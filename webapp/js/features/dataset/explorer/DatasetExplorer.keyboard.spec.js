/**
 * The file grid has one tab stop and a keyboard model (FR-EXP-09): arrows move the active tile and
 * the selection, Shift extends it, Home/End jump, Enter opens, Space toggles; tiles are not tab
 * stops. A selected tile has a second cue besides its tint (FR-EXP-10).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { reactive } from 'vue';
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

const DatasetExplorer = (await import('./DatasetExplorer.vue')).default;

const COLUMNS = 3;
const items = (n, type = ddb.entry.type.GENERIC) => Array.from({ length: n }, (_, i) => reactive({
    label: `f${i}.bin`, path: `ddb://h/o/d/f${i}.bin`, icon: 'fa-solid fa-file', selected: false,
    entry: { path: `f${i}.bin`, type, size: 10, hash: `h${i}` }
}));

let w;
function mountGrid(files) {
    setActivePinia(createPinia());
    w = mount(DatasetExplorer, {
        props: { files, dataset: { org: 'o', ds: 'd' }, canWrite: true },
        attachTo: document.body,
        global: { stubs: { ContextMenu: true, Toolbar: true, PathBreadcrumb: true } }
    });
    // jsdom has no layout: the grid is COLUMNS wide
    w.vm.gridColumns = COLUMNS;
    return w;
}
const list = () => w.find('#explorer');
const press = (key, mods = {}) => list().trigger('keydown', { key, ...mods });
const selectedLabels = files => files.filter(f => f.selected).map(f => f.label);

beforeEach(() => vi.spyOn(console, 'warn').mockImplementation(() => {}));
afterEach(() => { w?.unmount(); vi.restoreAllMocks(); });

describe('DatasetExplorer keyboard', () => {
    it('is one tab stop: the list is focusable, its tiles are not', async () => {
        mountGrid(items(18));
        await flushPromises();
        expect(list().attributes('tabindex')).toBe('0');
        expect(list().attributes('role')).toBe('listbox');
        const tiles = w.findAll('[role="option"]');
        expect(tiles).toHaveLength(18);
        expect(tiles.filter(t => t.attributes('tabindex') !== undefined)).toHaveLength(0);
        expect(w.findAll('[tabindex="0"]')).toHaveLength(1);
    });

    it('moves the active tile and the selection with the arrows, by 1 and by a row', async () => {
        const files = items(18);
        mountGrid(files);
        await flushPromises();
        await press('ArrowRight');
        expect(selectedLabels(files)).toEqual(['f0.bin']);
        await press('ArrowRight');
        expect(selectedLabels(files)).toEqual(['f1.bin']);
        await press('ArrowDown');
        expect(selectedLabels(files)).toEqual(['f4.bin']);
        await press('ArrowLeft');
        await press('ArrowUp');
        expect(selectedLabels(files)).toEqual(['f0.bin']);
        const id = list().attributes('aria-activedescendant');
        expect(w.find(`#${id}`).classes()).toContain('active');
        expect(w.find(`#${id}`).attributes('aria-selected')).toBe('true');
        expect(w.emitted('selectionChanged').at(-1)[0]).toBe(files[0]);
    });

    it('extends the selection with Shift+Arrow and jumps with Home and End', async () => {
        const files = items(18);
        mountGrid(files);
        await flushPromises();
        await press('ArrowRight');
        await press('ArrowRight');
        await press('ArrowRight', { shiftKey: true });
        await press('ArrowRight', { shiftKey: true });
        expect(selectedLabels(files)).toEqual(['f1.bin', 'f2.bin', 'f3.bin']);
        await press('End');
        expect(selectedLabels(files)).toEqual(['f17.bin']);
        await press('Home', { shiftKey: true });
        expect(selectedLabels(files)).toHaveLength(18);
        await press('Home');
        expect(selectedLabels(files)).toEqual(['f0.bin']);
    });

    it('moves the active tile without selecting with Ctrl+Arrow, and Space toggles it', async () => {
        const files = items(6);
        mountGrid(files);
        await flushPromises();
        await press('ArrowRight');
        await press('ArrowRight', { ctrlKey: true });
        await press('ArrowRight', { ctrlKey: true });
        expect(selectedLabels(files)).toEqual(['f0.bin']);
        await press(' ');
        expect(selectedLabels(files)).toEqual(['f0.bin', 'f2.bin']);
        await press(' ');
        expect(selectedLabels(files)).toEqual(['f0.bin']);
    });

    it('opens the active tile with Enter', async () => {
        const files = items(4);
        mountGrid(files);
        await flushPromises();
        await press('ArrowRight');
        await press('ArrowRight');
        await press('Enter');
        expect(w.emitted('openItem')[0][0]).toBe(files[1]);
    });

    it('makes the clicked tile the active one, and lands on the first selected tile when it gets the focus', async () => {
        const files = items(6);
        files[3].selected = true;
        mountGrid(files);
        await flushPromises();
        await list().trigger('focus');
        expect(list().attributes('aria-activedescendant')).toBe(w.findAll('[role="option"]')[3].attributes('id'));
        await w.findAll('[role="option"]')[1].trigger('click');
        await press('ArrowRight');
        expect(selectedLabels(files)).toEqual(['f2.bin']);
    });

    it('ignores the keys of something inside the list', async () => {
        const files = items(4);
        mountGrid(files);
        await flushPromises();
        await w.findAll('[role="option"]')[0].trigger('keydown', { key: 'ArrowRight' });
        expect(selectedLabels(files)).toEqual([]);
    });

    it('starts again from the first tile in another folder', async () => {
        mountGrid(items(6));
        await flushPromises();
        await press('End');
        expect(list().attributes('aria-activedescendant')).toBeTruthy();
        await w.setProps({ files: items(3) });
        expect(list().attributes('aria-activedescendant')).toBeUndefined();
    });
});

describe('DatasetExplorer selected tiles', () => {
    it('gives a selected tile a check badge besides its tint, and only a selected one', async () => {
        const files = items(3);
        files[1].selected = true;
        mountGrid(files);
        await flushPromises();
        const tiles = w.findAll('[role="option"]');
        expect(tiles.map(t => t.find('.selected-badge').exists())).toEqual([false, true, false]);
        expect(tiles[1].classes()).toContain('selected');
        expect(tiles[1].attributes('aria-selected')).toBe('true');
        expect(tiles[0].attributes('aria-selected')).toBe('false');
    });
});
