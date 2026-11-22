/**
 * The report editor's logic: what it offers from the dataset, the problems of a draft, and the save (the change check,
 * the numbering save of each source, a file that cannot be numbered).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ddb from 'ddb';
import { defaultState } from '@/libs/views/viewState';
import { DEFAULT_SCHEMA, DEFAULT_TEMPLATE } from '@/libs/reports/reportSettings';

const m = vi.hoisted(() => ({
    settings: vi.fn(), listViews: vi.fn(), reportChange: vi.fn(), saveNewReport: vi.fn(), updateReport: vi.fn(), numberMeasurementFile: vi.fn(), loadReportSources: vi.fn()
}));
vi.mock('@/libs/reports/reportSettings', async importOriginal => ({ ...await importOriginal(), datasetReportSettings: (...a) => m.settings(...a) }));
vi.mock('@/libs/views/viewStore', async importOriginal => ({ ...await importOriginal(), listViews: (...a) => m.listViews(...a) }));
vi.mock('@/libs/reports/reportStore', async importOriginal => ({
    ...await importOriginal(),
    reportChange: (...a) => m.reportChange(...a),
    saveNewReport: (...a) => m.saveNewReport(...a),
    updateReport: (...a) => m.updateReport(...a)
}));
vi.mock('@/libs/map/measurementStorage', async importOriginal => ({ ...await importOriginal(), numberMeasurementFile: (...a) => m.numberMeasurementFile(...a) }));
vi.mock('@/libs/reports/reportSources', () => ({ loadReportSources: (...a) => m.loadReportSources(...a) }));

const { useReportEditor, CONFLICT_TEXT } = await import('./useReportEditor');

const SECOND_TEMPLATE = { ...DEFAULT_TEMPLATE, id: 'compact', name: 'Compact', defaultSections: ['cover', 'tables'] };
const coverState = () => defaultState({ path: 'ortho.tif', hash: 'h1' }, { baseIsGeoraster: true });

let dataset;
let choose;
const make = (options = {}) => useReportEditor({ dataset, user: 'jdoe', choose, ...options });
// A loaded editor with a valid draft
async function ready(options = {}) {
    const editor = make({ initial: { sources: ['a/measurements.geojson'], cover: { viewId: 'v_cover123' } }, ...options });
    await editor.load();
    editor.draft.name = 'North pit';
    return editor;
}
const stored = (extra = {}) => ({ id: 'meta-7', uid: 'r_k3x9q2m7', name: 'North pit', data: {}, newerVersion: false, error: null, ...extra });
const existing = (data = {}) => stored({
    data: {
        version: 1, uid: 'r_k3x9q2m7', name: 'North pit', templateId: 'standard', title: '', subtitle: '', preparedBy: '', preparedFor: '', notes: '',
        sources: [{ file: 'a/measurements.geojson', label: 'A' }], cover: { viewId: 'v_cover123' }, units: null,
        filter: { groups: [], categories: [], severities: [], statuses: [], kinds: [], owners: [] },
        sections: [{ kind: 'cover', enabled: true }, { kind: 'summary', enabled: true }], ...data
    }
});

beforeEach(() => {
    Object.values(m).forEach(fn => fn.mockReset());
    vi.spyOn(console, 'error').mockImplementation(() => {});
    dataset = {
        search: vi.fn(async (pattern, options) => (options?.type === ddb.entry.type.GEORASTER
            ? [{ path: 'ortho.tif', hash: 'h1' }, { path: 'dsm.tif', hash: 'h2' }]
            : [{ path: 'b/measurements.geojson' }, { path: 'a/measurements.geojson' }, { path: 'a/ortho_measurements.geojson' }, { path: 'notes/readme_measurements.txt' }]))
    };
    choose = vi.fn();
    m.settings.mockResolvedValue({ templates: [DEFAULT_TEMPLATE, SECOND_TEMPLATE], schema: DEFAULT_SCHEMA });
    m.listViews.mockResolvedValue([{ uid: 'v_cover123', name: 'Cover', error: null, newerVersion: false }, { uid: 'v_broken00', name: 'Broken', error: 'bad', newerVersion: false }]);
    m.reportChange.mockResolvedValue(null);
    m.saveNewReport.mockImplementation(async (ds, definition) => ({ id: 'meta-9', uid: 'r_newnewne', name: definition.name, data: definition }));
    m.updateReport.mockImplementation(async (ds, uid, { definition }) => ({ id: 'meta-8', uid, name: definition.name, data: definition }));
    m.numberMeasurementFile.mockResolvedValue({ written: true });
    m.loadReportSources.mockImplementation(async (ds, sources) => sources.map(s => ({ label: s.label, file: s.file, document: { metadata: { views: { map: { groups: [{ id: `g-${s.label}`, name: `Group ${s.label}` }] } } }, features: [] } })));
});

describe('what the editor offers', () => {
    it('gives a new report the first template of the organization and its default sections', async () => {
        m.settings.mockResolvedValue({ templates: [SECOND_TEMPLATE, DEFAULT_TEMPLATE], schema: DEFAULT_SCHEMA });
        const editor = make();
        await editor.load();
        expect(editor.draft.templateId).toBe('compact');
        expect(editor.draft.sections.filter(s => s.enabled).map(s => s.kind)).toEqual(['cover', 'tables']);
        expect(editor.loading.value).toBe(false);
    });

    it('lists the measurement files and the georasters of the dataset, and the saved views that can be opened', async () => {
        const editor = make();
        await editor.load();
        expect(editor.measurementFiles.value).toEqual(['a/measurements.geojson', 'a/ortho_measurements.geojson', 'b/measurements.geojson']);
        expect(editor.georasters.value.map(g => g.path)).toEqual(['dsm.tif', 'ortho.tif']);
        expect(editor.views.value.map(v => v.uid)).toEqual(['v_cover123']);
    });

    it('starts a new report from the file and the cover it is given, with the source labelled A', async () => {
        const editor = make({ initial: { sources: ['a/measurements.geojson'], cover: { viewState: coverState() } } });
        await editor.load();
        expect(editor.draft.sources).toEqual([{ file: 'a/measurements.geojson', label: 'A' }]);
        expect(editor.coverKind.value).toBe('state');
    });

    it('starts a new report from the dataset page with no source and no cover', async () => {
        const editor = make();
        await editor.load();
        expect(editor.draft.sources).toEqual([]);
        expect(editor.draft.cover).toBeNull();
        expect(editor.coverKind.value).toBe('none');
    });

    it('lists the groups of every source with the label of its source', async () => {
        const editor = await ready();
        editor.add('b/measurements.geojson');
        await vi.waitFor(() => expect(editor.groupOptions.value).toHaveLength(2));
        expect(editor.groupOptions.value).toEqual([{ id: 'g-A', label: 'A: Group A' }, { id: 'g-B', label: 'B: Group B' }]);
    });

    it('says why it cannot be used when the settings cannot be read', async () => {
        m.settings.mockRejectedValue(new Error('The Registry did not answer'));
        const editor = make();
        await editor.load();
        expect(editor.loadError.value).toBe('The Registry did not answer');
        expect(editor.loading.value).toBe(false);
    });
});

describe('the template of an edited report', () => {
    it('is the one it names', async () => {
        const editor = make({ entry: existing({ templateId: 'compact' }) });
        await editor.load();
        expect(editor.resolvedTemplate.value.id).toBe('compact');
        expect(editor.templateNotice.value).toBe('');
    });

    it('is the first of the organization with the notice when the one it names was deleted, and stays as stored until changed', async () => {
        const editor = make({ entry: existing({ templateId: 'deleted-one' }) });
        await editor.load();
        expect(editor.resolvedTemplate.value.id).toBe('standard');
        expect(editor.templateNotice.value).toBe(`Template deleted-one no longer exists; this report uses ${DEFAULT_TEMPLATE.name}`);
        expect(editor.draft.templateId).toBe('deleted-one');
    });
});

describe('the template chosen', () => {
    const enabled = editor => editor.draft.sections.filter(sec => sec.enabled).map(sec => sec.kind);

    it('gives a new report the default sections of each template chosen while its sections are not changed', async () => {
        const editor = make();
        await editor.load();
        expect(editor.draft.templateId).toBe('standard');
        editor.chooseTemplate('compact');
        expect(editor.draft.templateId).toBe('compact');
        expect(enabled(editor)).toEqual(['cover', 'tables']);
        editor.chooseTemplate('standard');
        expect(editor.draft.sections).toEqual(editor.draft.sections.map(sec => ({ ...sec, enabled: true })));
    });

    it('leaves the sections of a new report as the user set them', async () => {
        const editor = make();
        await editor.load();
        editor.chooseTemplate('compact');
        editor.draft.sections.find(sec => sec.kind === 'tables').enabled = false;
        editor.chooseTemplate('standard');
        expect(editor.draft.templateId).toBe('standard');
        expect(enabled(editor)).toEqual(['cover']);
    });

    it('never changes the sections of a stored report', async () => {
        const editor = make({ entry: existing() });
        await editor.load();
        const before = JSON.stringify(editor.draft.sections);
        editor.chooseTemplate('compact');
        expect(editor.draft.templateId).toBe('compact');
        expect(JSON.stringify(editor.draft.sections)).toBe(before);
    });
});

describe('a report of a newer version', () => {
    it('is refused: the editor says why and saves nothing', async () => {
        const editor = make({ entry: { ...existing({ version: 99 }), newerVersion: true } });
        editor.draft.name = 'North pit';
        await editor.load();
        expect(editor.loadError.value).toBe('This report was saved by a newer version of the application.');
        expect(await editor.save()).toBeNull();
        expect(m.updateReport).not.toHaveBeenCalled();
        expect(m.saveNewReport).not.toHaveBeenCalled();
    });
});

describe('the problems of the draft', () => {
    it('are listed by field: no name, no source, no cover', async () => {
        const editor = make();
        await editor.load();
        expect(editor.problems.value).toEqual({
            name: 'Give the report a name', sources: 'Add at least one measurement file', cover: 'Choose the view the report draws its maps on'
        });
    });

    it('are none for a valid draft', async () => {
        const editor = await ready();
        expect(editor.problems.value).toEqual({});
        expect(editor.firstProblem.value).toBe('');
    });

    it('include a label that is not 1 to 3 characters A to Z and 0 to 9, and a label used twice', async () => {
        const editor = await ready();
        editor.add('b/measurements.geojson');
        editor.draft.sources[1].label = 'a1';
        expect(editor.problems.value.sources).toContain('A to Z and 0 to 9');
        editor.draft.sources[1].label = 'A';
        expect(editor.problems.value.sources).toBe('Each source needs its own label');
    });

    it('include texts that are too long, and the notes', async () => {
        const editor = await ready();
        editor.draft.title = 'x'.repeat(201);
        editor.draft.notes = 'y'.repeat(10001);
        expect(editor.problems.value.title).toBe('At most 200 characters');
        expect(editor.problems.value.notes).toBe('At most 10000 characters');
    });

    it('include a cover that names a saved view that was deleted: the editor asks for another', async () => {
        const editor = make({ entry: existing({ cover: { viewId: 'v_gone0000' } }) });
        await editor.load();
        expect(editor.coverDeleted.value).toBe(true);
        expect(editor.problems.value.cover).toBe('The cover view was deleted: choose another');
        editor.chooseView('v_cover123');
        expect(editor.coverDeleted.value).toBe(false);
    });

    it('make the save do nothing but show them', async () => {
        const editor = make();
        await editor.load();
        expect(await editor.save()).toBeNull();
        expect(editor.showProblems.value).toBe(true);
        expect(m.saveNewReport).not.toHaveBeenCalled();
        expect(m.numberMeasurementFile).not.toHaveBeenCalled();
    });
});

describe('the cover', () => {
    it('is a saved view, or a view state made of the layers picked, the first one the base', async () => {
        const editor = await ready();
        editor.chooseLayers(['dsm.tif', 'ortho.tif']);
        expect(editor.coverKind.value).toBe('layers');
        expect(editor.draft.cover.viewState.base).toEqual({ path: 'dsm.tif', hash: 'h2' });
        expect(editor.draft.cover.viewState.layers.map(l => l.path)).toEqual(['dsm.tif', 'ortho.tif']);
        editor.chooseView('v_cover123');
        expect(editor.draft.cover).toEqual({ viewId: 'v_cover123' });
        expect(editor.coverKind.value).toBe('view');
        editor.chooseLayers([]);
        expect(editor.draft.cover).toBeNull();
    });
});

describe('the sources and the sections', () => {
    it('add a file under the next label, once, and removing one takes the groups of that source out of the filter', async () => {
        const editor = await ready();
        editor.add('b/measurements.geojson');
        editor.add('b/measurements.geojson');
        expect(editor.draft.sources.map(s => s.label)).toEqual(['A', 'B']);
        await vi.waitFor(() => expect(editor.groupOptions.value).toHaveLength(2));
        editor.draft.filter.groups = ['g-A', 'g-B'];
        editor.removeSource(1);
        expect(editor.draft.sources.map(s => s.file)).toEqual(['a/measurements.geojson']);
        expect(editor.draft.filter.groups).toEqual(['g-A']);
    });

    it('move a section up or down, and stay where they are at the ends', async () => {
        const editor = await ready();
        const order = () => editor.draft.sections.map(s => s.kind);
        const first = order()[0];
        editor.moveSection(0, -1);
        expect(order()[0]).toBe(first);
        editor.moveSection(0, 1);
        expect(order()[1]).toBe(first);
        const last = editor.draft.sections.length - 1;
        const tail = order()[last];
        editor.moveSection(last, 1);
        expect(order()[last]).toBe(tail);
    });
});

describe('save: a new report', () => {
    it('stores the definition with its name trimmed, then numbers each source file', async () => {
        const editor = await ready();
        editor.add('b/measurements.geojson');
        editor.draft.name = '  North pit  ';
        const result = await editor.save();
        expect(result).toEqual({ uid: 'r_newnewne', failures: [] });
        const [, definition, options] = m.saveNewReport.mock.calls[0];
        expect(definition.name).toBe('North pit');
        expect(definition.sources).toEqual([{ file: 'a/measurements.geojson', label: 'A' }, { file: 'b/measurements.geojson', label: 'B' }]);
        expect(options).toEqual({ user: 'jdoe' });
        expect(m.numberMeasurementFile.mock.calls.map(c => c[1]).sort()).toEqual(['a/measurements.geojson', 'b/measurements.geojson']);
        expect(editor.storedUid.value).toBe('r_newnewne');
    });

    it('stores the definition even when a file cannot be numbered, and names the file and why', async () => {
        const editor = await ready();
        editor.add('b/measurements.geojson');
        m.numberMeasurementFile.mockImplementation(async (ds, file) => {
            if (file === 'b/measurements.geojson') throw new Error('The file cannot be written');
            return { written: true };
        });
        const result = await editor.save();
        expect(m.saveNewReport).toHaveBeenCalledOnce();
        expect(result).toEqual({ uid: 'r_newnewne', failures: [{ file: 'b/measurements.geojson', reason: 'The file cannot be written' }] });
        expect(editor.failures.value).toEqual(result.failures);
    });

    it('stores the definition before it numbers the files, so a refused definition leaves the files as they are', async () => {
        const editor = await ready();
        m.saveNewReport.mockRejectedValue(new Error('This dataset has 100 reports. Delete one to save a new report.'));
        expect(await editor.save()).toBeNull();
        expect(editor.formError.value).toBe('This dataset has 100 reports. Delete one to save a new report.');
        expect(m.numberMeasurementFile).not.toHaveBeenCalled();
    });

    it('refuses a definition over 32 KB with the message that names the limit, and writes nothing', async () => {
        const editor = await ready();
        editor.draft.sources = Array.from({ length: 40 }, (_, i) => ({ file: `survey/${'d'.repeat(900)}/${i}_measurements.geojson`, label: `S${i}` }));
        expect(editor.problems.value).toEqual({});
        expect(await editor.save()).toBeNull();
        expect(editor.formError.value).toBe('This report is too large to save: a report definition can take at most 32 KB.');
        expect(m.saveNewReport).not.toHaveBeenCalled();
        expect(m.numberMeasurementFile).not.toHaveBeenCalled();
    });

    it('does not save twice at once', async () => {
        const editor = await ready();
        let release;
        m.saveNewReport.mockImplementation(() => new Promise(resolve => { release = () => resolve({ id: 'm', uid: 'r_newnewne', name: 'North pit', data: {} }); }));
        const first = editor.save();
        expect(await editor.save()).toBeNull();
        await vi.waitFor(() => expect(release).toBeDefined());
        release();
        await first;
        expect(m.saveNewReport).toHaveBeenCalledOnce();
    });
});

describe('save: an edited report (the change check)', () => {
    it('updates it when nobody changed it', async () => {
        const editor = make({ entry: existing() });
        await editor.load();
        const result = await editor.save();
        expect(m.reportChange).toHaveBeenCalledWith(dataset, 'r_k3x9q2m7', 'meta-7');
        expect(m.updateReport).toHaveBeenCalledOnce();
        expect(m.updateReport.mock.calls[0][1]).toBe('r_k3x9q2m7');
        expect(m.saveNewReport).not.toHaveBeenCalled();
        expect(result.uid).toBe('r_k3x9q2m7');
        // The next save checks against the version this one wrote
        await editor.save();
        expect(m.reportChange).toHaveBeenLastCalledWith(dataset, 'r_k3x9q2m7', 'meta-8');
    });

    it('asks to Overwrite, Save as new or Cancel when another session changed it', async () => {
        m.reportChange.mockResolvedValue('changed');
        choose.mockResolvedValue('confirm');
        const editor = make({ entry: existing() });
        await editor.load();
        await editor.save();
        expect(choose).toHaveBeenCalledWith({ ...CONFLICT_TEXT.changed, confirmText: 'Overwrite', secondaryText: 'Save as new' });
        expect(m.updateReport).toHaveBeenCalledOnce();

        choose.mockResolvedValue('secondary');
        await editor.save();
        expect(m.saveNewReport).toHaveBeenCalledOnce();
    });

    it('writes nothing when the user cancels the question', async () => {
        m.reportChange.mockResolvedValue('changed');
        choose.mockResolvedValue('cancel');
        const editor = make({ entry: existing() });
        await editor.load();
        expect(await editor.save()).toBeNull();
        expect(m.updateReport).not.toHaveBeenCalled();
        expect(m.saveNewReport).not.toHaveBeenCalled();
        expect(m.numberMeasurementFile).not.toHaveBeenCalled();
    });

    it('asks to Save as new or Cancel when another session deleted it, and never updates it', async () => {
        m.reportChange.mockResolvedValue('deleted');
        choose.mockResolvedValue('confirm');
        const editor = make({ entry: existing() });
        await editor.load();
        await editor.save();
        expect(choose).toHaveBeenCalledWith({ ...CONFLICT_TEXT.deleted, confirmText: 'Save as new' });
        expect(m.saveNewReport).toHaveBeenCalledOnce();
        expect(m.updateReport).not.toHaveBeenCalled();
    });

    it('shows the failure of the check and writes nothing', async () => {
        m.reportChange.mockRejectedValue(new Error('offline'));
        const editor = make({ entry: existing() });
        await editor.load();
        expect(await editor.save()).toBeNull();
        expect(editor.formError.value).toBe('offline');
        expect(m.updateReport).not.toHaveBeenCalled();
    });
});
