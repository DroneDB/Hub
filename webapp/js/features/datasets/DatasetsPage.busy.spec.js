/**
 * The dataset list and its busy datasets: while an import or a rescan of its index runs, the Registry refuses every request
 * on a dataset but its delete and its tasks, and its list says so (`busy`). The row shows "Importing… 40 %" from the list,
 * then from the task store that follows the task; it does not open (its name is text, a click and Open do nothing), Edit
 * is off with the reason, Delete says that the task stops first; the list reloads when the task ends. Only busy rows are
 * followed: no task list is asked for the others.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils';
import PrimeVue from 'primevue/config';

const reg = vi.hoisted(() => ({ isAdmin: () => false, isLoggedIn: () => true, features: { get: () => false }, Organization: null }));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: reg }));
// The delete question and its request: what the row passes is the subject here (useEntityDelete has its own spec)
const h_ = vi.hoisted(() => ({ deleteEntity: null }));
vi.mock('@/composables/useEntityDelete', () => ({ useEntityDelete: () => (...args) => h_.deleteEntity(...args) }));

const { default: DatasetsPage } = await import('./DatasetsPage.vue');
const { default: taskMonitor } = await import('@/libs/tasks/taskMonitor');

const serverDataset = (slug, busy = null) => ({
    slug, creationDate: '2026-01-01T00:00:00Z', size: 1, properties: { entries: 2, meta: {} },
    permissions: { canRead: true, canWrite: true, canDelete: true }, lastModified: null, ...(busy ? { busy } : {})
});
const importTask = (extra = {}) => ({ taskId: 'imp1', toolId: 'import-dataset', state: 'Processing', progressPercent: 40, ...extra });

let tasksBySlug;
let seq = 0;
let datasetsPage;
let datasets;
let push;
let wrapper;

async function render(items) {
    globalThis.HubOptions = {};
    localStorage.clear();
    datasets = {};
    // A key of its own per test: the store of the app's tasks is a module that outlives the page
    seq += 1;
    datasetsPage = vi.fn(() => Promise.resolve({ items: items(), total: 2 }));
    reg.Organization = vi.fn(() => ({
        info: () => Promise.resolve({ name: 'Org', slug: 'org', permissions: {} }),
        datasetsPage,
        Dataset: slug => (datasets[slug] ||= {
            baseApi: `/orgs/org/ds/${slug}-${seq}`, org: 'org', ds: `${slug}-${seq}`,
            getTasks: vi.fn(async () => tasksBySlug[slug] ?? []),
            delete: vi.fn(async () => true)
        })
    }));
    push = vi.fn();
    wrapper = mount(DatasetsPage, {
        attachTo: document.body,
        global: {
            plugins: [PrimeVue],
            components: { RouterLink: RouterLinkStub },
            mocks: { $route: { params: { org: 'org' } }, $router: { push } },
            stubs: { DatasetDialog: true, ImportDatasetDialog: true, OrganizationDialog: true, OrganizationMembersDialog: true, MessageDialog: true, DialogHost: true, EmptyState: true, Paginator: true }
        }
    });
    await flushPromises();
    return wrapper;
}

const rowOf = slug => wrapper.findAll('tbody tr').find(tr => tr.text().includes(slug));
const busyImport = { kind: 'importing', taskId: 'imp1', progress: 40 };

beforeEach(() => {
    tasksBySlug = {};
    h_.deleteEntity = vi.fn(async () => true);
});
afterEach(() => {
    // The store of the app outlives the page: it lets the tracked tasks go
    for (const dataset of Object.values(datasets ?? {})) taskMonitor.forgetBusy(dataset);
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
});

describe('DatasetsPage rows of busy datasets', () => {
    it('shows "Importing… 40 %" from the list on the busy row, its name as text, and nothing on the others', async () => {
        tasksBySlug = { aukerman: [importTask()] };
        await render(() => [serverDataset('aukerman', busyImport), serverDataset('plain')]);

        expect(rowOf('aukerman').find('.ds-busy').text()).toBe('Importing… 40 %');
        expect(rowOf('aukerman').find('.ds-busy').attributes('role')).toBe('status');
        expect(rowOf('aukerman').find('a.ds-name').exists()).toBe(false);
        expect(rowOf('aukerman').find('.ds-name-busy').text()).toBe('aukerman');
        expect(rowOf('plain').find('.ds-busy').exists()).toBe(false);
        expect(rowOf('plain').find('a.ds-name').exists()).toBe(true);
    });

    it('says "Rescanning…" for a rescan, without a progress that is not known yet', async () => {
        await render(() => [serverDataset('aukerman', { kind: 'rescanning', taskId: 'r1', progress: null }), serverDataset('plain')]);
        expect(rowOf('aukerman').find('.ds-busy').text()).toBe('Rescanning…');
    });

    it('asks no task list for a row that is not busy, and follows the busy row only', async () => {
        tasksBySlug = { aukerman: [importTask()] };
        await render(() => [serverDataset('aukerman', busyImport), serverDataset('plain')]);

        expect(datasets.aukerman.getTasks).toHaveBeenCalled();
        expect(datasets.plain?.getTasks.mock.calls.length ?? 0).toBe(0);
    });

    it('follows the progress the task store gives', async () => {
        tasksBySlug = { aukerman: [importTask()] };
        await render(() => [serverDataset('aukerman', { kind: 'importing', taskId: 'imp1', progress: null }), serverDataset('plain')]);

        tasksBySlug = { aukerman: [importTask({ progressPercent: 75 })] };
        await taskMonitor.forceRefresh(datasets.aukerman);
        await flushPromises();

        expect(rowOf('aukerman').find('.ds-busy').text()).toBe('Importing… 75 %');
    });

    it('does not open a busy dataset on a click of the row, and opens the others', async () => {
        await render(() => [serverDataset('aukerman', busyImport), serverDataset('plain')]);

        await rowOf('aukerman').find('td').trigger('click');
        expect(push).not.toHaveBeenCalled();
        wrapper.vm.viewDataset(wrapper.vm.datasets.find(ds => ds.slug === 'aukerman'));
        expect(push).not.toHaveBeenCalled();

        await rowOf('plain').find('td').trigger('click');
        expect(push).toHaveBeenCalledWith({ name: 'ViewDataset', params: { org: 'org', ds: 'plain' } });
    });

    it('offers only Delete in the row menu of a busy dataset: Open and Edit are off and say why', async () => {
        await render(() => [serverDataset('aukerman', busyImport), serverDataset('plain')]);
        wrapper.vm.contextMenuDataset = wrapper.vm.datasets.find(ds => ds.slug === 'aukerman');
        const items = wrapper.vm.datasetContextMenuItems.filter(item => !item.separator);

        expect(items.map(item => [item.label, !!item.disabled])).toEqual([
            ['Open (The dataset is being imported)', true],
            ['Edit (The dataset is being imported)', true],
            ['Delete', false]
        ]);

        wrapper.vm.contextMenuDataset = wrapper.vm.datasets.find(ds => ds.slug === 'plain');
        expect(wrapper.vm.datasetContextMenuItems.filter(item => !item.separator).map(item => [item.label, !!item.disabled]))
            .toEqual([['Open', false], ['Edit', false], ['Delete', false]]);
    });

    it('turns Edit off with the reason, and keeps Delete', async () => {
        await render(() => [serverDataset('aukerman', busyImport), serverDataset('plain')]);
        const edit = rowOf('aukerman').find('button[aria-label="Edit dataset"]');

        expect(edit.attributes('aria-disabled')).toBe('true');
        expect(edit.attributes('title')).toBe('Edit dataset: The dataset is being imported');
        await edit.trigger('click');
        expect(wrapper.vm.dsDialogOpen).toBe(false);

        const remove = rowOf('aukerman').find('button[aria-label="Delete dataset"]');
        expect(remove.attributes('disabled')).toBeUndefined();
        expect(rowOf('plain').find('button[aria-label="Edit dataset"]').attributes('aria-disabled')).toBeUndefined();
    });

    it('says that the import or the rescan stops first when a busy dataset is deleted, and that nothing ended on its own', async () => {
        tasksBySlug = { aukerman: [importTask()] };
        await render(() => [serverDataset('aukerman', busyImport), serverDataset('plain')]);
        const forget = vi.spyOn(taskMonitor, 'forgetBusy');

        await rowOf('aukerman').find('button[aria-label="Delete dataset"]').trigger('click');
        const [, options] = h_.deleteEntity.mock.calls[0];
        expect(options.warning).toBe('The import stops first, then the dataset and all its files are deleted.');
        expect(await options.remove()).toBe(true);
        expect(forget).toHaveBeenCalledWith(datasets.aukerman);
        expect(datasets.aukerman.delete).toHaveBeenCalledTimes(1);

        await rowOf('plain').find('button[aria-label="Delete dataset"]').trigger('click');
        expect(h_.deleteEntity.mock.calls[1][1].warning).toBe('All the files will be deleted too.');
        forget.mockRestore();
    });

    it('says the same for a rescan', async () => {
        await render(() => [serverDataset('aukerman', { kind: 'rescanning', taskId: 'r1', progress: 10 }), serverDataset('plain')]);
        await rowOf('aukerman').find('button[aria-label="Delete dataset"]').trigger('click');
        expect(h_.deleteEntity.mock.calls[0][1].warning).toBe('The rescan stops first, then the dataset and all its files are deleted.');
    });

    it('reloads the list when the store says the task ended, and the tag goes', async () => {
        tasksBySlug = { aukerman: [importTask()] };
        let busy = busyImport;
        await render(() => [serverDataset('aukerman', busy), serverDataset('plain')]);
        expect(rowOf('aukerman').find('.ds-busy').exists()).toBe(true);
        const loads = datasetsPage.mock.calls.length;

        busy = null;
        tasksBySlug = { aukerman: [importTask({ state: 'Succeeded', progressPercent: 100 })] };
        await taskMonitor.forceRefresh(datasets.aukerman);
        await flushPromises();

        expect(datasetsPage.mock.calls.length).toBeGreaterThan(loads);
        expect(rowOf('aukerman').find('.ds-busy').exists()).toBe(false);
        expect(rowOf('aukerman').find('a.ds-name').exists()).toBe(true);
    });

    it('shows the dataset of an import cancelled a moment ago as being deleted, not as a row to open, and drops it when it is gone', async () => {
        const { ApiError } = await import('@/libs/ddb/apiError');
        let rows = () => [serverDataset('river'), serverDataset('plain')];
        tasksBySlug = { river: [importTask({ state: 'Deleted' })] };
        await render(() => rows());
        expect(rowOf('river').find('a.ds-name').exists()).toBe(true);

        // The cancel answered and the list loaded before the Registry deleted the dataset
        taskMonitor.followCancelled(datasets.river, { taskId: 'imp1', toolId: 'import-dataset' });
        await vi.waitFor(() => expect(rowOf('river').find('.ds-busy').exists()).toBe(true));
        expect(rowOf('river').find('.ds-busy').text()).toBe('Deleting…');
        expect(rowOf('river').find('a.ds-name').exists()).toBe(false);
        await rowOf('river').find('td').trigger('click');
        expect(push).not.toHaveBeenCalled();

        const loads = datasetsPage.mock.calls.length;
        rows = () => [serverDataset('plain')];
        datasets.river.getTasks.mockRejectedValue(new ApiError('Not found', 404));
        await taskMonitor.forceRefresh(datasets.river);
        await flushPromises();

        expect(datasetsPage.mock.calls.length).toBeGreaterThan(loads);
        expect(rowOf('river')).toBeUndefined();
    });
});
