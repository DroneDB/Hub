/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

class Entry {
    constructor(dataset, entry) {
        this.dataset = dataset;
        Object.assign(this, entry);

        // Quick check
        if (!this.hash) throw new Error("Not a valid file entry object");
    }

    buildUrl(path) {
        let url = `${this.dataset.baseApi}/build/${this.hash}/${path}`;
        return url;
    }

    async getCopc() {
        const copcUrl = this.buildUrl("copc/cloud.copc.laz");

        if (await this.dataset.registry.headRequest(copcUrl)) return copcUrl;
        else throw new Error(`Il file COPC non è disponibile.\n\nIl file potrebbe essere ancora in fase di elaborazione. Torna alla lista file per verificare lo stato del build.`);
    }

    async getCog() {
        const cogUrl = this.buildUrl("cog/cog.tif");

        if (await this.dataset.registry.headRequest(cogUrl)) return cogUrl;
        else throw new Error(`Il file COG non è disponibile.\n\nIl file potrebbe essere ancora in fase di elaborazione. Torna alla lista file per verificare lo stato del build.`);
    }

    async getNxz() {
        const nxzUrl = this.buildUrl("nxs/model.nxz");
        if (await this.dataset.registry.headRequest(nxzUrl)) return nxzUrl;
        else throw new Error(`Il modello 3D non è disponibile.\n\nIl file potrebbe essere ancora in fase di elaborazione. Torna alla lista file per verificare lo stato del build.`);
    }

    /**
     * Returns the URL of the OGC 3D Tiles root tileset (3dtiles/tileset.json) when present,
     * or null otherwise. 3D Tiles are produced for MODEL entries alongside the legacy Nexus
     * output (dual output), so this artifact is optional: datasets built before 3D Tiles
     * support (or with Obj2Tiles unavailable) only have nxs/model.nxz. Callers must tolerate
     * a null result and fall back to getNxz().
     */
    async get3DTiles() {
        const tilesetUrl = this.buildUrl("3dtiles/tileset.json");
        if (await this.dataset.registry.headRequest(tilesetUrl)) return tilesetUrl;
        return null;
    }

    async getGsplat() {
        const spzUrl = this.buildUrl("gsplat/model.spz");
        if (await this.dataset.registry.headRequest(spzUrl)) return spzUrl;
        else throw new Error(`Il Gaussian Splat non è disponibile.\n\nIl file potrebbe essere ancora in fase di elaborazione. Torna alla lista file per verificare lo stato del build.`);
    }

    /**
     * Returns the URL of the optional level-of-detail artifact (gsplat/model.rad) when present,
     * or null otherwise. The .rad enables progressive streaming (Spark `paged: true`) so large
     * scenes load coarse-first and fetch detail on demand instead of downloading the whole .spz.
     * It is optional: a dataset built without build-lod has no .rad, so callers must tolerate null
     * and fall back to getGsplat().
     */
    async getGsplatLod() {
        const radUrl = this.buildUrl("gsplat/model.rad");
        if (await this.dataset.registry.headRequest(radUrl)) return radUrl;
        return null;
    }

    /**
     * Returns the parsed local-space bounding box ({min:[x,y,z], max:[x,y,z]}) written at build
     * time (gsplat/bounds.json), or null when absent. The viewer uses it to frame the camera
     * deterministically - essential for the paged .rad path, where the streamed mesh has no
     * resident splats (and thus no computable bounds) when it first initializes.
     */
    async getGsplatBounds() {
        const boundsUrl = this.buildUrl("gsplat/bounds.json");
        if (!(await this.dataset.registry.headRequest(boundsUrl))) return null;
        try {
            const resp = await fetch(boundsUrl);
            if (!resp.ok) return null;
            const b = await resp.json();
            if (b && Array.isArray(b.min) && Array.isArray(b.max)) return b;
        } catch (e) {
            // bounds are an optimization; ignore failures and fall back to client-side framing.
        }
        return null;
    }

    /**
     * Returns the URL of the georeferencing sidecar (gsplat/georef.json) when present,
     * or null otherwise. The sidecar is optional: a splat without georeferencing renders
     * in local space, so callers must tolerate a null result.
     */
    async getGeoref() {
        const georefUrl = this.buildUrl("gsplat/georef.json");
        if (await this.dataset.registry.headRequest(georefUrl)) return georefUrl;
        return null;
    }

    async getVector() {
        const vectorUrl = this.buildUrl("vec/vector.fgb");

        if (await this.dataset.registry.headRequest(vectorUrl)) return vectorUrl;
        else throw new Error(`Il file vettoriale non è disponibile.\n\nIl file potrebbe essere ancora in fase di elaborazione. Torna alla lista file per verificare lo stato del build.`);
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

module.exports = {
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
    }
};
