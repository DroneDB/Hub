/**
 * FR-MAP-24: one icon per meaning, and one meaning per icon. The buttons of the map take their glyph from libs/glyphs:
 * a Font Awesome Solid glyph, or one drawn for the Hub where Font Awesome has none that says what the button does.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import * as icons from './glyphs';

const WEBAPP = path.resolve(__dirname, '../..');
const FONT_AWESOME_SOLID = path.resolve(WEBAPP, '../node_modules/@fortawesome/fontawesome-free/svgs/solid');
const source = file => readFileSync(path.resolve(__dirname, file), 'utf8');

// Every meaning of the registry and its glyph
const MEANINGS = Object.entries(icons).filter(([name]) => name.endsWith('_ICON'));
const FONT_GLYPH = /^fa-solid fa-([a-z-]+)$/;
const DRAWN_GLYPH = /^ddb-icon ddb-icon-([a-z-]+)$/;
const drawnNames = MEANINGS.map(([, glyph]) => DRAWN_GLYPH.exec(glyph)).filter(Boolean).map(match => match[1]).sort();
const drawing = name => readFileSync(path.resolve(WEBAPP, 'icons', `${name}.svg`), 'utf8');
const stylesheet = readFileSync(path.resolve(WEBAPP, 'css/_icons.scss'), 'utf8');

describe('the icons of the map, the viewers and the explorer', () => {
    it('are one glyph per meaning: no two meanings share a glyph', () => {
        const glyphs = MEANINGS.map(([, glyph]) => glyph);
        expect(glyphs.length).toBeGreaterThan(30);
        expect(glyphs.filter((glyph, i) => glyphs.indexOf(glyph) !== i)).toEqual([]);
    });

    it.each(MEANINGS)('%s is a Font Awesome Solid glyph that exists, or a glyph drawn for the Hub', (name, glyph) => {
        const font = FONT_GLYPH.exec(glyph);
        if (font) expect(existsSync(path.join(FONT_AWESOME_SOLID, `${font[1]}.svg`))).toBe(true);
        else expect(glyph).toMatch(DRAWN_GLYPH);
    });

    it('draw what the tool makes on the map, where Font Awesome has no glyph that says it', () => {
        expect({
            area: icons.AREA_ICON, editVertices: icons.EDIT_VERTICES_ICON, stockpile: icons.STOCKPILE_ICON, rasterAnalysis: icons.RASTER_ANALYSIS_ICON,
            callouts: icons.CALLOUTS_ICON, direction: icons.DIRECTION_ICON, flightPath: icons.FLIGHT_PATH_ICON, compare: icons.COMPARE_ICON,
            geojson: icons.EXPORT_GEOJSON_ICON, csv: icons.EXPORT_CSV_ICON,
            rectangle: icons.SELECT_RECTANGLE_ICON, polygon: icons.SELECT_POLYGON_ICON, clearSelection: icons.CLEAR_SELECTION_ICON
        }).toEqual({
            area: 'ddb-icon ddb-icon-area', editVertices: 'ddb-icon ddb-icon-edit-vertices', stockpile: 'ddb-icon ddb-icon-stockpile',
            rasterAnalysis: 'ddb-icon ddb-icon-raster-analysis', callouts: 'ddb-icon ddb-icon-callouts', direction: 'ddb-icon ddb-icon-direction',
            flightPath: 'ddb-icon ddb-icon-flight-path', compare: 'ddb-icon ddb-icon-compare', geojson: 'ddb-icon ddb-icon-file-geojson',
            csv: 'ddb-icon ddb-icon-file-table', rectangle: 'ddb-icon ddb-icon-select-rectangle', polygon: 'ddb-icon ddb-icon-select-polygon',
            clearSelection: 'ddb-icon ddb-icon-select-clear'
        });
    });

    it('keep the three ways to remove apart: an eraser for one, a broom for the map, a bin for the saved file', () => {
        expect([icons.ERASE_ICON, icons.CLEAR_ALL_ICON, icons.DELETE_ICON]).toEqual(['fa-solid fa-eraser', 'fa-solid fa-broom', 'fa-solid fa-trash']);
    });

    it('open the measure tools with a glyph that is none of the tools', () => {
        expect(icons.MEASURE_ICON).toBe('fa-solid fa-compass-drafting');
        expect([icons.POINT_ICON, icons.LENGTH_ICON]).toEqual(['fa-solid fa-location-dot', 'fa-solid fa-ruler']);
    });

    it('are a bookmark for the saved views, not the icon of another meaning: layers, the split compare', () => {
        expect(icons.VIEWS_ICON).toBe('fa-solid fa-bookmark');
        for (const icon of [icons.STOCKPILE_ICON, icons.VIEWS_ICON]) {
            expect(icon).not.toMatch(/layer-group|table-columns|mountain/);
        }
    });
});

describe('the glyphs of the annotation reports', () => {
    it('are a page of lines for a report and a hash for the references of the annotations', () => {
        expect(icons.REPORT_ICON).toBe('fa-solid fa-file-lines');
        expect(icons.REFERENCES_ICON).toBe('fa-solid fa-hashtag');
    });
});

describe('the glyphs drawn for the Hub', () => {
    it('have one drawing each, and no drawing is left without a meaning', () => {
        const files = readdirSync(path.resolve(WEBAPP, 'icons')).map(file => file.replace(/\.svg$/, '')).sort();
        expect(files).toEqual(drawnNames);
    });

    it('have one class each in the stylesheet, which takes the drawing of the same name', () => {
        const list = /\$glyphs:([^;]+);/.exec(stylesheet)[1].split(',').map(name => name.trim()).sort();
        expect(list).toEqual(drawnNames);
        expect(stylesheet).toContain(".ddb-icon-#{$glyph}");
        expect(stylesheet).toContain("url('../icons/#{$glyph}.svg')");
    });

    it('take the colour of the text around them and the size of its font', () => {
        const rule = /\.ddb-icon \{([^}]+)\}/.exec(stylesheet)[1];
        expect(rule).toMatch(/background-color: currentColor;/);
        expect(rule).toMatch(/[^-]mask: var\(--ddb-icon-glyph\) center \/ contain no-repeat;/);
        expect(rule).toMatch(/width: 1\.125em;/);
        expect(rule).toMatch(/height: 1\.125em;/);
    });

    it.each(drawnNames)('%s is drawn on the 24 x 24 grid, as a mask: black shapes, white only inside a cut-out', name => {
        const svg = drawing(name);
        expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 24 24">/);
        const outside = svg.replace(/<mask[\s\S]*?<\/mask>/g, '');
        const colours = [...outside.matchAll(/(?:fill|stroke)="([^"]+)"/g)].map(match => match[1]);
        expect(colours.filter(colour => colour !== '#000' && colour !== 'none')).toEqual([]);
    });
});

describe('the files that show a meaning', () => {
    it.each([
        ['the map toolbar', '../features/viewers/map/MapToolbar.vue',
            ['BACK_ICON', 'RESET_VIEW_ICON', 'useFullscreen', 'COPY_LINK_ICON', 'RASTER_ANALYSIS_ICON', 'STOCKPILE_ICON', 'DIRECTION_ICON',
                'FLIGHT_PATH_ICON', 'COMPARE_ICON', 'REPORT_ICON']],
        ['the measure tools of the map', './map/controls/measureControl.js',
            ['POINT_ICON', 'LENGTH_ICON', 'AREA_ICON', 'ERASE_ICON', 'EDIT_VERTICES_ICON', 'STOP_ICON', 'MEASUREMENT_LIST_ICON', 'CALLOUTS_ICON',
                'SAVE_ICON', 'CLEAR_ALL_ICON', 'EXPORT_GEOJSON_ICON', 'EXPORT_CSV_ICON', 'DELETE_ICON', 'MEASURE_ICON', 'REFERENCES_ICON']],
        ['the selection tools of the map', './map/controls/selectionControl.js', ['SELECT_RECTANGLE_ICON', 'SELECT_POLYGON_ICON', 'CLEAR_SELECTION_ICON']],
        ['the settings button of the map', './map/controls/settingsControl.js', ['SETTINGS_ICON']],
        ['the fullscreen buttons of the map and the viewers', '../composables/useFullscreen.js', ['FULLSCREEN_ICON', 'EXIT_FULLSCREEN_ICON']],
        ['the bar and the toolbar of the viewers', '../components/ViewerShell.vue', ['useFullscreen']],
        ['the zoom, north and attribution buttons', './map/controls/defaultControls.js',
            ['ZOOM_IN_ICON', 'ZOOM_OUT_ICON', 'NORTH_ICON', 'ATTRIBUTION_ICON', 'COLLAPSE_ICON']],
        ['the measure toolbar of the 3D viewers', '../components/MeasureToolbar.vue', ['POINT_ICON', 'LENGTH_ICON', 'HEIGHT_ICON', 'AREA_ICON', 'CLEAR_ALL_ICON']],
        ['the Measurement List', './map/measurementTypes.js', ['POINT_ICON', 'LENGTH_ICON', 'AREA_ICON', 'STOCKPILE_ICON']],
        ['the Stockpile panel', '../features/viewers/map/StockpileVolumePanel.vue', ['STOCKPILE_ICON', 'AREA_ICON']],
        ['the Raster Analysis panel', '../features/viewers/map/RasterAnalysisControls.vue', ['RASTER_ANALYSIS_ICON']],
        ['the profile chart', '../features/viewers/map/RasterProfileChart.vue', ['EXPORT_CSV_ICON']],
        ['the menu of a file', './contextMenuItems.js', ['COMPARE_ICON']],
        ['the detail panel of a file', '../features/dataset/explorer/DetailPanel.vue', ['COMPARE_ICON']],
        ['the map of the datasets', '../features/datasets/DatasetLocationsMap.vue', ['RESET_VIEW_ICON']],
        ['the Preferences tab', '../features/account/PreferencesDialog.vue', ['STOCKPILE_ICON']],
        ['the saved views of the explorer', '../features/dataset/explorer/SavedViews.vue', ['VIEWS_ICON']],
        ['the reports of the explorer', '../features/dataset/explorer/ReportsList.vue', ['REPORT_ICON']],
        ['the bar of the report page', '../features/reports/ReportBar.vue', ['REPORT_ICON']]
    ])('%s takes its glyphs from the registry', (name, file, constants) => {
        const text = source(file);
        for (const constant of constants) expect(text).toContain(constant);
    });

    // The glyphs these meanings had: another meaning's (the split of a page), a look-alike (the hills of the area
    // chart and of the mountain, the set square beside the ruler) or one that names something else (the "my location"
    // arrow, the signpost, the chat bubble, the three letters of file-csv)
    it.each([
        '../features/viewers/map/MapToolbar.vue',
        './map/controls/measureControl.js',
        '../components/MeasureToolbar.vue',
        '../features/viewers/map/StockpileVolumePanel.vue',
        '../features/viewers/map/MeasurementListDialog.vue',
        '../features/viewers/map/RasterAnalysisControls.vue',
        '../features/viewers/map/RasterProfileChart.vue',
        './contextMenuItems.js',
        '../features/dataset/explorer/DetailPanel.vue',
        '../features/account/PreferencesDialog.vue',
        '../features/dataset/explorer/SavedViews.vue'
    ])('%s does not write the glyph of another meaning', file => {
        expect(source(file)).not.toMatch(/fa-(table-columns|mountain|chart-area|draw-polygon|location-arrow|signs-post|message|file-csv|ruler-combined)\b/);
    });

    it.each([
        '../features/viewers/map/StockpileVolumePanel.vue',
        '../features/viewers/map/MeasurementListDialog.vue',
        '../features/account/PreferencesDialog.vue',
        '../features/dataset/explorer/SavedViews.vue'
    ])('%s does not show a pile or the saved views as stacked layers', file => {
        expect(source(file)).not.toMatch(/fa-layer-group/);
    });

    it.each([
        '../features/viewers/map/MapToolbar.vue',
        '../components/ViewerShell.vue'
    ])('%s takes the glyph of its fullscreen button from the state of the page, not a glyph of its own', file => {
        expect(source(file)).not.toMatch(/fa-(compress|expand)\b/);
    });

    it.each([
        './map/controls/measureControl.js', './map/controls/selectionControl.js', './map/controls/settingsControl.js'
    ])('%s has no image file for a button: a glyph follows the size and the colour of the others', file => {
        expect(source(file).replace(/ERASE_HOVER_CURSOR = .*/, '')).not.toMatch(/\/images\/[\w-]+\.svg/);
        expect(source(file)).not.toMatch(/innerHTML = '<i/);
    });
});
