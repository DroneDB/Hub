/**
 * Another thumbnail size lays the grid out again (FR-EXP-43): in the virtual grid the tile the keyboard is on, else the
 * first one on screen, stays in view, at its row of the new layout.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h, reactive } from 'vue';
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

const items = n => Array.from({ length: n }, (_, i) => reactive({
    label: `f${i}.bin`, path: `ddb://h/o/d/f${i}.bin`, icon: 'fa-solid fa-file', selected: false,
    entry: { path: `f${i}.bin`, type: ddb.entry.type.GENERIC, size: 10, hash: `h${i}` }
}));

// The virtual grid without layout: it renders no row, it scrolls where it is told
const scrollToIndex = vi.fn();
const scrollElement = { scrollTop: 0 };
const VirtualScrollerStub = defineComponent({
    name: 'VirtualScroller',
    props: { items: { type: Array, default: () => [] }, itemSize: { type: Number, default: 0 }, minHeight: { type: Number, default: 0 } },
    setup(_, { expose }) {
        expose({ scrollToIndex, scrollElement });
        return () => h('div', { class: 'virtual-scroller' });
    }
});

let w;
async function mountGrid() {
    setActivePinia(createPinia());
    w = mount(DatasetExplorer, {
        props: { files: items(240), dataset: { org: 'o', ds: 'd' }, tileSize: 's' },
        attachTo: document.body,
        global: { stubs: { ContextMenu: true, Toolbar: true, PathBreadcrumb: true, VirtualScroller: VirtualScrollerStub } }
    });
    // 840 px wide: 6 cells of 140 px at S, 3 of 268 px at L
    w.vm.gridWidth = 840;
    w.vm.fitColumns();
    await flushPromises();
    expect(w.vm.gridColumns).toBe(6);
    scrollToIndex.mockClear();
}

afterEach(() => { w?.unmount(); scrollElement.scrollTop = 0; vi.clearAllMocks(); });

describe('DatasetExplorer thumbnail size (FR-EXP-43)', () => {
    it('keeps the tile the keyboard is on in view: tile 100 is on row 33 of 3 columns at L', async () => {
        await mountGrid();
        w.vm.nav.setActive(100);
        await w.setProps({ tileSize: 'l' });
        await flushPromises();
        expect(w.vm.gridColumns).toBe(3);
        expect(scrollToIndex).toHaveBeenCalledExactlyOnceWith(33);
    });

    it('keeps the first tile on screen in view: 10 rows of 196 px scrolled at S is tile 60, row 20 at L', async () => {
        await mountGrid();
        scrollElement.scrollTop = 1960;
        await w.setProps({ tileSize: 'l' });
        await flushPromises();
        expect(scrollToIndex).toHaveBeenCalledExactlyOnceWith(20);
    });

    it('does not scroll at the top of the folder', async () => {
        await mountGrid();
        await w.setProps({ tileSize: 'l' });
        await flushPromises();
        expect(w.vm.gridColumns).toBe(3);
        expect(scrollToIndex).not.toHaveBeenCalled();
    });
});
