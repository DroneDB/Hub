/**
 * The dataset list while an import runs (FR-UPL-10, FR-XC-16): after a load the page asks the task list of each row once, the
 * store of the app tracks the imports that run, the row shows 'Importing… 40 %' from it, and the list reloads when the
 * import ends.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils';
import PrimeVue from 'primevue/config';

const reg = vi.hoisted(() => ({ isAdmin: () => false, isLoggedIn: () => true, features: { get: () => false }, Organization: null }));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: reg }));

const { default: DatasetsPage } = await import('./DatasetsPage.vue');
const { default: taskMonitor } = await import('@/libs/tasks/taskMonitor');

const serverDataset = slug => ({
    slug, creationDate: '2026-01-01T00:00:00Z', size: 1, properties: { entries: 2, meta: {} },
    permissions: { canRead: true }, lastModified: null
});
const importTask = (extra = {}) => ({ taskId: 'imp1', toolId: 'import-dataset', state: 'Processing', progressPercent: 40, ...extra });

let tasksBySlug;
let datasetsPage;

async function render() {
    globalThis.HubOptions = {};
    localStorage.clear();
    datasetsPage = vi.fn(() => Promise.resolve({ items: [serverDataset('aukerman'), serverDataset('plain')], total: 2 }));
    reg.Organization = vi.fn(() => ({
        info: () => Promise.resolve({ name: 'Org', slug: 'org', permissions: {} }),
        datasetsPage,
        Dataset: slug => ({ baseApi: `/orgs/org/ds/${slug}`, org: 'org', ds: slug, getTasks: vi.fn(async () => tasksBySlug[slug] ?? []) })
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
    await vi.waitFor(() => expect(wrapper.findAll('.ds-importing').length + wrapper.findAll('tbody tr').length).toBeGreaterThan(0));
    return wrapper;
}

const rowOf = (wrapper, slug) => wrapper.findAll('tbody tr').find(tr => tr.text().includes(slug));

describe('DatasetsPage rows of datasets that are being imported', () => {
    beforeEach(() => { tasksBySlug = {}; });

    it('shows "Importing… 40 %" on the row of a dataset whose import runs, and nothing on the others', async () => {
        tasksBySlug = { aukerman: [importTask()] };
        const wrapper = await render();
        await vi.waitFor(() => expect(rowOf(wrapper, 'aukerman').find('.ds-importing').exists()).toBe(true));

        expect(rowOf(wrapper, 'aukerman').find('.ds-importing').text()).toBe('Importing… 40 %');
        expect(rowOf(wrapper, 'plain').find('.ds-importing').exists()).toBe(false);

        tasksBySlug = { aukerman: [importTask({ state: 'Succeeded', progressPercent: 100 })] };
        await taskMonitor.forceRefresh(wrapper.vm.org.Dataset('aukerman'));
        wrapper.unmount();
    });

    it('asks the task list of each visible row, once, after the load', async () => {
        const asked = [];
        const wrapper = await (async () => {
            tasksBySlug = new Proxy({}, { get: (_, slug) => { asked.push(slug); return []; } });
            return render();
        })();
        await flushPromises();

        expect(asked.filter(s => s === 'aukerman')).toHaveLength(1);
        expect(asked.filter(s => s === 'plain')).toHaveLength(1);
        wrapper.unmount();
    });

    it('reloads the list when the store says the import ended, and the tag goes', async () => {
        tasksBySlug = { aukerman: [importTask()] };
        const wrapper = await render();
        await vi.waitFor(() => expect(rowOf(wrapper, 'aukerman').find('.ds-importing').exists()).toBe(true));
        const loads = datasetsPage.mock.calls.length;

        tasksBySlug = { aukerman: [importTask({ state: 'Succeeded', progressPercent: 100 })] };
        await taskMonitor.forceRefresh(wrapper.vm.org.Dataset('aukerman'));
        await flushPromises();

        expect(datasetsPage.mock.calls.length).toBeGreaterThan(loads);
        await vi.waitFor(() => expect(rowOf(wrapper, 'aukerman').find('.ds-importing').exists()).toBe(false));
        wrapper.unmount();
    });
});
