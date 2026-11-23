// @ts-check
/**
 * useReportEditor - what the report editor does, without its markup: the draft of a definition, what the dataset
 * offers to fill it from (the measurement files, the saved views, the files a view can be made of, the organization's
 * templates and schema, the groups of the sources), the view the report draws its maps on, the problems of the draft,
 * and the save.
 *
 * A new report starts filled in (reportPrefill): what it was opened with, the newest report of the dataset and what the
 * dataset has. Its view is a saved view, or a new one (the map the editor was opened from, or a file of the dataset)
 * that the save stores as a saved view before the report, so that the user does not have to make a view first.
 *
 * The save: the definition is written (a new one, or the update of a stored one after the change check: another
 * session's change asks to Overwrite or Save as new, its deletion to Save as new), then each source file gets the
 * numbering save, so the references the report shows are stored. A file that cannot be numbered does not undo the
 * definition: it is listed in `failures` with the reason, and the report shows that file's items without a reference
 * until a later save can number it. `dirty` says whether the draft differs from what was read or last stored.
 *
 * A report of a later version is not edited: the editor says why (`loadError`) and saves nothing, as what this version
 * does not know of it would be lost.
 *
 *   const editor = useReportEditor({ dataset, user, entry, initial: { sources, view }, choose });
 *   await editor.load();
 *   const saved = await editor.save();   // { uid, failures } or null (invalid, cancelled, refused: see `formError`)
 */
import { computed, inject, provide, reactive, ref, shallowRef } from 'vue';
import ddb, { pathutils } from 'ddb';
import { isMeasurementFile, numberMeasurementFile } from '@/libs/map/measurementStorage';
import { sectionOf, VIEW } from '@/libs/map/measurementFormat';
import { defaultState, MAX_NAME_LENGTH } from '@/libs/views/viewState';
import { isUsableView, listViews, saveNewView } from '@/libs/views/viewStore';
import {
    DEFINITION_VERSION, MAX_NOTES_LENGTH, MAX_TEXT_LENGTH, MAX_SOURCE_LABEL_LENGTH, MEASUREMENT_KINDS, OWNERS, SECTION_KINDS,
    addSource, newDefinition, sectionsFromTemplate
} from '@/libs/reports/reportDefinition';
import {
    listReports, reportChange, reportSaveProblem, saveNewReport, updateReport, MAX_REPORT_NAME_LENGTH, NEWER_REPORT_TEXT
} from '@/libs/reports/reportStore';
import { defaultBaseFile, freeName, newestReport, prefillReport } from '@/libs/reports/reportPrefill';
import { datasetReportSettings, DEFAULT_SCHEMA, DEFAULT_TEMPLATE } from '@/libs/reports/reportSettings';
import { resolveTemplate, templateMissingText } from '@/libs/reports/reportModel';
import { loadReportSources } from '@/libs/reports/reportSources';

const LABEL_PATTERN = /^[A-Z0-9]{1,3}$/;
/** A uid that passes the rules, for the checks of a draft that has none yet. */
const PLACEHOLDER_UID = 'r_00000000';
/** The cover of a report whose view is saved with it, for the checks made before that view has its uid. */
const PLACEHOLDER_COVER = Object.freeze({ viewId: 'v_00000000' });
// The files a new view can be made of: the types that cover an area on the map (an image or a video covers too little)
const BASE_TYPES = [ddb.entry.type.GEORASTER, ddb.entry.type.POINTCLOUD, ddb.entry.type.VECTOR];

/** The choices of the units of a report: none is the units each reader has chosen. */
export const UNIT_OPTIONS = Object.freeze([
    { value: '', label: 'The units each reader has chosen' },
    { value: 'metric', label: 'Metric' },
    { value: 'imperial', label: 'Imperial' }
]);

/** The fields of the draft that the editor shows under More options: a problem there opens it. */
export const MORE_OPTIONS_FIELDS = Object.freeze(['title', 'subtitle', 'preparedBy', 'preparedFor', 'notes', 'labels']);

