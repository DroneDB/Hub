import { describe, it, expect } from 'vitest';
import { readSource, ruleOf, mediaBlock } from '@/specs/cssSource';

// The panels over the map must keep out of the toolbar rail on the right, and on a phone the
// analysis panels are sheets inside the map that fold; the layout is CSS, so the rules are read
const css = readSource(__dirname, '../../../../css/ol-controls.css');
const scss = readSource(__dirname, '../../../../css/_analysis-panel.scss');
const layerPanel = readSource(__dirname, './RasterLayerOpacityPanel.vue');
const layerPanelStyle = layerPanel.slice(layerPanel.indexOf('<style'));
const PHONE = 'max-width: 767.98px';
/** The number of rem a pattern captures in a rule. @param {string} source @param {RegExp} pattern */
const rem = (source, pattern) => Number(pattern.exec(source)[1]);

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

    it('keep the bottom panel above the scale bar at any size (FR-MAP-30): on a narrow or short map it reaches over the bottom left', () => {
        // The scale bar of OpenLayers with its text is about 3rem high (0.5rem + 25px + 12px of text), under the 4rem of the reserve
        const scaleBar = ruleOf(css, '.map-container .ol-scale-bar');
        expect(scaleBar).toMatch(/bottom:\s*0\.5rem/);
        expect(scaleBar).toMatch(/left:\s*4rem/);
        expect(ruleOf(css, '.map-bottom-panel')).toMatch(/bottom:\s*var\(--map-bottom-reserve\)/);
        expect(ruleOf(css, '.map-bottom-panel')).not.toMatch(/bottom:\s*2rem/);
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

// FR-MAP-10: the hint "Photos are in images - Show" at the bottom centre of the map. A narrow or compact map (U-411) brings
// the bottom-left controls under the middle: the scale bar (FR-MAP-30) stands 0.5rem up and about 3rem high
describe('the hint of a folder whose subfolder has the map entries', () => {
    const chipSource = readSource(__dirname, './GeoSubfolderChip.vue');
    const chip = ruleOf(chipSource.slice(chipSource.indexOf('<style')), '.geo-subfolder-chip');
    const mapCore = readSource(__dirname, './MapCore.vue');
    const datasetMap = readSource(__dirname, './DatasetMap.vue');

    it('is in the map, where its reserves are defined: MapCore\'s overlay slot in .map-container, which DatasetMap fills', () => {
        const container = mapCore.indexOf('class="map-container"');
        const slot = mapCore.indexOf('<slot name="overlay" />');
        expect(container).toBeGreaterThan(0);
        expect(slot).toBeGreaterThan(container);
        // The container closes before the dialogs of the map
        expect(slot).toBeLessThan(mapCore.indexOf('<MapDialogs'));
        expect(datasetMap).toMatch(/<template #overlay>\s*<GeoSubfolderChip /);
    });

    it('stands above the scale bar and the settings button at any size, as the bottom panels do', () => {
        expect(chip).toMatch(/bottom:\s*var\(--map-bottom-reserve\)/);
        expect(chip).not.toMatch(/bottom:\s*2\.5rem/);
        const reserve = rem(ruleOf(css, '.map-container'), /--map-bottom-reserve:\s*([\d.]+)rem/);
        const scaleBarBottom = rem(ruleOf(css, '.map-container .ol-scale-bar'), /bottom:\s*([\d.]+)rem/);
        // The scale bar with its text is about 3rem high: its top is under the bottom of the hint
        expect(scaleBarBottom + 3).toBeLessThanOrEqual(reserve);
    });

    it('keeps out of the toolbar rail, with the width of the map, and stays under the controls and the panels', () => {
        expect(chip).toMatch(/max-width:\s*calc\(100% - 2 \* var\(--map-rail-reserve\)\)/);
        expect(chip).toMatch(/z-index:\s*var\(--map-layer-bottom-panel\)/);
        expect(chip).toMatch(/left:\s*50%/);
        expect(chip).toMatch(/transform:\s*translateX\(-50%\)/);
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

// The colour legend of the styled rasters stands in the row of the bottom controls, at the bottom right: it was at the top
// left, on the selection tools of the dataset map
describe('the colour legend of the styled rasters', () => {
    const source = readSource(__dirname, './RasterLegend.vue');
    const style = source.slice(source.indexOf('<style'));
    const legend = ruleOf(style, '.raster-legend');
    const narrow = ruleOf(style, '.map-container.is-narrow .raster-legend');
    const map = ruleOf(css, '.map-container');
    const mapCore = readSource(__dirname, './MapCore.vue');

    it('stands at the bottom right, left of the attribution button and out of the top left, where the selection tools are', () => {
        expect(legend).toMatch(/right:\s*var\(--map-rail-reserve\)/);
        expect(legend).toMatch(/bottom:\s*0\.5rem/);
        expect(legend).not.toMatch(/\b(top|left):/);
        // The attribution button of OpenLayers stands 0.5em from the corner, a control of 3rem: inside the rail
        expect(rem(map, /--map-rail-reserve:\s*([\d.]+)rem/)).toBeGreaterThanOrEqual(0.5 + 3);
    });

    it('starts after the settings button and the scale bar, with the width of the map', () => {
        expect(css.match(/--map-scale-reserve:/g)).toHaveLength(1);
        expect(legend).toMatch(/max-width:\s*calc\(100% - var\(--map-rail-reserve\) - var\(--map-scale-reserve\)\)/);
        // The bar of the scale is at most 2.5 times its least length (the round lengths go 1, 2, 5), and its last label
        // hangs about 1rem over its end
        const least = Number(/new ScaleLine\(\{[^}]*minWidth:\s*(\d+)/.exec(mapCore)[1]);
        const scaleBarLeft = rem(ruleOf(css, '.map-container .ol-scale-bar'), /left:\s*([\d.]+)rem/);
        expect(rem(map, /--map-scale-reserve:\s*([\d.]+)rem/)).toBeGreaterThanOrEqual(scaleBarLeft + 2.5 * least / 16 + 1);
    });

    it('is one row of legends under the bottom panels, however many layers have one: the legends that do not fit are cut off', () => {
        expect(legend).toMatch(/flex-flow:\s*row wrap-reverse/);
        expect(legend).toMatch(/justify-content:\s*flex-end/);
        expect(legend).toMatch(/overflow:\s*hidden/);
        const top = rem(legend, /bottom:\s*([\d.]+)rem/) + rem(legend, /max-height:\s*([\d.]+)rem/);
        expect(top).toBeLessThan(rem(map, /--map-bottom-reserve:\s*([\d.]+)rem/));
        // The height of that row: the name and the ends (0.75rem of text at 1.2), the bar, the two gaps and the padding
        const item = ruleOf(style, '.legend-item');
        const text = rem(legend, /font-size:\s*([\d.]+)rem/) * Number(/line-height:\s*([\d.]+)/.exec(legend)[1]);
        const row = 2 * text + rem(ruleOf(style, '.legend-bar'), /height:\s*([\d.]+)rem/) + 2 * rem(item, /gap:\s*([\d.]+)rem/)
            + 2 * rem(legend, /padding:\s*([\d.]+)rem/);
        expect(rem(legend, /max-height:\s*([\d.]+)rem/)).toBeCloseTo(row, 5);
    });

    it('narrows its legends before one leaves the row', () => {
        const item = ruleOf(style, '.legend-item');
        expect(item).toMatch(/flex:\s*1 1 8rem/);
        expect(item).toMatch(/min-width:\s*8rem/);
        expect(item).toMatch(/width:\s*11rem/);
    });

    it('stands at the top of a narrow map, right of the left column of controls and below the buttons at the top centre', () => {
        expect(css.match(/--map-left-reserve:/g)).toHaveLength(1);
        // The zoom and the selection tools: 0.5rem from the edge, a control of 3rem
        expect(rem(map, /--map-left-reserve:\s*([\d.]+)rem/)).toBeGreaterThanOrEqual(rem(ruleOf(css, '.ol-zone-top-left'), /left:\s*([\d.]+)rem/) + 3);
        expect(narrow).toMatch(/top:\s*var\(--map-top-reserve\)/);
        expect(narrow).toMatch(/left:\s*var\(--map-left-reserve\)/);
        expect(narrow).toMatch(/right:\s*auto/);
        expect(narrow).toMatch(/bottom:\s*auto/);
        expect(narrow).toMatch(/flex-flow:\s*column/);
        expect(narrow).toMatch(/max-height:\s*none/);
        expect(narrow).toMatch(/max-width:\s*calc\(100% - var\(--map-left-reserve\) - var\(--map-rail-reserve\)\)/);
        expect(ruleOf(style, '.map-container.is-narrow .legend-item')).toMatch(/flex:\s*none/);
        // Beside an analysis panel that is not a sheet, it ends before the panel
        expect(ruleOf(mediaBlock(style, 'min-width: 768px'), '.map-container.is-narrow:has(> .analysis-panel) .raster-legend'))
            .toMatch(/max-width:\s*calc\(100% - var\(--map-left-reserve\) - var\(--map-rail-reserve\) - var\(--ddb-panel-analysis-width\) - 0\.5rem\)/);
    });

    it('keeps its row from the analysis panels, which end on the line of the bottom panels while a legend shows', () => {
        const desktop = mediaBlock(scss, 'min-width: 768px');
        expect(ruleOf(desktop, '.map-container:not(.is-narrow):has(> .raster-legend) > .analysis-panel'))
            .toMatch(/max-height:\s*calc\(100% - 0\.5rem - var\(--map-bottom-reserve\)\)/);
        // The legend is a child of the map, as the panels are (MapCore.spec.js checks the rendered map)
        expect(mapCore).toMatch(/<div ref="map-container" class="map-container"[\s\S]*<RasterLegend [\s\S]*<slot name="overlay" \/>\s*<\/div>/);
    });

    it('leaves the row to the attribution while it is open', () => {
        expect(ruleOf(style, '.map-container:not(.is-narrow):has(.ol-attribution:not(.ol-collapsed)) .raster-legend'))
            .toMatch(/visibility:\s*hidden/);
    });
});
