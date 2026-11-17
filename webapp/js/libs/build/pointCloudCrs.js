// @ts-check
/**
 * The coordinate system of a point cloud's COPC, from what the build says of it. A cloud in longitude and
 * latitude (or in geocentric coordinates) gets its COPC built in the UTM zone of its centre, which is
 * metric, so that it streams and measures right; the uploaded file keeps its own coordinate system. The
 * artifact of the COPC says so (`crs: { name, epsg, transformed }`); a build or a server that predates
 * that field says nothing, and the Hub then says nothing either.
 *
 * The viewers read the CRS of the COPC from its header; this is for the words around it and for the
 * measurements that were saved before the COPC was built again.
 */
import { ArtifactRole, findArtifactIn } from '@/libs/ddb/buildArtifacts';

/** @typedef {{ name: string, epsg: number | null, transformed: boolean }} CopcCrs */

/** The CRS statuses of an entry whose COPC is built in another CRS than the file's (libddb's `crsStatus`). */
const REPROJECTED_STATUSES = new Set(['geographic', 'geocentric']);

/**
 * The CRS of the entry's COPC as its artifact states it, or null when the artifact states none (or
 * states it in a shape this does not know).
 * @param {any} entry
 * @returns {CopcCrs | null}
 */
export function copcCrsOf(entry) {
    const crs = /** @type {any} */ (findArtifactIn(entry, ArtifactRole.POINTCLOUD_COPC))?.crs;
    if (!crs || typeof crs !== 'object' || typeof crs.name !== 'string' || !crs.name.trim()) return null;
    const epsg = Number.isInteger(crs.epsg) && crs.epsg > 0 ? crs.epsg : null;
    return { name: crs.name.trim(), epsg, transformed: crs.transformed === true };
}

/**
 * The CRS a COPC that was built in another CRS than its file is in, as people read it ("WGS 84 / UTM
 * zone 33N (EPSG:32633)"), or null when the COPC is in the CRS of the file or the build does not say.
 * @param {any} entry
 * @returns {string | null}
 */
function reprojectedLabel(entry) {
    const crs = copcCrsOf(entry);
    if (!crs || !crs.transformed) return null;
    return crs.epsg && !crs.name.includes(`EPSG:${crs.epsg}`) ? `${crs.name} (EPSG:${crs.epsg})` : crs.name;
}

/**
 * The value of the "Streamed in" row of the properties of a point cloud whose COPC was built in another
 * CRS, or null.
 * @param {any} entry
 * @returns {string | null}
 */
export function streamedInText(entry) {
    const label = reprojectedLabel(entry);
    return label ? `${label} (the uploaded file is unchanged)` : null;
}

/**
 * What the download of such a COPC tells the user, or null.
 * @param {any} entry
 * @returns {string | null}
 */
export function copcDownloadNote(entry) {
    const label = reprojectedLabel(entry);
    return label ? `The COPC is in ${label}, the coordinate system it is streamed in. The uploaded file is unchanged.` : null;
}

/**
 * The CRS the coordinates of a measurements file were in when the file states none: the CRS of the COPC
 * when it was written. A COPC was always built in the CRS of its file before COPCs were built in UTM, so
 * for a COPC that is (or is about to be) built in another CRS it is the file's CRS (`properties.projection`),
 * and else the CRS of the COPC the viewer has now.
 * @param {any} entry
 * @param {any} copcCoordinateSystem  the coordinate system of the COPC the viewer has now ({ srs, ... })
 * @returns {any}
 */
export function unstatedMeasurementCrs(entry, copcCoordinateSystem) {
    const projection = entry?.properties?.projection;
    const reprojected = copcCrsOf(entry)?.transformed === true || REPROJECTED_STATUSES.has(entry?.properties?.crsStatus);
    return reprojected && typeof projection === 'string' && projection.trim() ? projection : copcCoordinateSystem;
}
