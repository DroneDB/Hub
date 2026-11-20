/**
 * Deleting files from the dataset page (FR-EXP-08, D-011): the question is titled "Delete 2 items",
 * lists the items, warns that a folder goes with everything inside it and gives the total size,
 * with "Calculating size…" while the size of a folder is read. Delete stays available meanwhile.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';
import ddb from 'ddb';
import { useDialogs } from './useDialogs';
import { useDatasetActions } from './useDatasetActions';

vi.mock('@/composables/useNotify', () => ({ useNotify: () => ({ success: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }));
vi.mock('@/features/dataset/dialogs/SettingsDialog.vue', () => ({ default: {} }));
vi.mock('@/features/dataset/ShareEmbed.vue', () => ({ default: {} }));

const T = ddb.entry.type;
const MB = 1048576;
const item = (path, type, size = 0) => ({ label: path, path: `ddb://h/o/d/${path}`, entry: { path, type, size } });

let dialogs;
let search;
let dataset;
let listing;

function setup() {
    dialogs = useDialogs();
    search = vi.fn();
    dataset = { org: 'o', ds: 'd', search, deleteObjs: vi.fn(async paths => ({ deleted: paths })) };
    listing = { removed: vi.fn() };
    return useDatasetActions({
        dataset, listing, dialogs, busy: ref(false), canWrite: ref(true), route: { org: 'o', ds: 'd' }, openItem: vi.fn(), refresh: vi.fn()
    });
}
/** The question as the dialog host would render it now. */
const question = () => dialogs.stack.value[0].props();
const answer = result => dialogs.stack.value[0].finish(result);

beforeEach(() => vi.spyOn(console, 'warn').mockImplementation(() => {}));

describe('the delete question of the dataset page', () => {
    it('names two folders, warns about their content, and shows the total once it is known', async () => {
        const actions = setup();
        let resolveX; let resolveNewdir;
        search.mockImplementation((query, { path }) => new Promise(resolve => { if (path === 'x') resolveX = resolve; else resolveNewdir = resolve; }));
        const done = actions.remove([item('x', T.DIRECTORY), item('newdir', T.DIRECTORY)]);

        expect(question()).toMatchObject({ title: 'Delete 2 items', confirmText: 'Delete', cancelText: 'Cancel', confirmButtonClass: 'danger' });
        expect(question().message).toContain('<strong>newdir</strong> and everything inside it');
        expect(question().message).toContain('Calculating size…');
        expect(search).toHaveBeenCalledTimes(2);
        expect(search).toHaveBeenCalledWith('*', expect.objectContaining({ path: 'newdir', recursive: true }));

        resolveX([]);
        resolveNewdir([1, 2, 3, 4].map(i => ({ path: `newdir/f${i}`, type: T.IMAGE, size: MB })));
        await vi.waitFor(() => expect(question().message).toContain('Total size: 4 MB'));
        expect(question().message).not.toContain('Calculating');

        answer('cancel');
        await done;
        expect(dataset.deleteObjs).not.toHaveBeenCalled();
    });

    it('can be confirmed while the size is being read, and then stops reading', async () => {
        const actions = setup();
        let signal;
        search.mockImplementation((query, options) => { signal = options.signal; return new Promise(() => {}); });
        const done = actions.remove([item('newdir', T.DIRECTORY)]);
        expect(question().message).toContain('Calculating size…');
        answer('confirm');
        await done;
        await vi.waitFor(() => expect(dataset.deleteObjs).toHaveBeenCalledWith(['newdir']));
        expect(signal.aborted).toBe(true);
    });

    it('asks nothing of the server for files: the size is the sum of their sizes at once', async () => {
        const actions = setup();
        const done = actions.remove([item('a.jpg', T.IMAGE, 2 * MB), item('b.jpg', T.IMAGE, 3 * MB)]);
        expect(question().title).toBe('Delete 2 items');
        expect(question().message).toContain('Total size: 5 MB');
        expect(search).not.toHaveBeenCalled();
        answer('confirm');
        await done;
        await vi.waitFor(() => expect(listing.removed).toHaveBeenCalledWith(['a.jpg', 'b.jpg']));
    });

    it('says so when the size cannot be read, and can still be confirmed', async () => {
        const actions = setup();
        search.mockRejectedValue(new Error('offline'));
        const done = actions.remove([item('newdir', T.DIRECTORY)]);
        await vi.waitFor(() => expect(question().message).toContain('The size could not be calculated.'));
        answer('confirm');
        await done;
        await vi.waitFor(() => expect(dataset.deleteObjs).toHaveBeenCalled());
    });

    it('asks nothing when nothing is selected', async () => {
        const actions = setup();
        await actions.remove([]);
        expect(dialogs.stack.value).toHaveLength(0);
    });
});
