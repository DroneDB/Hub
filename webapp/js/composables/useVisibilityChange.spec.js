/**
 * The one way the Hub changes the visibility of a dataset: it always asks, in either direction; a change the server
 * took reaches the session's root entry (the header shows it) and says so; Cancel and a failure change nothing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const notify = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('@/composables/useNotify', () => ({ useNotify: () => notify }));

const { useVisibilityChange } = await import('./useVisibilityChange');
const { useDatasetSessionStore } = await import('@/stores/datasetSession');

let root;
let dataset;
beforeEach(() => {
    setActivePinia(createPinia());
    notify.success.mockClear();
    notify.error.mockClear();
    root = { path: '', properties: { meta: { visibility: { id: 'v', data: 0 } } } };
    useDatasetSessionStore().setRootEntry(root);
    dataset = { setVisibility: vi.fn(to => Promise.resolve({ id: 'v', data: to })) };
});

describe('useVisibilityChange', () => {
    it('asks first, then sets the visibility, puts it in the session root entry and says so', async () => {
        const confirm = vi.fn(() => Promise.resolve(true));
        const changed = await useVisibilityChange(confirm)(dataset, { name: 'Brighton', from: 0, to: 2 });
        expect(changed).toBe(true);
        expect(confirm).toHaveBeenCalledTimes(1);
        expect(confirm.mock.calls[0][0].title).toBe('Make the dataset Public?');
        expect(dataset.setVisibility).toHaveBeenCalledWith(2);
        expect(useDatasetSessionStore().rootEntry).toBe(root);
        expect(root.properties.meta.visibility.data).toBe(2);
        expect(notify.success).toHaveBeenCalledWith('Brighton is now Public', { summary: 'Visibility Updated' });
    });

    it('asks before making a dataset Private too', async () => {
        root.properties.meta.visibility.data = 2;
        const confirm = vi.fn(() => Promise.resolve(true));
        await useVisibilityChange(confirm)(dataset, { name: 'Brighton', from: 2, to: 0 });
        expect(confirm.mock.calls[0][0].title).toBe('Make the dataset Private?');
        expect(dataset.setVisibility).toHaveBeenCalledWith(0);
    });

    it('changes nothing on Cancel', async () => {
        const changed = await useVisibilityChange(() => Promise.resolve(false))(dataset, { name: 'Brighton', from: 0, to: 1 });
        expect(changed).toBe(false);
        expect(dataset.setVisibility).not.toHaveBeenCalled();
        expect(root.properties.meta.visibility.data).toBe(0);
        expect(notify.success).not.toHaveBeenCalled();
    });

    it('neither asks nor sends anything for the visibility the dataset has', async () => {
        const confirm = vi.fn(() => Promise.resolve(true));
        expect(await useVisibilityChange(confirm)(dataset, { name: 'Brighton', from: '1', to: 1 })).toBe(false);
        expect(confirm).not.toHaveBeenCalled();
        expect(dataset.setVisibility).not.toHaveBeenCalled();
    });

    it('a failure is a toast, and the session keeps the visibility the dataset has', async () => {
        dataset.setVisibility.mockRejectedValue(new Error('Forbidden'));
        const changed = await useVisibilityChange(() => Promise.resolve(true))(dataset, { name: 'Brighton', from: 0, to: 2 });
        expect(changed).toBe(false);
        expect(root.properties.meta.visibility.data).toBe(0);
        expect(notify.error).toHaveBeenCalledWith('Failed to update visibility: Forbidden');
        expect(notify.success).not.toHaveBeenCalled();
    });
});
