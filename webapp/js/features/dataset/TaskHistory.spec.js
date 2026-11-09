/**
 * Unit tests for the TaskHistory.vue pagination/filter semantics:
 * - filter changes reset back to the first page (via onFilterChange)
 * - background store refreshes (applyFilters(false)) keep the current page
 * - a shrinking list clamps onto the last valid page
 * (the row actions, cancel, retry and delete, are useTaskActions': useTaskActions.spec)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { mount, flushPromises } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import TaskHistory from './TaskHistory.vue';

// The tab refreshes the shared task store: the store is not under test
vi.mock('@/libs/tasks/taskMonitor', () => ({
    default: {
        forceRefresh: vi.fn(() => Promise.resolve()), on: vi.fn(), off: vi.fn(),
        getTasks: vi.fn(() => [{ taskId: 't1', toolId: 'build', state: 'Succeeded', actions: [] }])
    },
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

    it('lists a task queued on a processing node under Enqueued, not Processing (FR-PRC-37)', () => {
        const tasks = [
            fixedTask(1, { state: 'Processing', waitingForNode: true }),
            fixedTask(2, { state: 'Processing' }),
            fixedTask(3, { state: 'Enqueued' })
        ];
        const enqueued = fakeVm(tasks, { selectedState: 'Enqueued' });
        applyFilters.call(enqueued);
        expect(enqueued.filteredTasks.map(t => t.taskId)).toEqual(['t1', 't3']);
        const processing = fakeVm(tasks, { selectedState: 'Processing' });
        applyFilters.call(processing);
        expect(processing.filteredTasks.map(t => t.taskId)).toEqual(['t2']);
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

// FR-PRC-21: a reader who cannot write to the dataset is not offered Clear Concluded, which the server refuses
describe('Clear Concluded', () => {
    let wrapper;
    afterEach(() => wrapper?.unmount());

    async function clearButton(canWrite) {
        const dataset = { org: 'org', ds: 'ds', getTaskTools: vi.fn(() => Promise.resolve([])), registry: { sys: { processingNodes: vi.fn(() => Promise.resolve([])) } } };
        wrapper = mount(TaskHistory, {
            props: { dataset, canWrite },
            global: { plugins: [PrimeVue], stubs: { TasksTable: true, TaskLogDialog: true, DialogHost: true, Window: true } }
        });
        await flushPromises();
        return wrapper.findAll('button').filter(b => b.text().includes('Clear Concluded'));
    }

    it('is hidden for a reader without write access', async () => {
        expect(await clearButton(false)).toHaveLength(0);
    });

    it('is offered to a writer', async () => {
        expect(await clearButton(true)).toHaveLength(1);
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
    // The slug rule of the Registry (SlugRules, FR-XC-12, libs/slug.js): FR-PRC-03 replaced the local kebab-case check
    const build = newDatasetName => {
        const vm = {
            optionsError: '',
            selectedPreset: { label: 'Custom (JSON array)' },
            customOptions: [],
            photogrammetryForm: { preset: 'custom', optionsText: '', createNewDataset: true, newDatasetName, newDatasetVisibility: 0 }
        };
        return { params: TaskHistory.methods._buildSubmitParams.call(vm), error: vm.optionsError };
    };
    const RULE = "Dataset slug is invalid: it has 2 to 128 characters (lowercase letters, digits, '_' and '-'), starts with a letter or digit and has no '--'";

    it('refuses what the Registry refuses, with its rule', () => {
        for (const name of ['a', 'a--b', 'Survey 2026', '-survey']) {
            expect(build(name)).toEqual({ params: null, error: RULE });
        }
    });

    it('accepts what the Registry accepts: an underscore, a trailing dash, two characters', () => {
        for (const name of ['survey_2026', 'survey-', 'ab', 'survey-2026']) {
            expect(build(name).params).toMatchObject({ createNewDataset: true, newDatasetName: name });
            expect(build(name).error).toBe('');
        }
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

// FR-PRC-35: Check Node says what the node runs and what waits; the submit's own check adds no toast
describe('Check Node', () => {
    const status = { reachable: true, taskQueueCount: 1, maxParallelTasks: 1, engine: 'odx', engineVersion: '3.8.4' };
    function vmWith(info) {
        return {
            photogrammetryForm: { nodeId: 'local' }, photogrammetryNodes: [], nodeStatus: null, checkingNode: false,
            dataset: { registry: { sys: { processingNodeStatus: vi.fn(() => Promise.resolve(info)) } } },
            $notify: { success: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() }
        };
    }

    it('says "1 running, 0 waiting" for one task on a node that runs one', async () => {
        const vm = vmWith(status);

        await TaskHistory.methods.checkNode.call(vm);

        expect(vm.$notify.success).toHaveBeenCalledOnce();
        expect(vm.$notify.success).toHaveBeenCalledWith('1 running, 0 waiting, max 1 parallel.', { summary: 'Node reachable' });
        expect(vm.nodeStatus).toEqual(status);
    });

    it('shows no toast for the check the submit makes first', async () => {
        const vm = vmWith(status);

        const result = await TaskHistory.methods.checkNode.call(vm, { silent: true });

        expect(result).toEqual(status);
        expect(vm.$notify.success).not.toHaveBeenCalled();
        expect(vm.$notify.error).not.toHaveBeenCalled();
    });

    it('a submit shows one toast: Photogrammetry started', async () => {
        const vm = {
            ...vmWith(status),
            _pendingParams: { folder: '' }, submitting: false, photogrammetryDialogOpen: true,
            photogrammetryDisabledMsg: 'off', loadTasks: vi.fn(() => Promise.resolve()),
            trackHeavyTask: vi.fn(() => Promise.resolve()),
            dataset: { submitTask: vi.fn(() => Promise.resolve({ taskId: 't1' })) }
        };

        await TaskHistory.methods._doSubmit.call(vm);

        expect(vm.$notify.info).toHaveBeenCalledOnce();
        expect(vm.$notify.info).toHaveBeenCalledWith('The task is now queued on the processing node.', { summary: 'Photogrammetry started' });
        expect(vm.$notify.success).not.toHaveBeenCalled();
    });
});

// FR-PRC-26: the builds of a photogrammetry run are folded under it
describe('applyFilters - the builds of a task', () => {
    const pg = { taskId: 'pg', toolId: 'photogrammetry', state: 'Succeeded' };
    const builds = Array.from({ length: 9 }, (_, i) => ({ taskId: `b${i}`, toolId: 'build', state: 'Succeeded', parentJobId: 'pg' }));

    it('lists the run with the count of its 9 builds, not 10 rows', () => {
        const vm = fakeVm([pg, ...builds]);

        applyFilters.call(vm);

        expect(vm.filteredTasks.map(t => t.taskId)).toEqual(['pg']);
        expect(vm.filteredTasks[0].childBuilds).toEqual({ total: 9, active: 0 });
    });

    it('lists the builds themselves when the tool filter is Build', () => {
        const vm = fakeVm([pg, ...builds], { selectedTool: 'build' });

        applyFilters.call(vm);

        expect(vm.filteredTasks).toHaveLength(9);
    });
});
