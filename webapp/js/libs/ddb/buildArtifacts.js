// @ts-check
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Build artifacts by role: what an artifact is for, never where it lives.
 *
 * The role names are the shared vocabulary of the DroneDB/Registry plan (XI-04:
 * libddb owns the build layout and reports a role-tagged artifact manifest).
 * This module is the Hub's only copy of the DroneDB build layout. When Registry
 * returns `artifacts: [{role, url, mediaType}]` on the entry DTO, `artifactPath`
 * becomes a lookup into that array and buildArtifacts.json goes away; callers keep
 * asking by role.
 */

import artifactPaths from './buildArtifacts.json';

/** @enum {string} */
export const ArtifactRole = Object.freeze({
    RASTER_COG: 'raster.cog',
    VECTOR_GPKG: 'vector.gpkg',
    /** The MVT pyramid; its path is the TileJSON index that proves the pyramid exists. */
    VECTOR_MVT: 'vector.mvt',
    /** Drawing-coordinate metadata of a CAD vector without a CRS (no MVT pyramid). */
    VECTOR_LOCAL: 'vector.local',
    POINTCLOUD_COPC: 'pointcloud.copc',
    MODEL_NEXUS: 'model.nexus',
    MODEL_3DTILES: 'model.3dtiles',
    GSPLAT_SPZ: 'gsplat.spz',
    GSPLAT_LOD: 'gsplat.lod',
    GSPLAT_BOUNDS: 'gsplat.bounds',
    GSPLAT_GEOREF: 'gsplat.georef'
});

/**
 * Path of each artifact inside the entry's build folder (build/{hash}/...), as written
 * by DroneDB, keyed by role. Kept as data so the lint guard (eslint-rules/no-build-layout.mjs)
 * reads the same table. Copied from the libddb build layout, never invented.
 * @type {Readonly<Record<string, string>>}
 */
const ARTIFACT_PATHS = Object.freeze(artifactPaths);

/**
 * Path of an artifact relative to the entry's build folder.
 * @param {string} role  an ArtifactRole value
 * @returns {string}
 */
export function artifactPath(role) {
    const path = ARTIFACT_PATHS[role];
    if (!path) throw new Error(`Unknown build artifact role: ${role}`);
    return path;
}

/** Every role the Hub knows. */
export const ALL_ARTIFACT_ROLES = Object.freeze(Object.values(ArtifactRole));
