// @ts-check
/**
 * The glyph of each meaning on the map, in the viewers and in the explorer: what a button, a menu item or the title
 * of a panel shows for it. A glyph is a class, used as the class of an <i>, the `icon` of a PrimeVue button or of a
 * menu item, and the button of a map control (the icon of an entry type is in libs/icons.js).
 */

/**
 * A glyph drawn for the Hub, where Font Awesome has none that says what the button does (css/_icons.scss draws
 * webapp/icons/<name>.svg in the colour of the text). It is a class, used wherever a Font Awesome class is:
 * <i :class="AREA_ICON" />, the `icon` of a PrimeVue button, a menu item, the button of a map control.
 * @param {string} name
 */
const drawn = name => `ddb-icon ddb-icon-${name}`;

/**
 * One icon per meaning on the map, in the viewers and in the explorer, and one meaning per icon: no two
 * of these are the same glyph. Where the tool makes something on the map, the glyph is what it makes: a polygon with
 * its vertices for an area, the back-and-forth track of a survey for the flight path, a frame cut by the slider for
 * the split compare, a heap on its base plane for a pile (not a mountain range, the outline the area chart of Raster
 * Analysis had too, and not the stacked layers of a raster layer or a merge).
 */
// The view
export const BACK_ICON = 'fa-solid fa-arrow-left';
export const RESET_VIEW_ICON = 'fa-solid fa-house';
export const FULLSCREEN_ICON = 'fa-solid fa-expand';
export const EXIT_FULLSCREEN_ICON = 'fa-solid fa-compress';
export const COPY_LINK_ICON = 'fa-solid fa-link';
export const ZOOM_IN_ICON = 'fa-solid fa-plus';
export const ZOOM_OUT_ICON = 'fa-solid fa-minus';
export const NORTH_ICON = 'fa-solid fa-arrow-up';
export const SETTINGS_ICON = 'fa-solid fa-gear';
export const ATTRIBUTION_ICON = 'fa-solid fa-info';
export const COLLAPSE_ICON = 'fa-solid fa-chevron-right';
// What the map shows
export const DIRECTION_ICON = drawn('direction');
export const FLIGHT_PATH_ICON = drawn('flight-path');
export const COMPARE_ICON = drawn('compare');
export const CALLOUTS_ICON = drawn('callouts');
// The reference (`ref`) each annotation shows on the map, and the report made from the annotations of a map
export const REFERENCES_ICON = 'fa-solid fa-hashtag';
export const REPORT_ICON = 'fa-solid fa-file-lines';
// The saved views of a dataset: a bookmark (not the split of "Compare")
export const VIEWS_ICON = 'fa-solid fa-bookmark';
// The analysis tools
export const RASTER_ANALYSIS_ICON = drawn('raster-analysis');
export const STOCKPILE_ICON = drawn('stockpile');
// The measure tools: 'Measure' opens them on a compact map, so it is none of them
export const MEASURE_ICON = 'fa-solid fa-compass-drafting';
export const POINT_ICON = 'fa-solid fa-location-dot';
export const LENGTH_ICON = 'fa-solid fa-ruler';
export const HEIGHT_ICON = 'fa-solid fa-ruler-vertical';
export const AREA_ICON = drawn('area');
export const EDIT_VERTICES_ICON = drawn('edit-vertices');
export const STOP_ICON = 'fa-solid fa-circle-xmark';
// The measurements of a map. Three ways to remove, three glyphs: the eraser takes one, the broom clears the map,
// the bin deletes the saved file
export const MEASUREMENT_LIST_ICON = 'fa-solid fa-list';
export const SAVE_ICON = 'fa-solid fa-floppy-disk';
export const ERASE_ICON = 'fa-solid fa-eraser';
export const CLEAR_ALL_ICON = 'fa-solid fa-broom';
export const DELETE_ICON = 'fa-solid fa-trash';
// Rescan: read the metadata again, of the whole dataset (its Settings) and of the entries selected in the explorer
export const RESCAN_ICON = 'fa-solid fa-rotate';
// The two exports are a pair: a file marked with its format (braces, a table)
export const EXPORT_GEOJSON_ICON = drawn('file-geojson');
export const EXPORT_CSV_ICON = drawn('file-table');
// Selecting the files of the dataset map: dashed, as a selection is drawn, so the polygon is not the one of an area
export const SELECT_RECTANGLE_ICON = drawn('select-rectangle');
export const SELECT_POLYGON_ICON = drawn('select-polygon');
export const CLEAR_SELECTION_ICON = drawn('select-clear');
