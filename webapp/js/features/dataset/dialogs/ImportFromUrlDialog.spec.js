/**
 * ImportFromUrlDialog: the import-file task is tracked in the dialog, and its dataset may be deleted
 * while the dialog waits (FR-UPL-05, D-004). The dialog then stops waiting and shows the reason.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { effectScope } from 'vue';
import { useHeavyTask } from '@/composables/useHeavyTask';
import { ApiError } from '@/libs/ddb/apiError';

const { default: ImportFromUrlDialog } = await import('./ImportFromUrlDialog.vue');
const { runImport, phaseLabel } = ImportFromUrlDialog.methods;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('ImportFromUrlDialog, a dataset deleted while the import runs', () => {
    it('stops the progress and shows "The dataset was deleted." when the task list answers 404 after Processing', async () => {
        let deleted = false;
        const dataset = {
            baseApi: '/orgs/org1/ds/url-import',
            importFromUrl: vi.fn(async () => ({ taskId: 't1' })),
            getTasks: vi.fn(async () => {
                if (deleted) throw new ApiError('Not found', 404);
                return [{ taskId: 't1', toolId: 'import-file', state: 'Processing', progressPercent: 50, phaseMessage: 'downloading' }];
            }),
            getTaskLog: vi.fn(async () => ({ lines: [], cursor: 0 })),
            getTask: vi.fn(async () => { throw new ApiError('Not found', 404); })
        };
        const scope = effectScope();
        const { trackHeavyTask } = /** @type {ReturnType<typeof useHeavyTask>} */ (scope.run(() => useHeavyTask()));
        const vm = {
            canImport: true, importing: false, importDone: false, importProgress: 0, importStatus: '', errorMessage: null,
            url: 'https://example.com/a.tif', fileName: '', folder: '', overwrite: false, username: '', password: '',
            verifyResult: null, dataset, trackHeavyTask, $emit: vi.fn()
        };
        vm.phaseLabel = phaseLabel.bind(vm);

        const run = runImport.call(vm);
        await vi.advanceTimersByTimeAsync(0);
        expect(vm.importing).toBe(true);
        expect(vm.importProgress).toBe(50);

        deleted = true;
        await vi.advanceTimersByTimeAsync(20000);
        await run;

        expect(vm.importing).toBe(false);
        expect(vm.importDone).toBe(false);
        expect(vm.errorMessage).toBe('The dataset was deleted.');
        expect(vm.$emit).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
        scope.stop();
    });
});
