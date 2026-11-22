/**
 * Rescan of the selected entries from the dataset page: one heavy task (rescan-entries) with the dataset-relative paths,
 * asked about first. It does not lock the dataset; when it ends the listing shows what changed (each file, or the folder
 * on show when a folder was in the selection).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';
import ddb from 'ddb';
import { useDatasetActions } from './useDatasetActions';
import { BUSY_TOOLS } from '@/libs/tasks/taskMonitor';

const notify = vi.hoisted(() => ({ success: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
const runHeavyTask = vi.hoisted(() => vi.fn());
vi.mock('@/composables/useNotify', () => ({ useNotify: () => notify }));
vi.mock('@/composables/useHeavyTask', () => ({ useHeavyTask: () => ({ runHeavyTask }) }));
vi.mock('@/libs/build/buildManager', () => ({ default: { startPolling: vi.fn() } }));

// The page's other dialogs are not under test (the settings dialog imports an image of the build)
vi.mock('@/features/dataset/dialogs/SettingsDialog.vue', () => ({ default: {} }));
vi.mock('@/features/dataset/ShareEmbed.vue', () => ({ default: {} }));

const T = ddb.entry.type;
const file = path => ({ path: `ddb://h/org/ds/${path}`, label: path.split('/').pop(), entry: { path, type: T.IMAGE, size: 1 } });
const folder = path => ({ path: `ddb://h/org/ds/${path}`, label: path.split('/').pop(), entry: { path, type: T.DIRECTORY, size: 0 } });

let dataset;
let dialogs;
let listing;

/** Rescans `items`; the question is answered with `answer`, the task runs `submit`. */
async function rescan(items, { answer = 'confirm', submit, addEntry = vi.fn().mockResolvedValue(undefined) } = {}) {
    dataset = { org: 'org', ds: 'ds' };
    listing = { files: ref([]), addEntry, reload: vi.fn().mockResolvedValue(undefined) };
    runHeavyTask.mockImplementation(submit ?? (async (ds, tool, options) => {
        options.onSubmitted?.({ taskId: 't1' });
        return { taskId: 't1', state: 'Succeeded' };
    }));
    dialogs = { open: vi.fn().mockResolvedValue(answer) };
    const actions = useDatasetActions({
        dataset, listing, dialogs, busy: ref(false), canWrite: ref(true),
        route: { org: 'org', ds: 'ds' }, openItem: vi.fn(), refresh: vi.fn()
    });
    await actions.rescanEntries(items);
}

describe('Rescan of the entries selected in the explorer', () => {
    beforeEach(() => vi.clearAllMocks());

    it('asks first, with the question of the selection, and starts nothing when the user cancels', async () => {
        await rescan([file('a.jpg')], { answer: 'cancel' });
        expect(dialogs.open).toHaveBeenCalledTimes(1);
        expect(dialogs.open.mock.calls[0][1]).toMatchObject({ title: 'Rescan 1 item', confirmText: 'Rescan' });
        expect(runHeavyTask).not.toHaveBeenCalled();
        expect(listing.addEntry).not.toHaveBeenCalled();
    });

    it('runs the rescan-entries task with the dataset-relative paths of the items', async () => {
        await rescan([file('a.jpg'), file('sub/b.tif')]);
        expect(runHeavyTask).toHaveBeenCalledTimes(1);
        const [ds, tool, options] = runHeavyTask.mock.calls[0];
        expect(ds).toBe(dataset);
        expect(tool).toBe('rescan-entries');
        expect(options).toMatchObject({ params: { paths: ['a.jpg', 'sub/b.tif'] }, notify: false });
    });

    it('does not make the dataset busy', () => {
        expect(BUSY_TOOLS).not.toHaveProperty('rescan-entries');
    });

    it('tells that the rescan started, then shows each file again and says it finished', async () => {
        await rescan([file('a.jpg'), file('sub/b.tif')]);
        expect(notify.info).toHaveBeenCalledWith('Rescan started for 2 items...', expect.objectContaining({ summary: 'Rescan' }));
        expect(listing.addEntry.mock.calls.map(c => c[0])).toEqual(['a.jpg', 'sub/b.tif']);
        expect(listing.reload).not.toHaveBeenCalled();
        expect(notify.success).toHaveBeenCalledWith('Rescan finished for 2 items', expect.objectContaining({ summary: 'Rescan' }));
    });

    it('reads the folder on show again when a folder was in the selection', async () => {
        await rescan([file('a.jpg'), folder('photos')]);
        expect(runHeavyTask.mock.calls[0][2].params.paths).toEqual(['a.jpg', 'photos']);
        expect(listing.reload).toHaveBeenCalledTimes(1);
        expect(listing.addEntry).not.toHaveBeenCalled();
        expect(notify.success).toHaveBeenCalled();
    });

    it('says why it failed, and shows nothing as changed', async () => {
        await rescan([file('a.jpg')], { submit: async () => { throw Object.assign(new Error('Too many tasks are running.'), { task: {} }); } });
        expect(notify.error).toHaveBeenCalledWith('Too many tasks are running.', expect.objectContaining({ summary: 'Rescan failed', life: 'long' }));
        expect(listing.addEntry).not.toHaveBeenCalled();
        expect(listing.reload).not.toHaveBeenCalled();
        expect(notify.success).not.toHaveBeenCalled();
    });

    it('still finishes when one file cannot be shown again', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        await rescan([file('a.jpg')], { addEntry: vi.fn().mockRejectedValue(new Error('gone')) });
        expect(notify.error).not.toHaveBeenCalled();
        expect(notify.success).toHaveBeenCalled();
        warn.mockRestore();
    });

    it('does nothing for an empty selection', async () => {
        await rescan([]);
        expect(dialogs.open).not.toHaveBeenCalled();
        expect(runHeavyTask).not.toHaveBeenCalled();
    });
});
