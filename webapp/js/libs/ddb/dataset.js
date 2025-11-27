/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
const { Entry } = require('./entry');
const Visibility = require('./visibility');

module.exports = class Dataset {
    constructor(registry, org, ds) {
        this.registry = registry;
        this.org = org;
        this.ds = ds;
    }

    remoteUri(path) {
        const { remote, secure } = this.registry;

        const proto = secure ? "ddb" : "ddb+unsafe";
        const p = (path && path !== ".") ? `/${path}` : "";

        return `${proto}://${remote}/${this.org}/${this.ds}${p}`;
    }


    get baseApi() {
        return `/orgs/${this.org}/ds/${this.ds}`;
    }

    downloadUrl(paths, options = {}) {
        if (typeof paths === "string") paths = [paths];

        let url = `${this.baseApi}/download`;

        let q = {};

        if (paths !== undefined) {
            if (paths.length > 1) q.path = paths.join(",");
            else url += `/${paths[0]}`;
        }

        if (options.inline) q.inline = "1";
        q = new URLSearchParams(q).toString();
        if (q) url += `?${q}`;

        return url;
    }

    thumbUrl(path, size) {
        let url = `${this.baseApi}/thumb?path=${encodeURIComponent(path)}`;
        if (size) url += `&size=${size}`;
        return url;
    }

    tileUrl(path, tz, tx, ty, options = {}) {
        let retina = "";
        if (options.retina) retina = "@2x";

        let url = `${this.baseApi}/tiles/${tz}/${tx}/${ty}${retina}.png?path=${path}`;
        return url;
    }

    Entry(fileEntry) {
        return new Entry(this, fileEntry);
    }

    async download(paths) {
        return this.registry.postRequest(`${this.baseApi}/download`, { path: paths });
    }

    async getFileContents(path) {
        const url = this.downloadUrl(path, { inline: true });
        return this.registry.getRequest(url);
    }

    async info() {
        return this.registry.getRequest(`${this.baseApi}`);
    }

    async update(name, visibility) {
        return this.registry.putRequest(`${this.baseApi}`, {
            name, visibility
        });
    }

    async list(path) {
        return this.registry.postRequest(`${this.baseApi}/list`, { path });
    }

    async listOne(path){
        const l = await this.list(path);
        if (l.length === 1){
            return l[0];
        }else if (l.length === 0){
            throw new Error(`Cannot find: ${path}. It might have been renamed or moved.`);
        }else{
            throw new Error("listOne returned more than 1 element");
        }
    }

    async search(query){
        return this.registry.postRequest(`${this.baseApi}/search`, { query });
    }

    async delete() {
        return this.registry.deleteRequest(`${this.baseApi}`);
    }

    async deleteObj(path) {
        return this.registry.deleteRequest(`${this.baseApi}/obj`, { path });
    }

    async moveObj(source, dest) {
        return this.registry.putRequest(`${this.baseApi}/obj`, { source, dest });
    }

    async transferObj(sourcePath, destOrgSlug, destDsSlug, destPath = "", overwrite = false) {
        if (!sourcePath) throw new Error("Invalid source path");
        if (!destOrgSlug) throw new Error("Invalid destination organization");
        if (!destDsSlug) throw new Error("Invalid destination dataset");

        return this.registry.postRequest(`${this.baseApi}/transfer`, {
            sourcePath,
            destOrgSlug,
            destDsSlug,
            destPath,
            overwrite
        });
    }

    async writeObj(path, content) {
        return this.registry.postRequest(`${this.baseApi}/obj`, { path, file: new Blob([content]) });
    }

    async createFolder(path) {
        return this.registry.postRequest(`${this.baseApi}/obj`, { path });
    }

    async rename(slug) {
        if (typeof slug !== "string") throw new Error(`Invalid slug ${slug}`);
        return this.registry.postRequest(`${this.baseApi}/rename`, { slug });
    }

    async metaSet(key, data, path = "") {
        if (!key) throw new Error(`Invalid key ${key}`);
        if (data === undefined) throw new Error(`Invalid data`);
        if (typeof data === "string") data = JSON.stringify(data);
        return this.registry.postRequest(`${this.baseApi}/meta/set`, {
            key, data, path
        });
    }

    async setVisibility(visibility) {
        const v = parseInt(visibility);
        if (isNaN(v)) throw Error("Invalid visibility value");

        return this.metaSet("visibility", v);
    }

    async getVisibility(){
        const info = await this.info();
        return info[0].properties?.meta?.visibility?.data;
    }

    async build(path, force = false) {
        if (!path) throw new Error(`Invalid path ${path}`);

        const response = await this.registry.postRequest(`${this.baseApi}/build`, {
            path: path,
            force: force
        });

        return response === true ? { success: true } : response;
    }

    async getBuilds(page = 1, pageSize = 50) {
        const params = new URLSearchParams({
            page: page.toString(),
            pageSize: pageSize.toString()
        });

        return this.registry.getRequest(`${this.baseApi}/builds?${params}`);
    }

    async clearCompletedBuilds() {
        const response = await this.registry.postRequest(`${this.baseApi}/builds/clear`, {});
        return response;
    }
};
