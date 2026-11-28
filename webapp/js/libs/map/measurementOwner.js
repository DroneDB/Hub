// @ts-check
/**
 * Which file the measurements of a set of layers are saved in. The map (its measurements) and a report (the link
 * from an item to the viewer that shows it) both ask here, so that a link opens the map on the file the item is in.
 *
 * - One file on show: the measurements are in its sidecar, `<name>_measurements.geojson` (the owner is that file).
 * - Anything else (a folder's children, several files, a view with layers): `measurements.geojson` in the folder of
 *   the first file on show (the dataset root for a file at the root). Where the listing shows no such file and shows
 *   the sidecar of a raster on show (measurements an earlier map saved there), that sidecar is the owner: it is read
 *   and saved as it was, and the folder file is made only when no raster has one.
 *
 * Only the files the map draws count (drawnByMap): a notes file or a PDF in the folder does not make a raster one of
 * several, so that an upload of one cannot move the measurements to another file.
 *
 * A file on show is `{ entry }` (a listed file) or `{ placeholder: { path } }` (a layer that cannot be drawn yet, or
 * a path only known by name). The folders of a listing and the measurement files themselves are not "on show": a Save
 * adds a measurements file to the listing, which must not make the folder look like a different set of files.
 */
import ddb from 'ddb';
import { isMeasurementFile, MeasurementStorage } from '@/libs/map/measurementStorage';

/** @typedef {{ entry?: { path: string, type?: number } | null, placeholder?: { path: string } | null }} ShownFile */

/** The path of a file on show, or null. @param {ShownFile} file */
export function shownPath(file) {
    return (file.entry && file.entry.path) || (file.placeholder && file.placeholder.path) || null;
}

/** The types of file the map draws (a layer, a camera marker, a footprint or a vector layer) @returns {number[]} */
const drawnTypes = () => {
    const T = ddb.entry.type;
    return [T.GEORASTER, T.GEOIMAGE, T.GEOVIDEO, T.GEOPANORAMA, T.POINTCLOUD, T.VECTOR, T.GAUSSIAN_SPLAT];
};

/**
 * Whether the map draws a file on show: a layer that cannot be drawn yet (a placeholder) counts, a listed file does
 * when it is of a type the map draws and is not a measurements file. The folders of a listing, a notes file, a PDF
 * and the like are not drawn.
 * @param {ShownFile} file
 */
export function drawnByMap(file) {
    if (!file.entry) return !!file.placeholder;
    return drawnTypes().includes(/** @type {number} */ (file.entry.type)) && !isMeasurementFile(file.entry.path);
}

/**
 * The files the measurements are about: the ones the map draws.
 * @param {ShownFile[]} files
 */
export function measuredFiles(files) {
    return files.filter(drawnByMap);
}

/** The path of the sidecar of a file: where the measurements of that file alone are saved. @param {string} path */
const sidecarPath = path => new MeasurementStorage(null, { path }).measurementPath;

/**
 * `measurements.geojson` in the folder of the first file on show.
 * @param {ShownFile[]} files
 */
export function standaloneMeasurementEntry(files) {
    const first = files.find(f => shownPath(f));
    const folder = first ? ddb.pathutils.getParentFolder(/** @type {string} */ (shownPath(first))) || '' : '';
    return { path: folder ? `${folder}/measurements.geojson` : 'measurements.geojson' };
}

/**
 * The raster on show, the first, whose sidecar is in the listing: measurements that were saved for it alone, which no
 * file of the folder replaces, when the folder has no measurements file of its own.
 * @param {ShownFile[]} files
 * @param {ShownFile[]} shown  the files the map draws
 * @returns {ShownFile | null}
 */
function rasterWithListedSidecar(files, shown) {
    const listed = new Set(files.map(shownPath));
    const folderFile = standaloneMeasurementEntry(files).path;
    if (listed.has(folderFile)) return null;
    return shown.find(f => f.entry && f.entry.type === ddb.entry.type.GEORASTER && listed.has(sidecarPath(f.entry.path))) || null;
}

/**
 * The entry the measurements belong to: the one file on show (its sidecar holds them), else the folder (the file of
 * the folder of the first file), else, when the folder has none and a raster has a sidecar, that raster.
 * @param {ShownFile[]} files
 * @returns {{ path: string, type?: number }}
 */
export function measurementOwnerEntry(files) {
    const shown = measuredFiles(files);
    if (shown.length === 1) return shown[0].entry || { path: /** @type {string} */ (shownPath(shown[0])) };
    const raster = rasterWithListedSidecar(files, shown);
    return raster ? /** @type {{ path: string, type?: number }} */ (raster.entry) : standaloneMeasurementEntry(files);
}

/**
 * The measurement file of a set of files on show: where the map saves, and reads, its measurements.
 * @param {ShownFile[]} files
 */
export function measurementFileOf(files) {
    return new MeasurementStorage(null, measurementOwnerEntry(files)).measurementPath;
}

/**
 * The entry whose file holds the measurements a saved view shows: the files the map viewer shows for it (a base that
 * is not one of its layers, then the layers, the bottom one first) under the rule of measurementOwnerEntry.
 * @param {{ base: { path: string }, layers: { path: string }[] }} state  a view state
 * @returns {{ path: string, type?: number }}
 */
export function viewMeasurementOwner(state) {
    const layers = state.layers.map(l => l.path);
    const paths = [...(layers.includes(state.base.path) ? [] : [state.base.path]), ...[...layers].reverse()];
    return measurementOwnerEntry(paths.map(path => ({ placeholder: { path } })));
}
