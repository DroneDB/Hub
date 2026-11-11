/**
 * ImportDatasetDialog: the import is tracked until it ends, and its dataset may be deleted while the
 * dialog waits (a cancelled or failed import rolls back, FR-UPL-05, D-004). The dialog then settles
 * once, with the reason, instead of showing the progress for ever.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { effectScope } from 'vue';
import { useHeavyTask } from '@/composables/useHeavyTask';
import { ApiError } from '@/libs/ddb/apiError';

const { default: ImportDatasetDialog } = await import('./ImportDatasetDialog.vue');
const { startImport, onImportProgress } = ImportDatasetDialog.methods;

let seq = 0;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup(getTasks) {
    seq += 1;
    const slug = `imported-${seq}`;
    const dataset = {
        baseApi: `/orgs/org1/ds/${slug}`,
        getTasks: vi.fn(getTasks),
        getTaskLog: vi.fn(async () => ({ lines: [], cursor: 0 })),
        getTask: vi.fn(async () => { throw new ApiError('Not found', 404); })
    };
    const scope = effectScope();
    const { trackHeavyTask } = /** @type {ReturnType<typeof useHeavyTask>} */ (scope.run(() => useHeavyTask()));
    const vm = {
        canImport: true, sourceType: 'url', params: {}, slug, name: 'Imported', visibility: 0,
        submitting: false, importing: false, taskId: null, importStartTime: 0,
        progressPercent: 0, phase: null, logTail: [], etaText: '',
        org: {
            createImport: vi.fn(async () => ({ taskId: 't1', dsSlug: slug })),
            Dataset: vi.fn(() => dataset)
        },
        trackHeavyTask,
        $emit: vi.fn()
    };
    vm.onImportProgress = onImportProgress.bind(vm);
    return { vm, dataset, slug, stop: () => scope.stop() };
}

const doneCalls = vm => vm.$emit.mock.calls.filter(c => c[0] === 'close' && c[1] === 'done');

describe('ImportDatasetDialog, a dataset deleted while the import runs', () => {
    it('closes once with "The dataset was deleted." when the task list answers 404 after Processing', async () => {
        let deleted = false;
        const { vm, slug, stop } = setup(async () => {
            if (deleted) throw new ApiError('Not found', 404);
            return [{ taskId: 't1', toolId: 'import-dataset', state: 'Processing', progressPercent: 30 }];
        });

        const run = startImport.call(vm);
        await vi.advanceTimersByTimeAsync(0);
        expect(vm.$emit).toHaveBeenCalledWith('close', 'started', expect.objectContaining({ slug }));
        expect(vm.progressPercent).toBe(30);
        expect(doneCalls(vm)).toHaveLength(0);

        deleted = true;
        await vi.advanceTimersByTimeAsync(20000);
        await run;

        expect(doneCalls(vm)).toEqual([['close', 'done', { slug, success: false, error: 'The dataset was deleted.' }]]);
        await vi.advanceTimersByTimeAsync(130000);
        expect(doneCalls(vm)).toHaveLength(1);
        expect(vi.getTimerCount()).toBe(0);
        stop();
    });

    it('shows the task error when the import failed before its dataset went', async () => {
        const reason = 'The source is not reachable';
        const { vm, slug, stop } = setup(async () => [{ taskId: 't1', toolId: 'import-dataset', state: 'Failed', error: reason }]);

        await startImport.call(vm);

        expect(doneCalls(vm)).toEqual([['close', 'done', { slug, success: false, error: reason }]]);
        stop();
    });
});
