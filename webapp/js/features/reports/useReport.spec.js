/**
 * The live report: it reads the definition, the measurement files, the settings and the cover view each time it opens
 * (so it shows the values they have now), builds the model, and tells why there is none.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import ddb from 'ddb';
import { ApiError } from '@/libs/ddb/apiError';
import { defaultState, newLayer } from '@/libs/views/viewState';
import { DEFAULT_SCHEMA, DEFAULT_TEMPLATE } from '@/libs/reports/reportSettings';
import { definitionOf, documentOf, mapFeature, cloudFeature } from '@/libs/reports/reportModel.fixtures';

const m = vi.hoisted(() => ({ dataset: null, listReports: vi.fn(), listViews: vi.fn(), settings: vi.fn() }));
vi.mock('@/libs/api/sharedRegistry', () => ({
    default: { Organization: () => ({ Dataset: () => m.dataset, datasets: () => Promise.resolve([{ slug: 'site', name: 'North site' }]) }) }
}));
vi.mock('@/libs/reports/reportStore', async importOriginal => ({ ...await importOriginal(), listReports: (...a) => m.listReports(...a) }));
vi.mock('@/libs/views/viewStore', async importOriginal => ({ ...await importOriginal(), listViews: (...a) => m.listViews(...a) }));
vi.mock('@/libs/reports/reportSettings', async importOriginal => ({ ...await importOriginal(), datasetReportSettings: (...a) => m.settings(...a) }));

const { useReport } = await import('./useReport');

const point = (id, ref, props = {}) => mapFeature(id, ref, 'point', { type: 'Point', coordinates: [11, 45] }, { name: `Point ${ref}`, ...props });
const file = (...features) => JSON.stringify(documentOf(features));
const root = (canWrite = true) => ({ properties: { permissions: { canRead: true, canWrite, canDelete: canWrite } } });
const entry = definition => ({ id: 'meta-1', uid: definition.uid, name: definition.name, data: definition, newerVersion: false, error: null });

function coverView() {
    const state = defaultState({ path: 'f/ortho.tif', hash: 'h1' }, { baseIsGeoraster: true });
    state.layers = [newLayer('f/ortho.tif', { hash: 'h1' })];
    return { uid: 'v_cover', name: 'Cover', data: state, error: null, newerVersion: false };
}

let files;
let report;
let wrapper;
function open(uid = 'r_k3x9q2m7') {
    wrapper = mount(defineComponent({
        setup() {
            report = useReport({ org: 'acme', ds: 'site', uid });
            return () => h('div');
        }
    }), { global: { plugins: [createPinia()] } });
    return report.loaded;
}

beforeEach(() => {
    setActivePinia(createPinia());
    files = { 'f/ortho_measurements.geojson': file(point('p1', '1', { status: 'open' }), point('p2', '2')) };
    m.dataset = {
        org: 'acme',
        ds: 'site',
        baseApi: '/orgs/acme/ds/site',
        info: vi.fn(async () => [root()]),
        getFileContents: vi.fn(async path => {
            if (!(path in files)) throw new ApiError('nf', 404);
            return files[path];
        }),
        getRasterValueInfo: vi.fn(async () => ({ bandCount: 1, dataType: 'Float32' })),
        list: vi.fn(async () => [{ path: 'g/dsm.tif', type: ddb.entry.type.GEORASTER }])
    };
    m.listReports.mockResolvedValue({ reports: [entry(definitionOf(['f/ortho_measurements.geojson']))], unreadable: [] });
    m.listViews.mockResolvedValue([coverView()]);
    m.settings.mockResolvedValue({ templates: [DEFAULT_TEMPLATE], schema: DEFAULT_SCHEMA });
    window.history.replaceState(null, '', '/r/acme/site/reports/r_k3x9q2m7');
    vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
    wrapper?.unmount();
    vi.restoreAllMocks();
});

describe('a report that opens', () => {
    it('builds the model from the definition and the files, with the dataset name, and says whether the user can write', async () => {
        await open();
        expect(report.loading.value).toBe(false);
        expect(report.model.value.name).toBe('North pit');
        expect(report.model.value.datasetName).toBe('North site');
        expect(report.model.value.items.map(i => i.displayRef)).toEqual(['1', '2']);
        expect(report.canWrite.value).toBe(true);
        expect(m.listReports).toHaveBeenCalledWith(m.dataset, { fresh: true });
    });

    it('is read-only for a user who cannot write', async () => {
        m.dataset.info.mockResolvedValue([root(false)]);
        await open();
        expect(report.canWrite.value).toBe(false);
        expect(report.model.value).not.toBeNull();
    });

    it('shows the values the files have now each time it opens, not what they had when it was saved', async () => {
        await open();
        expect(report.model.value.items.find(i => i.id === 'p1').status).toBe('open');
        wrapper.unmount();
        files['f/ortho_measurements.geojson'] = file(point('p1', '1', { status: 'closed' }), point('p2', '2'));
        await open();
        expect(report.model.value.items.find(i => i.id === 'p1').status).toBe('closed');
    });

    it('reads everything again on reload', async () => {
        await open();
        files['f/ortho_measurements.geojson'] = file(point('p1', '1', { status: 'closed' }));
        await report.reload();
        expect(report.model.value.items).toHaveLength(1);
        expect(report.model.value.items[0].status).toBe('closed');
    });
});

describe('the logo', () => {
    afterEach(() => { delete globalThis.HubOptions; });

    it('is the logo the instance configures when the template has none', async () => {
        globalThis.HubOptions = { appLogo: '/images/acme.svg' };
        await open();
        expect(report.model.value.logo).toEqual({ source: 'instance', url: '/images/acme.svg' });
    });

    it('is none when the instance configures none (the banner of the header is not the instance\'s)', async () => {
        globalThis.HubOptions = {};
        await open();
        expect(report.model.value.logo).toBeNull();
    });

    it('is the logo of the template when it has one', async () => {
        globalThis.HubOptions = { appLogo: '/images/acme.svg' };
        m.settings.mockResolvedValue({ templates: [{ ...DEFAULT_TEMPLATE, logo: 'report-logo-standard.png' }], schema: DEFAULT_SCHEMA });
        await open();
        expect(report.model.value.logo.source).toBe('template');
    });
});

describe('the links of the items', () => {
    it('are the report address with the item anchor, absolute, and the cover view with the item for the file the cover saves its measurements in', async () => {
        await open();
        const item = report.model.value.items[0];
        const block = report.model.value.sections.find(s => s.kind === 'items').blocks.find(b => b.type === 'heading' && b.itemId === item.id);
        expect(block.anchor).toBe(`item-${item.id}`);
        expect(block.viewerUrl).toBe('/r/acme/site/views/v_cover?item=p1');
        const qr = report.model.value.sections.find(s => s.kind === 'items').blocks.find(b => b.type === 'qr');
        expect(qr.url).toBe(`${window.location.origin}/r/acme/site/reports/r_k3x9q2m7#item-p1`);
    });

    it('open the map on the owner of the file for another 2D source, found by listing its folder', async () => {
        files['g/dsm_measurements.geojson'] = file(point('q1', '1'));
        m.listReports.mockResolvedValue({ reports: [entry(definitionOf(['f/ortho_measurements.geojson', 'g/dsm_measurements.geojson']))], unreadable: [] });
        await open();
        expect(m.dataset.list).toHaveBeenCalledWith('g');
        const heading = report.model.value.sections.find(s => s.kind === 'items').blocks.find(b => b.type === 'heading' && b.itemId === 'q1');
        expect(heading.viewerUrl).toMatch(/^\/r\/acme\/site\/view\/[^/]+\/map\?item=q1$/);
        expect(heading.text.startsWith('B-1')).toBe(true);
    });

    it('open the point cloud viewer for a 3D item', async () => {
        files['f/ortho_measurements.geojson'] = file(cloudFeature('c1', '1', 'distance', { type: 'LineString', coordinates: [[11, 45], [11.001, 45]] }, { name: 'Span', distance: 12 }));
        await open();
        const heading = report.model.value.sections.find(s => s.kind === 'items').blocks.find(b => b.type === 'heading' && b.itemId === 'c1');
        expect(heading.viewerUrl).toMatch(/\/pointcloud\?item=c1$/);
    });
});

describe('what the report says is wrong', () => {
    it('lists a source that does not exist and shows the other sources', async () => {
        m.listReports.mockResolvedValue({ reports: [entry(definitionOf(['f/ortho_measurements.geojson', 'gone_measurements.geojson']))], unreadable: [] });
        await open();
        expect(report.model.value.failedSources.map(s => s.file)).toEqual(['gone_measurements.geojson']);
        expect(report.model.value.items).toHaveLength(2);
        expect(report.model.value.notices.some(n => n.code === 'sourceFailed' && n.text.includes('gone_measurements.geojson'))).toBe(true);
    });

    it('says the cover view was deleted when the saved view is gone', async () => {
        m.listViews.mockResolvedValue([]);
        await open();
        expect(report.model.value.coverDeleted).toBe(true);
        expect(report.model.value.notices.map(n => n.code)).toContain('coverDeleted');
    });

    it('treats a cover view that cannot be read, or is of a newer version, as a deleted one: the notice, and items on the basemap only', async () => {
        for (const broken of [{ error: 'a layer path is not valid', newerVersion: false }, { error: null, newerVersion: true }]) {
            m.listViews.mockResolvedValue([{ ...coverView(), ...broken }]);
            await open();
            expect(report.model.value.coverDeleted).toBe(true);
            expect(report.model.value.notices.map(n => n.code)).toContain('coverDeleted');
            wrapper.unmount();
        }
        wrapper = null;
    });

    it('uses the first template of the organization with the notice when its template was deleted', async () => {
        m.listReports.mockResolvedValue({ reports: [entry(definitionOf(['f/ortho_measurements.geojson'], { templateId: 'gone' }))], unreadable: [] });
        await open();
        expect(report.model.value.templateMissing).toBe(true);
        expect(report.model.value.notices.map(n => n.code)).toContain('templateMissing');
    });
});

describe('a report that cannot be shown', () => {
    it('is missing when the dataset has no report with the uid', async () => {
        m.listReports.mockResolvedValue({ reports: [], unreadable: [] });
        await open();
        expect(report.missing.value).toBe(true);
        expect(report.model.value).toBeNull();
        expect(report.loading.value).toBe(false);
    });

    it('is unreadable when it is stored and cannot be read, with the reason', async () => {
        m.listReports.mockResolvedValue({ reports: [], unreadable: [{ id: '3', uid: 'r_k3x9q2m7', name: 'Broken', error: 'a source label is used twice' }] });
        await open();
        expect(report.missing.value).toBe(false);
        expect(report.unreadable.value).toBe('This report cannot be read: a source label is used twice.');
    });

    it('is of a newer version when the application that saved it is newer', async () => {
        m.listReports.mockResolvedValue({ reports: [{ ...entry(definitionOf()), newerVersion: true }], unreadable: [] });
        await open();
        expect(report.unreadable.value).toBe('This report was saved by a newer version of the application.');
    });

    it('keeps the error of the dataset (no access, sign in, not found) for the page state', async () => {
        const denied = new ApiError('denied', 401);
        m.dataset.info.mockRejectedValue(denied);
        await open();
        expect(report.loadError.value).toBe(denied);
        expect(report.model.value).toBeNull();
        expect(m.listReports).not.toHaveBeenCalled();
    });

    it('keeps the error of the list of reports', async () => {
        const failure = new Error('boom');
        m.listReports.mockRejectedValue(failure);
        await open();
        expect(report.loadError.value).toBe(failure);
        expect(report.errorMessage.value).toBe('boom');
    });
});
