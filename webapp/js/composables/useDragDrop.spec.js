/** Drag-and-drop composables. */
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { h, reactive } from 'vue';
import { useDragDrop } from './useDragDrop';

function harness(props, datasetDrop, selected = []) {
    let api;
    mount({ setup() { api = useDragDrop(props, { selectedFiles: () => selected }); return () => h('div'); } },
        { global: { provide: { datasetDrop } } });
    return api;
}

const internalDrop = item => ({
    preventDefault: vi.fn(), stopPropagation: vi.fn(),
    dataTransfer: { types: ['item'], getData: () => JSON.stringify(item) }
});

describe('useDragDrop', () => {
    it('moves an internal drag dropped on the background into the folder on screen, with the selection', async () => {
        const datasetDrop = { move: vi.fn(), upload: vi.fn() };
        const props = reactive({ canWrite: true, currentPath: 'photos' });
        const other = { entry: { path: 'b.jpg' } };
        const api = harness(props, datasetDrop, [other]);
        await api.explorerDropHandler(internalDrop({ entry: { path: 'a.jpg' } }));
        expect(datasetDrop.move).toHaveBeenCalledTimes(2);
        expect(datasetDrop.move.mock.calls[0][1].entry.path).toBe('photos');
        expect(api.dropping.value).toBe(false);
    });

    it('does nothing without write access and skips drops an item already handled', async () => {
        const datasetDrop = { move: vi.fn(), upload: vi.fn() };
        const api = harness(reactive({ canWrite: false, currentPath: '' }), datasetDrop);
        await api.explorerDropHandler(internalDrop({ entry: { path: 'a.jpg' } }));
        const handled = { ...internalDrop({ entry: { path: 'a.jpg' } }), _ddbHandled: true };
        const api2 = harness(reactive({ canWrite: true, currentPath: '' }), datasetDrop);
        await api2.explorerDropHandler(handled);
        expect(datasetDrop.move).not.toHaveBeenCalled();
    });

    it('tracks the overlay with nested enter/leave events', () => {
        const api = harness(reactive({ canWrite: true, currentPath: '' }), null);
        api.explorerDragEnter();
        api.explorerDragEnter();
        api.explorerDragLeave();
        expect(api.dropping.value).toBe(true);
        api.explorerDragLeave();
        expect(api.dropping.value).toBe(false);
    });
});
