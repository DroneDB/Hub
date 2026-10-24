// @ts-check
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Build artifacts by role: what an artifact is for, never where it lives.
 *
 * libddb owns the build layout (plan decision D8, XI-04) and Registry puts the artifacts that
 * exist on the entry DTO: `artifacts: [{role, url, mediaType}]`, from the same listing that gives
 * the entry. The Hub asks by role and uses the URL it is given: it holds no build path and does
 * not probe for files. The ArtifactRole values are the shared vocabulary (a role Registry sends
 * and the Hub does not know is ignored, a role the Hub asks for and the entry lacks is absent).
 */

/**
 * One artifact of an entry's build, as Registry lists it.
 * @typedef {{ role: string, url: string, mediaType?: string }} BuildArtifact
 */

/** @enum {string} */
export const ArtifactRole = Object.freeze({
    RASTER_COG: 'raster.cog',
    VECTOR_GPKG: 'vector.gpkg',
    /** The MVT pyramid; its artifact is the TileJSON index that proves the pyramid exists. */
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
 * The artifacts an entry DTO lists (none for an entry that is not built, not buildable, or from
 * a listing that predates its build).
 * @param {{ artifacts?: BuildArtifact[] } | null | undefined} entry
 * @returns {BuildArtifact[]}
 */
export function artifactsOf(entry) {
    return Array.isArray(entry?.artifacts) ? entry.artifacts : [];
}

/**
 * The artifact with a role (or the first of an any-of list of roles that exists), or null.
 * @param {{ artifacts?: BuildArtifact[] } | null | undefined} entry
 * @param {string | string[]} roles
 * @returns {BuildArtifact | null}
 */
export function findArtifactIn(entry, roles) {
    const artifacts = artifactsOf(entry);
    for (const role of Array.isArray(roles) ? roles : [roles]) {
        const found = artifacts.find(a => a.role === role);
        if (found) return found;
    }
    return null;
}

/**
 * The URL the Hub requests an artifact with. Registry builds it from the host it believes it
 * has, which behind a proxy can differ from the one the browser used (scheme, name, port); the
 * Hub is served by the Registry it talks to, so only the path and query are kept (as every
 * other URL of the Hub is: Dataset.baseApi is origin-relative).
 * @param {BuildArtifact} artifact
 * @returns {string}
 */
export function artifactHref(artifact) {
    const url = new URL(artifact.url, 'http://registry.invalid');
    return url.pathname + url.search;
}
