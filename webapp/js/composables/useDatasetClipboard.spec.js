/**
 * Paste of a cut inside one dataset (FR-EXP-04, D-040, FR-XC-07): the Registry refuses a move onto a name that exists (409)
 * and PUT /obj has no overwrite, so the conflict prompt offers Keep both (a free name, "<stem> (<n>).<ext>") and Skip, never
 * Overwrite. What the paste did not move stays on the clipboard, and a failure is reported once. A copy keeps Overwrite (its
 * endpoint takes it).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';
import { setActivePinia, createPinia } from 'pinia';
import ddb from 'ddb';
import { useDialogs } from './useDialogs';
import { useDatasetClipboard } from './useDatasetClipboard';
import { useClipboardStore } from '@/stores/clipboard';
import PasteConflictDialog from '@/features/dataset/dialogs/PasteConflictDialog.vue';
import PasteResultDialog from '@/features/dataset/dialogs/PasteResultDialog.vue';
import { ApiError } from '@/libs/ddb/apiError';
import { setPref, PREF } from '@/libs/preferences';

const notify = vi.hoisted(() => ({ success: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock('@/composables/useNotify', () => ({ useNotify: () => notify }));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: { Organization: () => ({ Dataset: () => ({}) }), features: { value: () => null, get: () => false } } }));

const T = ddb.entry.type;
const item = path => ({ label: path.split('/').pop(), path: `ddb://h/o/d/${path}`, entry: { path, type: T.GENERIC, size: 1, hash: 'h' } });

let dataset;
let listing;
let dialogs;
let clipboard;
let paste;
const top = () => dialogs.stack.value.at(-1);
const propsOf = entry => (typeof entry.props === 'function' ? entry.props() : entry.props);
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
    // A clipboard of an earlier test is not restored
    setPref(PREF.CLIPBOARD, null, { session: true });
    setActivePinia(createPinia());
    Object.values(notify).forEach(fn => fn.mockClear());
    // The folder "dest" holds A.tif (a.tif in another letter case) and a (2).tif
    dataset = {
        org: 'o', ds: 'd',
        remoteUri: path => `ddb://h/o/d/${path}`,
        list: vi.fn(async () => [{ path: 'dest/A.tif', type: T.GENERIC }, { path: 'dest/a (2).tif', type: T.GENERIC }]),
        moveObj: vi.fn(async () => ({})),
        copyObj: vi.fn(async () => ({}))
    };
    listing = { selected: ref([]), currentPath: ref('dest'), files: ref([]), removed: vi.fn(), added: vi.fn() };
    dialogs = useDialogs();
    clipboard = useClipboardStore();
    ({ paste } = useDatasetClipboard({ dataset, listing, dialogs, busy: ref(false), canWrite: ref(true), showError: vi.fn() }));
});

/** Pastes; the conflict prompt answers `choices`. */
async function pasteAnswering(choices) {
    const done = paste();
    await tick();
    const prompt = top();
    expect(prompt.component).toBe(PasteConflictDialog);
    const props = propsOf(prompt);
    props.onResolve(choices);
    await done;
    return props;
}

describe('Paste of a cut inside one dataset onto a name that exists', () => {
    it('offers Keep both and Skip, not Overwrite, for the conflicting item (compared without regard to case)', async () => {
        clipboard.cut({ orgSlug: 'o', dsSlug: 'd', basePath: 'src' }, [item('src/a.tif'), item('src/b.tif')]);

        const props = await pasteAnswering('cancel');

        expect(props).toMatchObject({ keepBoth: true, replace: false, verb: 'move', items: [{ path: 'dest/a.tif' }] });
        expect(dataset.moveObj).not.toHaveBeenCalled();
        // Cancel: the clipboard is as it was
        expect(clipboard.items.map(it => it.path)).toEqual(['src/a.tif', 'src/b.tif']);
    });

    it('moves a Keep both to the free name "a (3).tif" and the rest to their names, and empties the clipboard', async () => {
        clipboard.cut({ orgSlug: 'o', dsSlug: 'd', basePath: 'src' }, [item('src/a.tif'), item('src/b.tif')]);

        await pasteAnswering(['keep']);

        expect(dataset.moveObj.mock.calls).toEqual([['src/a.tif', 'dest/a (3).tif'], ['src/b.tif', 'dest/b.tif']]);
        expect(listing.added.mock.calls[0][0].map(it => it.entry.path)).toEqual(['dest/a (3).tif', 'dest/b.tif']);
        expect(clipboard.isEmpty).toBe(true);
        expect(notify.success).toHaveBeenCalledWith('2 items moved successfully', { summary: 'Paste' });
    });

    it('keeps a skipped item on the clipboard, and reports the paste once', async () => {
        clipboard.cut({ orgSlug: 'o', dsSlug: 'd', basePath: 'src' }, [item('src/a.tif'), item('src/b.tif')]);

        await pasteAnswering(['skip']);

        expect(dataset.moveObj.mock.calls).toEqual([['src/b.tif', 'dest/b.tif']]);
        expect(clipboard.mode).toBe('cut');
        expect(clipboard.items.map(it => it.path)).toEqual(['src/a.tif']);
        const reports = dialogs.stack.value.filter(d => d.component === PasteResultDialog);
        expect(reports).toHaveLength(1);
        expect(propsOf(reports[0])).toMatchObject({ mode: 'cut', skipped: ['src/a.tif'], failed: {} });
        expect(notify.success).not.toHaveBeenCalled();
    });

    it('keeps an item that the server refused on the clipboard, with its message in the one report', async () => {
        clipboard.cut({ orgSlug: 'o', dsSlug: 'd', basePath: 'src' }, [item('src/c.tif'), item('src/b.tif')]);
        // c.tif came to dest meanwhile: no prompt, the Registry refuses the move
        dataset.moveObj.mockImplementation(async from => {
            if (from === 'src/c.tif') throw new ApiError("A file or folder named 'c.tif' already exists in this folder", 409);
            return {};
        });

        await paste();

        expect(dialogs.stack.value.some(d => d.component === PasteConflictDialog)).toBe(false);
        expect(clipboard.items.map(it => it.path)).toEqual(['src/c.tif']);
        const reports = dialogs.stack.value.filter(d => d.component === PasteResultDialog);
        expect(reports).toHaveLength(1);
        expect(propsOf(reports[0]).failed).toEqual({ 'src/c.tif': "A file or folder named 'c.tif' already exists in this folder" });
        expect(notify.error).not.toHaveBeenCalled();
    });
});

describe('Paste of a copy inside one dataset onto a name that exists', () => {
    it('keeps Overwrite All (the copy endpoint takes overwrite) and the clipboard', async () => {
        clipboard.copy({ orgSlug: 'o', dsSlug: 'd', basePath: 'src' }, [item('src/a.tif')]);

        const props = await pasteAnswering('overwrite');

        expect(props.keepBoth).toBeUndefined();
        expect(dataset.copyObj).toHaveBeenCalledExactlyOnceWith('src/a.tif', 'dest/a.tif', true);
        expect(clipboard.items.map(it => it.path)).toEqual(['src/a.tif']);
    });
});
