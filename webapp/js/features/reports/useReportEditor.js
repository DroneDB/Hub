// @ts-check
/**
 * useReportEditor - what the report editor does, without its markup: the draft of a definition, what the dataset
 * offers to fill it from (the measurement files, the saved views, the georasters, the organization's templates and
 * schema, the groups of the sources), the problems of the draft, and the save.
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
 *   const editor = useReportEditor({ dataset, user, entry, initial, choose });
 *   await editor.load();
 *   const saved = await editor.save();   // { uid, failures } or null (invalid, cancelled, refused: see `formError`)
 */
import { computed, inject, provide, reactive, ref, shallowRef } from 'vue';
import ddb from 'ddb';
import { isMeasurementFile, numberMeasurementFile } from '@/libs/map/measurementStorage';
import { sectionOf, VIEW } from '@/libs/map/measurementFormat';
import { buildEntryState } from '@/libs/views/viewState';
import { isUsableView, listViews } from '@/libs/views/viewStore';
import {
    DEFINITION_VERSION, MAX_NOTES_LENGTH, MAX_TEXT_LENGTH, MAX_SOURCE_LABEL_LENGTH, MEASUREMENT_KINDS, OWNERS, SECTION_KINDS,
    addSource, newDefinition, sectionsFromTemplate
} from '@/libs/reports/reportDefinition';
import { reportChange, reportSaveProblem, saveNewReport, updateReport, MAX_REPORT_NAME_LENGTH, NEWER_REPORT_TEXT } from '@/libs/reports/reportStore';
import { datasetReportSettings, DEFAULT_SCHEMA, DEFAULT_TEMPLATE } from '@/libs/reports/reportSettings';
import { resolveTemplate, templateMissingText } from '@/libs/reports/reportModel';
import { loadReportSources } from '@/libs/reports/reportSources';

const LABEL_PATTERN = /^[A-Z0-9]{1,3}$/;
/** A uid that passes the rules, for the checks of a draft that has none yet. */
const PLACEHOLDER_UID = 'r_00000000';

/** The question the editor asks of a change made by another session. */
export const CONFLICT_TEXT = {
    changed: { title: 'Report changed', message: 'Someone saved this report after you opened it. Overwrite their changes, or save yours as a new report?' },
    deleted: { title: 'Report deleted', message: 'This report was deleted after you opened it. Save it as a new report to keep it.' }
};

/** @param {any} value */
const clone = value => JSON.parse(JSON.stringify(value));

