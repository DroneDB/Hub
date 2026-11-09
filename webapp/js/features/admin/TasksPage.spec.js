/**
 * Admin > Tasks, handleCancelDialogClose (FR-PRC-10, D-002): a cancel refused for a task that has
 * already ended is a neutral message, a refusal for an active task or another error is an error,
 * a 200 that deleted nothing says nothing, and the list is reloaded whatever the answer.
 */
import { describe, it, expect, vi } from 'vitest';
import { ApiError } from '@/libs/ddb/apiError';

const reg = vi.hoisted(() => ({ Organization: null, admin: {} }));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: reg }));

const { default: TasksPage } = await import('./TasksPage.vue');
const { handleCancelDialogClose, datasetFor } = TasksPage.methods;

const TASK = { taskId: 't1', orgSlug: 'org', dsSlug: 'ds', toolId: 'build', state: 'Processing' };

function cancelVm(answer, read = () => Promise.resolve({ state: 'Succeeded' })) {
    const dataset = { cancelTask: vi.fn(() => answer), getTask: vi.fn(read) };
    reg.Organization = vi.fn(() => ({ Dataset: vi.fn(() => dataset) }));
    const vm = {
        dataset,
        cancelDialogOpen: true,
        cancellingTask: { ...TASK },
        loadTasks: vi.fn(() => Promise.resolve()),
        scheduleAutoRefresh: vi.fn(),
        $notify: { info: vi.fn(), error: vi.fn(), success: vi.fn() }
    };
    vm.datasetFor = task => datasetFor.call(vm, task);
    return vm;
}

function expectRefreshed(vm) {
    expect(vm.loadTasks).toHaveBeenCalled();
    expect(vm.scheduleAutoRefresh).toHaveBeenCalled();
}

describe('TasksPage handleCancelDialogClose', () => {
    it('shows a neutral message when the server refuses the cancel of a task that has already ended', async () => {
        const vm = cancelVm(Promise.reject(new ApiError('The task has already ended (Succeeded)', 400)));
        await handleCancelDialogClose.call(vm, 'confirm');
        expect(reg.Organization).toHaveBeenCalledWith('org');
        expect(vm.dataset.cancelTask).toHaveBeenCalledWith('t1');
        expect(vm.dataset.getTask).toHaveBeenCalledWith('t1');
        expect(vm.$notify.info).toHaveBeenCalledWith('The task had already ended, so there was nothing to cancel.', { summary: 'Not cancelled' });
        expect(vm.$notify.error).not.toHaveBeenCalled();
        expect(vm.cancelDialogOpen).toBe(false);
        expect(vm.cancellingTask).toBeNull();
        expectRefreshed(vm);
    });

    it('shows the refusal as an error when the task is still active', async () => {
        const vm = cancelVm(Promise.reject(new ApiError('Refused', 400)), () => Promise.resolve({ state: 'Enqueued' }));
        await handleCancelDialogClose.call(vm, 'confirm');
        expect(vm.$notify.error).toHaveBeenCalledWith('Refused', { summary: 'Cancel failed' });
        expect(vm.$notify.info).not.toHaveBeenCalled();
        expectRefreshed(vm);
    });

    it('shows an error when the task cannot be read again after a 400', async () => {
        const vm = cancelVm(Promise.reject(new ApiError('Refused', 400)), () => Promise.reject(new ApiError('Not found', 404)));
        await handleCancelDialogClose.call(vm, 'confirm');
        expect(vm.$notify.error).toHaveBeenCalledWith('Refused', { summary: 'Cancel failed' });
        expect(vm.$notify.info).not.toHaveBeenCalled();
        expectRefreshed(vm);
    });

    it('shows an error on another status', async () => {
        const vm = cancelVm(Promise.reject(new ApiError('Server error', 500)));
        await handleCancelDialogClose.call(vm, 'confirm');
        expect(vm.$notify.error).toHaveBeenCalledWith('Server error', { summary: 'Cancel failed' });
        expect(vm.dataset.getTask).not.toHaveBeenCalled();
        expectRefreshed(vm);
    });

    it('says nothing when the task was cancelled or the server deleted nothing', async () => {
        for (const deleted of [true, false]) {
            const vm = cancelVm(Promise.resolve({ deleted }));
            await handleCancelDialogClose.call(vm, 'confirm');
            expect(vm.$notify.info).not.toHaveBeenCalled();
            expect(vm.$notify.error).not.toHaveBeenCalled();
            expect(vm.$notify.success).not.toHaveBeenCalled();
            expectRefreshed(vm);
        }
    });

    it('does nothing when the cancel is not confirmed', async () => {
        const vm = cancelVm(Promise.resolve({ deleted: true }));
        await handleCancelDialogClose.call(vm, 'cancel');
        expect(vm.dataset.cancelTask).not.toHaveBeenCalled();
        expect(vm.loadTasks).not.toHaveBeenCalled();
        expect(vm.cancelDialogOpen).toBe(false);
        expect(vm.cancellingTask).toBeNull();
    });
});

describe('TasksPage delete question', () => {
    it('uses the shared delete wording: the task by its tool and path, Delete / Cancel', () => {
        const vm = { deletingTask: { ...TASK, path: 'a.tif' }, taskTools: [], toolTitle: () => 'Build' };
        const props = TasksPage.computed.deleteDialog.call(vm);
        expect(props).toMatchObject({ title: 'Delete task “Build”', confirmText: 'Delete', cancelText: 'Cancel', confirmButtonClass: 'danger' });
        expect(props.message).toContain('<strong>Build</strong> on a.tif');
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

describe('TasksPage cancel question', () => {
    it('tells an import that its files and the dataset it created are deleted (FR-UPL-05)', () => {
        const vm = { cancellingTask: { ...TASK, toolId: 'import-dataset' }, taskTools: [], toolTitle: () => 'Import dataset' };
        const props = TasksPage.computed.cancelDialog.call(vm);
        expect(props).toMatchObject({ title: 'Cancel Task', confirmText: 'Cancel Task', cancelText: "Don't Cancel", confirmButtonClass: 'danger' });
        expect(props.warningMessage).toBe('The files imported so far are deleted, and so is the dataset that this import created.');
    });

    it('asks the plain question for another task', () => {
        const vm = { cancellingTask: { ...TASK, path: 'a.tif' }, taskTools: [], toolTitle: () => 'Build' };
        const props = TasksPage.computed.cancelDialog.call(vm);
        expect(props.warningMessage).toBeUndefined();
        expect(props.message).toContain('<strong>Build</strong> (path: a.tif) will be stopped.');
    });
});
