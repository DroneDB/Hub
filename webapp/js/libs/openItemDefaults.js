// @ts-check
/**
 * The viewer table: the one list of the viewers a dataset file opens in. The explorer's toolbar
 * (its Open slot), its context menus (one "Open ..." item per row that accepts the file), the detail
 * panel and a double click (the default view) all read it. Adding a viewer is adding a row here.
 */
import ddb from 'ddb';
import { canOpenInMap, isLocalVector } from '@/libs/entryTypes';
import { isPdfFile } from '@/libs/textFileUtils';

const T = ddb.entry.type;

/** .3tz archives indexed as generic files by older ddb are 3D Tiles too. */
const is3tz = entry => /\.3tz$/i.test(entry?.path || '');

/** An entry of one of `types`. */
const ofTypes = (...types) => (/** @type {any} */ entry) => !!entry && types.includes(entry.type);

/**
 * @typedef {object} ViewerRow
 * @property {string} id                       the action id ('open-map')
 * @property {string|null} view               the viewer route ('map'); null: the file opens its own way (PDF)
 * @property {string} label
 * @property {string} icon
 * @property {(entry: any) => boolean} accepts   the file opens in this viewer
 * @property {(entry: any) => boolean} isDefault the file opens here by default (double click, Open)
 */

/** @type {ReadonlyArray<ViewerRow>} */
const VIEWERS = Object.freeze([
    { id: 'open-map', view: 'map', label: 'Open Map', icon: 'fa-solid fa-map', accepts: canOpenInMap, isDefault: e => canOpenInMap(e) && ofTypes(T.GEORASTER, T.VECTOR)(e) },
    { id: 'open-pointcloud', view: 'pointcloud', label: 'Open Point Cloud', icon: 'fa-solid fa-cube', accepts: ofTypes(T.POINTCLOUD), isDefault: ofTypes(T.POINTCLOUD) },
    { id: 'open-3dmodel', view: 'model', label: 'Open 3D Model', icon: 'fa-solid fa-cube', accepts: ofTypes(T.MODEL), isDefault: ofTypes(T.MODEL) },
    { id: 'open-3dtiles', view: 'unified', label: 'Open 3D Tiles', icon: 'fa-solid fa-cubes', accepts: e => ofTypes(T.TILES3D)(e) || (ofTypes(T.GENERIC)(e) && is3tz(e)), isDefault: e => ofTypes(T.TILES3D)(e) || (ofTypes(T.GENERIC)(e) && is3tz(e)) },
    { id: 'open-panorama', view: 'panorama', label: 'Open Panorama', icon: 'fa-solid fa-globe', accepts: ofTypes(T.PANORAMA, T.GEOPANORAMA), isDefault: ofTypes(T.PANORAMA, T.GEOPANORAMA) },
    { id: 'open-splat', view: 'splat', label: 'Open Gaussian Splat', icon: 'fa-solid fa-spray-can-sparkles', accepts: ofTypes(T.GAUSSIAN_SPLAT), isDefault: ofTypes(T.GAUSSIAN_SPLAT) },
    { id: 'open-markdown', view: 'markdown', label: 'Open Markdown', icon: 'fa-solid fa-book', accepts: ofTypes(T.MARKDOWN), isDefault: ofTypes(T.MARKDOWN) },
    // One Open item for a PDF (it opens in the browser's PDF viewer), told apart by its icon
    { id: 'open-pdf', view: null, label: 'Open', icon: 'fa-regular fa-file-pdf', accepts: e => !!e && isPdfFile(e), isDefault: e => !!e && isPdfFile(e) }
]);

/** The row of the viewer `entry` opens in by default, or null (the lightbox, the browser, a folder). */
function defaultViewerFor(entry) {
    return (entry && VIEWERS.find(row => row.isDefault(entry))) || null;
}

/** The view an entry opens with by default (double-click, share links, after a build). */
function defaultViewFor(entry) {
    if (!entry) return undefined;
    if (isLocalVector(entry)) return 'unified';
    return defaultViewerFor(entry)?.view || undefined;
}

export { VIEWERS, defaultViewerFor, isLocalVector, defaultViewFor };
