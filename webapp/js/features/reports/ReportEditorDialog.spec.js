/**
 * The report editor dialog: its fields are labelled, a save that cannot be done says what is wrong at the fields, a
 * saved report closes it with its uid, a source that could not be numbered keeps it open to name the file (the report is
 * stored all the same), a template that was deleted is said, and leaving with changes asks first.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import Select from 'primevue/select';
import ddb from 'ddb';
import { defaultState } from '@/libs/views/viewState';
import { DEFAULT_SCHEMA, DEFAULT_TEMPLATE } from '@/libs/reports/reportSettings';

const m = vi.hoisted(() => ({ saveNewReport: vi.fn(), updateReport: vi.fn(), reportChange: vi.fn(), numberMeasurementFile: vi.fn(), settings: vi.fn() }));
vi.mock('@/libs/reports/reportSettings', async importOriginal => ({
    ...await importOriginal(),
    datasetReportSettings: (...a) => m.settings(...a)
}));
vi.mock('@/libs/views/viewStore', async importOriginal => ({
    ...await importOriginal(),
    listViews: async () => [{ uid: 'v_cover123', name: 'Cover view', error: null, newerVersion: false }]
}));
vi.mock('@/libs/reports/reportSources', () => ({
    loadReportSources: async (ds, sources) => sources.map(s => ({ label: s.label, file: s.file, document: { metadata: {}, features: [] } }))
}));
vi.mock('@/libs/reports/reportStore', async importOriginal => ({
    ...await importOriginal(),
    saveNewReport: (...a) => m.saveNewReport(...a),
    updateReport: (...a) => m.updateReport(...a),
    reportChange: (...a) => m.reportChange(...a)
}));
vi.mock('@/libs/map/measurementStorage', async importOriginal => ({ ...await importOriginal(), numberMeasurementFile: (...a) => m.numberMeasurementFile(...a) }));

const { default: ReportEditorDialog } = await import('./ReportEditorDialog.vue');

const searchDataset = async (pattern, options) => (options?.type === ddb.entry.type.GEORASTER
    ? [{ path: 'ortho.tif', hash: 'h1' }]
    : [{ path: 'a/measurements.geojson' }, { path: 'b/measurements.geojson' }]);
const dataset = { search: vi.fn(searchDataset) };
const coverState = () => defaultState({ path: 'ortho.tif', hash: 'h1' }, { baseIsGeoraster: true });
const existing = (extra = {}) => ({
    id: 'meta-7', uid: 'r_k3x9q2m7', name: 'North pit', newerVersion: false, error: null,
    data: {
        version: 1, uid: 'r_k3x9q2m7', name: 'North pit', templateId: 'standard', title: '', subtitle: '', preparedBy: '', preparedFor: '', notes: '',
        sources: [{ file: 'a/measurements.geojson', label: 'A' }], cover: { viewId: 'v_cover123' }, units: null,
        filter: { groups: [], categories: [], severities: [], statuses: [], kinds: [], owners: [] },
        sections: [{ kind: 'cover', enabled: true }, { kind: 'summary', enabled: true }], ...extra
    }
});

let wrapper;
let choose;
async function render(props = {}) {
    wrapper = mount(ReportEditorDialog, {
        props: { dataset, user: 'jdoe', choose, ...props },
        attachTo: document.body,
        global: { plugins: [PrimeVue] }
    });
    await flushPromises();
}
const body = () => document.body;
const field = id => document.getElementById(id);
const confirmButton = () => body().querySelector('button[data-confirm]');
const cancelButton = () => body().querySelector('button[data-cancel]');
async function type(id, value) {
    const input = field(id);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await flushPromises();
}
async function click(element) {
    element.click();
    await flushPromises();
}

beforeEach(() => {
    Object.values(m).forEach(fn => fn.mockReset());
    vi.spyOn(console, 'error').mockImplementation(() => {});
    choose = vi.fn();
    dataset.search.mockImplementation(searchDataset);
    m.settings.mockResolvedValue({ templates: [DEFAULT_TEMPLATE], schema: DEFAULT_SCHEMA });
    m.reportChange.mockResolvedValue(null);
    m.saveNewReport.mockImplementation(async (ds, definition) => ({ id: 'meta-9', uid: 'r_newnewne', name: definition.name, data: definition }));
    m.updateReport.mockImplementation(async (ds, uid, { definition }) => ({ id: 'meta-8', uid, name: definition.name, data: definition }));
    m.numberMeasurementFile.mockResolvedValue({ written: true });
});
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

describe('the fields', () => {
    it('are labelled: every input, select and text area of the form has a label that names it', async () => {
        await render({ initial: { sources: ['a/measurements.geojson'], cover: { viewState: coverState() } } });
        const controls = [...body().querySelectorAll('.report-editor input:not([type="hidden"]), .report-editor textarea')];
        expect(controls.length).toBeGreaterThan(8);
        for (const control of controls) {
            const labelled = control.getAttribute('aria-label') || control.getAttribute('aria-labelledby')
                || (control.id && body().querySelector(`label[for="${control.id}"]`));
            expect(labelled, control.outerHTML).toBeTruthy();
        }
    });

    it('group the filter and the cover choices in fieldsets with a legend', async () => {
        await render();
        const legends = [...body().querySelectorAll('.report-editor legend')].map(l => l.textContent.trim());
        expect(legends).toEqual(expect.arrayContaining(['Sources', 'Cover view', 'Filter', 'Sections', 'Categories', 'Statuses', 'Kinds', 'Made in']));
    });

    it('start empty from the dataset page: a name to give, no source, no cover', async () => {
        await render();
        expect(field('report-name').value).toBe('');
        expect(body().querySelectorAll('.report-source')).toHaveLength(0);
        expect(body().textContent).toContain('Template');
        expect(confirmButton().textContent.trim()).toBe('Save');
    });

    it('start from the map with its file as source A and its view as the cover', async () => {
        await render({ initial: { sources: ['a/measurements.geojson'], cover: { viewState: coverState() } } });
        expect(body().querySelectorAll('.report-source')).toHaveLength(1);
        expect(body().querySelector('.report-source input').value).toBe('A');
        expect(body().querySelector('[data-testid="cover-state"]').textContent).toContain('The map as it is now: 1 layer');
    });

    it('show the report being edited', async () => {
        await render({ entry: existing({ title: 'Inspection' }) });
        expect(field('report-name').value).toBe('North pit');
        expect(field('report-title').value).toBe('Inspection');
    });

    it('give a new report the default sections of the template picked in the list', async () => {
        m.settings.mockResolvedValue({ templates: [DEFAULT_TEMPLATE, { ...DEFAULT_TEMPLATE, id: 'compact', name: 'Compact', defaultSections: ['cover', 'tables'] }], schema: DEFAULT_SCHEMA });
        await render();
        const select = wrapper.findAllComponents(Select).find(c => c.props('inputId') === 'report-template');
        select.vm.$emit('update:modelValue', 'compact');
        await flushPromises();
        const checked = [...body().querySelectorAll('input[id^="report-section-"]')].filter(i => i.checked).map(i => i.id);
        expect(checked).toEqual(['report-section-cover', 'report-section-tables']);
    });

    it('tell that the template of the report was deleted and which one it uses', async () => {
        await render({ entry: existing({ templateId: 'gone' }) });
        expect(body().querySelector('[data-testid="template-notice"]').textContent.trim()).toBe(`Template gone no longer exists; this report uses ${DEFAULT_TEMPLATE.name}`);
    });

    it('ask for another cover when the saved view of the report was deleted', async () => {
        await render({ entry: existing({ cover: { viewId: 'v_gone0000' } }) });
        await click(confirmButton());
        expect(body().textContent).toContain('The cover view was deleted: choose another');
        expect(m.updateReport).not.toHaveBeenCalled();
    });
});

describe('save', () => {
    it('says what is wrong at the fields and stores nothing when the name, the source or the cover is missing', async () => {
        await render();
        await click(confirmButton());
        expect(body().querySelector('[data-testid="form-problems"]').textContent).toContain('cannot be saved yet');
        expect(field('report-name').getAttribute('aria-invalid')).toBe('true');
        expect(field('report-name-error').textContent).toContain('Give the report a name');
        expect(body().textContent).toContain('Add at least one measurement file');
        expect(body().textContent).toContain('Choose the view the report draws its maps on');
        expect(m.saveNewReport).not.toHaveBeenCalled();
        expect(wrapper.emitted('close')).toBeUndefined();
    });

    it('stores the report, numbers its source and closes with the uid', async () => {
        await render({ initial: { sources: ['a/measurements.geojson'], cover: { viewState: coverState() } } });
        await type('report-name', 'North pit');
        await type('report-title', 'Inspection');
        await click(confirmButton());
        expect(m.saveNewReport).toHaveBeenCalledOnce();
        const definition = m.saveNewReport.mock.calls[0][1];
        expect(definition).toMatchObject({ name: 'North pit', title: 'Inspection', sources: [{ file: 'a/measurements.geojson', label: 'A' }] });
        expect(m.numberMeasurementFile).toHaveBeenCalledWith(dataset, 'a/measurements.geojson');
        expect(wrapper.emitted('close')).toEqual([[{ uid: 'r_newnewne' }]]);
    });

    it('stays open when a source could not be numbered: it names the file and why, the report is stored, and Open report closes with it', async () => {
        m.numberMeasurementFile.mockRejectedValue(new Error('The file cannot be written'));
        await render({ initial: { sources: ['a/measurements.geojson'], cover: { viewState: coverState() } } });
        await type('report-name', 'North pit');
        await click(confirmButton());
        expect(m.saveNewReport).toHaveBeenCalledOnce();
        expect(wrapper.emitted('close')).toBeUndefined();
        const notice = body().querySelector('[data-testid="numbering-failed"]');
        expect(notice.textContent).toContain('a/measurements.geojson');
        expect(notice.textContent).toContain('The file cannot be written');
        expect(notice.textContent).toContain('dash');
        expect(confirmButton().textContent.trim()).toBe('Open report');
        await click(confirmButton());
        expect(m.saveNewReport).toHaveBeenCalledOnce();
        expect(wrapper.emitted('close')).toEqual([[{ uid: 'r_newnewne' }]]);
    });

    it('offers Save again after a source could not be numbered and the report was changed: it updates the stored report and numbers again', async () => {
        m.numberMeasurementFile.mockRejectedValueOnce(new Error('The file cannot be written'));
        await render({ initial: { sources: ['a/measurements.geojson'], cover: { viewState: coverState() } } });
        await type('report-name', 'North pit');
        await click(confirmButton());
        expect(confirmButton().textContent.trim()).toBe('Open report');
        await type('report-title', 'Inspection');
        expect(confirmButton().textContent.trim()).toBe('Save');
        await click(confirmButton());
        expect(m.saveNewReport).toHaveBeenCalledOnce();
        expect(m.updateReport).toHaveBeenCalledOnce();
        expect(m.updateReport.mock.calls[0][1]).toBe('r_newnewne');
        expect(m.updateReport.mock.calls[0][2].definition).toMatchObject({ title: 'Inspection' });
        expect(m.numberMeasurementFile).toHaveBeenCalledTimes(2);
        expect(wrapper.emitted('close')).toEqual([[{ uid: 'r_newnewne' }]]);
    });

    it('asks before closing a stored report with changes that are not saved, and closes with the stored report when they are discarded', async () => {
        m.numberMeasurementFile.mockRejectedValue(new Error('The file cannot be written'));
        await render({ initial: { sources: ['a/measurements.geojson'], cover: { viewState: coverState() } } });
        await type('report-name', 'North pit');
        await click(confirmButton());
        await type('report-title', 'Inspection');
        await click(cancelButton());
        const question = document.getElementById('confirmDialog');
        expect(question.textContent).toContain('Discard the changes?');
        expect(wrapper.emitted('close')).toBeUndefined();
        await click(question.querySelector('button[data-confirm]'));
        expect(wrapper.emitted('close')).toEqual([[{ uid: 'r_newnewne' }]]);
        expect(m.updateReport).not.toHaveBeenCalled();
    });

    it('shows the refusal of the store at the top', async () => {
        m.saveNewReport.mockRejectedValue(new Error('This dataset has 100 reports. Delete one to save a new report.'));
        await render({ initial: { sources: ['a/measurements.geojson'], cover: { viewState: coverState() } } });
        await type('report-name', 'North pit');
        await click(confirmButton());
        expect(body().querySelector('[data-testid="form-error"]').textContent.trim()).toBe('This dataset has 100 reports. Delete one to save a new report.');
        expect(wrapper.emitted('close')).toBeUndefined();
    });

    it('asks Overwrite, Save as new or Cancel when another session changed the report, through the question the host gives', async () => {
        m.reportChange.mockResolvedValue('changed');
        choose.mockResolvedValue('cancel');
        await render({ entry: existing() });
        await click(confirmButton());
        expect(choose).toHaveBeenCalledWith(expect.objectContaining({ title: 'Report changed', confirmText: 'Overwrite', secondaryText: 'Save as new' }));
        expect(m.updateReport).not.toHaveBeenCalled();
        expect(wrapper.emitted('close')).toBeUndefined();
    });
});

describe('leaving', () => {
    it('closes at once when nothing changed', async () => {
        await render({ entry: existing() });
        await click(cancelButton());
        expect(wrapper.emitted('close')).toEqual([[null]]);
    });

    it('asks first when the report has changes that are not saved, and keeps editing on Cancel', async () => {
        await render({ entry: existing() });
        await type('report-title', 'Changed');
        await click(cancelButton());
        const question = document.getElementById('confirmDialog');
        expect(question).not.toBeNull();
        expect(question.textContent).toContain('Discard the changes?');
        expect(wrapper.emitted('close')).toBeUndefined();
        await click(question.querySelector('button[data-cancel]'));
        expect(wrapper.emitted('close')).toBeUndefined();
        expect(field('report-title').value).toBe('Changed');
    });

    it('closes without a report when the changes are discarded', async () => {
        await render({ entry: existing() });
        await type('report-title', 'Changed');
        await click(cancelButton());
        await click(document.getElementById('confirmDialog').querySelector('button[data-confirm]'));
        expect(wrapper.emitted('close')).toEqual([[null]]);
    });
});

describe('loading', () => {
    it('says why the editor cannot be used when the settings cannot be read, and reads them again on Retry', async () => {
        m.settings.mockRejectedValueOnce(new Error('The Registry did not answer'));
        await render();
        expect(body().textContent).toContain('The Registry did not answer');
        expect(field('report-name')).toBeNull();
        expect(confirmButton().disabled).toBe(true);
        const retry = [...body().querySelectorAll('button')].find(b => b.textContent.trim() === 'Retry');
        await click(retry);
        expect(field('report-name')).not.toBeNull();
        expect(confirmButton().disabled).toBe(false);
    });

    it('opens with empty pickers when the searches of the dataset fail: they are best effort', async () => {
        dataset.search.mockRejectedValue(new Error('offline'));
        await render();
        expect(field('report-name')).not.toBeNull();
        expect(body().querySelectorAll('.report-source')).toHaveLength(0);
    });
});
