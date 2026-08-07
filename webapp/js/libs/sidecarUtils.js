/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import ddb from 'ddb';

/**
 * Discover sidecar files associated with a given entry path.
 *
 * A sidecar is any file in the same folder whose path is
 * `<basename-without-extension>_<suffix>` (e.g. `model.spz` -> `model_cameras.json`,
 * `cloud.laz` -> `cloud_measurements.geojson`). The relationship is purely
 * naming-convention based; no backend/DB awareness of sidecars exists.
 *
 * @param {Array} allEntries - file browser items (each with an `entry` object with `path`/`type`)
 * @param {string} entryPath - path of the main file being renamed
 * @returns {Array<{path: string, label: string}>} discovered sidecar files
 */
export function discoverSidecars(allEntries, entryPath) {
    if (!entryPath || !Array.isArray(allEntries)) return [];

    const base = entryPath.replace(/\.[^./\\]+$/, '');
    const prefix = `${base}_`;

    return allEntries
        .filter(item => {
            const entry = item && item.entry;
            if (!entry || !entry.path) return false;
            if (entry.path === entryPath) return false;
            if (ddb.entry.isDirectory(entry)) return false;
            if (!entry.path.startsWith(prefix)) return false;

            // Suffix must stay within the same folder and have an extension
            const suffix = entry.path.substring(prefix.length);
            return suffix.length > 0 && suffix.indexOf('/') === -1 && suffix.indexOf('.') !== -1;
        })
        .map(item => ({
            path: item.entry.path,
            label: ddb.pathutils.basename(item.entry.path)
        }));
}
