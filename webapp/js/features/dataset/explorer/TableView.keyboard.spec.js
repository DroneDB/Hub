/**
 * The file table is an ARIA grid with one tab stop and the same keyboard model as the grid
 * (FR-EXP-09): Up/Down move the active row and the selection, Shift extends it, Home/End jump,
 * Enter opens, Space toggles. Its rows say whether they are selected (FR-EXP-10).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { reactive } from 'vue';
import PrimeVue from 'primevue/config';
import { createPinia, setActivePinia } from 'pinia';
import ddb from 'ddb';

vi.mock('@/libs/build/buildManager', () => ({
    default: { getBuildState: () => null, hasActiveBuild: () => false, on: vi.fn(), off: vi.fn() },
    BUILD_STATES: {}
}));
vi.mock('@/libs/build/buildHelpers', () => ({
    isBuildableFile: () => false, hasActiveBuild: () => false, isFileBuilt: vi.fn(), buildFile: vi.fn(), isBuildComplete: () => false,
    isBuildLoading: () => false, getBuildBadge: () => null, getBuildBadgeTooltip: () => ''
}));

const TableView = (await import('./TableView.vue')).default;

const items = n => Array.from({ length: n }, (_, i) => reactive({
    label: `f${i}.bin`, path: `ddb://h/o/d/f${i}.bin`, icon: 'fa-solid fa-file', selected: false,
    entry: { path: `f${i}.bin`, type: ddb.entry.type.GENERIC, size: 10, mtime: 1, hash: `h${i}` }
}));

let w;
function mountTable(files) {
    setActivePinia(createPinia());
    w = mount(TableView, {
        props: { files, dataset: { org: 'o', ds: 'd' }, canWrite: true },
        attachTo: document.body,
        global: { plugins: [PrimeVue], stubs: { ContextMenu: true, Toolbar: true, PathBreadcrumb: true } }
    });
    return w;
}
const table = () => w.find('table');
const rows = () => w.findAll('tbody tr');
const press = (key, mods = {}) => table().trigger('keydown', { key, ...mods });
const selectedLabels = files => files.filter(f => f.selected).map(f => f.label);

beforeEach(() => vi.spyOn(console, 'warn').mockImplementation(() => {}));
afterEach(() => { w?.unmount(); vi.restoreAllMocks(); });

describe('TableView as a grid', () => {
    it('is one tab stop: the table is focusable, its rows are not, and it is a multi-selectable grid', async () => {
        mountTable(items(5));
        await flushPromises();
        expect(table().attributes()).toMatchObject({ role: 'grid', tabindex: '0', 'aria-multiselectable': 'true', 'aria-label': 'Files' });
        expect(rows()).toHaveLength(5);
        expect(rows().every(r => r.attributes('tabindex') === '-1')).toBe(true);
        expect(w.findAll('tbody [tabindex="0"]')).toHaveLength(0);
    });

    it('exposes the selection of each row as aria-selected', async () => {
        const files = items(3);
        files[1].selected = true;
        mountTable(files);
        await flushPromises();
        expect(rows().map(r => r.attributes('aria-selected'))).toEqual(['false', 'true', 'false']);
        files[2].selected = true;
        await flushPromises();
        expect(rows().map(r => r.attributes('aria-selected'))).toEqual(['false', 'true', 'true']);
    });

    it('moves the active row and the selection with Up and Down, and jumps with Home and End', async () => {
        const files = items(6);
        mountTable(files);
        await flushPromises();
        await press('ArrowDown');
        await press('ArrowDown');
        expect(selectedLabels(files)).toEqual(['f1.bin']);
        const id = table().attributes('aria-activedescendant');
        expect(w.find(`#${id}`).element).toBe(rows()[1].element);
        expect(rows()[1].classes()).toContain('row-active');
        await press('End');
        expect(selectedLabels(files)).toEqual(['f5.bin']);
        await press('ArrowUp');
        expect(selectedLabels(files)).toEqual(['f4.bin']);
        await press('Home');
        expect(selectedLabels(files)).toEqual(['f0.bin']);
    });

    it('extends the selection with Shift, and a horizontal arrow does nothing', async () => {
        const files = items(6);
        mountTable(files);
        await flushPromises();
        await press('ArrowDown');
        await press('ArrowDown', { shiftKey: true });
        await press('ArrowDown', { shiftKey: true });
        expect(selectedLabels(files)).toEqual(['f0.bin', 'f1.bin', 'f2.bin']);
        await press('ArrowRight');
        expect(selectedLabels(files)).toEqual(['f0.bin', 'f1.bin', 'f2.bin']);
    });

    it('opens the active row with Enter and toggles it with Space', async () => {
        const files = items(4);
        mountTable(files);
        await flushPromises();
        await press('ArrowDown');
        await press('ArrowDown', { ctrlKey: true });
        await press(' ');
        expect(selectedLabels(files)).toEqual(['f0.bin', 'f1.bin']);
        await press('Enter');
        expect(w.emitted('openItem')[0][0]).toBe(files[1]);
    });

    it('follows the rows as sorted on screen', async () => {
        const files = items(3);
        mountTable(files);
        await flushPromises();
        w.vm.sortBy('name');
        await flushPromises();
        expect(w.vm.sortDirection).toBe('desc');
        await press('ArrowDown');
        expect(selectedLabels(files)).toEqual(['f2.bin']);
    });

    it('makes a clicked row the active one and gives the table the focus', async () => {
        const files = items(4);
        mountTable(files);
        await flushPromises();
        await rows()[2].trigger('click');
        expect(selectedLabels(files)).toEqual(['f2.bin']);
        expect(document.activeElement).toBe(table().element);
        await press('ArrowDown');
        expect(selectedLabels(files)).toEqual(['f3.bin']);
    });

    it('leaves the keys of a sort button in the header to the button', async () => {
        const files = items(3);
        mountTable(files);
        await flushPromises();
        const header = w.find('thead button.sort-header');
        expect(header.exists()).toBe(true);
        await header.trigger('keydown', { key: 'ArrowDown' });
        expect(selectedLabels(files)).toEqual([]);
    });
});
