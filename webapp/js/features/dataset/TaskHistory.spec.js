/**
 * Unit tests for the TaskHistory.vue pagination/filter semantics:
 * - filter changes reset back to the first page (via onFilterChange)
 * - background store refreshes (applyFilters(false)) keep the current page
 * - a shrinking list clamps onto the last valid page
 * and cancelTask (FR-PRC-10): a cancel refused for a task that has already ended is a neutral message,
 * and the row is refreshed whatever the answer
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import TaskHistory from './TaskHistory.vue';
import taskMonitor from '@/libs/tasks/taskMonitor';
import { ApiError } from '@/libs/ddb/apiError';

// cancelTask refreshes the shared task store: the calls are asserted, the store is not under test
vi.mock('@/libs/tasks/taskMonitor', () => ({
    default: { forceRefresh: vi.fn(() => Promise.resolve()), on: vi.fn(), off: vi.fn() },
    datasetKey: vi.fn()
}));

// applyFilters reports the bulk-download state to the dataset session store
beforeEach(() => setActivePinia(createPinia()));

const { applyFilters, onFilterChange } = TaskHistory.methods;

// Minimal fake component instance — just the state the methods under test touch.
function fakeVm(tasks, { page = 0, selectedState = '', selectedTool = '' } = {}) {
    const vm = {
        tasks,
        filteredTasks: [],
        selectedState,
        selectedTool,
        currentPageFirst: page,
        pageSize: 20,
        // Present on the real component (useTaskFormatting); unused unless
        // a task has toolId 'bulk-download', which these fixtures avoid.
        isActive: () => false,
    };
    // Delegate so composed methods (e.g. onFilterChange) resolve this.applyFilters.
    vm.applyFilters = (resetPage = true) => applyFilters.call(vm, resetPage);
    return vm;
}

function fixedTask(i, over = {}) {
    return { taskId: `t${i}`, toolId: 'extract', state: i % 2 ? 'Succeeded' : 'Processing', ...over };
}

const manyTasks = Array.from({ length: 25 }, (_, i) => fixedTask(i + 1));

describe('applyFilters — page handling', () => {
    it('resets to the first page by default (filter change)', () => {
        const vm = fakeVm(manyTasks, { page: 40 });
        applyFilters.call(vm);
        expect(vm.filteredTasks).toHaveLength(25);
        expect(vm.currentPageFirst).toBe(0);
    });

    it('keeps a valid current page when called with resetPage = false', () => {
        const vm = fakeVm(manyTasks, { page: 20 }); // second page of 25 rows
        applyFilters.call(vm, false);
        expect(vm.filteredTasks).toHaveLength(25);
        expect(vm.currentPageFirst).toBe(20);
    });

    it('clamps onto the last valid page when the list shrinks below the current page', () => {
        // 25 tasks, page 40 is out of range (only pages 0 and 20 exist)
        let vm = fakeVm(Array.from({ length: 25 }, (_, i) => fixedTask(i + 1)), { page: 40 });
        vm.tasks = vm.tasks.slice(0, 24);
        applyFilters.call(vm, false);
        expect(vm.currentPageFirst).toBe(20);

        // shrink to a single page
        vm = fakeVm(manyTasks, { page: 40 });
        vm.tasks = vm.tasks.slice(0, 15);
        applyFilters.call(vm, false);
        expect(vm.currentPageFirst).toBe(0);
    });

    it('keeps page 0 when the list becomes empty', () => {
        const vm = fakeVm([], { page: 20 });
        applyFilters.call(vm, false);
        expect(vm.filteredTasks).toHaveLength(0);
        expect(vm.currentPageFirst).toBe(0);
    });
});

describe('applyFilters — filtering', () => {
    it('filters by state and tool together', () => {
        const vm = fakeVm(
            [
                fixedTask(1, { state: 'Succeeded', toolId: 'extract' }),
                fixedTask(2, { state: 'Succeeded', toolId: 'build' }),
                fixedTask(3, { state: 'Failed', toolId: 'extract' }),
            ],
            { selectedState: 'Succeeded', selectedTool: 'build' },
        );
        applyFilters.call(vm);
        expect(vm.filteredTasks).toHaveLength(1);
        expect(vm.filteredTasks[0].taskId).toBe('t2');
    });

    it('returns everything when no filter is set', () => {
        const vm = fakeVm(manyTasks);
        applyFilters.call(vm);
        expect(vm.filteredTasks).toHaveLength(25);
    });
});

describe('onFilterChange', () => {
    it('always resets the page, even when PrimeVue passes a falsy value (All States = empty string)', () => {
        const vm = fakeVm(manyTasks, { page: 40 });
        onFilterChange.call(vm, '');
        expect(vm.currentPageFirst).toBe(0);
    });

    it('resets the page for a concrete value too', () => {
        const vm = fakeVm(manyTasks, { page: 40, selectedState: 'Processing' });
        onFilterChange.call(vm, 'Processing');
        expect(vm.currentPageFirst).toBe(0);
    });
});

describe('cancelTask', () => {
    const { cancelTask } = TaskHistory.methods;

    beforeEach(() => taskMonitor.forceRefresh.mockClear());

    function cancelVm(answer, read = () => Promise.resolve({ state: 'Succeeded' })) {
        return {
            tools: [],
            toolTitle: id => id,
            confirm: vi.fn(() => Promise.resolve(true)),
            dataset: { cancelTask: vi.fn(() => answer), getTask: vi.fn(read) },
            loadTasks: vi.fn(() => Promise.resolve()),
            $notify: { info: vi.fn(), error: vi.fn(), success: vi.fn() }
        };
    }

    function expectRefreshed(vm) {
        expect(taskMonitor.forceRefresh).toHaveBeenCalledWith(vm.dataset);
        expect(vm.loadTasks).toHaveBeenCalled();
    }

    it('shows a neutral message when the server refuses the cancel of a task that has already ended', async () => {
        const vm = cancelVm(Promise.reject(new ApiError('The task has already ended (Succeeded)', 400)));
        await cancelTask.call(vm, fixedTask(1, { state: 'Processing' }));
        expect(vm.dataset.cancelTask).toHaveBeenCalledWith('t1');
        expect(vm.dataset.getTask).toHaveBeenCalledWith('t1');
        expect(vm.$notify.info).toHaveBeenCalledWith('The task had already ended, so there was nothing to cancel.', { summary: 'Not cancelled' });
        expect(vm.$notify.error).not.toHaveBeenCalled();
        expectRefreshed(vm);
    });

    it('shows the refusal as an error when the task is still active', async () => {
        const vm = cancelVm(Promise.reject(new ApiError('Refused', 400)), () => Promise.resolve({ state: 'Processing' }));
        await cancelTask.call(vm, fixedTask(2, { state: 'Processing' }));
        expect(vm.$notify.error).toHaveBeenCalledWith('Refused', { summary: 'Cancel failed' });
        expect(vm.$notify.info).not.toHaveBeenCalled();
        expectRefreshed(vm);
    });

    it('shows an error when the task cannot be read again after a 400', async () => {
        const vm = cancelVm(Promise.reject(new ApiError('Refused', 400)), () => Promise.reject(new ApiError('Not found', 404)));
        await cancelTask.call(vm, fixedTask(6, { state: 'Processing' }));
        expect(vm.$notify.error).toHaveBeenCalledWith('Refused', { summary: 'Cancel failed' });
        expect(vm.$notify.info).not.toHaveBeenCalled();
        expectRefreshed(vm);
    });

    it('shows an error on another status, without reading the task again', async () => {
        const vm = cancelVm(Promise.reject(new ApiError('Server error', 500)));
        await cancelTask.call(vm, fixedTask(7, { state: 'Processing' }));
        expect(vm.$notify.error).toHaveBeenCalledWith('Server error', { summary: 'Cancel failed' });
        expect(vm.dataset.getTask).not.toHaveBeenCalled();
        expectRefreshed(vm);
    });

    it('says nothing more when the task was cancelled', async () => {
        const vm = cancelVm(Promise.resolve({ deleted: true }));
        await cancelTask.call(vm, fixedTask(3, { state: 'Processing' }));
        expect(vm.$notify.info).not.toHaveBeenCalled();
        expect(vm.$notify.error).not.toHaveBeenCalled();
        expectRefreshed(vm);
    });

    it('says nothing when the server deleted nothing, the refreshed row showing how the task ended', async () => {
        const vm = cancelVm(Promise.resolve({ deleted: false }));
        await cancelTask.call(vm, fixedTask(4, { state: 'Processing' }));
        expect(vm.$notify.info).not.toHaveBeenCalled();
        expect(vm.$notify.error).not.toHaveBeenCalled();
        expectRefreshed(vm);
    });

    it('does nothing when the cancel is not confirmed', async () => {
        const vm = cancelVm(Promise.resolve({ deleted: true }));
        vm.confirm = vi.fn(() => Promise.resolve(false));
        await cancelTask.call(vm, fixedTask(5, { state: 'Processing' }));
        expect(vm.dataset.cancelTask).not.toHaveBeenCalled();
        expect(vm.loadTasks).not.toHaveBeenCalled();
    });
});

// FR-ACC-01: GET /sys/processingNodes needs a signed-in user; its 401 would send an anonymous
// visitor of a shared dataset to Login, and only a user who can write is offered the nodes
describe('processing nodes', () => {
    const { loadProcessingNodes } = TaskHistory.methods;
    const canWriteChanged = TaskHistory.watch.canWrite;

    function nodesVm(canWrite) {
        const processingNodes = vi.fn(() => Promise.resolve([{ id: 'n1', title: 'Node' }]));
        const vm = {
            canWrite,
            photogrammetryNodes: [],
            photogrammetryForm: { nodeId: undefined },
            dataset: { registry: { sys: { processingNodes } } },
            loadTools: vi.fn(() => Promise.resolve()),
            loadTasks: vi.fn(() => Promise.resolve()),
            registerTabChild: null
        };
        vm.loadProcessingNodes = () => loadProcessingNodes.call(vm);
        return { vm, processingNodes };
    }

    it('never asks for them for a visitor who cannot write (an anonymous visitor)', async () => {
        const { vm, processingNodes } = nodesVm(false);
        await TaskHistory.mounted.call(vm);
        expect(processingNodes).not.toHaveBeenCalled();
        expect(vm.photogrammetryNodes).toEqual([]);
        expect(vm.loadTasks).toHaveBeenCalled();
    });

    it('asks for them for a writer and selects the first node', async () => {
        const { vm, processingNodes } = nodesVm(true);
        await TaskHistory.mounted.call(vm);
        expect(processingNodes).toHaveBeenCalledTimes(1);
        expect(vm.photogrammetryNodes.map(n => n.id)).toEqual(['n1']);
        expect(vm.photogrammetryForm.nodeId).toBe('n1');
    });

    it('asks for them once the user can write, and only once', async () => {
        const { vm, processingNodes } = nodesVm(false);
        await TaskHistory.mounted.call(vm);
        vm.canWrite = true;
        await canWriteChanged.call(vm, true);
        await canWriteChanged.call(vm, true);
        expect(processingNodes).toHaveBeenCalledTimes(1);

        vm.canWrite = false;
        canWriteChanged.call(vm, false);
        expect(processingNodes).toHaveBeenCalledTimes(1);
    });
});

describe('deleteTask', () => {
    const { deleteTask } = TaskHistory.methods;

    it('asks with the shared delete wording: the task by its tool and path, Delete / Cancel', async () => {
        const vm = {
            tools: [],
            toolTitle: () => 'Build <3D>',
            confirm: vi.fn(() => Promise.resolve(false)),
            dataset: { deleteTask: vi.fn() }
        };
        await deleteTask.call(vm, fixedTask(1, { state: 'Succeeded', path: 'a.tif' }));
        const question = vm.confirm.mock.calls[0][0];
        expect(question).toMatchObject({ title: 'Delete task “Build <3D>”', confirmText: 'Delete', cancelText: 'Cancel', danger: true });
        expect(question.message).toContain('<strong>Build &lt;3D&gt;</strong> on a.tif');
        expect(question.message).toContain('results it produced');
        expect(vm.dataset.deleteTask).not.toHaveBeenCalled();
    });
});

describe('showClearDialog', () => {
    const { showClearDialog } = TaskHistory.methods;

    it('asks with the shared delete wording, Delete / Cancel, and clears nothing on Cancel', async () => {
        const vm = { concludedCount: 3, confirm: vi.fn(() => Promise.resolve(false)), dataset: { clearTasks: vi.fn() } };
        await showClearDialog.call(vm);
        const question = vm.confirm.mock.calls[0][0];
        expect(question).toMatchObject({ title: 'Delete concluded tasks', confirmText: 'Delete', cancelText: 'Cancel', danger: true });
        expect(question.message).toContain('This deletes 3 concluded tasks.');
        expect(question.message).toContain('their logs');
        expect(vm.dataset.clearTasks).not.toHaveBeenCalled();
    });
});
