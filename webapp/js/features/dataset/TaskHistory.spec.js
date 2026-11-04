/**
 * Unit tests for the TaskHistory.vue pagination/filter semantics:
 * - filter changes reset back to the first page (via onFilterChange)
 * - background store refreshes (applyFilters(false)) keep the current page
 * - a shrinking list clamps onto the last valid page
 * and cancelTask: a cancel the server answers with "not deleted" says so instead of nothing
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import TaskHistory from './TaskHistory.vue';

// cancelTask refreshes the shared task store: not under test here
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

    function cancelVm(answer) {
        return {
            tools: [],
            toolTitle: id => id,
            confirm: vi.fn(() => Promise.resolve(true)),
            dataset: { cancelTask: vi.fn(() => answer) },
            loadTasks: vi.fn(() => Promise.resolve()),
            $notify: { info: vi.fn(), error: vi.fn(), success: vi.fn() }
        };
    }

    it('says so when the server cancelled nothing, the task having ended meanwhile', async () => {
        const vm = cancelVm(Promise.resolve({ deleted: false }));
        await cancelTask.call(vm, fixedTask(1, { state: 'Processing' }));
        expect(vm.dataset.cancelTask).toHaveBeenCalledWith('t1');
        expect(vm.$notify.info).toHaveBeenCalledWith(expect.stringContaining('already ended'), expect.anything());
        expect(vm.loadTasks).toHaveBeenCalled();
    });

    it('says nothing more when the task was cancelled', async () => {
        const vm = cancelVm(Promise.resolve({ deleted: true }));
        await cancelTask.call(vm, fixedTask(2, { state: 'Processing' }));
        expect(vm.$notify.info).not.toHaveBeenCalled();
        expect(vm.$notify.error).not.toHaveBeenCalled();
        expect(vm.loadTasks).toHaveBeenCalled();
    });

    it('shows the reason of a refusal (a task that has already ended is a bad request)', async () => {
        const vm = cancelVm(Promise.reject(new Error('The task has already ended (Succeeded)')));
        await cancelTask.call(vm, fixedTask(3, { state: 'Processing' }));
        expect(vm.$notify.error).toHaveBeenCalledWith('The task has already ended (Succeeded)', { summary: 'Cancel failed' });
    });
});
