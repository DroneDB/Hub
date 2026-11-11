/**
 * The virtual file grid places its rows absolutely, item-size apart: a row shorter than a tile
 * lets two-line names draw into the next row. The tile and the row height come from one geometry.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import { tileHeight, tileCssVars, GRID_CELL_WIDTH, TILE_SIZES, tileSizeChoice, tileThumbnailSize, gridCellWidth } from './tileGeometry';
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

    it('lets the thumbnail fill its square box and show whole on a neutral background (FR-EXP-33)', () => {
        const rule = css.slice(css.indexOf('.thumbnail .container img {'));
        const block = rule.slice(0, rule.indexOf('}'));
        expect(block).toMatch(/width:\s*100%/);
        expect(block).toMatch(/height:\s*100%/);
        expect(block).toMatch(/object-fit:\s*contain/);
        expect(block).toMatch(/background:\s*var\(--ddb-bg-subtle\)/);
        // the box is the geometry's: the thumbnail side, and the image no longer sets its own maximum inline
        expect(source('EntryThumbnail.vue')).not.toMatch(/alt=""\s+style=/);
        expect(tileHeight({ rootFontPx: 16, fontPx: 16, size: TILE_SIZES.s })).toBe(4 + 4 + 4 + 4 + 128 + 4 + 48);
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

// ---- The size of the thumbnails: S, M, L (FR-EXP-43) ---------------------------------------------------

describe('the tile sizes', () => {
    it('are S 128, M 192 and L 256 px', () => {
        expect(TILE_SIZES).toEqual({ s: 128, m: 192, l: 256 });
        expect(['s', 'm', 'l'].map(tileThumbnailSize)).toEqual([128, 192, 256]);
        // Not a size: the S one
        expect(tileThumbnailSize('xl')).toBe(128);
    });

    it('are chosen by the user, and by default M from the xwide breakpoint (a 4K screen) and S below it', () => {
        expect(tileSizeChoice('l', false)).toBe('l');
        expect(tileSizeChoice('s', true)).toBe('s');
        expect(tileSizeChoice('', true)).toBe('m');
        expect(tileSizeChoice(null, false)).toBe('s');
        expect(tileSizeChoice('huge', true)).toBe('m');
        expect(tileSizeChoice(undefined, false)).toBe('s');
    });

    it('make the tile height of the size: M is 20 + 192 + 48 = 260 px, and the grid row is as tall', async () => {
        expect(tileHeight({ size: TILE_SIZES.s })).toBe(20 + 128 + 48);
        expect(tileHeight({ size: TILE_SIZES.m })).toBe(260);
        expect(tileHeight({ size: TILE_SIZES.l })).toBe(324);
        // On a phone the name grows with the body font (19.2 px), not the spacing
        expect(tileHeight({ size: TILE_SIZES.m, fontPx: 19.2 })).toBe(Math.ceil(20 + 192 + 2 * 1.5 * 19.2));
    });

    it('make the grid columns the thumbnail and its 12 px around it', () => {
        expect([128, 192, 256].map(gridCellWidth)).toEqual([140, 204, 268]);
        expect(gridCellWidth()).toBe(GRID_CELL_WIDTH);
    });

    const files = Array.from({ length: 250 }, (_, i) => ({
        path: `f${i}.jpg`, label: `f${i}.jpg`, selected: false, entry: { path: `f${i}.jpg`, type: 3 }
    }));
    // A tile that keeps the props it is given
    const Tile = { name: 'Thumbnail', props: ['file', 'size', 'dataset', 'lazyLoad', 'active'], template: '<div />' };
    const mountExplorer = (props = {}, count = 250) => mount(DatasetExplorer, {
        props: { files: files.slice(0, count), dataset: {}, ...props },
        global: {
            plugins: [PrimeVue],
            stubs: { Thumbnail: Tile, Toolbar: true, ContextMenu: true, PathBreadcrumb: true, VirtualScroller: true }
        }
    });

    it('size the explorer: its thumbnails, its cell width, its columns and the height of its virtual rows', async () => {
        const w = mountExplorer({ tileSize: 'm' });
        await w.vm.$nextTick();
        expect(w.find('#explorer').attributes('style')).toContain('--grid-cell-width: 204px');
        expect(w.findComponent({ name: 'VirtualScroller' }).props('itemSize')).toBeGreaterThanOrEqual(260);
        w.vm.gridWidth = 1020;
        w.vm.fitColumns();
        expect(w.vm.gridColumns).toBe(5);
        w.unmount();
    });

    it('give the thumbnails the side of the size', () => {
        const w = mountExplorer({ tileSize: 'l' }, 3);
        expect(w.findAllComponents({ name: 'Thumbnail' }).map(t => t.props('size'))).toEqual([256, 256, 256]);
        w.unmount();
    });

    it('count the columns again when the size changes', async () => {
        const w = mountExplorer({ tileSize: 's' });
        w.vm.gridWidth = 1020;
        w.vm.fitColumns();
        expect(w.vm.gridColumns).toBe(7);
        await w.setProps({ tileSize: 'l' });
        expect(w.vm.gridColumns).toBe(3);
        w.unmount();
    });

    it('keep the S size by default', () => {
        const w = mountExplorer({}, 3);
        expect(w.findAllComponents({ name: 'Thumbnail' }).map(t => t.props('size'))).toEqual([128, 128, 128]);
        w.unmount();
    });
});
