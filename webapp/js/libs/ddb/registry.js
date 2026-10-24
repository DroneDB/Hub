/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/*
 * Registry Client Library
 *
 * Request Body Handling:
 * - Objects are sent as JSON by default (Content-Type: application/json)
 * - FormData instances are sent as-is for file uploads and form submissions
 * - Strings are sent as plain text
 * - null and undefined values in objects are preserved correctly in JSON
 */

import Organization from './organization';
import RequestCache from './requestCache';
import { DEFAULT_REGISTRY } from './constants';
import { createHttpClient } from './http/httpClient';
import SysApi from './sysApi';
import ShareApi from './shareApi';
import AuthSession from './authSession';
import FeaturesService from './featuresService';
import AdminApi from './adminApi';
import OrganizationsApi from './organizationsApi';

const registries = new Map();

export default class Registry {
    constructor(url = "https://" + DEFAULT_REGISTRY) {
        this.url = url;
        this.eventListeners = {};
        // Shared by every client of this origin
        this.requestCache = RequestCache.forOrigin(url);
        // Transport: auth header, timeout, parsing, ApiError
        this.http = createHttpClient({ baseUrl: url, getToken: () => this.getAuthToken() });
        this.sys = new SysApi(this);
        this.share = new ShareApi(this);
        this.session = new AuthSession(this);
        this.features = new FeaturesService(this);
        this.admin = new AdminApi(this);
        this.orgs = new OrganizationsApi(this);
    }

    /**
     * The shared client of a Registry URL (one per origin), so helpers do not build a new
     * client, with its own feature list and token refresh, on every call.
     * @param {string} url
     * @returns {Registry}
     */
    static forUrl(url) {
        if (!registries.has(url)) registries.set(url, new Registry(url));
        return registries.get(url);
    }

    // ---- session (authSession.js) ----

    login(username, password, xAuthToken = null) { return this.session.login(username, password, xAuthToken); }
    logout() { return this.session.logout(); }
    changePwd(oldPassword, newPassword) { return this.session.changePwd(oldPassword, newPassword); }
    refreshToken() { return this.session.refreshToken(); }
    setAutoRefreshToken(seconds) { return this.session.setAutoRefreshToken(seconds); }
    setCredentials(username, token, expires) { return this.session.setCredentials(username, token, expires); }
    clearCredentials() { return this.session.clearCredentials(); }
    getAuthToken() { return this.session.getAuthToken(); }
    getAuthTokenExpiration() { return this.session.getAuthTokenExpiration(); }
    getUsername() { return this.session.getUsername(); }
    isAdmin() { return this.session.isAdmin(); }
    isLoggedIn() { return this.session.isLoggedIn(); }
    ensureLoggedIn() { return this.session.ensureLoggedIn(); }

    /** Drops the cached GET answers (all, or the endpoints starting with `prefix`). */
    invalidateCache(prefix = '') {
        this.requestCache.invalidate(prefix);
    }

