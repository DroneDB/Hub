/**
 * New folder and Rename run their request inside their dialog (FR-EXP-04, FR-EXP-15, FR-XC-11): the page hands the dialog the
 * names of the entries of the folder (for the clash check) and a callback that throws when the request fails, so that a
 * refusal of the Registry (409) shows at the name field and the dialog stays open, with no Alert and no toast.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';
import ddb from 'ddb';
import { useDialogs } from './useDialogs';
import { useDatasetActions } from './useDatasetActions';
import { ApiError } from '@/libs/ddb/apiError';

const notify = vi.hoisted(() => ({ success: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock('@/composables/useNotify', () => ({ useNotify: () => notify }));
vi.mock('@/features/dataset/dialogs/SettingsDialog.vue', () => ({ default: {} }));
vi.mock('@/features/dataset/ShareEmbed.vue', () => ({ default: {} }));
const registryUtils = vi.hoisted(() => ({ renameDataset: vi.fn() }));
vi.mock('@/libs/api/registryUtils', () => registryUtils);

const T = ddb.entry.type;
const item = (path, type = T.GENERIC) => ({ label: path.split('/').pop(), path: `ddb://h/o/d/${path}`, entry: { path, type, size: 1 } });
const clash = new ApiError("A file or folder named 'b.txt' already exists in this folder", 409, { conflictPath: 'b.txt' });

let dataset;
let listing;
let actions;
let dialogs;
const dialogProps = () => { const { props } = dialogs.stack.value.at(-1); return typeof props === 'function' ? props() : props; };

beforeEach(() => {
    Object.values(notify).forEach(fn => fn.mockClear());
    dataset = {
        org: 'o', ds: 'd',
        remoteUri: path => `ddb://h/o/d/${path}`,
        createFolder: vi.fn(async path => ({ path, type: T.DIRECTORY, size: 0 })),
        moveObj: vi.fn(async (from, to) => ({ path: to, type: T.GENERIC, size: 1 }))
    };
    listing = {
        removed: vi.fn(), added: vi.fn(), drop: vi.fn(), currentPath: ref('photos'),
        files: ref([item('photos/a.txt'), item('photos/b.txt'), item('photos/sub', T.DIRECTORY)]), inView: () => true
    };
    dialogs = useDialogs();
    actions = useDatasetActions({
        dataset, listing, dialogs, busy: ref(false), canWrite: ref(true), route: { org: 'o', ds: 'd' }, openItem: vi.fn(), refresh: vi.fn()
    });
});

describe('New folder', () => {
    it('gives the dialog the folder on show and the paths of its entries', () => {
        actions.newFolder();
        expect(dialogProps()).toMatchObject({ folder: 'photos', siblings: ['photos/a.txt', 'photos/b.txt', 'photos/sub'] });
    });

    it('creates the folder inside the current one and adds it to the list', async () => {
        actions.newFolder();
        const entry = await dialogProps().createFolder('fresh');
        expect(dataset.createFolder).toHaveBeenCalledWith('photos/fresh');
        expect(entry.path).toBe('photos/fresh');
        expect(listing.added).toHaveBeenCalledTimes(1);
        expect(listing.added.mock.calls[0][0][0].entry.path).toBe('photos/fresh');
    });

    it('throws a refusal of the Registry for the dialog to show, with no Alert and no toast', async () => {
        dataset.createFolder.mockRejectedValue(clash);
        actions.newFolder();
        await expect(dialogProps().createFolder('b.txt')).rejects.toBe(clash);
        expect(dialogs.stack.value).toHaveLength(1);
        expect(listing.added).not.toHaveBeenCalled();
        expect(notify.error).not.toHaveBeenCalled();
    });
});

describe('Rename', () => {
    it('gives the dialog the paths of the entries of the listing and a callback that renames', async () => {
        const file = item('photos/a.txt');
        actions.rename(file);
        expect(dialogProps()).toMatchObject({ file, siblings: ['photos/a.txt', 'photos/b.txt', 'photos/sub'] });

        await dialogProps().renameEntry('photos/c.txt', { sidecars: [] });

        expect(dataset.moveObj).toHaveBeenCalledWith('photos/a.txt', 'photos/c.txt');
        expect(notify.success).toHaveBeenCalledWith('File renamed successfully', { summary: 'Renamed' });
        expect(listing.added.mock.calls[0][0][0].entry.path).toBe('photos/c.txt');
    });

    it('throws a refusal of the Registry for the dialog to show: no Alert, no toast, the listing unchanged', async () => {
        dataset.moveObj.mockRejectedValue(clash);
        actions.rename(item('photos/a.txt'));
        await expect(dialogProps().renameEntry('photos/b.txt', { sidecars: [] })).rejects.toBe(clash);
        expect(dialogs.stack.value).toHaveLength(1);
        expect(notify.success).not.toHaveBeenCalled();
        expect(listing.added).not.toHaveBeenCalled();
        expect(listing.removed).not.toHaveBeenCalled();
    });

    it('renames the sidecars after the file, and says so once', async () => {
        const file = item('photos/a.tif');
        listing.files.value = [file, item('photos/a_notes.txt')];
        actions.rename(file);
        await dialogProps().renameEntry('photos/z.tif', { sidecars: [{ oldPath: 'photos/a_notes.txt', newPath: 'photos/z_notes.txt' }] });
        expect(dataset.moveObj.mock.calls).toEqual([['photos/a.tif', 'photos/z.tif'], ['photos/a_notes.txt', 'photos/z_notes.txt']]);
        expect(notify.success).toHaveBeenCalledTimes(1);
        expect(notify.success.mock.calls[0][0]).toBe('File and 1 sidecar renamed successfully');
    });

    it('shows the failure of a sidecar as an Alert, after the file went through', async () => {
        const file = item('photos/a.tif');
        listing.files.value = [file, item('photos/a_notes.txt')];
        dataset.moveObj.mockImplementation(async (from, to) => {
            if (from === 'photos/a_notes.txt') throw clash;
            return { path: to, type: T.GENERIC, size: 1 };
        });
        actions.rename(file);
        await dialogProps().renameEntry('photos/z.tif', { sidecars: [{ oldPath: 'photos/a_notes.txt', newPath: 'photos/z_notes.txt' }] });
        expect(notify.success).not.toHaveBeenCalled();
        const alert = dialogs.stack.value.at(-1).props;
        expect(typeof alert === 'function' ? alert() : alert).toMatchObject({ title: 'Rename', message: clash.message });
    });
});

describe('Rename of the dataset root', () => {
    const root = { label: 'My survey', path: 'ddb://h/o/d/', entry: { path: '', type: T.DRONEDB, size: 0 } };

    // The slug made of the name is taken: the dialog shows it at its field and keeps the typed name (no Alert, page not busy)
    it('hands the dialog a callback that throws a refusal of the Registry, with no Alert', async () => {
        const taken = new ApiError("Dataset 'survey-b' already exists", 400, { errors: { slug: ["Dataset 'survey-b' already exists"] } });
        registryUtils.renameDataset.mockReset().mockRejectedValue(taken);
        const busy = ref(false);
        actions = useDatasetActions({
            dataset, listing, dialogs, busy, canWrite: ref(true), route: { org: 'o', ds: 'd' }, openItem: vi.fn(), refresh: vi.fn()
        });
        actions.rename(root);
        expect(dialogProps().onClose).toBeUndefined();

        await expect(dialogProps().renameDataset('Survey B')).rejects.toBe(taken);

        expect(registryUtils.renameDataset).toHaveBeenCalledExactlyOnceWith('o', 'd', 'Survey B');
        expect(dialogs.stack.value).toHaveLength(1);
        expect(busy.value).toBe(false);
        expect(notify.error).not.toHaveBeenCalled();
    });
});
