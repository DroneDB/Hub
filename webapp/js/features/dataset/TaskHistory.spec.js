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
import fs from 'node:fs';
import path from 'node:path';

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

    it('lists a task queued on a processing node under Enqueued, not Processing', () => {
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

// GET /sys/processingNodes needs a signed-in user; its 401 would send an anonymous
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

// A reader who cannot write to the dataset is not offered Clear Concluded, which the server refuses
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

// The list is read again every 2.5 s while a task runs: a user on page 2 stays there
describe('a background refresh of the task list', () => {
    let wrapper;
    afterEach(() => wrapper?.unmount());

    it('keeps the page the user is on, with the real table showing the list', async () => {
        const many = n => Array.from({ length: n }, (_, i) => ({ taskId: `t${i}`, toolId: 'extract', state: 'Succeeded', actions: [], createdAt: '2026-11-01T10:00:00Z' }));
        const { default: taskMonitor } = await import('@/libs/tasks/taskMonitor');
        taskMonitor.getTasks.mockReturnValue(many(45));
        taskMonitor.on.mockClear();
        const dataset = { org: 'org', ds: 'ds', getTaskTools: vi.fn(() => Promise.resolve([])), registry: { sys: { processingNodes: vi.fn(() => Promise.resolve([])) } } };
        wrapper = mount(TaskHistory, {
            props: { dataset, canWrite: false },
            global: { plugins: [PrimeVue], stubs: { TaskLogDialog: true, DialogHost: true, Window: true } }
        });
        await flushPromises();
        wrapper.vm.currentPageFirst = 20;
        await flushPromises();

        // A poll brings a new array: one task more
        taskMonitor.getTasks.mockReturnValue(many(46));
        const [, onTasksUpdated] = taskMonitor.on.mock.calls.find(([event]) => event === 'tasksUpdated');
        onTasksUpdated({ dataset });
        await flushPromises();

        expect(wrapper.vm.filteredTasks).toHaveLength(46);
        expect(wrapper.vm.currentPageFirst).toBe(20);
    });
});

// A row action (Retry, Cancel, Delete) on page 2 and the tab shown again leave the user on page 2
describe('the page after a row action and a tab switch', () => {
    let wrapper;
    afterEach(() => wrapper?.unmount());

    it('stays on the page of the row that was retried, and on the page left when the tab comes back', async () => {
        const many = n => Array.from({ length: n }, (_, i) => ({ taskId: `t${i}`, toolId: 'extract', state: 'Failed', actions: [], createdAt: '2026-11-01T10:00:00Z' }));
        const { default: taskMonitor } = await import('@/libs/tasks/taskMonitor');
        taskMonitor.getTasks.mockReturnValue(many(45));
        const dataset = {
            org: 'org', ds: 'ds', getTaskTools: vi.fn(() => Promise.resolve([])), retryTask: vi.fn(() => Promise.resolve()),
            registry: { sys: { processingNodes: vi.fn(() => Promise.resolve([])) } }
        };
        wrapper = mount(TaskHistory, {
            props: { dataset, canWrite: true },
            global: { plugins: [PrimeVue], stubs: { TaskLogDialog: true, DialogHost: true, Window: true } }
        });
        await flushPromises();
        wrapper.vm.onPageChange({ first: 20, rows: 20 });
        await flushPromises();

        await wrapper.vm.taskActions.retry(wrapper.vm.filteredTasks[25]);
        await flushPromises();
        expect(dataset.retryTask).toHaveBeenCalledWith('t25');
        expect(wrapper.vm.currentPageFirst).toBe(20);

        await wrapper.vm.onTabActivated();
        await flushPromises();
        expect(wrapper.vm.currentPageFirst).toBe(20);

        // A list that got shorter meanwhile: the last page that exists
        taskMonitor.getTasks.mockReturnValue(many(15));
        await wrapper.vm.onTabActivated();
        expect(wrapper.vm.currentPageFirst).toBe(0);
    });

    it('goes back to the first page when a filter changes', async () => {
        const { default: taskMonitor } = await import('@/libs/tasks/taskMonitor');
        taskMonitor.getTasks.mockReturnValue(Array.from({ length: 45 }, (_, i) => ({ taskId: `t${i}`, toolId: 'extract', state: 'Failed', actions: [] })));
        const dataset = { org: 'org', ds: 'ds', getTaskTools: vi.fn(() => Promise.resolve([])), registry: { sys: { processingNodes: vi.fn(() => Promise.resolve([])) } } };
        wrapper = mount(TaskHistory, {
            props: { dataset, canWrite: false },
            global: { plugins: [PrimeVue], stubs: { TaskLogDialog: true, DialogHost: true, Window: true } }
        });
        await flushPromises();
        wrapper.vm.onPageChange({ first: 20, rows: 20 });
        wrapper.vm.onFilterChange();
        expect(wrapper.vm.currentPageFirst).toBe(0);
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
    // The slug rule of the Registry (SlugRules, libs/slug.js), not a local kebab-case check
    const build = newDatasetName => {
        const vm = {
            optionsError: '',
            newDatasetNameError: '',
            _focusField: vi.fn(),
            selectedPreset: { label: 'Custom (JSON array)' },
            customOptions: [],
            photogrammetryForm: { preset: 'custom', optionsText: '', createNewDataset: true, newDatasetName, newDatasetVisibility: 0 }
        };
        return { params: TaskHistory.methods._buildSubmitParams.call(vm), error: vm.newDatasetNameError, options: vm.optionsError, vm };
    };
    const RULE = "Dataset slug is invalid: it has 2 to 128 characters (lowercase letters, digits, '_' and '-'), starts with a letter or digit and has no '--'";

    // The error of the name is under the name input, which takes the focus; the options error is not used for it
    it('refuses what the Registry refuses, with its rule, under the name field', () => {
        for (const name of ['a', 'a--b', 'Survey 2026', '-survey']) {
            const { params, error, options, vm } = build(name);
            expect({ params, error, options }).toEqual({ params: null, error: RULE, options: '' });
            expect(vm._focusField).toHaveBeenCalledWith('task-history-new-dataset-name');
        }
    });

    it('asks for a name under the name field, not with the options', () => {
        const { params, error, options, vm } = build('  ');
        expect({ params, error, options }).toEqual({ params: null, error: 'A new dataset name is required.', options: '' });
        expect(vm._focusField).toHaveBeenCalledWith('task-history-new-dataset-name');
    });

    it('accepts what the Registry accepts: an underscore, a trailing dash, two characters', () => {
        for (const name of ['survey_2026', 'survey-', 'ab', 'survey-2026']) {
            expect(build(name).params).toMatchObject({ createNewDataset: true, newDatasetName: name });
            expect(build(name).error).toBe('');
        }
    });
});

// A path error is shown once, inline, with the focus on its field: no window with Close and OK
describe('photogrammetry path errors', () => {
    const submit = async form => {
        const vm = {
            optionsError: '', folderPathError: '', destPathError: '', newDatasetNameError: '',
            photogrammetryForm: { preset: 'custom', optionsText: '', createNewDataset: false, folder: '', destPath: 'out', ...form },
            validateDatasetPath: TaskHistory.methods.validateDatasetPath,
            _buildSubmitParams: vi.fn(() => null),
            _focusField: vi.fn(),
            confirm: vi.fn()
        };
        await TaskHistory.methods.submitPhotogrammetry.call(vm);
        return vm;
    };

    it('shows an image folder that starts with "/" only inline, with the focus on the field', async () => {
        const vm = await submit({ folder: '/images' });
        expect(vm.folderPathError).toBe('Image folder must not start with "/" or "\\" - use a path relative to the dataset root.');
        expect(vm.confirm).not.toHaveBeenCalled();
        expect(vm._focusField).toHaveBeenCalledExactlyOnceWith('task-history-image-folder');
        expect(vm._buildSubmitParams).not.toHaveBeenCalled();
    });

    it('shows an output folder that is absolute only inline, with the focus on the field', async () => {
        const vm = await submit({ destPath: 'C:\\out' });
        expect(vm.destPathError).toBe('Output folder must not be an absolute path.');
        expect(vm.confirm).not.toHaveBeenCalled();
        expect(vm._focusField).toHaveBeenCalledExactlyOnceWith('task-history-output-folder');
    });
});

// The profile names the run in the task lists (the label the server gives the task)
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

// Check Node says what the node runs and what waits; the submit's own check adds no toast
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

// The builds of a photogrammetry run are folded under it
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

describe('layout', () => {
    it('the task table has no padding around it', () => {
        const style = fs.readFileSync(path.join(__dirname, 'TaskHistory.vue'), 'utf8').split(/<style[^>]*>/)[1];
        const content = style.slice(style.indexOf('.content {')).split('}')[0];
        expect(content).toContain('overflow: auto;');
        expect(content).not.toContain('padding');
    });
});

// The photogrammetry window is sized for the list of the node's options only when it shows that list
describe('the options of the processing node', () => {
    const shown = (preset, options) => TaskHistory.computed.optionsListShown.call({ photogrammetryForm: { preset }, availableOdmOptions: options });

    it('shows the list for a profile when the node gave its options', () => {
        expect(shown('default', [{ name: 'dsm' }])).toBe(true);
    });

    it('shows no list for the Custom profile or a node that gave none', () => {
        expect(shown('custom', [{ name: 'dsm' }])).toBe(false);
        expect(shown('default', [])).toBe(false);
    });

    it('says so when the node did not answer, and forgets it when another node answers', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const options = vi.fn(() => Promise.reject(new Error('Internal server error')));
        const vm = { photogrammetryForm: { nodeId: 'n1' }, availableOdmOptions: [{ name: 'old' }], optionsLoadFailed: false,
            dataset: { registry: { sys: { processingNodeOptions: options } } } };

        await TaskHistory.methods.loadOdmOptions.call(vm);
        expect(vm.availableOdmOptions).toEqual([]);
        expect(vm.optionsLoadFailed).toBe(true);

        options.mockImplementation(() => Promise.resolve([{ name: 'dsm' }]));
        await TaskHistory.methods.loadOdmOptions.call(vm);
        expect(vm.availableOdmOptions).toEqual([{ name: 'dsm' }]);
        expect(vm.optionsLoadFailed).toBe(false);
        warn.mockRestore();
    });
});
