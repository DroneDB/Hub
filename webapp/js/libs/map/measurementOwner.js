// @ts-check
/**
 * Which file the measurements of a set of layers are saved in. The map (its measurements) and a report (the link
 * from an item to the viewer that shows it) both ask here, so that a link opens the map on the file the item is in.
 *
 * - One file on show: the measurements are in its sidecar, `<name>_measurements.geojson` (the owner is that file).
 * - Anything else (a folder's children, several files, a view with layers): `measurements.geojson` in the folder of
 *   the first file on show (the dataset root for a file at the root).
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

/**
 * The files the measurements are about.
 * @param {ShownFile[]} files
 */
export function measuredFiles(files) {
    return files.filter(f => {
        if (!f.entry) return !!f.placeholder;
        return !ddb.entry.isDirectory(f.entry) && !isMeasurementFile(f.entry.path);
    });
}

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
 * The entry the measurements belong to: the one file on show (its sidecar holds them), else the folder (the file of
 * the folder of the first file).
 * @param {ShownFile[]} files
 * @returns {{ path: string, type?: number }}
 */
export function measurementOwnerEntry(files) {
    const shown = measuredFiles(files);
    if (shown.length !== 1) return standaloneMeasurementEntry(files);
    return shown[0].entry || { path: /** @type {string} */ (shownPath(shown[0])) };
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
