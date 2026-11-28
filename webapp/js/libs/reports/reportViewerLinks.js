// @ts-check
/**
 * Where "Open in viewer" of a report item goes (the live page and the PDF share these rules).
 *
 * - A 2D item whose measurement file is the one the cover view saves its measurements in: the cover view itself
 *   (a saved view, or the view state it holds, as a file route with the other layers added), framed on the item.
 * - Any other 2D item: the map on the owner of its file. That is the one file whose sidecar the measurement file is
 *   (`<name>_measurements.geojson`) or, for a `measurements.geojson` of a folder, two files of that folder (a map of
 *   several files keeps its measurements there). Which map file an owner is, is found by listing the folder, and
 *   checked with the rule the map itself saves by (libs/map/measurementOwner), so the two cannot drift apart.
 * - A 3D item: the point cloud viewer on the cloud its file names.
 *
 * The functions here are pure; `findOwnerRoute` reads one folder listing.
 */
import { pathutils } from 'ddb';
import { canOpenInMap, isGeoraster } from '@/libs/entryTypes';
import { isMeasurementFile } from '@/libs/map/measurementStorage';
import { measurementFileOf } from '@/libs/map/measurementOwner';
import { fileViewUrl, savedViewUrl, viewerUrl } from '@/libs/views/viewLinks';

const SIDECAR_SUFFIX = '_measurements.geojson';
const FOLDER_FILE = 'measurements.geojson';

/**
 * The files a view shows, as the map gets them: a base file that is not a georaster first, then the layers from the
 * bottom up (the first layer of a state is the top one).
 * @param {import('@/libs/views/viewState').ViewState} state
 * @returns {{ placeholder: { path: string } }[]}
 */
export function viewFiles(state) {
    const layers = state.layers.map(l => l.path);
    const paths = [...(layers.includes(state.base.path) ? [] : [state.base.path]), ...[...layers].reverse()];
    return paths.map(path => ({ placeholder: { path } }));
}

/**
 * The measurement file of a view: where its map saves and reads its measurements.
 * @param {import('@/libs/views/viewState').ViewState | null | undefined} state
 * @returns {string | null}
 */
export function viewMeasurementFile(state) {
    return state ? measurementFileOf(viewFiles(state)) : null;
}

/**
 * The file route that opens the same files as a view state: its first layer, the others added in order; a base file
 * that is not a georaster is the route's file and the layers are all added (the order the map draws them in is then
 * the same as the view's).
 * @param {import('@/libs/views/viewState').ViewState} state
 * @returns {{ path: string, add: string[] }}
 */
export function viewRoute(state) {
    const layers = state.layers.map(l => l.path);
    return layers.includes(state.base.path)
        ? { path: layers[0], add: layers.slice(1) }
        : { path: state.base.path, add: layers };
}

/**
 * The map route that shows a measurement file, given the entries of its folder, or null when no map of them keeps its
 * measurements in it.
 * @param {string} file  a measurement file
 * @param {{ path: string, type?: number }[]} entries  the entries of the folder of the file
 * @returns {{ path: string, add: string[] } | null}
 */
export function ownerRouteOf(file, entries) {
    const shown = entries.filter(e => canOpenInMap(e) && !isMeasurementFile(e.path));
    /** @type {{ path: string, add: string[] } | null} */
    let route = null;
    if (pathutils.basename(file) === FOLDER_FILE) {
        // Several files make the folder the owner: the georasters first, they are what a map is made of
        const ordered = [...shown.filter(e => isGeoraster(e)), ...shown.filter(e => !isGeoraster(e))];
        if (ordered.length >= 2) route = { path: ordered[0].path, add: [ordered[1].path] };
    } else if (file.endsWith(SIDECAR_SUFFIX)) {
        const stem = file.slice(0, -SIDECAR_SUFFIX.length);
        const owner = shown.find(e => pathutils.dropExtension(e.path) === stem);
        if (owner) route = { path: owner.path, add: [] };
    }
    if (!route) return null;
    // The route's files as the map draws them: the same rule as the map's gives the same file, or the route is not it
    const files = [route.path, ...route.add].map(path => ({ placeholder: { path } }));
    return measurementFileOf(route.add.length ? [...files].reverse() : files) === file ? route : null;
}

/**
 * Finds the map route of a measurement file by listing its folder; null when none shows it (or the listing failed).
 * @param {{ list: (path: string) => Promise<any[]> }} dataset
 * @param {string} file
 */
export async function findOwnerRoute(dataset, file) {
    try {
        return ownerRouteOf(file, await dataset.list(pathutils.getParentFolder(file) ?? ''));
    } catch (e) {
        console.warn(`The map of ${file} could not be looked for:`, e);
        return null;
    }
}

/**
 * The function that gives the viewer address of an item of the report model (null where there is none).
 * @param {object} context
 * @param {{ org: string, ds: string }} context.dataset
 * @param {import('./reportDefinition').ReportCover | null} context.cover  the cover of the definition
 * @param {import('@/libs/views/viewState').ViewState | null} context.coverState  the cover view as it is now (null when it was deleted)
 * @param {ReadonlyMap<string, { path: string, add: string[] } | null>} context.ownerRoutes  the map route of each source file other than the cover's
 * @returns {(item: { id: string, owner: string, file: string, pointCloudFile?: string | null }) => string | null}
 */
export function itemViewerUrls({ dataset, cover, coverState, ownerRoutes }) {
    const coverFile = viewMeasurementFile(coverState);
    return item => {
        if (item.owner === 'pointCloud') {
            return item.pointCloudFile ? viewerUrl({ baseUrl: '', org: dataset.org, ds: dataset.ds, path: item.pointCloudFile, view: 'pointcloud', item: item.id }) : null;
        }
        if (coverState && cover && item.file === coverFile) {
            if ('viewId' in cover) return savedViewUrl(dataset, cover.viewId, { item: item.id });
            const { path, add } = viewRoute(coverState);
            return fileViewUrl(dataset, path, { add, item: item.id });
        }
        const route = ownerRoutes.get(item.file);
        return route ? fileViewUrl(dataset, route.path, { add: route.add, item: item.id }) : null;
    };
}
