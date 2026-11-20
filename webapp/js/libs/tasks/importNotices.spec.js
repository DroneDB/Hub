/**
 * The toast of a background import that ends (FR-UPL-11, FR-XC-16, D-004): the store of the app tracks the import after the
 * dialog is closed with "Run in background", and a finished task gives "Import complete" with a link to the dataset; a failed
 * one gives "Import failed" with the task error, and the link only while the dataset still exists.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import taskMonitor from './taskMonitor';
import { startImportNotices, noticeImportEnded } from './importNotices';
import { setToastService } from '@/libs/notify';
import { ApiError } from '@/libs/ddb/apiError';

let seq = 0;
let add;
let open;
let stop;

const importTask = over => ({ taskId: 'imp1', toolId: 'import-dataset', state: 'Processing', progressPercent: 40, ...over });

function datasetWith(list) {
    seq += 1;
    const dataset = { org: 'org', ds: `imported-${seq}`, baseApi: `/orgs/org/ds/imported-${seq}`, getTasks: vi.fn(async () => list.tasks) };
    return dataset;
}
const toast = n => add.mock.calls[n][0];

beforeEach(() => {
    add = vi.fn();
    open = vi.fn();
    setToastService({ add, remove: vi.fn() });
    stop = startImportNotices(open);
});
afterEach(() => {
    stop();
    setToastService(null);
});

describe('the notice of an import that ended', () => {
    it('keeps tracking after the dialog is gone, and says "Import complete" with a link to the dataset when the task succeeds', async () => {
        const list = { tasks: [importTask()] };
        const dataset = datasetWith(list);
        // The dialog started it and closed with "Run in background": nothing but the store holds the task now
        taskMonitor.trackImport(dataset, 'imp1');
        await vi.waitFor(() => expect(taskMonitor.getImports(dataset)).toHaveLength(1));
        expect(add).not.toHaveBeenCalled();

        list.tasks = [importTask({ state: 'Succeeded', progressPercent: 100 })];
        await taskMonitor.forceRefresh(dataset);

        expect(add).toHaveBeenCalledTimes(1);
        expect(toast(0)).toMatchObject({
            severity: 'success', summary: 'Import complete', detail: `Dataset "${dataset.ds}" imported successfully`
        });
        expect(toast(0).data.action.label).toBe('Open dataset');
        toast(0).data.action.run();
        expect(open).toHaveBeenCalledWith(dataset);
    });

    it('says "Import failed" with the task error and the link when the dataset still exists (an import into an existing dataset)', async () => {
        const list = { tasks: [importTask()] };
        const dataset = datasetWith(list);
        taskMonitor.trackImport(dataset, 'imp1');
        await vi.waitFor(() => expect(taskMonitor.isLoaded(dataset)).toBe(true));

        list.tasks = [importTask({ state: 'Failed', error: 'The file is not a ZIP, TAR, 7z or RAR archive' })];
        await taskMonitor.forceRefresh(dataset);

        expect(add).toHaveBeenCalledTimes(1);
        expect(toast(0)).toMatchObject({
            severity: 'error', summary: 'Import failed', detail: `${dataset.ds}: The file is not a ZIP, TAR, 7z or RAR archive`
        });
        expect(toast(0).data.action.label).toBe('Open dataset');
    });

    it('has no link when the failed import deleted the dataset that it created', async () => {
        const list = { tasks: [importTask()] };
        const dataset = datasetWith(list);
        taskMonitor.trackImport(dataset, 'imp1');
        await vi.waitFor(() => expect(taskMonitor.isLoaded(dataset)).toBe(true));
        // The last list had the task running; then the rollback deleted the dataset: its task list is a 404
        dataset.getTasks.mockRejectedValue(new ApiError('not found', 404));
        await taskMonitor.forceRefresh(dataset);

        expect(add).toHaveBeenCalledTimes(1);
        expect(toast(0)).toMatchObject({ severity: 'error', summary: 'Import failed', detail: `${dataset.ds}: The dataset was deleted.` });
        expect(toast(0)).not.toHaveProperty('data');
    });

    it('says the task error also when the dataset is gone, and "cancelled" for a cancelled import', () => {
        const dataset = { org: 'org', ds: 'x' };
        noticeImportEnded({ dataset, task: { state: 'Failed', error: 'Out of disk space' }, gone: true }, open);
        expect(toast(0)).toMatchObject({ summary: 'Import failed', detail: 'x: Out of disk space' });
        expect(toast(0)).not.toHaveProperty('data');

        noticeImportEnded({ dataset, task: { state: 'Failed' }, gone: false }, open);
        expect(toast(1).detail).toBe('x: The task failed.');

        noticeImportEnded({ dataset, task: { state: 'Deleted' }, gone: true }, open);
        expect(toast(2)).toMatchObject({ severity: 'info', summary: 'Import cancelled', detail: 'Import of "x" was cancelled' });
    });

    it('stops with the function that startImportNotices returned', async () => {
        stop();
        const list = { tasks: [importTask()] };
        const dataset = datasetWith(list);
        taskMonitor.trackImport(dataset, 'imp1');
        await vi.waitFor(() => expect(taskMonitor.isLoaded(dataset)).toBe(true));
        list.tasks = [importTask({ state: 'Succeeded' })];
        await taskMonitor.forceRefresh(dataset);
        expect(add).not.toHaveBeenCalled();
        stop = startImportNotices(open);
    });
});

