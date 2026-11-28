/**
 * The clipboard of the dataset page: what a deletion removes from it (only entries of the dataset it concerns, and
 * what is under a deleted folder). That it does not outlive the session is pinned in preferences.spec.js.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const { useClipboardStore } = await import('./clipboard');
const { default: emitter } = await import('@/libs/eventBus');
const { deletedEntriesEvent } = await import('@/libs/dataset/deletedEntries');

const file = path => ({ entry: { path, type: 1, size: 10 } });
const folder = path => ({ entry: { path, type: 3, size: 0 } });
const SOURCE = { orgSlug: 'acme', dsSlug: 'site', basePath: '' };

let store;
beforeEach(() => {
    sessionStorage.clear();
    setActivePinia(createPinia());
    store = useClipboardStore();
});
afterEach(() => {
    store.$dispose();
    emitter.all.clear();
    window.history.replaceState({}, '', '/');
});

const paths = () => store.items.map(i => i.path);
// A deletion in the dataset org/ds, told while the page at `address` is on show
const deletedIn = (org, ds, deleted, address = `/r/${org}/${ds}`) => {
    window.history.replaceState({}, '', address);
    emitter.emit('deleteEntries', deletedEntriesEvent({ org, ds }, deleted));
};

describe('a deletion and the clipboard', () => {
    it('removes the copied entry that was deleted in its own dataset', () => {
        store.copy(SOURCE, [file('a.jpg'), file('b.jpg')]);
        deletedIn('acme', 'site', ['a.jpg']);
        expect(paths()).toEqual(['b.jpg']);
    });

    it('leaves the items copied from another dataset alone, whatever their path', () => {
        store.copy(SOURCE, [file('a.jpg'), file('b.jpg')]);
        deletedIn('acme', 'other', ['a.jpg']);
        deletedIn('another-org', 'site', ['a.jpg', 'b.jpg']);
        expect(paths()).toEqual(['a.jpg', 'b.jpg']);
    });

    it('goes by the dataset the deletion names, not by the page on show when it is told', () => {
        store.copy(SOURCE, [file('a.jpg'), file('b.jpg'), file('c.jpg')]);
        // The answer of a deletion in acme/site comes after the user went to another page, or to another dataset
        deletedIn('acme', 'site', ['a.jpg'], '/upload');
        deletedIn('acme', 'site', ['b.jpg'], '/r/acme/other');
        // A deletion in another dataset told while the clipboard's own dataset is on show
        deletedIn('acme', 'other', ['c.jpg'], '/r/acme/site');
        expect(paths()).toEqual(['c.jpg']);
    });

    it('ignores a deletion that names no dataset (a bare list of paths)', () => {
        store.copy(SOURCE, [file('a.jpg')]);
        window.history.replaceState({}, '', '/r/acme/site');
        emitter.emit('deleteEntries', ['a.jpg']);
        expect(paths()).toEqual(['a.jpg']);
    });

    it('takes what was under a deleted folder, and keeps the neighbour that only shares a prefix', () => {
        store.copy(SOURCE, [file('photos/a.jpg'), file('photos/deep/b.jpg'), file('photos2/c.jpg'), folder('photos/deep')]);
        deletedIn('acme', 'site', ['photos']);
        expect(paths()).toEqual(['photos2/c.jpg']);
    });

    it('is emptied, and resets, when the last item goes', () => {
        store.cut(SOURCE, [file('a.jpg')]);
        deletedIn('acme', 'site', ['a.jpg']);
        expect(store.isEmpty).toBe(true);
        expect(store.mode).toBeNull();
        expect(store.source).toBeNull();
    });

    it('removePaths of a paste (no dataset given) concerns the clipboard\'s own dataset', () => {
        store.cut(SOURCE, [file('a.jpg'), file('b.jpg')]);
        store.removePaths(['a.jpg']);
        expect(paths()).toEqual(['b.jpg']);
    });
});
