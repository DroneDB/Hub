/**
 * The report editor's logic: what it offers from the dataset, what a new report starts with, the view (a saved one or a
 * new one saved with the report), the problems of a draft, and the save (the change check, the numbering save of each
 * source, a file that cannot be numbered).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ddb from 'ddb';
import { defaultState } from '@/libs/views/viewState';
import { DEFAULT_SCHEMA, DEFAULT_TEMPLATE } from '@/libs/reports/reportSettings';

const m = vi.hoisted(() => ({
    settings: vi.fn(), listViews: vi.fn(), saveNewView: vi.fn(), listReports: vi.fn(), reportChange: vi.fn(), saveNewReport: vi.fn(), updateReport: vi.fn(), numberMeasurementFile: vi.fn(), loadReportSources: vi.fn()
}));
vi.mock('@/libs/reports/reportSettings', async importOriginal => ({ ...await importOriginal(), datasetReportSettings: (...a) => m.settings(...a) }));
vi.mock('@/libs/views/viewStore', async importOriginal => ({
    ...await importOriginal(), listViews: (...a) => m.listViews(...a), saveNewView: (...a) => m.saveNewView(...a)
}));
vi.mock('@/libs/reports/reportStore', async importOriginal => ({
    ...await importOriginal(),
    listReports: (...a) => m.listReports(...a),
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
    const editor = make({ initial: { sources: ['a/measurements.geojson'], view: { uid: 'v_cover123' } }, ...options });
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
        ds: 'north-pit',
        info: vi.fn(async () => [{ properties: { meta: { name: { data: 'North pit survey' } } } }]),
        search: vi.fn(async (pattern, options) => {
            if (options?.type === ddb.entry.type.GEORASTER) return [{ path: 'ortho.tif', hash: 'h1' }, { path: 'odm_orthophoto.tif', hash: 'h3' }, { path: 'dsm.tif', hash: 'h2' }];
            if (options?.type === ddb.entry.type.VECTOR) return [{ path: 'zones.geojson', hash: 'h4' }, { path: 'a/measurements.geojson', hash: 'h5' }];
            if (options?.type) return [];
            return [{ path: 'b/measurements.geojson' }, { path: 'a/measurements.geojson' }, { path: 'a/ortho_measurements.geojson' }, { path: 'notes/readme_measurements.txt' }];
        })
    };
    choose = vi.fn();
    m.settings.mockResolvedValue({ templates: [DEFAULT_TEMPLATE, SECOND_TEMPLATE], schema: DEFAULT_SCHEMA });
    m.listViews.mockResolvedValue([{ uid: 'v_cover123', name: 'Cover', error: null, newerVersion: false }, { uid: 'v_broken00', name: 'Broken', error: 'bad', newerVersion: false }]);
    m.listReports.mockResolvedValue({ reports: [], unreadable: [] });
    m.saveNewView.mockImplementation(async (ds, state, { name }) => ({ id: 'meta-v', uid: 'v_newview0', name, data: { ...state, name }, newerVersion: false, error: null }));
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

    it('lists the measurement files, the files a view can be made of (georasters first, no measurement file) and the saved views that can be opened', async () => {
        const editor = make();
        await editor.load();
        expect(editor.measurementFiles.value).toEqual(['a/measurements.geojson', 'a/ortho_measurements.geojson', 'b/measurements.geojson']);
        expect(editor.baseFiles.value).toEqual([
            { path: 'dsm.tif', hash: 'h2', georaster: true }, { path: 'odm_orthophoto.tif', hash: 'h3', georaster: true },
            { path: 'ortho.tif', hash: 'h1', georaster: true }, { path: 'zones.geojson', hash: 'h4', georaster: false }
        ]);
        expect(editor.views.value.map(v => v.uid)).toEqual(['v_cover123']);
    });

    it('starts a new report from the map: its file as source A and its saved view, filled in and not dirty', async () => {
        const editor = make({ initial: { sources: ['a/measurements.geojson'], view: { uid: 'v_cover123' } } });
        await editor.load();
        expect(editor.draft.sources).toEqual([{ file: 'a/measurements.geojson', label: 'A' }]);
        expect(editor.viewChoice.value).toEqual({ kind: 'saved', uid: 'v_cover123' });
        expect(editor.draft.cover).toEqual({ viewId: 'v_cover123' });
        expect(editor.draft.name).toMatch(/^Cover – /);
        expect(editor.draft.title).toBe('North pit survey');
        expect(editor.draft.subtitle).toBe('Cover');
        expect(editor.draft.preparedBy).toBe('jdoe');
        expect(editor.problems.value).toEqual({});
        expect(editor.dirty.value).toBe(false);
    });

    it('starts a new report from a map state as a new view named after the map', async () => {
        const editor = make({ initial: { sources: [], view: { state: coverState(), name: 'Cover' } } });
        await editor.load();
        expect(editor.viewChoice.value).toMatchObject({ kind: 'fromMap', name: 'Cover (2)' });
        expect(editor.hasMapView).toBe(true);
        expect(editor.draft.cover).toBeNull();
    });

    it('starts a new report from the dataset page with its only saved view, and no source when there are several files', async () => {
        const editor = make();
        await editor.load();
        expect(editor.draft.sources).toEqual([]);
        expect(editor.viewChoice.value).toEqual({ kind: 'saved', uid: 'v_cover123' });
    });

    it('proposes a new view of the orthophoto when the dataset has no saved view', async () => {
        m.listViews.mockResolvedValue([]);
        const editor = make();
        await editor.load();
        expect(editor.viewChoice.value).toEqual({ kind: 'fromFile', path: 'odm_orthophoto.tif', name: 'odm_orthophoto.tif' });
        expect(editor.draft.name).toMatch(/^North pit survey – /);
    });

    it('fills in the texts, template, units, sections and files of the newest report of the dataset', async () => {
        const last = existing({ preparedBy: 'Acme Surveys', preparedFor: 'City of North', units: 'imperial', templateId: 'compact',
            sections: [{ kind: 'tables', enabled: true }], sources: [{ file: 'b/measurements.geojson', label: 'X' }], modifiedAt: '2026-11-20T10:00:00Z' });
        const older = existing({ preparedFor: 'Someone else', modifiedAt: '2026-11-01T10:00:00Z' });
        m.listReports.mockResolvedValue({ reports: [older, last], unreadable: [] });
        const editor = make();
        await editor.load();
        expect(editor.draft).toMatchObject({ preparedBy: 'Acme Surveys', preparedFor: 'City of North', units: 'imperial', templateId: 'compact' });
        expect(editor.draft.sections).toEqual([{ kind: 'tables', enabled: true }]);
        expect(editor.draft.sources).toEqual([{ file: 'b/measurements.geojson', label: 'A' }]);
        expect(editor.viewChoice.value).toEqual({ kind: 'saved', uid: 'v_cover123' });
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
    it('are listed by field: no name, no source, no view', async () => {
        m.listViews.mockResolvedValue([]);
        dataset.search.mockResolvedValue([]);
        const editor = make();
        await editor.load();
        editor.draft.name = ' ';
        expect(editor.problems.value).toEqual({
            name: 'Give the report a name', sources: 'Choose at least one measurement file', view: 'Choose the view the report draws its maps on'
        });
    });

    it('include a new view with no name or no file', async () => {
        const editor = await ready();
        editor.chooseView('fromFile');
        editor.nameView('  ');
        expect(editor.problems.value.view).toBe('Give the new view a name');
        editor.nameView('x'.repeat(101));
        expect(editor.problems.value.view).toBe('The name of the view can have at most 100 characters');
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
        expect(editor.problems.value.labels).toContain('A to Z and 0 to 9');
        editor.draft.sources[1].label = 'A';
        expect(editor.problems.value.labels).toBe('Each measurement file needs its own label');
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
        expect(editor.problems.value.view).toBe('This view was deleted: choose another');
        editor.chooseView('saved', 'v_cover123');
        expect(editor.coverDeleted.value).toBe(false);
    });

    it('make the save do nothing but show them', async () => {
        const editor = make();
        await editor.load();
        editor.draft.name = '';
        expect(await editor.save()).toBeNull();
        expect(editor.showProblems.value).toBe(true);
        expect(m.saveNewReport).not.toHaveBeenCalled();
        expect(m.numberMeasurementFile).not.toHaveBeenCalled();
    });
});

describe('the view', () => {
    it('is a saved view, a new view of a file (named after it until the user names it), or the map the editor came from', async () => {
        const editor = make({ initial: { sources: ['a/measurements.geojson'], view: { state: coverState(), name: '' } } });
        await editor.load();
        expect(editor.viewChoice.value).toMatchObject({ kind: 'fromMap', name: 'ortho.tif' });
        editor.chooseView('saved', 'v_cover123');
        expect(editor.draft.cover).toEqual({ viewId: 'v_cover123' });
        editor.chooseView('fromFile');
        expect(editor.viewChoice.value).toEqual({ kind: 'fromFile', path: 'odm_orthophoto.tif', name: 'odm_orthophoto.tif' });
        expect(editor.draft.cover).toBeNull();
        editor.chooseFile('dsm.tif');
        expect(editor.viewChoice.value).toEqual({ kind: 'fromFile', path: 'dsm.tif', name: 'dsm.tif' });
        editor.nameView('Elevation');
        editor.chooseFile('ortho.tif');
        expect(editor.viewChoice.value).toEqual({ kind: 'fromFile', path: 'ortho.tif', name: 'Elevation' });
        editor.chooseView('fromMap');
        expect(editor.viewChoice.value).toMatchObject({ kind: 'fromMap', name: 'ortho.tif', state: coverState() });
    });

    it('of a stored report that keeps a view state is kept as it is until another is chosen', async () => {
        const kept = { viewState: coverState() };
        const editor = make({ entry: existing({ cover: kept }) });
        await editor.load();
        expect(editor.viewChoice.value).toEqual({ kind: 'kept' });
        expect(editor.hasKeptView).toBe(true);
        editor.chooseView('saved', 'v_cover123');
        editor.chooseView('kept');
        expect(editor.draft.cover).toEqual(kept);
        await editor.save();
        expect(m.updateReport.mock.calls[0][2].definition.cover).toEqual(kept);
        expect(m.saveNewView).not.toHaveBeenCalled();
    });
});

describe('the sources and the sections', () => {
    it('are the files chosen: those kept keep their labels, the new ones take the next free labels', async () => {
        const editor = await ready();
        editor.setSources(['a/measurements.geojson', 'b/measurements.geojson']);
        editor.draft.sources[0].label = 'N';
        editor.setSources(['b/measurements.geojson', 'a/ortho_measurements.geojson', 'a/measurements.geojson']);
        expect(editor.draft.sources).toEqual([
            { file: 'a/measurements.geojson', label: 'N' }, { file: 'b/measurements.geojson', label: 'B' }, { file: 'a/ortho_measurements.geojson', label: 'A' }
        ]);
        editor.setSources(['b/measurements.geojson']);
        expect(editor.draft.sources).toEqual([{ file: 'b/measurements.geojson', label: 'B' }]);
    });

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

describe('save: a new view', () => {
    it('stores the view first, then the report that names it, and lists the view', async () => {
        const editor = await ready();
        editor.chooseView('fromFile');
        editor.nameView(' Pit ortho ');
        const saved = await editor.save();
        expect(saved.uid).toBe('r_newnewne');
        const [, state, options] = m.saveNewView.mock.calls[0];
        expect(state.base).toEqual({ path: 'odm_orthophoto.tif', hash: 'h3' });
        expect(state.layers.map(l => l.path)).toEqual(['odm_orthophoto.tif']);
        expect(options).toEqual({ name: 'Pit ortho', user: 'jdoe' });
        expect(m.saveNewView.mock.invocationCallOrder[0]).toBeLessThan(m.saveNewReport.mock.invocationCallOrder[0]);
        expect(m.saveNewReport.mock.calls[0][1].cover).toEqual({ viewId: 'v_newview0' });
        expect(editor.viewChoice.value).toEqual({ kind: 'saved', uid: 'v_newview0' });
        expect(editor.views.value.map(v => v.uid)).toContain('v_newview0');
        expect(editor.dirty.value).toBe(false);
    });

    it('of a file that is not a georaster has no layer', async () => {
        const editor = await ready();
        editor.chooseView('fromFile');
        editor.chooseFile('zones.geojson');
        await editor.save();
        expect(m.saveNewView.mock.calls[0][1]).toMatchObject({ base: { path: 'zones.geojson', hash: 'h4' }, layers: [] });
    });

    it('is stored once: a second save after the report failed uses the view the first one stored', async () => {
        const editor = await ready();
        editor.chooseView('fromFile');
        m.saveNewReport.mockRejectedValueOnce(new Error('The Registry did not answer'));
        expect(await editor.save()).toBeNull();
        expect(editor.formError.value).toBe('The Registry did not answer');
        expect(await editor.save()).toMatchObject({ uid: 'r_newnewne' });
        expect(m.saveNewView).toHaveBeenCalledOnce();
        expect(m.saveNewReport.mock.calls[1][1].cover).toEqual({ viewId: 'v_newview0' });
    });

    it('is not stored when the view cannot be saved, nor the report', async () => {
        const editor = await ready();
        editor.chooseView('fromFile');
        m.saveNewView.mockRejectedValueOnce(new Error('This dataset has 100 views. Delete one to save a new view.'));
        expect(await editor.save()).toBeNull();
        expect(editor.formError.value).toBe('This dataset has 100 views. Delete one to save a new view.');
        expect(m.saveNewReport).not.toHaveBeenCalled();
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