    get remote() {
        return this.url.replace(/^https?:\/\//, "");
    }

    get secure() {
        return this.url.startsWith("https://");
    }

    async storageInfo() {
        if (this.ensureLoggedIn()) {
            const res = await this.getRequest(`/users/storage`);

            if (res.total == null) {
                return {
                    total: null,
                    used: res.used
                };
            } else {
                return {
                    total: res.total,
                    used: res.used,
                    free: res.total - res.used,
                    usedPercentage: res.used / res.total
                };
            }

        } else {
            throw new Error("not logged in");
        }
    }

    // ==================== Features ====================

    // ==================== Organization Member Management ==

    /**
     * Permission level constants for organization members
     */
    static get OrganizationPermissions() {
        return {
            ReadOnly: 0,
            ReadWrite: 1,
            ReadWriteDelete: 2,
            Admin: 3
        };
    }

    /**
     * Gets the display name for a permission level
     * @param {number} permission - Permission level (0-3)
     * @returns {string} Human-readable permission name
     */
    static getPermissionName(permission) {
        switch (permission) {
            case 0: return 'Read Only';
            case 1: return 'Read/Write';
            case 2: return 'Read/Write/Delete';
            case 3: return 'Admin';
            default: return 'Unknown';
        }
    }

    /**
     * One request to the Registry.
     *
     * makeRequest(endpoint, options) with options { method, body, contentType, responseType,
     * signal, headers, cache, readOnly, onHeaders }; the positional form makeRequest(endpoint, method, body,
     * contentType, responseType) still works.
     *
     * GETs go through the request cache (single flight, short read cache, conditional
     * requests); with a `signal`, only the reused descriptors do. `cache: false` skips it. Any other method drops the cached answers.
     * `signal` aborts the request (AbortError); requests time out after 5 minutes.
     * `onHeaders(headers)` receives the response headers (requests that skip the cache only).
     */
    async makeRequest(endpoint, methodOrOptions = "GET", body = null, contentType = null, responseType = null) {
        const options = typeof methodOrOptions === 'object' && methodOrOptions !== null
            ? methodOrOptions
            : { method: methodOrOptions, body, contentType, responseType };
        const method = (options.method || "GET").toUpperCase();

        // Input validation
        if (typeof endpoint !== 'string' || !endpoint) {
            throw new Error('Invalid endpoint: must be a non-empty string');
        }
        if (!endpoint.startsWith('/')) {
            throw new Error("Invalid endpoint: must start with '/'");
        }
        // Validate endpoint for dangerous patterns
        if (/\.\.[/\\]/.test(endpoint) || [...endpoint].some(c => c.charCodeAt(0) < 0x20)) {
            throw new Error('Invalid endpoint: contains dangerous characters or patterns');
        }

        if (method !== "GET") {
            // A write changes what the cached reads saw; a read sent as POST (`readOnly`) does not
            if (!options.readOnly) this.requestCache.invalidate();
            return this._send(endpoint, method, options);
        }

        if (options.cache === false || options.responseType || options.onHeaders)
            return this._send(endpoint, method, options);

        const load = ({ etag }) => this._send(endpoint, method, { ...options, signal: undefined, etag, withMeta: true });
        // A caller that can abort: the descriptors that are reused anyway are shared (the caller
        // stops waiting when it aborts); anything else gets its own request, which the abort
        // cancels, so aborting it cannot abort another caller
        if (options.signal) {
            return this.requestCache.keeps(endpoint)
                ? this.requestCache.getAbortable(endpoint, load, options.signal)
                : this._send(endpoint, method, options);
        }
        return this.requestCache.get(endpoint, load);
    }

    // Sends one request; with `withMeta` resolves { value, etag, notModified } (request cache)
    _send(endpoint, method, options) {
        return this.http.send(endpoint, { ...options, method });
    }

    /** Request headers carrying the session token (for URLs fetched outside this client). */
    authHeaders(extra = {}) {
        return this.http.authHeaders(extra);
    }

    /**
     * An authenticated fetch() that returns the raw Response, for blobs, streams and
     * callers that treat HTTP statuses as results.
     * @param {string} endpoint  path starting with '/', or an absolute URL of this registry
     * @param {RequestInit} [init]
     * @returns {Promise<Response>}
     */
    fetchRaw(endpoint, init) {
        return this.http.fetchRaw(endpoint, init);
    }

    /**
     * @param {string} endpoint
     * @param {object} [options] { signal, headers, cache } (see makeRequest)
     */
    async getRequest(endpoint, options = {}) {
        return this.makeRequest(endpoint, { ...options, method: "GET" });
    }

    /**
     * Performs a GET request and returns the response as raw text.
     * Useful for downloading file contents where automatic JSON parsing should be bypassed.
     * @param {string} endpoint - API endpoint starting with '/'
     * @returns {Promise<string>} Response body as text
     */
    async getRequestAsText(endpoint) {
        return this.makeRequest(endpoint, "GET", null, null, 'text');
    }

    async postRequest(endpoint, body = {}) {
        return this.makeRequest(endpoint, "POST", body);
    }

    async putRequest(endpoint, body = {}) {
        return this.makeRequest(endpoint, "PUT", body);
    }

    async deleteRequest(endpoint, body = {}) {
        return this.makeRequest(endpoint, "DELETE", body);
    }

    // Methods for explicit FormData usage (for file uploads or when needed)
    async postFormData(endpoint, formData, options = {}) {
        if (!(formData instanceof FormData))
            throw new Error('Expected FormData instance');
        return this.makeRequest(endpoint, { ...options, method: "POST", body: formData });
    }

    async putFormData(endpoint, formData) {
        if (!(formData instanceof FormData))
            throw new Error('Expected FormData instance');
        return this.makeRequest(endpoint, "PUT", formData);
    }

    async deleteFormData(endpoint, formData) {
        if (!(formData instanceof FormData))
            throw new Error('Expected FormData instance');
        return this.makeRequest(endpoint, "DELETE", formData);
    }

    Organization(name) {
        return new Organization(this, name);
    }

    /**
     * Called with the error when a request (other than sign-in or token refresh) is
     * rejected with 401. The app decides what to do (end the session, go to Login).
     * @param {(error: Error) => void} handler
     */
    onUnauthorized(handler) {
        this.http.onUnauthorized(handler);
    }

    addEventListener(event, cb) {
        this.eventListeners[event] = this.eventListeners[event] || [];
        if (!this.eventListeners[event].find(e => e === cb)) {
            this.eventListeners[event].push(cb);
        }
    }

    removeEventListener(event, cb) {
        this.eventListeners[event] = this.eventListeners[event] || [];
        this.eventListeners[event] = this.eventListeners[event].filter(e => e !== cb);
    }

    emit(event, ...params) {
        if (this.eventListeners[event]) {
            this.eventListeners[event].forEach(listener => {
                listener(...params);
            });
        }
    }

    // ========== Extended User Management Methods ==========



}