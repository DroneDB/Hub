/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { ArtifactRole, findArtifactIn, artifactHref } from './buildArtifacts';

// The roles a model can be listed under (see ArtifactRole)
const MODEL_ROLES = [ArtifactRole.MODEL_BM3D, ArtifactRole.MODEL_NEXUS];

const STILL_PROCESSING = 'The file may still be processing. Return to the file list to check the build status.';

class Entry {
    constructor(dataset, entry) {
        this.dataset = dataset;
        Object.assign(this, entry);

        // Quick check
        if (!this.hash) throw new Error("Not a valid file entry object");
    }

    /**
     * URL of a build artifact by role (or the first of an any-of list) when the entry lists it,
     * or null. The entry DTO carries the artifacts that exist (libddb's build manifest): nothing
     * is requested to find out, so an entry read before its build finished has none.
     * @param {string | string[]} role
     * @returns {string | null}
     */
    findArtifact(role) {
        const artifact = findArtifactIn(this, role);
        return artifact ? artifactHref(artifact) : null;
    }

    /**
     * URL of a build artifact that the caller cannot work without.
     * @param {string | string[]} role
     * @param {string} label  what the user is told is missing ("The COPC file")
     * @returns {string}
     */
    requireArtifact(role, label) {
        const url = this.findArtifact(role);
        if (url) return url;
        throw new Error(`${label} is not available.\n\n${STILL_PROCESSING}`);
    }

    /** Parsed JSON of an optional artifact, or null when absent or unreadable. */
    async readArtifactJson(role) {
        const url = this.findArtifact(role);
        if (!url) return null;
        try {
            const resp = await this.dataset.registry.fetchRaw(url);
            return resp.ok ? await resp.json() : null;
        } catch {
            return null;
        }
    }

    getCopc() {
        return this.requireArtifact(ArtifactRole.POINTCLOUD_COPC, 'The COPC file');
    }

    /**
     * URL of the multiresolution model, whichever format the build made it in. libddb lists the
     * legacy Nexus model only while the bm3d one is missing, so the Hub has no order to prefer.
     */
    getModelArtifact() {
        return this.requireArtifact(MODEL_ROLES, 'The 3D model');
    }

    /**
     * URL of the OGC 3D Tiles root tileset when present, or null. 3D Tiles are produced for
     * MODEL entries alongside the multiresolution model, so this artifact is optional: datasets
     * built before 3D Tiles support (or with Obj2Tiles unavailable) only have that model.
     * Callers must tolerate null and fall back to getModelArtifact().
     */
    get3DTiles() {
        return this.findArtifact(ArtifactRole.MODEL_3DTILES);
    }

    getGsplat() {
        return this.requireArtifact(ArtifactRole.GSPLAT_SPZ, 'The Gaussian Splat');
    }

    /**
     * URL of the optional level-of-detail splat artifact when present, or null. It enables
     * progressive streaming (Spark `paged: true`): large scenes load coarse-first instead of
     * downloading the whole .spz. A dataset built without build-lod has none, so callers must
     * tolerate null and fall back to getGsplat().
     */
    getGsplatLod() {
        return this.findArtifact(ArtifactRole.GSPLAT_LOD);
    }

    /**
     * The local-space bounding box ({min:[x,y,z], max:[x,y,z]}) written at build time, or null.
     * The viewer uses it to frame the camera deterministically - essential for the paged LOD
     * path, where the streamed mesh has no resident splats when it first initializes.
     */
    async getGsplatBounds() {
        // Bounds are an optimization: on any failure the viewer frames client-side.
        const b = await this.readArtifactJson(ArtifactRole.GSPLAT_BOUNDS);
        return b && Array.isArray(b.min) && Array.isArray(b.max) ? b : null;
    }

    /**
     * Returns the OpenLayers-compatible URL template for the MVT tile pyramid
     * served by Registry's MvtController at /orgs/{org}/ds/{ds}/mvt/{hash}/{z}/{x}/{y}.pbf.
     * The {z}/{x}/{y} placeholders are kept verbatim for ol/source/VectorTile.
     */
    getMvtUrlTemplate() {
        return `${this.dataset.baseApi}/mvt/${this.hash}/{z}/{x}/{y}.pbf`;
    }

    /**
     * Returns the URL for the TileJSON metadata served alongside the MVT pyramid.
     */
    getMvtMetadataUrl() {
        return `${this.dataset.baseApi}/mvt/${this.hash}/metadata.json`;
    }
}

const entry = {
    Entry,
    type: {
        UNDEFINED: 0,
        DIRECTORY: 1,
        GENERIC: 2,
        GEOIMAGE: 3,
        GEORASTER: 4,
        POINTCLOUD: 5,
        IMAGE: 6,
        DRONEDB: 7,
        MARKDOWN: 8,
        VIDEO: 9,
        GEOVIDEO: 10,
        MODEL: 11,
        PANORAMA: 12,
        GEOPANORAMA: 13,
        VECTOR: 14,
        GAUSSIAN_SPLAT: 15,
        TILES3D: 16,
    },

    typeToHuman: function (t) {
        switch (t) {
            case this.type.UNDEFINED:
                return "Undefined";
            case this.type.DIRECTORY:
                return "Directory";
            case this.type.GENERIC:
                return "Generic";
            case this.type.GEOIMAGE:
                return "GeoImage";
            case this.type.GEORASTER:
                return "GeoRaster";
            case this.type.POINTCLOUD:
                return "PointCloud";
            case this.type.IMAGE:
                return "Image";
            case this.type.DRONEDB:
                return "DroneDB";
            case this.type.MARKDOWN:
                return "Markdown";
            case this.type.VIDEO:
                return "Video";
            case this.type.GEOVIDEO:
                return "GeoVideo";
            case this.type.MODEL:
                return "Model";
            case this.type.PANORAMA:
                return "Panorama";
            case this.type.GEOPANORAMA:
                return "GeoPanorama";
            case this.type.VECTOR:
                return "Vector";
            case this.type.GAUSSIAN_SPLAT:
                return "GaussianSplat";
            case this.type.TILES3D:
                return "Tiles3D";
            default:
                return "?";
        }
    },

    hasGeometry: function (entry) {
        if (!entry) return false;
        return !!entry.point_geom || !!entry.polygon_geom;
    },

    isDirectory: function (entry) {
        if (!entry) return false;
        return entry.type === this.type.DIRECTORY ||
            entry.type === this.type.DRONEDB;
    },

    // The dataset itself: the DroneDB entry the server lists as the root of the tree (its path is
    // the dataset's ddb:// address) or the one a drop on the root names (no path)
    isDatasetRoot: function (entry) {
        if (!entry || entry.type !== this.type.DRONEDB) return false;
        return !entry.path || /^ddb(\+unsafe)?:\/\//i.test(entry.path);
    }
};

export { Entry };
export default entry;
