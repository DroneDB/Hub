// @ts-check
/**
 * Optional files of a dataset (a viewer's `<name>_measurements.geojson` and `<name>_cameras.json` sidecars): most
 * datasets have none, and a request for a file that is not there is a 404 that the browser logs as an error. The Hub
 * asks for such a file only when the listing of its folder holds it (FR-XC-10, OBS-002).
 */
import { pathutils } from 'ddb';

/**
 * Whether the folder of `path` lists a file of that name. `true` when the listing cannot say (a failed listing, a dataset
 * object without `list`): the caller then reads the file and its own error handling decides, so a listing that fails never
 * hides a file that exists.
 * @param {{ list?: (folder: string | null) => Promise<Array<{ path: string }>> }} dataset
 * @param {string} path  dataset-relative
 * @returns {Promise<boolean>}
 */
export async function isListed(dataset, path) {
    if (typeof dataset?.list !== 'function') return true;
    try {
        const folder = pathutils.getParentFolder(path) || null;
        const entries = await dataset.list(folder);
        if (!Array.isArray(entries)) return true;
        return entries.some(e => e && e.path === path);
    } catch {
        return true;
    }
}

/**
 * The address of the dataset thumbnail to show, or null when the dataset has none: the root entry of the dataset says it
 * (`hasThumbnail`), so no request goes out for a cover that is not there. A Registry that does not say (an older one) is asked.
 * @param {{ datasetThumbUrl: (size: number) => string }} dataset
 * @param {{ hasThumbnail?: boolean } | null | undefined} properties  the properties of the root entry
 * @param {number} size
 * @returns {string | null}
 */
export function datasetThumbnailUrl(dataset, properties, size) {
    return properties?.hasThumbnail === false ? null : dataset.datasetThumbUrl(size);
}
