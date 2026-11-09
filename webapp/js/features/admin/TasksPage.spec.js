/**
 * Admin > Tasks runs the row actions of the dataset Tasks tab (useTaskActions, FR-XC-15) on the task's own dataset:
 * a cancel, a retry and the log go through the per-dataset endpoints of the row's organization and dataset, a
 * delete through the admin endpoint, and the list is read again after each. The behaviour of the actions themselves
 * is in useTaskActions.spec.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import { ApiError } from '@/libs/ddb/apiError';

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

// FR-ACC-15: the server refuses the admin rights the client believed in
describe('TasksPage refused (403)', () => {
    it('goes home with the notice of the guard, not silently', async () => {
        const { deniedLocation } = await import('@/libs/authRoutes');
        reg.admin.adminTasks = vi.fn(() => Promise.reject(new ApiError('Forbidden', 403)));
        const vm = { $router: { push: vi.fn(() => Promise.resolve()) }, loading: false, items: [], total: 0 };
        const error = vi.spyOn(console, 'error').mockImplementation(() => { });
        await TasksPage.methods.loadTasks.call(vm);
        error.mockRestore();
        expect(vm.$router.push).toHaveBeenCalledWith(deniedLocation('AdminTasks'));
        expect(vm.$router.push).toHaveBeenCalledWith({ name: 'Organizations', query: { notice: 'denied:AdminTasks' } });
    });
});

// The cancel question of the page is the one of every task cancel (useTaskActions, libs/tasks/cancelConfirmation)
describe('TasksPage cancel question', () => {
    // The question the page opens for a cancel of `task`, answered "Don't Cancel"
    async function questionFor(task) {
        await mountPage();
        const asked = wrapper.vm.taskActions.cancel(task);
        await flushPromises();
        const [dialog] = wrapper.vm.dialogs.stack.value;
        dialog.finish('cancel');
        expect(await asked).toBeNull();
        return dialog.props;
    }

    it('tells an import that its files and the dataset it created are deleted (FR-UPL-05)', async () => {
        const props = await questionFor({ ...TASK, state: 'Processing', toolId: 'import-dataset', targetLabel: null });
        expect(props).toMatchObject({ title: 'Cancel Task', confirmText: 'Cancel Task', cancelText: "Don't Cancel", confirmButtonClass: 'danger' });
        expect(props.warningMessage).toBe('The files imported so far are deleted, and so is the dataset that this import created.');
    });

    it('asks the plain question for another task, naming its target', async () => {
        const props = await questionFor({ ...TASK, state: 'Processing', toolId: 'build', targetLabel: null, path: 'a.tif' });
        expect(props.warningMessage).toBeUndefined();
        expect(props.message).toContain('<strong>build</strong> (path: a.tif) will be stopped.');
    });
});
