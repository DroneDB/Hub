/**
 * Admin > Tasks runs the row actions of the dataset Tasks tab (useTaskActions, FR-XC-15) on the task's own dataset:
 * a cancel, a retry and the log go through the per-dataset endpoints of the row's organization and dataset, a
 * delete through the admin endpoint, and the list is read again after each. The behaviour of the actions themselves
 * is in useTaskActions.spec.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PrimeVue from 'primevue/config';

const reg = vi.hoisted(() => ({ Organization: null, admin: {}, features: { value: () => [] } }));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: reg }));

const { default: TasksPage } = await import('./TasksPage.vue');

const TASK = {
    taskId: 't1', orgSlug: 'org', dsSlug: 'ds', toolId: 'merge', version: '1', state: 'Failed',
    createdAt: '2026-11-09T10:00:00Z', targetLabel: '→ out.tif', actions: ['viewLog', 'retry', 'delete']
};

let wrapper;
afterEach(() => wrapper?.unmount());

async function mountPage() {
    const dataset = { retryTask: vi.fn(() => Promise.resolve()), getTask: vi.fn(() => Promise.resolve({ logTail: [] })) };
    reg.Organization = vi.fn(() => ({ Dataset: vi.fn(() => dataset) }));
    reg.admin = {
        usersDetailed: vi.fn(() => Promise.resolve([])),
        adminTasks: vi.fn(() => Promise.resolve({ items: [{ ...TASK }], total: 1 })),
        adminDeleteTask: vi.fn(() => Promise.resolve(true))
    };
    wrapper = mount(TasksPage, {
        global: {
            plugins: [PrimeVue],
            stubs: { TasksTable: true, TaskLogDialog: true, DialogHost: true },
            mocks: { $router: { push: vi.fn(() => Promise.resolve()) }, $notify: { success: vi.fn(), info: vi.fn(), error: vi.fn() } }
        }
    });
    await flushPromises();
    return { dataset };
}

describe('TasksPage row actions', () => {
    it('retries on the row\'s dataset and reads the list again', async () => {
        const { dataset } = await mountPage();
        const calls = reg.admin.adminTasks.mock.calls.length;

        expect(await wrapper.vm.taskActions.retry(wrapper.vm.items[0])).toBe(true);

        expect(reg.Organization).toHaveBeenCalledWith('org');
        expect(dataset.retryTask).toHaveBeenCalledWith('t1');
        expect(reg.admin.adminTasks.mock.calls.length).toBeGreaterThan(calls);
    });

    it('titles the log with the tool, the target and the dataset', async () => {
        await mountPage();
        expect(wrapper.vm.taskActions.logTitle(TASK)).toMatch(/^merge · → out\.tif · org\/ds · /);
    });
});