/** The question the editor asks of a change made by another session. */
export const CONFLICT_TEXT = {
    changed: { title: 'Report changed', message: 'Someone saved this report after you opened it. Overwrite their changes, or save yours as a new report?' },
    deleted: { title: 'Report deleted', message: 'This report was deleted after you opened it. Save it as a new report to keep it.' }
};

/** @param {any} value */
const clone = value => JSON.parse(JSON.stringify(value));

/**
 * The view choice of a stored report: its saved view, or the view state it keeps.
 * @param {import('@/libs/reports/reportDefinition').ReportCover | null} cover
 * @returns {import('@/libs/reports/reportPrefill').ViewChoice | null}
 */
function choiceOfCover(cover) {
    if (!cover) return null;
    return 'viewId' in cover ? { kind: 'saved', uid: cover.viewId } : { kind: 'kept' };
}

/**
 * @param {object} ctx
 * @param {any} ctx.dataset  reg.Organization(org).Dataset(ds)
 * @param {string} ctx.user  the user name the audit fields carry
 * @param {import('@/libs/metaList/metaListStore').MetaEntry | null} [ctx.entry]  the report being edited; none for a new one
 * @param {{ sources?: string[], view?: import('@/composables/useMapReport').MapReportView | null }} [ctx.initial]  what a new report was opened with:
 *   the measurement files and the view of the map
 * @param {(options: { title: string, message: string, confirmText: string, secondaryText?: string }) => Promise<'confirm'|'secondary'|'cancel'>} ctx.choose
 */
