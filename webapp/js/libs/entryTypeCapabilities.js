// @ts-check
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What libddb does with each entry type, as the server says it:
 * `GET /sys/features` carries `entryTypes` (libddb's DDBGetEntryTypes: id, buildable, thumbnail
 * none|file|build, ...) and `archiveExtensions` (what the archive extractor accepts). The Hub
 * is loaded after the features are (see main.js), so every question here is answered from
 * that data and the Hub keeps no type rule of its own.
 *
 * FALLBACK_* is not a second source of truth: it is what the Hub did before the server told it,
 * used only when the features did not load (the request failed) so the file list still works.
 * It is never read once the server's data is present.
 */

import reg from '@/libs/api/sharedRegistry';
import { Features } from '@/libs/features';

/**
 * @typedef {{ id: number, buildable: boolean, thumbnail: 'none' | 'file' | 'build' }} EntryTypeCapability
 */

/** Entry type ids (libddb's, the values of ddb.entry.type) the fallback knows. */
const FALLBACK_TYPE_ROWS = /** @type {EntryTypeCapability[]} */ ([
    { id: 3, buildable: false, thumbnail: 'file' },   // GeoImage
    { id: 4, buildable: true, thumbnail: 'file' },    // GeoRaster
    { id: 5, buildable: true, thumbnail: 'build' },   // PointCloud
    { id: 6, buildable: false, thumbnail: 'file' },   // Image
    { id: 11, buildable: true, thumbnail: 'none' },   // Model
    { id: 12, buildable: false, thumbnail: 'file' },  // Panorama
    { id: 13, buildable: false, thumbnail: 'file' },  // GeoPanorama
    { id: 14, buildable: true, thumbnail: 'none' },   // Vector
    { id: 15, buildable: true, thumbnail: 'build' },  // GaussianSplat
    { id: 16, buildable: true, thumbnail: 'none' }    // Tiles3D
]);

/** Lowercase, no dot, compound suffixes first (as the server lists them). */
const FALLBACK_ARCHIVE_EXTENSIONS = Object.freeze([
    'tar.gz', 'tar.bz2', 'tar.xz', 'tgz', 'tbz2', 'txz', 'zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'
]);

/** @type {Map<number, EntryTypeCapability>} */
let capabilities = new Map();
/** @type {unknown} */
let capabilitiesOf = null;

/** Capability of each type id: the server's rows, else the fallback; rebuilt when the features reload. */
function typeCapabilities() {
    const served = reg.features.value(Features.ENTRY_TYPES);
    const rows = Array.isArray(served) && served.length ? served : FALLBACK_TYPE_ROWS;
    if (rows !== capabilitiesOf) {
        capabilities = new Map(rows.map(row => [row.id, row]));
        capabilitiesOf = rows;
    }
    return capabilities;
}

/**
 * Whether libddb builds entries of this type (they have a build state, artifacts and a build action).
 * @param {number | string} type  an entry type (a string from a list response is read as its number)
 * @returns {boolean}
 */
export function isBuildableType(type) {
    return typeCapabilities().get(Number(type))?.buildable === true;
}

/**
 * Whether libddb gives entries of this type a thumbnail ("file": rendered from the entry, "build":
 * from an artifact once built). The server answers 404 for the others, so they are not asked for.
 * @param {number | string} type
 * @returns {boolean}
 */
export function hasThumbnail(type) {
    const thumbnail = typeCapabilities().get(Number(type))?.thumbnail;
    return thumbnail === 'file' || thumbnail === 'build';
}

/**
 * Whether a path names an archive the server can extract (its extension is one of the extractor's).
 * @param {string | null | undefined} path
 * @returns {boolean}
 */
export function isArchivePath(path) {
    if (!path) return false;
    const served = reg.features.value(Features.ARCHIVE_EXTENSIONS);
    const extensions = Array.isArray(served) && served.length ? served : FALLBACK_ARCHIVE_EXTENSIONS;
    const name = path.toLowerCase();
    return extensions.some(ext => name.endsWith(`.${ext}`));
}
