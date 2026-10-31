import { describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import ddb from 'ddb';
import FolderPicker from './FolderPicker.vue';

const { entry } = ddb;

const ENTRIES = [
    { path: 'flights', type: entry.type.DIRECTORY },
    { path: 'a.tif', type: entry.type.GEORASTER },
    { path: 'b.tif', type: entry.type.GEORASTER },
    { path: 'notes.txt', type: entry.type.GENERIC }
];

const Stub = { template: '<div><slot /><slot name="footer" /></div>' };

const picker = async (props = {}) => {
    const dataset = { list: vi.fn().mockResolvedValue(ENTRIES), createFolder: vi.fn() };
    const w = mount(FolderPicker, {
        props: { dataset, mode: 'file', ...props },
        global: { plugins: [PrimeVue], stubs: { Window: Stub, HubWindow: Stub, DataTable: true, PathBreadcrumb: true, ConfirmDialog: true } }
    });
    await flushPromises();
    return w;
};

const row = (w, path) => w.vm.files.find(f => f.entry.path === path);
const closed = w => w.emitted('close');

describe('FolderPicker selectability', () => {
    it('keeps the default rules without accept or exclude', async () => {
        const w = await picker();
        expect(w.vm.canSelect(row(w, 'a.tif'))).toBe(true);
        expect(w.vm.canSelect(row(w, 'notes.txt'))).toBe(true);
        expect(w.vm.canSelect(row(w, 'flights'))).toBe(false);
        expect(w.vm.rowClass(row(w, 'a.tif'))).toBe('');
        expect(w.vm.rowClass(row(w, 'flights'))).toContain('row-disabled');

        const folders = await picker({ mode: 'folder' });
        expect(folders.vm.canSelect(row(folders, 'flights'))).toBe(true);
        expect(folders.vm.canSelect(row(folders, 'a.tif'))).toBe(false);
    });

    it('rejects a file that accept refuses and greys its row', async () => {
        const w = await picker({ accept: e => e.type === entry.type.GEORASTER });
        expect(w.vm.canSelect(row(w, 'a.tif'))).toBe(true);
        expect(w.vm.canSelect(row(w, 'notes.txt'))).toBe(false);
        expect(w.vm.rowClass(row(w, 'notes.txt'))).toContain('row-disabled');
    });

    it('rejects an excluded path', async () => {
        const w = await picker({ exclude: ['/a.tif/'] });
        expect(w.vm.canSelect(row(w, 'a.tif'))).toBe(false);
        expect(w.vm.canSelect(row(w, 'b.tif'))).toBe(true);
    });

    it('still navigates into folders when accept refuses them', async () => {
        const w = await picker({ accept: () => false });
        w.vm.onRowDblClick({ data: row(w, 'flights') });
        await flushPromises();
        expect(w.vm.currentPath).toBe('flights');
        expect(w.vm.dataset.list).toHaveBeenLastCalledWith('flights');
    });

    it('does not confirm a rejected file by double click', async () => {
        const w = await picker({ exclude: ['a.tif'] });
        w.vm.onRowDblClick({ data: row(w, 'a.tif') });
        expect(closed(w)).toBeUndefined();
        w.vm.onRowDblClick({ data: row(w, 'b.tif') });
        expect(closed(w)[0][0].path).toBe('b.tif');
    });
});

describe('FolderPicker confirm', () => {
    it('refuses a typed excluded path', async () => {
        const w = await picker({ exclude: ['a.tif'] });
        w.vm.selectedPath = 'a.tif';
        await w.vm.onConfirm();
        expect(closed(w)).toBeUndefined();
        expect(w.vm.errorMessage).toContain('cannot be selected');
    });

    it('refuses a typed path of a file that accept rejects', async () => {
        const w = await picker({ accept: e => e.type === entry.type.GEORASTER });
        w.vm.selectedPath = 'notes.txt';
        await w.vm.onConfirm();
        expect(closed(w)).toBeUndefined();
        expect(w.vm.errorMessage).toContain('cannot be selected');
    });

    it('confirms a typed path that passes both', async () => {
        const w = await picker({ accept: e => e.type === entry.type.GEORASTER, exclude: ['a.tif'] });
        w.vm.selectedPath = 'b.tif';
        await w.vm.onConfirm();
        expect(closed(w)[0][0].path).toBe('b.tif');
    });
});
