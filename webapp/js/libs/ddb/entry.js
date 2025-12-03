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

    async getEpt() {
        const eptUrl = this.buildUrl("ept/ept.json");

        if (await this.dataset.registry.headRequest(eptUrl)) return eptUrl;
        else throw new Error(`Il file EPT non è disponibile.\n\nIl file potrebbe essere ancora in fase di elaborazione. Torna alla lista file per verificare lo stato del build.`);
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

    async getVector() {
        const vectorUrl = this.buildUrl("vec/vector.fgb");

        if (await this.dataset.registry.headRequest(vectorUrl)) return vectorUrl;
        else throw new Error(`Il file vettoriale non è disponibile.\n\nIl file potrebbe essere ancora in fase di elaborazione. Torna alla lista file per verificare lo stato del build.`);
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
