import { describe, it, expect } from 'vitest';
import { readSource, ruleOf, mediaBlock } from '@/specs/cssSource';

// The panels over the map must keep out of the toolbar rail on the right, and on a phone the
// analysis panels are sheets inside the map that fold; the layout is CSS, so the rules are read
const css = readSource(__dirname, '../../../../css/ol-controls.css');
const scss = readSource(__dirname, '../../../../css/_analysis-panel.scss');
const layerPanel = readSource(__dirname, './RasterLayerOpacityPanel.vue');
const layerPanelStyle = layerPanel.slice(layerPanel.indexOf('<style'));
const PHONE = 'max-width: 767.98px';

describe('the panels over the bottom of the map', () => {
    it('define the width of the toolbar rail once, on the map', () => {
        expect(css.match(/--map-rail-reserve:/g)).toHaveLength(1);
        expect(ruleOf(css, '.map-container')).toMatch(/--map-rail-reserve:\s*4rem/);
        expect(scss).not.toMatch(/--map-rail-reserve:/);
    });

    it('define the height of the bottom-left controls once, on the map', () => {
        expect(css.match(/--map-bottom-reserve:/g)).toHaveLength(1);
        expect(ruleOf(css, '.map-container')).toMatch(/--map-bottom-reserve:\s*4rem/);
        expect(scss).not.toMatch(/--map-bottom-reserve:/);
    });

    it('keep the bottom panel and the sheet, open or folded, above the map settings button on a phone', () => {
        const phone = mediaBlock(scss, PHONE);
        expect(ruleOf(mediaBlock(css, 'max-width: 575.98px'), '.map-bottom-panel')).toMatch(/bottom:\s*var\(--map-bottom-reserve\)/);
        expect(ruleOf(phone, '.analysis-panel')).toMatch(/bottom:\s*var\(--map-bottom-reserve\)/);
        expect(ruleOf(phone, '.map-container:has(> .analysis-panel.is-minimised) > .map-bottom-panel'))
            .toMatch(/bottom:\s*calc\(var\(--map-bottom-reserve\) \+ var\(--map-sheet-peek\) \+ 0\.5rem\)/);
    });

    it('keep the bottom panel out of the rail at any width', () => {
        expect(ruleOf(css, '.map-bottom-panel')).toMatch(/max-width:\s*calc\(100% - 2 \* var\(--map-rail-reserve\)\)/);
    });

    it('stretch the bottom panel from the left edge to the rail on a phone, not centred', () => {
        const panel = ruleOf(mediaBlock(css, 'max-width: 575.98px'), '.map-bottom-panel');
        expect(panel).toMatch(/left:\s*0\.5rem/);
        expect(panel).toMatch(/right:\s*var\(--map-rail-reserve\)/);
        expect(panel).toMatch(/transform:\s*none/);
        expect(panel).toMatch(/width:\s*auto/);
        expect(panel).toMatch(/max-width:\s*none/);
    });

    it('turn the analysis panels into sheets inside the map at the phone breakpoint of the Hub', () => {
        expect(scss).not.toMatch(/max-width:\s*768px/);
        const sheet = ruleOf(mediaBlock(scss, PHONE), '.analysis-panel');
        expect(sheet).toMatch(/position:\s*absolute/);
        expect(sheet).not.toMatch(/position:\s*fixed/);
        expect(sheet).toMatch(/right:\s*var\(--map-rail-reserve\)/);
        expect(sheet).toMatch(/max-height:\s*50%/);
        expect(sheet).toMatch(/background:\s*var\(--panel-bg-solid\)/);
    });

    it('paint the sheet opaque', () => {
        const token = scss.match(/--panel-bg-solid:\s*([^;]+);/);
        expect(token).not.toBeNull();
        expect(token[1]).not.toMatch(/rgba|hsla|\/|transparent/);
    });

    it('fold the sheet to its header and show the fold button only on a phone', () => {
        const phone = mediaBlock(scss, PHONE);
        expect(ruleOf(phone, '&.is-minimised')).toMatch(/max-height:\s*var\(--map-sheet-peek\)/);
        expect(phone).toMatch(/> :not\(\.panel-header\)\s*\{\s*display:\s*none/);
        expect(phone).toMatch(/\.sheet-toggle\s*\{[^}]*display:\s*inline-flex/);
        expect(scss.replace(phone, '')).toMatch(/\.sheet-toggle\s*\{\s*display:\s*none/);
    });

    it('hide the layer panel behind an open sheet and lift it above a folded one', () => {
        const phone = mediaBlock(scss, PHONE);
        expect(ruleOf(phone, '.map-container:has(> .analysis-panel:not(.is-minimised)) > .map-bottom-panel'))
            .toMatch(/display:\s*none/);
        expect(ruleOf(phone, '.map-container:has(> .analysis-panel.is-minimised) > .map-bottom-panel'))
            .toMatch(/bottom:\s*calc\(.*var\(--map-sheet-peek\)/);
    });
});

describe('the layer panel on a phone', () => {
    const tablet = mediaBlock(layerPanelStyle, PHONE);
    const phone = mediaBlock(layerPanelStyle, 'max-width: 575.98px');

    it('shows the fold toggle only at the phone breakpoint', () => {
        expect(ruleOf(layerPanelStyle.replace(tablet, ''), '.fold-toggle')).toMatch(/display:\s*none/);
        expect(ruleOf(layerPanelStyle.replace(tablet, ''), '.layers-header')).toMatch(/display:\s*none/);
        expect(ruleOf(tablet, '.fold-toggle')).toMatch(/display:\s*inline-flex/);
        expect(ruleOf(tablet, '.layers-header')).toMatch(/display:\s*flex/);
    });

    it('folds by hiding everything but the header', () => {
        expect(tablet).toMatch(/\.is-folded > :not\(\.layers-header\)\s*\{\s*display:\s*none/);
    });

    it('stays a direct child of the map and a bottom panel, so the rules for the sheets reach it', () => {
        expect(layerPanel).toMatch(/<div v-if="[^"]*" class="raster-opacity-panel map-bottom-panel"/);
    });

    it('lays a row out as two lines: the name and the eye, then the slider and the actions', () => {
        expect(ruleOf(phone, '.raster-opacity-row')).toMatch(/flex-direction:\s*column/);
        expect(ruleOf(phone, '.row-controls')).toMatch(/display:\s*flex/);
        expect(ruleOf(layerPanelStyle.replace(phone, ''), '.row-controls')).toMatch(/display:\s*contents/);
        // The name takes what the eye leaves and the slider what the actions leave, so none wraps
        expect(ruleOf(phone, '.raster-label')).toMatch(/flex:\s*1 1 0/);
        expect(ruleOf(phone, '.raster-opacity-row input[type="range"]')).toMatch(/flex:\s*1 1 0/);
        expect(ruleOf(phone, '.row-controls')).not.toMatch(/flex-wrap:\s*wrap/);
        expect(phone).not.toMatch(/flex:\s*1 0 100%/);
    });
});

describe('the layers of the map', () => {
    const split = readSource(__dirname, './RasterSplitOverlay.vue');
    const splitStyle = split.slice(split.indexOf('<style'));
    const map = ruleOf(css, '.map-container');
    /** The number a `--map-layer-*` token of the map stands for. @param {string} name */
    const layer = name => {
        const value = map.match(new RegExp(`--map-layer-${name}:\\s*(\\d+);`));
        expect(value, `--map-layer-${name}`).not.toBeNull();
        return Number(value[1]);
    };

    it('belong to the map alone, so the page around it never mixes with them', () => {
        expect(map).toMatch(/isolation:\s*isolate/);
    });

    it('lift the container of the toolbar zones over the inline z-index OpenLayers gives it', () => {
        expect(ruleOf(css, '.map-container .ol-overlaycontainer-stopevent'))
            .toMatch(/z-index:\s*var\(--map-layer-controls\)\s*!important/);
    });

    it('take their place from the tokens of the map', () => {
        expect(ruleOf(splitStyle, '.split-overlay')).toMatch(/z-index:\s*var\(--map-layer-split\)/);
        expect(ruleOf(css, '.map-bottom-panel')).toMatch(/z-index:\s*var\(--map-layer-bottom-panel\)/);
        expect(ruleOf(scss, '.analysis-panel')).toMatch(/z-index:\s*var\(--map-layer-panel\)/);
    });

    it('keep the toolbar above the split, so a divider under a map button never takes its click', () => {
        expect(layer('controls')).toBeGreaterThan(layer('split'));
        expect(layer('controls')).toBeGreaterThan(layer('bottom-panel'));
    });

    it('keep the analysis panels and sheets above the toolbar and the split, as they were', () => {
        expect(layer('panel')).toBeGreaterThan(layer('controls'));
        expect(layer('split')).toBeGreaterThan(layer('bottom-panel'));
    });

    it('put the labels of the split below the zoom control at the top left (and so below the row of buttons at the top centre), and above the settings button on a phone', () => {
        expect(map).toMatch(/--map-top-reserve:\s*4rem/);
        // 0.5rem inset + 0.25rem padding + 2 x (2rem button + 2 x 0.25rem margin) + 0.25rem padding = 6rem, and air
        expect(map).toMatch(/--map-zoom-reserve:\s*6\.25rem/);
        expect(ruleOf(splitStyle, '.split-band-label')).toMatch(/top:\s*var\(--map-zoom-reserve\)/);
        expect(ruleOf(mediaBlock(splitStyle, 'max-width: 575.98px'), '.split-band-label'))
            .toMatch(/bottom:\s*var\(--map-bottom-reserve\)/);
    });
});

describe('the toolbar rail of a compact map (FR-MAP-12, FR-SHR-05)', () => {
    // MapCore puts .is-compact on the map from the size of the map itself; the same rules serve a phone and a 600 x 400 frame
    it('shows the Measure toggle only on a compact map, and nowhere else', () => {
        expect(ruleOf(css, '.ol-measure-toggle')).toMatch(/display:\s*none/);
        expect(ruleOf(css, '.map-container.is-compact .ol-measure-toggle')).toMatch(/display:\s*block/);
    });

    it('hides the groups of the measure tools of a compact map until the toggle opens them', () => {
        const hidden = ruleOf(css, '.map-container.is-compact .ol-measure-control:not(.is-open) > .ol-control:not(.ol-measure-toggle)');
        expect(hidden).toMatch(/display:\s*none\s*!important/);
    });

    it('lets the rail of a compact map scroll when the open tools are taller than the map', () => {
        expect(ruleOf(css, '.map-container.is-compact .ol-zone-top-right')).toMatch(/overflow-y:\s*auto/);
    });

    it('turns the arrow of a popup below its point up', () => {
        const arrow = ruleOf(css, '.ol-point-popup-below::after');
        expect(arrow).toMatch(/top:\s*-0\.5rem/);
        expect(arrow).toMatch(/border-bottom:\s*0\.5rem solid white/);
    });
});

describe('the layer names of a map with several layers (FR-RAS-12)', () => {
    const split = readSource(__dirname, './RasterSplitOverlay.vue');

    it('centres the label of the last band in what the toolbar rail leaves of it, never wider', () => {
        expect(split).toMatch(/left: `calc\(\(\$\{left\} \+ 100% - var\(--map-rail-reserve\)\) \/ 2\)`/);
        expect(split).toMatch(/maxWidth: `calc\(100% - var\(--map-rail-reserve\) - \$\{left\}\)`/);
    });
});
