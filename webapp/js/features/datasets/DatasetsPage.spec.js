/**
 * The organization's dataset table shows when each dataset last changed, from the server's
 * `lastModified`, and asks the server to sort by it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils';
import PrimeVue from 'primevue/config';

const reg = vi.hoisted(() => ({
    isAdmin: () => false,
    isLoggedIn: () => true,
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
                components: { RouterLink: RouterLinkStub },
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
                components: { RouterLink: RouterLinkStub },
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

    it('has the search and the view in the toolbar above the table, and Import and Create in the header', async () => {
        pendingLocations();
        await render();
        const toolbar = wrapper.find('.list-toolbar');
        expect(toolbar.find('input[aria-label="Search datasets"]').exists()).toBe(true);
        expect(toolbar.find('.view-select').exists()).toBe(true);
        expect(wrapper.find('.org-header .org-actions').exists()).toBe(false); // a user who cannot write
        wrapper.vm.orgInfo = { ...wrapper.vm.orgInfo, permissions: { canWrite: true } };
        await flushPromises();
        const actions = wrapper.find('.org-header .org-actions');
        expect(actions.findAll('button').map(b => b.attributes('title') || b.text())).toEqual(['Import Dataset', 'Create Dataset']);
        expect(actions.find('input').exists()).toBe(false);
    });

    it('has no search in the map view, which does not filter by it, and keeps the view where it was', async () => {
        pendingLocations();
        await render('map');
        expect(wrapper.find('.list-toolbar input').exists()).toBe(false);
        expect(wrapper.find('.list-toolbar .view-select').exists()).toBe(true);
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
        await wrapper.vm.handleDatasetClose('save', { name: 'Roof 2026', visibility: 0, tagline: '', slug: 'roof-2026', changeSlug: true });
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

    it('saves a new name as the display name only: the slug, and so the URL, stays', async () => {
        pendingLocations();
        await render();
        for (const fn of Object.values(datasetApi)) fn.mockClear();
        wrapper.vm.handleEdit(wrapper.vm.datasets[0]);
        await wrapper.vm.handleDatasetClose('save', { name: 'Roof 2026', visibility: 0, tagline: '', slug: 'ds', changeSlug: false });
        await flushPromises();
        expect(datasetApi.metaSet).toHaveBeenCalledWith('name', 'Roof 2026');
        expect(datasetApi.rename).not.toHaveBeenCalled();
        // The visibility only: the name is not sent a second time
        expect(datasetApi.update).toHaveBeenCalledWith(undefined, 0);
        expect(wrapper.vm.datasets[0]).toMatchObject({ slug: 'ds', name: 'Roof 2026' });
    });

    it('renames the dataset only when the user asked to change the URL', async () => {
        pendingLocations();
        await render();
        for (const fn of Object.values(datasetApi)) fn.mockClear();
        wrapper.vm.handleEdit(wrapper.vm.datasets[0]);
        await wrapper.vm.handleDatasetClose('save', { name: 'Roof 2026', visibility: 0, tagline: '', slug: 'roof', changeSlug: true });
        await flushPromises();
        expect(datasetApi.rename).toHaveBeenCalledWith('roof');
        expect(datasetApi.metaSet).toHaveBeenCalledWith('name', 'Roof 2026');
        // The rename goes first: the name and the rest go to the dataset at its new slug
        expect(datasetApi.rename.mock.invocationCallOrder[0]).toBeLessThan(datasetApi.metaSet.mock.invocationCallOrder[0]);
        expect(wrapper.vm.datasets[0].slug).toBe('roof');
    });

    it('sends nothing else when the rename is refused, and says the URL did not change', async () => {
        pendingLocations();
        await render();
        for (const fn of Object.values(datasetApi)) fn.mockClear();
        datasetApi.rename.mockImplementationOnce(() => Promise.reject(new Error('Dataset slug is invalid')));
        const notify = wrapper.vm.$notify;
        notify.error.mockClear();
        wrapper.vm.handleEdit(wrapper.vm.datasets[0]);
        await wrapper.vm.handleDatasetClose('save', { name: 'Roof 2026', visibility: 0, tagline: '', slug: 'roof', changeSlug: true });
        await flushPromises();
        expect(datasetApi.rename).toHaveBeenCalledWith('roof');
        expect(datasetApi.metaSet).not.toHaveBeenCalled();
        expect(datasetApi.update).not.toHaveBeenCalled();
        expect(datasetApi.metaUnset).not.toHaveBeenCalled();
        expect(notify.error).toHaveBeenCalledWith('The URL was not changed: Dataset slug is invalid', expect.anything());
        expect(wrapper.vm.datasets[0]).toMatchObject({ slug: 'ds', editing: false });
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

describe('DatasetsPage edit dialog (DatasetDialog)', () => {
    let dialog;
    afterEach(() => {
        dialog?.unmount();
        dialog = null;
        document.body.innerHTML = '';
    });

    async function open(props) {
        const { default: DatasetDialog } = await import('./DatasetDialog.vue');
        dialog = mount(DatasetDialog, {
            props: { orgSlug: 'org', forbiddenSlugs: ['taken'], ...props },
            global: { plugins: [PrimeVue], stubs: { Window: { template: '<div><slot /></div>' } } }
        });
        await flushPromises();
    }
    const edit = () => open({ mode: 'edit', model: { slug: 'survey-2026', name: 'Survey 2026', visibility: 0, tagline: '' } });
    const closed = () => dialog.emitted('close').at(-1);

    it('keeps the slug on a name edit: no slug field until Change URL is ticked', async () => {
        await edit();
        expect(dialog.find('#dataset-dialog-slug').exists()).toBe(false);
        await dialog.find('#dataset-dialog-dataset-name').setValue('Roof 2026');
        dialog.vm.close('save');
        expect(closed()).toEqual(['save', expect.objectContaining({ name: 'Roof 2026', slug: 'survey-2026', changeSlug: false })]);
    });

    it('warns that the old links stop working, and checks the new slug with the Registry rule', async () => {
        await edit();
        await dialog.find('#dataset-dialog-change-slug').setValue(true);
        expect(dialog.text()).toContain('Links to /r/org/survey-2026 will stop working');
        await dialog.find('#dataset-dialog-slug').setValue('Roof 2026');
        expect(dialog.text()).toContain("Dataset slug is invalid: it has 2 to 128 characters (lowercase letters, digits, '_' and '-'), starts with a letter or digit and has no '--'");
        expect(dialog.vm.isValid()).toBe(false);
        await dialog.find('#dataset-dialog-slug').setValue('taken');
        expect(dialog.vm.isValid()).toBe(false);
        await dialog.find('#dataset-dialog-slug').setValue('roof-2026');
        expect(dialog.vm.isValid()).toBe(true);
        dialog.vm.close('save');
        expect(closed()).toEqual(['save', expect.objectContaining({ slug: 'roof-2026', changeSlug: true })]);
    });

    it('shows the Latin letter rule at the name field: a new dataset has no slug field, an edit has one', async () => {
        await open({ mode: 'new' });
        await dialog.find('#dataset-dialog-dataset-name').setValue('Москва');
        expect(dialog.find('#dataset-dialog-name-error').text()).toBe('Use at least one Latin letter (a–z) or digit');
        expect(dialog.vm.isValid()).toBe(false);
        dialog.unmount();

        await edit();
        await dialog.find('#dataset-dialog-dataset-name').setValue('Москва');
        expect(dialog.find('#dataset-dialog-name-error').text()).toBe('Use at least one Latin letter (a–z) or digit in the name, or enter a slug');
        await dialog.find('#dataset-dialog-change-slug').setValue(true);
        await dialog.find('#dataset-dialog-slug').setValue('moskva');
        expect(dialog.find('#dataset-dialog-name-error').exists()).toBe(false);
        expect(dialog.vm.isValid()).toBe(true);
    });

    it('checks the slug a new dataset gets from its name', async () => {
        await open({ mode: 'new' });
        await dialog.find('#dataset-dialog-dataset-name').setValue('a');
        expect(dialog.text()).toContain('Dataset slug is invalid');
        expect(dialog.vm.isValid()).toBe(false);
        await dialog.find('#dataset-dialog-dataset-name').setValue('Survey Team');
        expect(dialog.vm.isValid()).toBe(true);
    });
});

// A Public organization of another user is readable (D-003): its permissions, not an empty list, decide the create actions
describe('DatasetsPage create actions', () => {
    let wrapper;
    beforeEach(() => {
        globalThis.HubOptions = {};
        _resetPrefListenersForTests();
        localStorage.clear();
    });
    afterEach(() => {
        wrapper?.unmount();
        wrapper = null;
        reg.isLoggedIn = () => true;
        _resetPrefListenersForTests();
    });

    async function renderEmpty(permissions) {
        reg.Organization = vi.fn(() => ({
            info: () => Promise.resolve({ name: 'Org', slug: 'org', isPublic: true, ...(permissions ? { permissions } : {}) }),
            datasetsPage: () => Promise.resolve({ items: [], total: 0 }),
            datasetLocations: vi.fn(() => Promise.resolve([])),
            datasets: () => Promise.resolve([])
        }));
        wrapper = mount(DatasetsPage, {
            global: {
                plugins: [PrimeVue],
                components: { RouterLink: RouterLinkStub },
                mocks: { $route: { params: { org: 'org' } }, $router: { push: vi.fn() }, $notify: { success: vi.fn(), error: vi.fn() } },
                stubs: {
                    DatasetDialog: true, ImportDatasetDialog: true, OrganizationDialog: true, OrganizationMembersDialog: true, MessageDialog: true,
                    DialogHost: true, Paginator: true, DatasetLocationsMap: true
                }
            }
        });
        await flushPromises();
    }
    const createActions = () => wrapper.findAll('button').map(b => b.attributes('title') || b.text())
        .filter(t => t === 'Import Dataset' || t === 'Create Dataset');

    it('shows no create or import action in a read-only Public organization without datasets', async () => {
        await renderEmpty({ canRead: true, canWrite: false, canDelete: false, canManageMembers: false });
        expect(wrapper.vm.canCreateDataset).toBe(false);
        expect(createActions()).toEqual([]);
        expect(wrapper.text()).not.toContain('create a new dataset');
    });

    it('shows them in an empty organization the user may write', async () => {
        await renderEmpty({ canRead: true, canWrite: true, canDelete: false, canManageMembers: false });
        expect(createActions()).toEqual(['Import Dataset', 'Create Dataset']);
        expect(wrapper.text()).toContain('create a new dataset');
    });

    it('shows none to an anonymous visitor of an empty Public organization (the Registry sends them no permissions)', async () => {
        reg.isLoggedIn = () => false;
        await renderEmpty(null);
        expect(wrapper.vm.canCreateDataset).toBe(false);
        expect(createActions()).toEqual([]);
        expect(wrapper.text()).not.toContain('create a new dataset');
    });

    it('offers none in an empty organization of an older Registry that sends no permissions (FR-ACC-02)', async () => {
        await renderEmpty(null);
        expect(wrapper.vm.canCreateDataset).toBe(false);
        expect(createActions()).toEqual([]);
    });

    it('offers none before the organization loaded', () => {
        expect(DatasetsPage.computed.canCreateDataset.call({ orgInfo: null, datasets: [] })).toBe(false);
        expect(DatasetsPage.computed.canCreateDataset.call({ orgInfo: null, datasets: [{ permissions: { canWrite: true } }] })).toBe(false);
    });
});

// FR-ACC-02, FR-ACC-16, D-048: an organization that did not load shows its page state, not a broken page
describe('DatasetsPage page states (FR-XC-13)', () => {
    let wrapper;
    let push;
    beforeEach(() => {
        globalThis.HubOptions = {};
        _resetPrefListenersForTests();
        localStorage.clear();
    });
    afterEach(() => {
        wrapper?.unmount();
        wrapper = null;
        reg.isLoggedIn = () => true;
        _resetPrefListenersForTests();
    });

    async function renderRefused(status) {
        const { ApiError } = await import('@/libs/ddb/apiError');
        const { RouterLinkStub } = await import('@vue/test-utils');
        const datasetsPage = vi.fn(() => Promise.resolve({ items: [], total: 0 }));
        reg.Organization = vi.fn(() => ({ info: () => Promise.reject(new ApiError('refused', status)), datasetsPage }));
        push = vi.fn(() => Promise.resolve());
        wrapper = mount(DatasetsPage, {
            global: {
                plugins: [PrimeVue],
                mocks: { $route: { params: { org: 'admin' } }, $router: { push }, $notify: { success: vi.fn(), error: vi.fn() } },
                stubs: {
                    RouterLink: RouterLinkStub, DatasetDialog: true, ImportDatasetDialog: true, OrganizationDialog: true,
                    OrganizationMembersDialog: true, MessageDialog: true, DialogHost: true, Paginator: true, DatasetLocationsMap: true
                }
            }
        });
        await flushPromises();
        return { datasetsPage };
    }
    const shownActions = () => wrapper.findAll('button').map(b => b.attributes('title') || b.text())
        .filter(t => /Import|Create|Members/.test(t));

    it('a 403 shows "You do not have access to this organization", with no header, table, Create or Import', async () => {
        const { datasetsPage } = await renderRefused(403);
        expect(wrapper.find('h1').text()).toBe('You do not have access to this organization');
        expect(wrapper.findAll('h1')).toHaveLength(1);
        expect(wrapper.text()).toContain('"admin" is private.');
        expect(wrapper.find('.org-header').exists()).toBe(false);
        expect(wrapper.find('.ds-table').exists()).toBe(false);
        expect(shownActions()).toEqual([]);
        expect(wrapper.vm.canCreateDataset).toBe(false);
        expect(datasetsPage).not.toHaveBeenCalled();
        expect(wrapper.text()).toContain('Sign in as another user');
    });

    it('a 404 shows "Organization not found" naming the slug, and does not redirect (FR-ACC-16)', async () => {
        await renderRefused(404);
        expect(wrapper.find('h1').text()).toBe('Organization not found');
        expect(wrapper.text()).toContain('"admin" does not exist.');
        expect(wrapper.findAllComponents({ name: 'RouterLinkStub' }).map(l => l.props('to'))).toContainEqual({ name: 'Organizations' });
        expect(push).not.toHaveBeenCalled();
        expect(shownActions()).toEqual([]);
    });

    it('a 401 to a visitor without a session shows the sign-in state (D-048)', async () => {
        reg.isLoggedIn = () => false;
        await renderRefused(401);
        expect(wrapper.find('h1').text()).toBe('Sign in to open this organization');
        const signIn = wrapper.findAllComponents({ name: 'RouterLinkStub' }).find(l => l.text().includes('Sign in'));
        expect(signIn.props('to')).toMatchObject({ name: 'Login' });
        expect(push).not.toHaveBeenCalled();
    });

    it('another failure keeps the page with its message', async () => {
        await renderRefused(500);
        expect(wrapper.find('.resource-state').exists()).toBe(false);
        expect(wrapper.vm.error).toBe('refused');
    });
});

describe('DatasetsPage keyboard (ORG-01)', () => {
    let wrapper;
    beforeEach(() => {
        globalThis.HubOptions = {};
        _resetPrefListenersForTests();
        localStorage.clear();
    });
    afterEach(() => {
        wrapper?.unmount();
        wrapper = null;
        document.body.innerHTML = '';
        _resetPrefListenersForTests();
    });

    async function render() {
        const { createRouter, createMemoryHistory } = await import('vue-router');
        const router = createRouter({
            history: createMemoryHistory(),
            routes: [
                { path: '/r/:org', name: 'Datasets', component: { render: () => null } },
                { path: '/r/:org/:ds', name: 'ViewDataset', component: { render: () => null } }
            ]
        });
        await router.push('/r/org');
        reg.Organization = vi.fn(() => ({
            info: () => Promise.resolve({ name: 'Org', slug: 'org', permissions: { canRead: true, canWrite: true } }),
            datasetsPage: () => Promise.resolve({ items: [serverDataset({ slug: 'site', permissions: { canRead: true, canWrite: true } })], total: 1 }),
            datasets: () => Promise.resolve([])
        }));
        wrapper = mount(DatasetsPage, {
            attachTo: document.body,
            global: {
                plugins: [PrimeVue, router],
                // The menu's transition runs, so that it reports when it is shown
                stubs: {
                    transition: false, DatasetDialog: true, ImportDatasetDialog: true, OrganizationDialog: true, OrganizationMembersDialog: true,
                    MessageDialog: true, DialogHost: true, EmptyState: true, Paginator: true
                }
            }
        });
        await flushPromises();
        return router;
    }
    const menu = () => document.querySelector('[role="menubar"]');
    const settle = async () => {
        await flushPromises();
        await new Promise(resolve => setTimeout(resolve, 20));
        await flushPromises();
    };

    it('renders the dataset name as a link to the dataset, which Enter opens', async () => {
        await render();
        const link = wrapper.find('a.ds-name');
        expect(link.attributes('href')).toBe('/r/org/site');
        expect(link.classes()).toContain('stretched-link');
    });

    it('opens the dataset once on a click of the name: the link, not the row too', async () => {
        const router = await render();
        const push = vi.spyOn(router, 'push');
        await wrapper.find('a.ds-name').trigger('click');
        await flushPromises();
        expect(push).toHaveBeenCalledTimes(1);
        expect(router.currentRoute.value.name).toBe('ViewDataset');
    });

    it('has a row menu button in the Actions column, which opens the row menu', async () => {
        await render();
        const kebab = wrapper.find('button.ds-row-menu');
        expect(kebab.attributes('aria-haspopup')).toBe('menu');
        expect(kebab.attributes('aria-expanded')).toBe('false');
        await kebab.trigger('click');
        await settle();
        expect(menu()).not.toBeNull();
        expect(menu().textContent).toContain('Open');
        expect(wrapper.vm.contextMenuDataset.slug).toBe('site');
        expect(wrapper.find('button.ds-row-menu').attributes('aria-expanded')).toBe('true');
    });

    it('opens the row menu with Shift+F10 or the Menu key on the name', async () => {
        for (const key of [{ key: 'F10', shiftKey: true }, { key: 'ContextMenu' }]) {
            await render();
            await wrapper.find('a.ds-name').trigger('keydown', key);
            await settle();
            expect(menu()).not.toBeNull();
            expect(wrapper.vm.contextMenuDataset.slug).toBe('site');
            wrapper.unmount();
            wrapper = null;
            document.body.innerHTML = '';
        }
    });
});
