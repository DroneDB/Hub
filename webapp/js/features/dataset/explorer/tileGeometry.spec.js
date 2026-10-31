/**
 * The virtual file grid places its rows absolutely, item-size apart: a row shorter than a tile
 * lets two-line names draw into the next row. The tile and the row height come from one geometry.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import { tileHeight, tileCssVars, GRID_CELL_WIDTH } from './tileGeometry';
import DatasetExplorer from './DatasetExplorer.vue';

// A tile at a 16 px root font: margins 4 + 4, padding 4 + 4, thumbnail 128, gap 4, two lines of name
const DESKTOP = { rootFontPx: 16, fontPx: 16, height: 4 + 4 + 4 + 4 + 128 + 4 + 2 * 1.5 * 16 };
// On a phone the body font is 120 %: the name grows, the rem spacing does not
const PHONE = { rootFontPx: 16, fontPx: 19.2, height: Math.ceil(4 + 4 + 4 + 4 + 128 + 4 + 2 * 1.5 * 19.2) };

const source = file => fs.readFileSync(path.join(__dirname, file), 'utf8');
const styleOf = file => source(file).split('<style')[1];

describe('the tile height', () => {
    it.each([['desktop', DESKTOP], ['phone', PHONE]])('holds the whole tile on a %s', (_, fonts) => {
        expect(tileHeight(fonts)).toBe(fonts.height);
    });

    it('scales the thumbnail and the spacing with the root font', () => {
        expect(tileHeight({ rootFontPx: 20, fontPx: 16 })).toBe(5 + 5 + 5 + 5 + 160 + 5 + 48);
    });
});

describe('the tile layout', () => {
    const css = styleOf('EntryThumbnail.vue');

    it('takes its spacing and the height of its name from the geometry', () => {
        expect(css).toMatch(/margin:\s*var\(--tile-spacing\)/);
        expect(css).toMatch(/padding-top:\s*var\(--tile-spacing\)/);
        expect(css).toMatch(/padding-bottom:\s*var\(--tile-spacing\)/);
        expect(css).toMatch(/margin-bottom:\s*var\(--tile-spacing\)/);
        expect(css).toMatch(/line-height:\s*var\(--tile-label-line-height\)/);
        expect(css).toMatch(/height:\s*calc\(var\(--tile-label-lines\)\s*\*\s*var\(--tile-label-line-height\)\s*\*\s*1em\)/);
        expect(css).toMatch(/line-clamp:\s*var\(--tile-label-lines\)/);
        expect(tileCssVars()).toEqual({ '--tile-spacing': '0.25rem', '--tile-label-lines': 2, '--tile-label-line-height': 1.5 });
    });

    it('sizes the grid columns from the cell width the virtual grid counts with', () => {
        const explorerCss = styleOf('DatasetExplorer.vue');
        expect(explorerCss).toMatch(/minmax\(var\(--grid-cell-width\), 1fr\)/);
        expect(explorerCss).not.toMatch(/\d+px,\s*1fr/);
        expect(GRID_CELL_WIDTH).toBe(140);
    });

    it('outlines the cell a drag is over in both layouts, not only the direct children of the explorer', () => {
        expect(styleOf('DatasetExplorer.vue')).toMatch(/\.grid-cell\.drop-target\s*\{/);
    });
});

describe('the virtual grid', () => {
    const files = Array.from({ length: 250 }, (_, i) => ({
        path: `f${i}.jpg`, label: `f${i}.jpg`, selected: false, entry: { path: `f${i}.jpg`, type: 3 }
    }));

    const mountExplorer = () => mount(DatasetExplorer, {
        props: { files, dataset: {} },
        global: {
            plugins: [PrimeVue],
            stubs: { Thumbnail: true, Toolbar: true, ContextMenu: true, PathBreadcrumb: true, VirtualScroller: true }
        }
    });

    afterEach(() => vi.restoreAllMocks());

    it.each([['desktop', DESKTOP], ['phone', PHONE]])('spaces its rows at least one tile apart on a %s', async (_, fonts) => {
        const real = globalThis.getComputedStyle.bind(globalThis);
        vi.spyOn(globalThis, 'getComputedStyle').mockImplementation(el => {
            if (el === document.documentElement) return { fontSize: `${fonts.rootFontPx}px` };
            if (el?.id === 'explorer') return { fontSize: `${fonts.fontPx}px` };
            return real(el);
        });
        const w = mountExplorer();
        await w.vm.$nextTick(); // the fonts are measured once mounted
        const rowHeight = w.findComponent({ name: 'VirtualScroller' }).props('itemSize');
        expect(rowHeight).toBeGreaterThanOrEqual(fonts.height);
        w.unmount();
    });
});