/**
 * @param {object} ctx
 * @param {any} ctx.dataset  reg.Organization(org).Dataset(ds)
 * @param {string} ctx.user  the user name the audit fields carry
 * @param {import('@/libs/metaList/metaListStore').MetaEntry | null} [ctx.entry]  the report being edited; none for a new one
 * @param {{ sources?: string[], cover?: import('@/libs/reports/reportDefinition').ReportCover | null }} [ctx.initial]  what a new report starts with
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
    /** @type {import('vue').ShallowRef<{ path: string, hash: string }[]>} */
    const georasters = shallowRef([]);
    // The groups of each source, by file, as read from the files
    /** @type {import('vue').ShallowRef<Record<string, { id: string, name: string }[]>>} */
    const groupsByFile = shallowRef({});

    /** @type {import('@/libs/reports/reportDefinition').ReportDefinition} */
    const draft = reactive(entry ? clone(entry.data) : newDefinition({ sources: initial.sources ?? [], cover: initial.cover ?? null }));
    // The meta item the draft was read from, for the check for another session's save
    const loadedId = ref(entry ? entry.id : '');
    // The report the draft is stored as: the one being edited, or the one this editor made on its first save
    const storedUid = ref(entry ? entry.uid : '');
    /** @type {import('vue').Ref<{ file: string, reason: string }[]>} */
    const failures = ref([]);
    // The text of the draft as it was read or last stored: nothing to save or to discard while it is the same
    const baseline = ref('');
    const dirty = computed(() => !!baseline.value && baseline.value !== JSON.stringify(draft));
    // The layers picked for a cover made of dataset layers
    const coverLayers = ref(/** @type {string[]} */ ([]));
    // The cover is made of picked layers (else a view state the editor was given or the report has)
    const layersMode = ref(false);

    const resolved = computed(() => resolveTemplate(templates.value, draft.templateId));
    const templateNotice = computed(() => (resolved.value.missing ? templateMissingText(draft.templateId, resolved.value.template.name) : ''));
    // A cover that names a saved view that is no longer there: the editor asks for another one
    const coverDeleted = computed(() => !!draft.cover && 'viewId' in draft.cover && !loading.value && !views.value.some(v => v.uid === /** @type {{ viewId: string }} */ (draft.cover).viewId));
    /** What the cover is: 'none', a saved 'view', the 'layers' picked here, or a map 'state' (the one a map gave, or the report has). */
    const coverKind = computed(() => {
        if (!draft.cover) return 'none';
        if ('viewId' in draft.cover) return 'view';
        return layersMode.value ? 'layers' : 'state';
    });

    /** The groups of every source, with the label of the source: the choices of the group filter. */
    const groupOptions = computed(() => draft.sources.flatMap(s => (groupsByFile.value[s.file] ?? []).map(g => ({ id: g.id, label: `${s.label}: ${g.name}` }))));

    /**
     * What the dataset offers: the organization's templates and schema, the saved views, the measurement files and the
     * georasters. A failed read of the settings or of the views is the editor's error; the file pickers are best effort.
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
            const [settings, allViews, files, rasters] = await Promise.all([
                datasetReportSettings(dataset),
                listViews(dataset, { fresh: true }),
                dataset.search('*measurements.geojson').catch(() => []),
                dataset.search('*', { type: ddb.entry.type.GEORASTER }).catch(() => [])
            ]);
            templates.value = settings.templates?.length ? settings.templates : [DEFAULT_TEMPLATE];
            schema.value = settings.schema ?? DEFAULT_SCHEMA;
            // A cover view that cannot be drawn is a deleted one (coverDeleted), as the live page has it
            views.value = allViews.filter(isUsableView);
            measurementFiles.value = files.map(/** @param {any} f */ f => f.path).filter(isMeasurementFile).sort();
            georasters.value = rasters.map(/** @param {any} f */ f => ({ path: f.path, hash: f.hash || '' })).sort((a, b) => a.path.localeCompare(b.path));
            if (!entry) {
                // A new report starts from the first template of the organization: its id and its default sections
                const [first] = templates.value;
                draft.templateId = first.id;
                draft.sections = sectionsFromTemplate(first.defaultSections);
            }
            await readGroups();
        } catch (e) {
            console.error('Cannot prepare the report editor:', e);
            loadError.value = e instanceof Error ? e.message : String(e);
        } finally {
            loading.value = false;
            baseline.value = JSON.stringify(draft);
        }
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

    // ---- Changes the form makes ---------------------------------------------------------------

    /** Adds a measurement file as a source under the next free label. @param {string} file */
    function add(file) {
        draft.sources = addSource(draft.sources, file);
        void readGroups();
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

    /** @param {string} viewId */
    function chooseView(viewId) {
        layersMode.value = false;
        draft.cover = { viewId };
    }

    /** The cover is made of these georasters, the first one the base (the map opens on it). @param {string[]} paths */
    function chooseLayers(paths) {
        coverLayers.value = paths;
        layersMode.value = paths.length > 0;
        if (!paths.length) {
            draft.cover = null;
            return;
        }
        const first = georasters.value.find(g => g.path === paths[0]);
        draft.cover = { viewState: buildEntryState({ path: paths[0], hash: first?.hash ?? '' }, paths.slice(1), { baseIsGeoraster: true }) };
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
        if (!draft.sources.length) found.sources = 'Add at least one measurement file';
        else {
            const labels = draft.sources.map(s => s.label);
            const bad = draft.sources.findIndex(s => !LABEL_PATTERN.test(s.label));
            if (bad >= 0) found.sources = `A label is 1 to ${MAX_SOURCE_LABEL_LENGTH} characters, A to Z and 0 to 9`;
            else if (new Set(labels).size !== labels.length) found.sources = 'Each source needs its own label';
        }
        if (!draft.cover) found.cover = 'Choose the view the report draws its maps on';
        else if (coverDeleted.value) found.cover = 'The cover view was deleted: choose another';
        return found;
    });

    /** Why the draft cannot be saved, or ''. */
    const firstProblem = computed(() => Object.values(problems.value)[0] ?? '');

    // ---- Save ---------------------------------------------------------------------------------

    /** The draft as a definition to store (a plain copy, with its labels trimmed of nothing: they are checked as typed). */
    function definition() {
        return { ...clone(draft), version: DEFINITION_VERSION, name: draft.name.trim() };
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
        const data = definition();
        const text = JSON.stringify(draft);
        const refused = reportSaveProblem(data.name, { ...data, uid: storedUid.value || PLACEHOLDER_UID });
        if (refused) {
            formError.value = refused;
            return null;
        }
        saving.value = true;
        try {
            const how = await resolveConflict();
            if (how === 'cancel') return null;
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
        templates, schema, views, measurementFiles, georasters, groupOptions, coverLayers, coverKind, coverDeleted,
        resolvedTemplate: computed(() => resolved.value.template), templateNotice, storedUid,
        load, add, removeSource, chooseTemplate, chooseView, chooseLayers, moveSection, save,
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
