/**
 * A drag move offers Undo (FR-EXP-16, FR-XC-23): the toast of the move carries an Undo action that moves the item back to the
 * path it came from. A rename carries none. A move that replaced an entry offers none (that entry cannot come back), and an
 * Undo whose old path holds an entry again is refused and moves nothing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';
import ddb from 'ddb';
import { useDialogs } from './useDialogs';
import { useDatasetActions } from './useDatasetActions';

const notify = vi.hoisted(() => ({ success: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock('@/composables/useNotify', () => ({ useNotify: () => notify }));
vi.mock('@/features/dataset/dialogs/SettingsDialog.vue', () => ({ default: {} }));
vi.mock('@/features/dataset/ShareEmbed.vue', () => ({ default: {} }));

const T = ddb.entry.type;
const item = (path, type) => ({ label: path.split('/').pop(), path: `ddb://h/o/d/${path}`, entry: { path, type, size: 1 } });

let dataset;
let listing;
let actions;
let dialogs;
/** The Alert of the page's showError, as the dialog host would render it */
const alertProps = () => { const { props } = dialogs.stack.value[0]; return typeof props === 'function' ? props() : props; };

beforeEach(() => {
    Object.values(notify).forEach(fn => fn.mockClear());
    dataset = {
        org: 'o', ds: 'd',
        remoteUri: path => `ddb://h/o/d/${path}`,
        moveObj: vi.fn(async (from, to) => ({ path: to, type: T.GENERIC, size: 1 })),
        // The server's listing of a folder: empty, every path is free
        list: vi.fn(async () => [])
    };
    // The root is on show
    listing = {
        removed: vi.fn(), added: vi.fn(), drop: vi.fn(), files: ref([]), currentPath: ref(''), inView: path => !path.includes('/')
    };
    dialogs = useDialogs();
    actions = useDatasetActions({
        dataset, listing, dialogs, busy: ref(false), canWrite: ref(true), route: { org: 'o', ds: 'd' }, openItem: vi.fn(), refresh: vi.fn()
    });
});

describe('Undo of a drag move', () => {
    it('moves notes.txt into folder x and offers Undo in the toast, which moves it back', async () => {
        await actions.move(item('notes.txt', T.GENERIC), item('x', T.DIRECTORY));

        expect(dataset.moveObj).toHaveBeenCalledWith('notes.txt', 'x/notes.txt');
        expect(notify.success).toHaveBeenCalledTimes(1);
        const [text, options] = notify.success.mock.calls[0];
        expect(text).toBe('File moved successfully');
        expect(options.summary).toBe('Moved');
        expect(options.action.label).toBe('Undo');

        await options.action.run();

        expect(dataset.moveObj).toHaveBeenLastCalledWith('x/notes.txt', 'notes.txt');
        // The list: the item left the root, came to x, and is back at the root
        expect(listing.removed.mock.calls).toEqual([[['notes.txt']], [['x/notes.txt']]]);
        expect(listing.added.mock.calls[1][0][0].entry.path).toBe('notes.txt');
        // Undo says so, and offers no Undo of its own
        expect(notify.success).toHaveBeenCalledTimes(2);
        expect(notify.success.mock.calls[1]).toEqual(['The move was undone', { summary: 'Moved' }]);
    });

    it('names the failure of an Undo that the server refuses, and leaves the item where it is', async () => {
        await actions.move(item('notes.txt', T.GENERIC), item('x', T.DIRECTORY));
        const { action } = notify.success.mock.calls[0][1];
        dataset.moveObj.mockRejectedValueOnce(new Error('A file with that name exists'));

        await action.run();

        // The failure is the page's Alert (showError), titled for the Undo
        expect(alertProps()).toMatchObject({ title: 'Undo move', message: 'A file with that name exists' });
        expect(listing.added).toHaveBeenCalledTimes(1);
    });

    it('offers no Undo for a move that replaced an entry of the destination folder (the server lists it)', async () => {
        dataset.list.mockResolvedValueOnce([{ path: 'x/notes.txt', type: T.GENERIC, size: 3 }]);

        await actions.move(item('notes.txt', T.GENERIC), item('x', T.DIRECTORY));

        expect(dataset.list).toHaveBeenCalledWith('x');
        expect(dataset.moveObj).toHaveBeenCalledWith('notes.txt', 'x/notes.txt');
        expect(notify.success.mock.calls).toEqual([['File moved successfully', { summary: 'Moved' }]]);
    });

    it('offers no Undo for a move that replaced an entry of the folder on show (the listing knows, nothing is asked)', async () => {
        listing.inView = path => path.startsWith('x/');
        listing.files.value = [item('x/Notes.TXT', T.GENERIC)];

        await actions.move(item('notes.txt', T.GENERIC), item('x', T.DIRECTORY));

        expect(dataset.list).not.toHaveBeenCalled();
        expect(notify.success.mock.calls).toEqual([['File moved successfully', { summary: 'Moved' }]]);
    });

    it('refuses an Undo when the old path holds an entry again, and moves nothing', async () => {
        await actions.move(item('notes.txt', T.GENERIC), item('x', T.DIRECTORY));
        const { action } = notify.success.mock.calls[0][1];
        // Another notes.txt came to the root meanwhile
        dataset.list.mockResolvedValueOnce([{ path: 'notes.txt', type: T.GENERIC, size: 9 }]);

        await action.run();

        expect(dataset.list).toHaveBeenLastCalledWith(undefined);
        expect(dataset.moveObj).toHaveBeenCalledTimes(1);
        expect(notify.warn).toHaveBeenCalledWith('Cannot undo: notes.txt exists again', { summary: 'Undo move' });
        expect(listing.added).toHaveBeenCalledTimes(1);
        expect(notify.success).toHaveBeenCalledTimes(1);
    });

    it('offers no Undo for a move that failed', async () => {
        dataset.moveObj.mockRejectedValueOnce(new Error('No'));
        await actions.move(item('a.txt', T.GENERIC), item('x', T.DIRECTORY));
        expect(notify.success).not.toHaveBeenCalled();
        expect(alertProps()).toMatchObject({ title: 'Move file', message: 'No' });
    });
});
