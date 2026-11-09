/**
 * Unit tests for the TaskHistory.vue pagination/filter semantics:
 * - filter changes reset back to the first page (via onFilterChange)
 * - background store refreshes (applyFilters(false)) keep the current page
 * - a shrinking list clamps onto the last valid page
 * (the row actions, cancel, retry and delete, are useTaskActions': useTaskActions.spec)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import TaskHistory from './TaskHistory.vue';

// The tab refreshes the shared task store: the store is not under test
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

describe('photogrammetry new dataset name', () => {
    // The server's PhotogrammetryTool check (kebab-case) until FR-PRC-03 moves both to the published slug rule
    const build = newDatasetName => {
        const vm = {
            optionsError: '',
            selectedPreset: { label: 'Custom (JSON array)' },
            customOptions: [],
            photogrammetryForm: { preset: 'custom', optionsText: '', createNewDataset: true, newDatasetName, newDatasetVisibility: 0 }
        };
        return { params: TaskHistory.methods._buildSubmitParams.call(vm), error: vm.optionsError };
    };

    it('refuses what the server refuses, with its kebab-case rule', () => {
        for (const name of ['survey_2026', 'survey-']) {
            expect(build(name)).toEqual({ params: null, error: 'Dataset name must be kebab-case (lowercase letters, digits, hyphens).' });
        }
    });

    it('accepts what the server accepts, one character too', () => {
        expect(build('a').params).toMatchObject({ createNewDataset: true, newDatasetName: 'a' });
        expect(build('survey-2026').error).toBe('');
    });
});

// FR-PRC-22: the profile names the run in the task lists (the label the server gives the task)
describe('photogrammetry profile', () => {
    const build = (preset, customOptions = []) => TaskHistory.methods._buildSubmitParams.call({
        optionsError: '', destPathError: '', customOptions,
        selectedPreset: { label: 'Fast Orthophoto', options: [{ name: 'fast-orthophoto', value: true }] },
        photogrammetryForm: { preset, optionsText: '', createNewDataset: false, destPath: 'out' }
    });

    it('sends the profile of the options', () => {
        expect(build('fast').profile).toBe('Fast Orthophoto');
    });

    it('says when the options of the profile were changed', () => {
        expect(build('fast', [{ name: 'dsm', value: true }]).profile).toBe('Fast Orthophoto, customized');
    });
});