export function useReportEditor({ dataset, user, entry = null, initial = {}, choose }) {
    const loading = ref(true);
    const loadError = ref('');
    const saving = ref(false);
    const formError = ref('');
    // Shown after the first save attempt, so a form that was just opened has no red in it
    const showProblems = ref(false);

    const templates = shallowRef([DEFAULT_TEMPLATE]);
    const schema = shallowRef(DEFAULT_SCHEMA);
    /** @type {import('vue').ShallowRef<import('@/libs/views/viewStore').SavedView[]>} */
    const views = shallowRef([]);
    /** @type {import('vue').ShallowRef<string[]>} */
    const measurementFiles = shallowRef([]);
    /** @type {import('vue').ShallowRef<import('@/libs/reports/reportPrefill').BaseFile[]>} */
    const baseFiles = shallowRef([]);
    // The groups of each source, by file, as read from the files
    /** @type {import('vue').ShallowRef<Record<string, { id: string, name: string }[]>>} */
    const groupsByFile = shallowRef({});

    /** @type {import('@/libs/reports/reportDefinition').ReportDefinition} */
    const draft = reactive(entry ? clone(entry.data) : newDefinition({ sources: initial.sources ?? [] }));
    // The view state of the map the editor was opened from, which can be saved as a new view
    const mapView = initial.view && 'state' in initial.view ? initial.view : null;
    // The view state an existing report keeps, which it keeps until another view is chosen
    const keptCover = entry && entry.data.cover && 'viewState' in entry.data.cover ? clone(entry.data.cover) : null;
    /** @type {import('vue').Ref<import('@/libs/reports/reportPrefill').ViewChoice | null>} */
    const viewChoice = ref(entry ? choiceOfCover(entry.data.cover) : null);
    // The meta item the draft was read from, for the check for another session's save
    const loadedId = ref(entry ? entry.id : '');
    // The report the draft is stored as: the one being edited, or the one this editor made on its first save
    const storedUid = ref(entry ? entry.uid : '');
    /** @type {import('vue').Ref<{ file: string, reason: string }[]>} */
    const failures = ref([]);
    // The text of the draft and its view as they were read or last stored: nothing to save or to discard while it is the same
    const baseline = ref('');
    const snapshot = () => JSON.stringify({ draft, view: viewChoice.value });
    const dirty = computed(() => !!baseline.value && baseline.value !== snapshot());
    // The name the editor gave a new view of a file: a change of the file renames the view until the user names it
    let autoViewName = '';

    const resolved = computed(() => resolveTemplate(templates.value, draft.templateId));
    const templateNotice = computed(() => (resolved.value.missing ? templateMissingText(draft.templateId, resolved.value.template.name) : ''));
    // A saved view that is no longer there: the editor asks for another one
    const coverDeleted = computed(() => {
        const choice = viewChoice.value;
        return choice?.kind === 'saved' && !loading.value && !views.value.some(v => v.uid === choice.uid);
    });

    /** The groups of every source, with the label of the source: the choices of the group filter. */
    const groupOptions = computed(() => draft.sources.flatMap(s => (groupsByFile.value[s.file] ?? []).map(g => ({ id: g.id, label: `${s.label}: ${g.name}` }))));

    /**
     * What the dataset offers: the organization's templates and schema, the saved views, the measurement files and the
     * files a new view can be made of, and what a new report is filled in from. A failed read of the settings or of the
     * views is the editor's error; the rest is best effort.
     */
    async function load() {
        loading.value = true;
        loadError.value = '';
        if (entry?.newerVersion) {
            loadError.value = NEWER_REPORT_TEXT;
            loading.value = false;
            return;
        }
        try {
            const [settings, allViews, files, bases, reports, datasetName] = await Promise.all([
                datasetReportSettings(dataset),
                listViews(dataset, { fresh: true }),
                dataset.search('*measurements.geojson').catch(() => []),
                readBaseFiles(),
                // What a new report is filled in from: best effort, an empty form is still a form
                entry ? null : listReports(dataset).then(r => r.reports, () => []),
                entry ? '' : readDatasetName()
            ]);
            templates.value = settings.templates?.length ? settings.templates : [DEFAULT_TEMPLATE];
            schema.value = settings.schema ?? DEFAULT_SCHEMA;
            // A cover view that cannot be drawn is a deleted one (coverDeleted), as the live page has it
            views.value = allViews.filter(isUsableView);
            measurementFiles.value = files.map(/** @param {any} f */ f => f.path).filter(isMeasurementFile).sort();
            baseFiles.value = bases;
            if (!entry) prefill(reports ?? [], datasetName);
            await readGroups();
        } catch (e) {
            console.error('Cannot prepare the report editor:', e);
            loadError.value = e instanceof Error ? e.message : String(e);
        } finally {
            loading.value = false;
            baseline.value = snapshot();
        }
    }

    /**
     * The files of the dataset a new view can be made of, georasters first, each sorted by path; none when they cannot be
     * read (the saved views are still there).
     * @returns {Promise<import('@/libs/reports/reportPrefill').BaseFile[]>}
     */
    async function readBaseFiles() {
        const found = await Promise.all(BASE_TYPES.map(type => dataset.search('*', { type }).catch(() => [])));
        return found.flatMap((list, index) => list
            .filter(/** @param {any} f */ f => !isMeasurementFile(f.path))
            .map(/** @param {any} f */ f => ({ path: String(f.path), hash: f.hash || '', georaster: BASE_TYPES[index] === ddb.entry.type.GEORASTER }))
            .sort((/** @type {{ path: string }} */ a, /** @type {{ path: string }} */ b) => a.path.localeCompare(b.path)));
    }

    /** The name of the dataset as its page shows it, else its slug. */
    async function readDatasetName() {
        try {
            const [root] = await dataset.info();
            const name = root?.properties?.meta?.name?.data;
            if (typeof name === 'string' && name.trim()) return name.trim();
        } catch (e) {
            console.warn('Cannot read the name of the dataset:', e);
        }
        return String(dataset.ds ?? '');
    }

    /**
     * Fills in a new report (reportPrefill).
     * @param {import('@/libs/metaList/metaListStore').MetaEntry[]} reports @param {string} datasetName
     */
    function prefill(reports, datasetName) {
        const { fields, view } = prefillReport({
            initial,
            lastReport: newestReport(reports)?.data ?? null,
            views: views.value,
            measurementFiles: measurementFiles.value,
            baseFiles: baseFiles.value,
            templates: templates.value,
            user,
            datasetName,
            reportNames: reports.map(r => r.name),
            dateText: new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date())
        });
        Object.assign(draft, fields);
        if (view?.kind === 'fromFile') autoViewName = view.name;
        setChoice(view);
    }

    /** Reads the groups of the files the draft has as sources (a file that cannot be read has none). */
    async function readGroups() {
        const wanted = draft.sources.filter(s => !(s.file in groupsByFile.value));
        if (!wanted.length) return;
        const read = await loadReportSources(dataset, wanted);
        const next = { ...groupsByFile.value };
        for (const source of read) {
            const groups = 'document' in source && source.document ? sectionOf(source.document, VIEW.MAP).groups : null;
            next[source.file] = Array.isArray(groups) ? groups.filter(/** @param {any} g */ g => g && typeof g.id === 'string') : [];
        }
        groupsByFile.value = next;
    }

    /** What More options holds, in one line: the template, the units, the filter and the sections. */
    const optionsSummary = computed(() => {
        const units = draft.units ? UNIT_OPTIONS.find(o => o.value === draft.units)?.label : 'Units of each reader';
        const filtered = Object.values(draft.filter).some(list => list.length);
        const sections = draft.sections.filter(s => s.enabled).length;
        return [`${resolved.value.template.name} template`, units, filtered ? 'Filtered items' : 'All items', `${sections} ${sections === 1 ? 'section' : 'sections'}`].join(' · ');
    });

    // ---- Changes the form makes ---------------------------------------------------------------

    /** Adds a measurement file as a source under the next free label. @param {string} file */
    function add(file) {
        draft.sources = addSource(draft.sources, file);
        void readGroups();
    }

    /**
     * Makes these files the sources: the ones the draft has keep their labels and their place, the others come after under
     * the next free labels.
     * @param {string[]} files
     */
    function setSources(files) {
        for (let i = draft.sources.length - 1; i >= 0; i--) if (!files.includes(draft.sources[i].file)) removeSource(i);
        for (const file of files) add(file);
    }

    /** @param {number} index */
    function removeSource(index) {
        const [removed] = draft.sources.splice(index, 1);
        // A filter on a group of a source that is gone would hide everything
        const gone = new Set((groupsByFile.value[removed.file] ?? []).map(g => g.id));
        draft.filter.groups = draft.filter.groups.filter(id => !gone.has(id));
    }

    /**
     * Makes the report use a template. A report that is not stored yet takes the default sections of the new template
     * while its sections are still those of the template it had (the user did not change them); a stored report keeps
     * its sections, whatever the template says.
     * @param {string} id
     */
    function chooseTemplate(id) {
        const untouched = !storedUid.value
            && JSON.stringify(draft.sections) === JSON.stringify(sectionsFromTemplate(resolved.value.template.defaultSections));
        draft.templateId = id;
        if (untouched) draft.sections = sectionsFromTemplate(resolved.value.template.defaultSections);
    }

    /**
     * The view choice, and the cover of the draft that goes with it: a saved view's uid, the kept state, or none until the
     * save has stored the new view.
     * @param {import('@/libs/reports/reportPrefill').ViewChoice | null} choice
     */
    function setChoice(choice) {
        viewChoice.value = choice;
        if (choice?.kind === 'saved') draft.cover = { viewId: choice.uid };
        else if (choice?.kind === 'kept') draft.cover = clone(keptCover);
        else draft.cover = null;
    }

    const viewNames = () => views.value.map(v => v.name);

    /**
     * Chooses where the maps of the report are drawn: a saved view (`uid`), the map the editor was opened from, a file of
     * the dataset (the default one, see defaultBaseFile), or the view state the report keeps.
     * @param {'saved'|'fromMap'|'fromFile'|'kept'} kind @param {string} [uid]
     */
    function chooseView(kind, uid = '') {
        if (kind === 'saved') setChoice({ kind, uid });
        else if (kind === 'fromMap' && mapView) setChoice({ kind, state: mapView.state, name: freeName(mapView.name || pathutils.basename(mapView.state.base.path), viewNames()) });
        else if (kind === 'fromFile') {
            const file = defaultBaseFile(baseFiles.value);
            autoViewName = file ? freeName(pathutils.basename(file.path), viewNames()) : '';
            setChoice({ kind, path: file?.path ?? '', name: autoViewName });
        } else if (kind === 'kept' && keptCover) setChoice({ kind });
    }

    /** The file a new view is made of; the view is renamed after it while it has the name the editor gave it. @param {string} path */
    function chooseFile(path) {
        const choice = viewChoice.value;
        if (choice?.kind !== 'fromFile') return;
        const renamed = choice.name === autoViewName;
        if (renamed) autoViewName = freeName(pathutils.basename(path), viewNames());
        viewChoice.value = { ...choice, path, name: renamed ? autoViewName : choice.name };
    }

    /** Renames the new view. @param {string} name */
    function nameView(name) {
        const choice = viewChoice.value;
        if (choice?.kind === 'fromMap' || choice?.kind === 'fromFile') viewChoice.value = { ...choice, name };
    }

    /** Moves a section one place up (-1) or down (1). @param {number} index @param {-1|1} by */
    function moveSection(index, by) {
        const to = index + by;
        if (to < 0 || to >= draft.sections.length) return;
        const [section] = draft.sections.splice(index, 1);
        draft.sections.splice(to, 0, section);
    }

    // ---- Problems -----------------------------------------------------------------------------

    /** The problem of each field of the draft, by field. */
    const problems = computed(() => {
        /** @type {Record<string, string>} */
        const found = {};
        const name = draft.name.trim();
        if (!name) found.name = 'Give the report a name';
        else if (name.length > MAX_REPORT_NAME_LENGTH) found.name = `The name can have at most ${MAX_REPORT_NAME_LENGTH} characters`;
        for (const field of /** @type {const} */ (['title', 'subtitle', 'preparedBy', 'preparedFor'])) {
            if (draft[field].length > MAX_TEXT_LENGTH) found[field] = `At most ${MAX_TEXT_LENGTH} characters`;
        }
        if (draft.notes.length > MAX_NOTES_LENGTH) found.notes = `At most ${MAX_NOTES_LENGTH} characters`;
        if (!draft.sources.length) found.sources = 'Choose at least one measurement file';
        else {
            const labels = draft.sources.map(s => s.label);
            const bad = draft.sources.findIndex(s => !LABEL_PATTERN.test(s.label));
            if (bad >= 0) found.labels = `A label is 1 to ${MAX_SOURCE_LABEL_LENGTH} characters, A to Z and 0 to 9`;
            else if (new Set(labels).size !== labels.length) found.labels = 'Each measurement file needs its own label';
        }
        const view = viewProblem();
        if (view) found.view = view;
        return found;
    });

    /** What is wrong with the view choice, or ''. */
    function viewProblem() {
        const choice = viewChoice.value;
        if (!choice) return 'Choose the view the report draws its maps on';
        if (choice.kind === 'saved') return coverDeleted.value ? 'This view was deleted: choose another' : '';
        if (choice.kind === 'kept') return '';
        if (choice.kind === 'fromFile' && !choice.path) return 'Choose the file the new view shows';
        const name = choice.name.trim();
        if (!name) return 'Give the new view a name';
        return name.length > MAX_NAME_LENGTH ? `The name of the view can have at most ${MAX_NAME_LENGTH} characters` : '';
    }

    /** Why the draft cannot be saved, or ''. */
    const firstProblem = computed(() => Object.values(problems.value)[0] ?? '');

    // ---- Save ---------------------------------------------------------------------------------

    /**
     * The draft as a definition to store (a plain copy, with its labels trimmed of nothing: they are checked as typed). A
     * new view has no uid before it is saved: its checks use a placeholder.
     */
    function definition() {
        return { ...clone(draft), cover: draft.cover ?? { ...PLACEHOLDER_COVER }, version: DEFINITION_VERSION, name: draft.name.trim() };
    }

    /**
     * Stores the new view the report draws its maps on, when it has one, and makes it the report's saved view: a save
     * that fails after this one (the report's) keeps it, and a second try uses it instead of saving another.
     */
    async function saveChosenView() {
        const choice = viewChoice.value;
        if (choice?.kind !== 'fromMap' && choice?.kind !== 'fromFile') return;
        const base = choice.kind === 'fromFile' ? baseFiles.value.find(f => f.path === choice.path) : null;
        const state = choice.kind === 'fromMap'
            ? choice.state
            : defaultState({ path: choice.path, hash: base?.hash ?? '' }, { baseIsGeoraster: !!base?.georaster });
        const view = await saveNewView(dataset, state, { name: choice.name.trim(), user });
        views.value = [...views.value, view].sort((a, b) => a.name.localeCompare(b.name));
        setChoice({ kind: 'saved', uid: view.uid });
    }

    /**
     * Whether another session changed or deleted the stored report since it was read, and what the user wants then.
     * @returns {Promise<'update'|'new'|'cancel'>}
     */
    async function resolveConflict() {
        if (!storedUid.value) return 'new';
        const change = await reportChange(dataset, storedUid.value, loadedId.value);
        if (!change) return 'update';
        const text = CONFLICT_TEXT[change];
        const answer = await choose(change === 'changed'
            ? { ...text, confirmText: 'Overwrite', secondaryText: 'Save as new' }
            : { ...text, confirmText: 'Save as new' });
        if (answer === 'cancel') return 'cancel';
        return change === 'changed' && answer === 'confirm' ? 'update' : 'new';
    }

    /**
     * The numbering save of each source file, all at once: the ones that failed, with the file and the reason.
     * @param {string[]} files
     */
    async function numberSources(files) {
        const results = await Promise.all(files.map(file => numberMeasurementFile(dataset, file).then(() => null, /** @param {any} e */ e => {
            console.error(`Cannot number ${file}:`, e);
            return { file, reason: e instanceof Error && e.message ? e.message : String(e) };
        })));
        return /** @type {{ file: string, reason: string }[]} */ (results.filter(Boolean));
    }

    /**
     * Saves the report and numbers its sources.
     * @returns {Promise<{ uid: string, failures: { file: string, reason: string }[] } | null>}  null when nothing was saved
     */
    async function save() {
        if (saving.value) return null;
        if (entry?.newerVersion) {
            formError.value = NEWER_REPORT_TEXT;
            return null;
        }
        showProblems.value = true;
        formError.value = '';
        if (firstProblem.value) return null;
        const checked = definition();
        const refused = reportSaveProblem(checked.name, { ...checked, uid: storedUid.value || PLACEHOLDER_UID });
        if (refused) {
            formError.value = refused;
            return null;
        }
        saving.value = true;
        try {
            const how = await resolveConflict();
            if (how === 'cancel') return null;
            await saveChosenView();
            const data = definition();
            const text = snapshot();
            const stored = how === 'update'
                ? await updateReport(dataset, storedUid.value, { definition: data, user })
                : await saveNewReport(dataset, data, { user });
            storedUid.value = stored.uid;
            loadedId.value = stored.id;
            baseline.value = text;
            failures.value = await numberSources(data.sources.map(s => s.file));
            return { uid: stored.uid, failures: failures.value };
        } catch (e) {
            console.error('Cannot save the report:', e);
            formError.value = e instanceof Error ? e.message : String(e);
            return null;
        } finally {
            saving.value = false;
        }
    }

    return {
        draft, loading, loadError, saving, formError, showProblems, problems, firstProblem, failures, dirty,
        templates, schema, views, measurementFiles, baseFiles, groupOptions, viewChoice, coverDeleted,
        hasMapView: !!mapView, hasKeptView: !!keptCover, optionsSummary,
        resolvedTemplate: computed(() => resolved.value.template), templateNotice, storedUid,
        load, add, setSources, removeSource, chooseTemplate, chooseView, chooseFile, nameView, moveSection, save,
        filterChoices: { kinds: MEASUREMENT_KINDS, owners: OWNERS, sections: SECTION_KINDS }
    };
}

const EDITOR = Symbol('reportEditor');

/** Makes the editor the one its parts (the details, the sources, the filter) find with injectReportEditor. @param {ReturnType<typeof useReportEditor>} editor */
export const provideReportEditor = editor => provide(EDITOR, editor);

/** @returns {ReturnType<typeof useReportEditor>} */
export function injectReportEditor() {
    const editor = inject(EDITOR, null);
    if (!editor) throw new Error('A part of the report editor must be inside the editor');
    return /** @type {ReturnType<typeof useReportEditor>} */ (editor);
}
