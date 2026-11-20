// @ts-check
/**
 * The built files a user can download from the file browser's context menu: one row per artifact
 * role that a build offers as a download, outside the downloads of a splat (splatDownloads.js, which
 * also has the original and the .spz made for other tools).
 *
 * Whether an entry offers a row comes from its artifacts, never from its type: Registry lists the
 * `downloadName` of each artifact libddb offers as a download, and the build-artifact endpoint
 * names the file after the entry. A directory (3D Tiles) comes as a ZIP archive. Adding a download
 * is adding a row.
 */
import { ArtifactRole, findArtifactIn } from '@/libs/ddb/buildArtifacts';
import { copcDownloadNote } from '@/libs/build/pointCloudCrs';

/**
 * @typedef {object} BuildDownload
 * @property {string} role   the artifact the download is
 * @property {string} label
 * @property {string} icon
 * @property {(entry: any) => string | null} [note]  what the user is told when the download starts, if anything
 *   (a COPC built in another coordinate system than its file says which)
 */

/** @type {readonly Readonly<BuildDownload>[]} */
export const BUILD_DOWNLOADS = Object.freeze([
    { role: ArtifactRole.RASTER_COG, label: 'Download COG', icon: 'fa-solid fa-file-image' },
    { role: ArtifactRole.POINTCLOUD_COPC, label: 'Download COPC', icon: 'fa-solid fa-cube', note: copcDownloadNote },
    { role: ArtifactRole.VECTOR_GPKG, label: 'Download GPKG', icon: 'fa-solid fa-map' },
    { role: ArtifactRole.MODEL_3DTILES, label: 'Download 3D Tiles (.zip)', icon: 'fa-solid fa-cubes' }
]);

/**
 * Whether the entry has the artifact of the row and the server offers it as a download.
 * @param {{ artifacts?: any[] } | null | undefined} entry
 * @param {Readonly<BuildDownload>} download
 * @returns {boolean}
 */
export function offersBuildDownload(entry, download) {
    return !!findArtifactIn(entry, download.role)?.downloadName;
}

/**
 * What the user is told when the download of an artifact of the entry starts, or null.
 * @param {any} entry
 * @param {string} role
 * @returns {string | null}
 */
export function buildDownloadNote(entry, role) {
    return BUILD_DOWNLOADS.find(d => d.role === role)?.note?.(entry) ?? null;
}
