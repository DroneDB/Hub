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
        const formData = new FormData();
        if (paths !== undefined && paths !== null) formData.append('path', paths);
        return this.registry.postFormData(`${this.baseApi}/download`, formData);
    }

    /**
     * Downloads file(s) with a preflight check to detect 429 (Too Many Requests) before
     * initiating the native browser download. This avoids loading the entire file as a blob
     * in memory, and lets the browser handle streaming and progress natively.
     *
     * Flow:
     * 1. Send a lightweight preflight request with X-Download-Check header
     * 2. If 429, throw error so the caller can show a dialog
     * 3. If 200, proceed with window.location.href for native browser download
     *
     * @param {string|string[]} paths - Path(s) to download
     * @param {Object} options - Options (e.g. { inline: true })
     * @returns {Promise<void>}
     * @throws {Error} With .status = 429 when download limit is reached
     */
    async downloadWithCheck(paths, options = {}) {
        const url = this.downloadUrl(paths, options);
        const headers = { 'X-Download-Check': '1' };
        const authToken = this.registry.getAuthToken();
        if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

        const response = await fetch(url, { headers });

        if (!response.ok) {
            let errorMessage = `Download failed (${response.status})`;
            try {
                const contentType = response.headers.get('Content-Type');
                if (contentType && contentType.includes('application/json')) {
                    const json = await response.json();
                    errorMessage = json.error || json.message || errorMessage;
                }
            } catch (_) {
                // Ignore parse errors, use default message
            }
            const err = new Error(errorMessage);
            err.status = response.status;
            throw err;
        }

        // Preflight passed — initiate native browser download
        if (url.length < 2000) {
            window.location.href = url;
        } else {
            // URL too long for browser navigation, use POST to get a temporary short URL
            const { downloadUrl, error } = await this.download(paths);
            if (error) throw new Error(error);
            window.location.href = downloadUrl;
        }
    }

    /**
     * Gets the contents of a file as raw text.
     * Uses getRequestAsText to bypass automatic JSON parsing for file downloads.
     * @param {string} path - Path to the file within the dataset
     * @returns {Promise<string>} File contents as text
     */
    async getFileContents(path) {
        const url = this.downloadUrl(path, { inline: true });
        return this.registry.getRequestAsText(url);
    }

    async info() {
        return this.registry.getRequest(`${this.baseApi}`);
    }

    async update(name, visibility) {
        const formData = new FormData();
        if (name !== undefined) formData.append('name', name);
        if (visibility !== undefined) formData.append('visibility', visibility);
        return this.registry.putFormData(`${this.baseApi}`, formData);
    }

    async list(path) {
        const formData = new FormData();
        if (path !== undefined && path !== null) formData.append('path', path);
        return this.registry.postFormData(`${this.baseApi}/list`, formData);
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
        const formData = new FormData();
        if (query !== undefined && query !== null) formData.append('query', query);
        return this.registry.postFormData(`${this.baseApi}/search`, formData);
    }

    async delete() {
        return this.registry.deleteRequest(`${this.baseApi}`);
    }

    async deleteObj(path) {
        const formData = new FormData();
        formData.append('path', path);
        return this.registry.deleteFormData(`${this.baseApi}/obj`, formData);
    }

    async deleteObjs(paths) {
        const formData = new FormData();
        paths.forEach(path => formData.append('paths', path));
        return this.registry.deleteFormData(`${this.baseApi}/obj/batch`, formData);
    }

    async moveObj(source, dest) {
        const formData = new FormData();
        formData.append('source', source);
        formData.append('dest', dest);
        return this.registry.putFormData(`${this.baseApi}/obj`, formData);
    }

    async transferObj(sourcePath, destOrgSlug, destDsSlug, destPath = "", overwrite = false) {
        if (!sourcePath) throw new Error("Invalid source path");
        if (!destOrgSlug) throw new Error("Invalid destination organization");
        if (!destDsSlug) throw new Error("Invalid destination dataset");

        const formData = new FormData();
        formData.append('sourcePath', sourcePath);
        formData.append('destOrgSlug', destOrgSlug);
        formData.append('destDsSlug', destDsSlug);
        formData.append('destPath', destPath);
        formData.append('overwrite', overwrite);
        return this.registry.postFormData(`${this.baseApi}/transfer`, formData);
    }

    async writeObj(path, content) {
        const formData = new FormData();
        formData.append('path', path);
        formData.append('file', new Blob([content]));
        return this.registry.postFormData(`${this.baseApi}/obj`, formData);
    }

    async createFolder(path) {
        const formData = new FormData();
        formData.append('path', path);
        return this.registry.postFormData(`${this.baseApi}/obj`, formData);
    }

    async rename(slug) {
        if (typeof slug !== "string") throw new Error(`Invalid slug ${slug}`);
        const formData = new FormData();
        formData.append('slug', slug);
        return this.registry.postFormData(`${this.baseApi}/rename`, formData);
    }

    async metaSet(key, data, path = "") {
        if (!key) throw new Error(`Invalid key ${key}`);
        if (data === undefined) throw new Error(`Invalid data`);
        if (typeof data === "string") data = JSON.stringify(data);
        const formData = new FormData();
        formData.append('key', key);
        formData.append('data', data);
        formData.append('path', path);
        return this.registry.postFormData(`${this.baseApi}/meta/set`, formData);
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

        const formData = new FormData();
        formData.append('path', path);
        formData.append('force', force);
        const response = await this.registry.postFormData(`${this.baseApi}/build`, formData);

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
