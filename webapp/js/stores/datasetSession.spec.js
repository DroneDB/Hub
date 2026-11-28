/**
 * The dataset session: a meta value changed from the header (the visibility) reaches the root entry the page and the
 * viewer hold, without replacing it.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { watch, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { useDatasetSessionStore } from './datasetSession';

beforeEach(() => setActivePinia(createPinia()));

describe('setRootMeta', () => {
    it('sets the meta value on the root entry in place: the page and the viewer hold the same object', () => {
        const session = useDatasetSessionStore();
        const root = { path: '', properties: { meta: { visibility: { id: 'v', data: 0 } } } };
        session.setRootEntry(root);
        session.setRootMeta('visibility', { id: 'v', data: 2 });
        expect(session.rootEntry).toBe(root);
        expect(root.properties.meta.visibility.data).toBe(2);
    });

    it('tells what reads the root entry that it changed', async () => {
        const session = useDatasetSessionStore();
        session.setRootEntry({ path: '', properties: { meta: {} } });
        const seen = [];
        watch(() => session.rootEntry?.properties.meta.visibility?.data, value => seen.push(value));
        session.setRootMeta('visibility', { data: 1 });
        await nextTick();
        expect(seen).toEqual([1]);
    });

    it('gives an entry without meta its meta, and does nothing without a root entry', () => {
        const session = useDatasetSessionStore();
        session.setRootMeta('visibility', { data: 1 });
        expect(session.rootEntry).toBeNull();
        session.setRootEntry({ path: '' });
        session.setRootMeta('visibility', { data: 1 });
        expect(session.rootEntry.properties.meta.visibility).toEqual({ data: 1 });
    });
});
