/**
 * The organization's dataset table shows when each dataset last changed, from the server's
 * `lastModified`, and asks the server to sort by it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';

const reg = vi.hoisted(() => ({
    isAdmin: () => false,
    features: { get: () => false },
    Organization: null
}));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: reg }));

const { default: DatasetsPage } = await import('./DatasetsPage.vue');
const { datasetListQuery } = await import('@/libs/datasetList');
const { PREF, applyAccountValue, _resetPrefListenersForTests } = await import('@/libs/preferences');

const serverDataset = extra => ({
    slug: 'ds', creationDate: '2026-01-01T00:00:00Z', size: 1, properties: { entries: 2, meta: {} },
    permissions: { canRead: true }, lastModified: null, ...extra
});

describe('DatasetsPage rows', () => {
    it('maps the date of the last change to milliseconds, and keeps an unknown one null', () => {
        const row = DatasetsPage.methods.toRow;
        expect(row.call({}, serverDataset({ lastModified: '2026-03-04T05:06:07Z' })).lastModified).toBe(Date.parse('2026-03-04T05:06:07Z'));
        expect(row.call({}, serverDataset()).lastModified).toBeNull();
        expect(row.call({}, serverDataset({ lastModified: undefined })).lastModified).toBeNull();
    });
});

describe('DatasetsPage table', () => {
    async function render(sortColumn) {
        globalThis.HubOptions = {};
        localStorage.clear();
        if (sortColumn) localStorage.setItem('dataset_table_prefs', JSON.stringify({ sortColumn, sortDirection: 'desc' }));
        const datasetsPage = vi.fn(() => Promise.resolve({ items: [serverDataset({ lastModified: '2026-03-04T05:06:07Z' })], total: 1 }));
        reg.Organization = vi.fn(() => ({
            info: () => Promise.resolve({ name: 'Org', slug: 'org', permissions: {} }),
            datasetsPage
        }));
        const wrapper = mount(DatasetsPage, {
            global: {
                plugins: [PrimeVue],
                mocks: { $route: { params: { org: 'org' } }, $router: { push: vi.fn() } },
                stubs: { DatasetDialog: true, ImportDatasetDialog: true, OrganizationDialog: true, OrganizationMembersDialog: true, MessageDialog: true, DialogHost: true, EmptyState: true, Paginator: true }
            }
        });
        await flushPromises();
        return { wrapper, datasetsPage };
    }

    it('has a sortable Modified column that appears with the wide layouts', async () => {
        const { wrapper } = await render();
        const header = wrapper.findAll('th').find(th => th.text().includes('Modified'));
        expect(header).toBeTruthy();
        expect(header.classes()).toContain('d-xl-table-cell');
        expect(header.attributes('aria-sort')).toBeDefined();
        expect(wrapper.find('tbody .relative-time').exists()).toBe(true);
        wrapper.unmount();
    });

    it('asks the server to sort by lastModified when that is the stored sort', async () => {
        const { wrapper, datasetsPage } = await render('lastModified');
        expect(datasetsPage).toHaveBeenCalledWith(datasetListQuery({ page: 1, pageSize: 10, sortColumn: 'lastModified', sortDirection: 'desc' }), expect.anything());
        wrapper.unmount();
    });
});

describe('DatasetsPage map view', () => {
    let wrapper;
    let locations;

    beforeEach(() => {
        globalThis.HubOptions = {};
        _resetPrefListenersForTests();
        localStorage.clear();
    });
    afterEach(() => {
        wrapper?.unmount();
        wrapper = null;
        _resetPrefListenersForTests();
    });

    /** `datasetLocations` calls: each stays pending until the test settles it. */
    function pendingLocations() {
        const calls = [];
        locations = vi.fn(({ signal }) => new Promise((resolve, reject) => {
            calls.push({ signal, resolve, reject });
            signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
        }));
        return calls;
    }

    /** What a dataset of the organization does when it is edited. */
    const datasetApi = {
        metaSet: vi.fn(() => Promise.resolve()),
        metaUnset: vi.fn(() => Promise.resolve()),
        rename: vi.fn(slug => Promise.resolve({ slug })),
        update: vi.fn(() => Promise.resolve(true))
    };

    async function render(view) {
        if (view) localStorage.setItem(PREF.DATASET_TABLE, JSON.stringify({ view }));
        reg.Organization = vi.fn(() => ({
            info: () => Promise.resolve({ name: 'Org', slug: 'org', permissions: {} }),
            datasetsPage: () => Promise.resolve({ items: [serverDataset()], total: 1 }),
            datasetLocations: locations,
            datasets: () => Promise.resolve([]),
            Dataset: () => datasetApi
        }));
        wrapper = mount(DatasetsPage, {
            global: {
                plugins: [PrimeVue],
                mocks: { $route: { params: { org: 'org' } }, $router: { push: vi.fn() }, $notify: { success: vi.fn(), error: vi.fn() } },
                stubs: {
                    DatasetDialog: true, ImportDatasetDialog: true, OrganizationDialog: true, OrganizationMembersDialog: true, MessageDialog: true,
                    DialogHost: true, EmptyState: true, Paginator: true,
                    DatasetLocationsMap: { props: ['groups', 'loading'], template: '<div class="map-stub" />' }
                }
            }
        });
        await flushPromises();
    }
    const mapProps = () => wrapper.findComponent('.map-stub').props();
    const stored = () => JSON.parse(localStorage.getItem(PREF.DATASET_TABLE));

    it('shows the table, and asks nothing of the locations, by default', async () => {
        pendingLocations();
        await render();
        expect(wrapper.find('.ds-table').exists()).toBe(true);
        expect(wrapper.find('.map-stub').exists()).toBe(false);
        expect(wrapper.find('.view-select').exists()).toBe(true);
        expect(locations).not.toHaveBeenCalled();
    });

    it('shows the map of the organization instead of the table when that is the stored view', async () => {
        const calls = pendingLocations();
        await render('map');
        expect(wrapper.find('.ds-table').exists()).toBe(false);
        expect(locations).toHaveBeenCalledTimes(1);
        expect(mapProps().loading).toBe(true);
        const datasets = [{ slug: 'a', name: 'A', bbox: [1, 1, 2, 2] }];
        calls[0].resolve(datasets);
        await flushPromises();
        expect(mapProps()).toEqual({ groups: [{ org: 'org', orgName: 'Org', datasets }], loading: false });
    });

    it('asks once for the visit, however often the view is switched', async () => {
        const calls = pendingLocations();
        await render();
        wrapper.vm.view = 'map';
        await flushPromises();
        calls[0].resolve([]);
        await flushPromises();
        wrapper.vm.view = 'list';
        await flushPromises();
        wrapper.vm.view = 'map';
        await flushPromises();
        expect(locations).toHaveBeenCalledTimes(1);
        expect(mapProps().loading).toBe(false);
    });

    it('ends the request when the map is left before it answers, and asks again when it is shown', async () => {
        const calls = pendingLocations();
        await render('map');
        wrapper.vm.view = 'list';
        await flushPromises();
        expect(calls[0].signal.aborted).toBe(true);
        expect(wrapper.vm.locationsLoading).toBe(false);
        wrapper.vm.view = 'map';
        await flushPromises();
        expect(locations).toHaveBeenCalledTimes(2);
        expect(calls[1].signal.aborted).toBe(false);
    });

    it('ends the request when the page goes away', async () => {
        const calls = pendingLocations();
        await render('map');
        wrapper.unmount();
        wrapper = null;
        expect(calls[0].signal.aborted).toBe(true);
    });

    it('says why the map is empty when the locations cannot be read', async () => {
        const calls = pendingLocations();
        await render('map');
        calls[0].reject(Object.assign(new Error('Forbidden'), { status: 403 }));
        await flushPromises();
        expect(wrapper.vm.error).toBe('Forbidden');
        expect(wrapper.vm.locationsLoading).toBe(false);
    });

    it('asks again after a dataset was added or removed while the map is shown', async () => {
        const calls = pendingLocations();
        await render('map');
        calls[0].resolve([]);
        await flushPromises();
        await wrapper.vm.reloadDatasets();
        await flushPromises();
        expect(locations).toHaveBeenCalledTimes(2);
    });

    it('asks again after a dataset was renamed in the list, and shows the new slug on the map', async () => {
        const calls = pendingLocations();
        await render('map');
        calls[0].resolve([{ slug: 'ds', name: 'ds', bbox: [1, 1, 2, 2] }]);
        await flushPromises();
        wrapper.vm.view = 'list';
        await flushPromises();

        datasetApi.rename.mockClear();
        wrapper.vm.handleEdit(wrapper.vm.datasets[0]);
        await wrapper.vm.handleDatasetClose('save', { name: 'Roof 2026', visibility: 0, tagline: '' });
        await flushPromises();
        expect(datasetApi.rename).toHaveBeenCalledWith('roof-2026');
        expect(wrapper.vm.datasets[0].slug).toBe('roof-2026');
        // The list does not need the locations
        expect(locations).toHaveBeenCalledTimes(1);

        wrapper.vm.view = 'map';
        await flushPromises();
        expect(locations).toHaveBeenCalledTimes(2);
        calls[1].resolve([{ slug: 'roof-2026', name: 'Roof 2026', bbox: [1, 1, 2, 2] }]);
        await flushPromises();
        expect(mapProps().groups[0].datasets.map(d => d.slug)).toEqual(['roof-2026']);
    });

    it('stores the view with the other table settings, which reach the account whole', async () => {
        pendingLocations();
        await render();
        wrapper.vm.view = 'map';
        await flushPromises();
        expect(stored()).toEqual({ sortColumn: 'name', sortDirection: 'asc', itemsPerPage: 10, view: 'map' });
    });

    it('follows a change of the view made elsewhere, and stores nothing back', async () => {
        pendingLocations();
        await render();
        localStorage.clear();
        applyAccountValue(PREF.DATASET_TABLE, { sortColumn: 'name', sortDirection: 'asc', itemsPerPage: 10, view: 'map' });
        await flushPromises();
        expect(wrapper.vm.view).toBe('map');
        expect(locations).toHaveBeenCalledTimes(1);
    });
});
