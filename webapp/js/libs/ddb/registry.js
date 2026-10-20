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
import { applyHubBranding } from '../hubBranding';
import { ApiError } from './apiError';
import { createHttpClient } from './http/httpClient';

let refreshTimers = {};

const throwError = (msg, status, extraData = {}) => {
    throw new ApiError(msg, status, extraData);
};

// Credit https://stackoverflow.com/a/38552302
function parseJwt(token) {
    if (!token) return {};
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return {};
        const base64Url = parts[1];
        if (!base64Url) return {};
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function (c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
    } catch {
        return null;
    }
}

// Check localStorage availability
const hasLocalStorage = (() => {
    try {
        const test = '__localStorage_test__';
        localStorage.setItem(test, test);
        localStorage.removeItem(test);
        return true;
    } catch {
        return false;
    }
})();

// In-memory fallback storage when localStorage is not available
const memoryStorage = {};

const storage = {
    getItem: (key) => hasLocalStorage ? localStorage.getItem(key) : (memoryStorage[key] || null),
    setItem: (key, value) => hasLocalStorage ? localStorage.setItem(key, value) : (memoryStorage[key] = value),
    removeItem: (key) => hasLocalStorage ? localStorage.removeItem(key) : delete memoryStorage[key]
};

const registries = new Map();

export default class Registry {
    constructor(url = "https://" + DEFAULT_REGISTRY) {
        this.url = url;
        this.eventListeners = {};
        this._refreshingToken = false;
        this._features = {};
        // Shared by every client of this origin (HUB-06)
        this.requestCache = RequestCache.forOrigin(url);
        // Transport: auth header, timeout, parsing, ApiError (HQ-05)
        this.http = createHttpClient({ baseUrl: url, getToken: () => this.getAuthToken() });
    }

    /**
     * The shared client of a Registry URL (one per origin), so helpers do not build a new
     * client, with its own feature list and token refresh, on every call (HUB-06).
     * @param {string} url
     * @returns {Registry}
     */
    static forUrl(url) {
        if (!registries.has(url)) registries.set(url, new Registry(url));
        return registries.get(url);
    }

    /** Drops the cached GET answers (all, or the endpoints starting with `prefix`). */
    invalidateCache(prefix = '') {
        this.requestCache.invalidate(prefix);
    }

    get remote() {
        return this.url.replace(/^https?:\/\//, "");
    }

    get tagUrl() {
        // Drop the https prefix if it's secure (it's the default)
        return this.secure ? this.remote : this.url;
    }

    get secure() {
        return this.url.startsWith("https://");
    }

    // Login
    async login(username, password, xAuthToken = null) {
        const formData = new FormData();
        if (username) formData.append('username', username);
        if (password) formData.append('password', password);
        if (xAuthToken) formData.append('token', xAuthToken);

        try {
            const res = await this.postFormData('/users/authenticate', formData);

            if (res && res.token) {
                this.setCredentials(res.username, res.token, res.expires);
                this.setAutoRefreshToken();
                this.emit("login", res.username);

                return res;
            } else {
                throw new Error(res?.error || "Cannot login: Invalid response");
            }
        } catch (e) {
            if (e.status) {
                // Re-throw API errors
                throw e;
            } else {
                throw new Error(`Cannot login: ${e.message}`, { cause: e });
            }
        }
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

    async users() {
        return await this.getRequest(`/users`);
    }

    async userRoles() {
        return await this.getRequest(`/users/roles`);
    }

    async addUser(username, password, roles = [], email = '') {
        return await this.postRequest('/users', {
            userName: username,
            email: email,
            password,
            roles: roles
        });
    }

    /**
     * Deletes a user and optionally transfers their data to a successor.
     * @param {string} username - The username of the user to delete.
     * @param {string|null} successor - The username of the successor to transfer data to. If null, all data is deleted.
     * @param {string} conflictResolution - How to handle conflicts: 'HaltOnConflict' (0), 'Overwrite' (1), or 'Rename' (2). Default is 'Rename'.
     * @returns {Promise<Object>} Result object with deletion details.
     */
    async deleteUser(username, successor = null, conflictResolution = 'Rename') {
        let url = `/users/${encodeURIComponent(username)}`;
        const params = new URLSearchParams();

        if (successor) {
            params.append('successor', successor);
        }
        if (conflictResolution) {
            params.append('conflictResolution', conflictResolution);
        }

        const queryString = params.toString();
        if (queryString) {
            url += `?${queryString}`;
        }

        return await this.deleteRequest(url);
    }

    async changePwd(oldPassword, newPassword) {
        const formData = new FormData();
        formData.append('oldPassword', oldPassword);
        formData.append('newPassword', newPassword);
        const res = await this.postFormData('/users/changePwd', formData);
        if (res.token) {
            this.setCredentials(this.getUsername(), res.token, res.expires);
        } else {
            throwError(res.error || `Cannot change password: ${JSON.stringify(res)}`, res.status);
        }
    }

    async refreshToken() {
        if (!this.ensureLoggedIn()) {
            throw new Error("logged out");
        }

        // If a refresh is already in-flight, return the same promise
        if (this._refreshPromise) {
            return this._refreshPromise;
        }

        this._refreshPromise = this._doRefreshToken();

        try {
            return await this._refreshPromise;
        } finally {
            this._refreshPromise = null;
        }
    }

    async _doRefreshToken() {
        try {
            const res = await this.postRequest('/users/authenticate/refresh');

            if (res.token) {
                this.setCredentials(this._getUsernameFromStorage(), res.token, res.expires);
            } else {
                throwError(res.error || "Cannot refresh token: Invalid response", res.status || 400);
            }
        } catch (error) {
            if (error.status === 401) {
                // Token is no longer valid, clear credentials
                this.clearCredentials();
                throw new Error("logged out", { cause: error });
            }
            throw error;
        }
    }

    setAutoRefreshToken(seconds = 3600) {
        if (refreshTimers[this.url]) {
            clearTimeout(refreshTimers[this.url]);
            delete refreshTimers[this.url];
        }

        refreshTimers[this.url] = setTimeout(async () => {
            try {
                await this.refreshToken();
                this.setAutoRefreshToken(seconds);
            } catch (e) {
                console.error(e);

                // Try again later, unless we're logged out
                if (e.message !== "logged out") {
                    this.setAutoRefreshToken(seconds);
                }
            }
        }, seconds * 1000);
    }

    logout() {
        // Clear the auto-refresh timer
        if (refreshTimers[this.url]) {
            clearTimeout(refreshTimers[this.url]);
            delete refreshTimers[this.url];
        }
        // Clear cached features
        this._features = {};
        this.clearCredentials();
        this.emit("logout");
    }

    setCredentials(username, token, expires) {
        // Cached answers belong to the previous identity
        if (storage.getItem(`${this.url}_username`) !== username) this.invalidateCache();
        storage.setItem(`${this.url}_username`, username);
        storage.setItem(`${this.url}_jwt_token`, token);
        storage.setItem(`${this.url}_jwt_token_expires`, expires);

        // Set cookie if the URL matches the current window
        if (typeof window !== "undefined") {
            if (window.location.origin === this.url) {
                const expiresDate = new Date(expires * 1000).toUTCString();
                const isSecure = window.location.protocol === 'https:';
                document.cookie = `jwtToken=${token};expires=${expiresDate};path=/;SameSite=Strict${isSecure ? ';Secure' : ''}`;
            }
        }
    }

    getAuthToken() {
        const expiration = this.getAuthTokenExpiration();
        if (expiration && expiration > new Date()) {
            return storage.getItem(`${this.url}_jwt_token`);
        }
        return null;
    }

    /**
     * Get username from storage without triggering side effects.
     * Used internally to avoid circular calls with isLoggedIn().
     */
    _getUsernameFromStorage() {
        return storage.getItem(`${this.url}_username`);
    }

    getUsername() {
        if (this.ensureLoggedIn()) {
            return this._getUsernameFromStorage();
        }
        return null;
    }

    isAdmin() {
        if (this.ensureLoggedIn()) {
            const token = this.getAuthToken();
            if (!token)
                return false;

            const decoded = parseJwt(token);
            if (!decoded)
                return false;

            return decoded.admin === true;
        }
        return false;
    }

    getAuthTokenExpiration() {
        const expires = storage.getItem(`${this.url}_jwt_token_expires`);
        if (expires) {
            return new Date(expires * 1000);
        }
        return null;
    }

    async createOrganization(slugOrData, name, description, isPublic) {
        if (!this.ensureLoggedIn())
            throw new Error("not logged in");

        const formData = new FormData();

        // Support both old signature (slug, name, desc, isPublic) and new signature (object)
        if (typeof slugOrData === 'object') {
            // New signature: createOrganization({slug, name, description, isPublic})
            if (slugOrData.slug) formData.append('slug', slugOrData.slug);
            if (slugOrData.name) formData.append('name', slugOrData.name);
            if (slugOrData.description) formData.append('description', slugOrData.description);
            if (slugOrData.isPublic !== undefined) formData.append('isPublic', slugOrData.isPublic);
        } else {
            // Old signature: createOrganization(slug, name, description, isPublic)
            if (slugOrData) formData.append('slug', slugOrData);
            if (name) formData.append('name', name);
            if (description) formData.append('description', description);
            if (isPublic !== undefined) formData.append('isPublic', isPublic);
        }

        return await this.postFormData('/orgs', formData);
    }

    async updateOrganization(slug, name, description, isPublic) {
        if (!this.ensureLoggedIn())
            throw new Error("not logged in");

        const formData = new FormData();
        formData.append('slug', slug);
        if (name !== undefined) formData.append('name', name);
        if (description !== undefined) formData.append('description', description);
        if (isPublic !== undefined) formData.append('isPublic', isPublic);
        return await this.putFormData(`/orgs/${slug}`, formData);
    }

    async getOrganizations(ownedOnly = false) {
        const res = await this.getRequest(`/orgs${ownedOnly ? '?ownedOnly=true' : ''}`);
        return res.map(org => new Organization(this, org));
    }

    async deleteOrganization(orgSlug) {

        if (!this.ensureLoggedIn())
            throw new Error("not logged in");

        return await this.deleteRequest(`/orgs/${orgSlug}`);
    }

    // ==================== Features ====================

    /**
     * Loads all platform feature flags from the server.
     * Should be called once at app startup after authentication.
     * @returns {Promise<Object>} The features object
     */
    async loadFeatures() {
        try {
            this._features = await this.getRequest('/sys/features');
        } catch (e) {
            console.error('Failed to load features:', e);
            this._features = {};
        }

        // Apply Hub branding (window.HubOptions, document title, favicon links).
        // The features endpoint is anonymous, so this works pre-login too.
        try {
            applyHubBranding(this._features ? this._features.hubOptions : null);
        } catch (e) {
            console.error('Failed to apply Hub branding:', e);
        }

        return this._features;
    }

    /**
     * Gets the value of a specific feature flag.
     * Features must be loaded first via loadFeatures().
     * @param {string} name - The feature name (e.g. 'OrganizationMemberManagement')
     * @returns {boolean} Whether the feature is enabled (defaults to false if not loaded)
     */
    getFeature(name) {
        if (!this._features) return false;
        return this._features[name] === true;
    }

    /**
     * Gets the raw value of a feature (supports non-boolean features).
     * Features must be loaded first via loadFeatures().
     * @param {string} name - The feature name
     * @returns {*} The feature value, or null if not loaded/not present
     */
    getFeatureValue(name) {
        if (!this._features) return null;
        return this._features[name] ?? null;
    }

    // ==================== Organization Member Management ==

    /**
     * Gets all members of an organization
     * @param {string} orgSlug - The organization slug
     * @returns {Promise<Array>} List of organization members
     */
    async getOrganizationMembers(orgSlug) {
        if (!this.ensureLoggedIn())
            throw new Error("not logged in");

        return await this.getRequest(`/orgs/${encodeURIComponent(orgSlug)}/members`);
    }

    /**
     * Adds a member to an organization
     * @param {string} orgSlug - The organization slug
     * @param {string} userName - The username to add
     * @param {number} permissions - Permission level (0=ReadOnly, 1=ReadWrite, 2=ReadWriteDelete, 3=Admin)
     * @returns {Promise<void>}
     */
    async addOrganizationMember(orgSlug, userName, permissions = 1) {
        if (!this.ensureLoggedIn())
            throw new Error("not logged in");

        return await this.postRequest(`/orgs/${encodeURIComponent(orgSlug)}/members`, {
            userName: userName,
            permissions: permissions
        });
    }

    /**
     * Updates a member's permission level
     * @param {string} orgSlug - The organization slug
     * @param {string} userName - The username to update
     * @param {number} permissions - New permission level (0-3)
     * @returns {Promise<void>}
     */
    async updateMemberPermissions(orgSlug, userName, permissions) {
        if (!this.ensureLoggedIn())
            throw new Error("not logged in");

        return await this.putRequest(
            `/orgs/${encodeURIComponent(orgSlug)}/members/${encodeURIComponent(userName)}`,
            { permissions: permissions }
        );
    }

    /**
     * Removes a member from an organization
     * @param {string} orgSlug - The organization slug
     * @param {string} userName - The username to remove
     * @returns {Promise<void>}
     */
    async removeOrganizationMember(orgSlug, userName) {
        if (!this.ensureLoggedIn())
            throw new Error("not logged in");

        return await this.deleteRequest(
            `/orgs/${encodeURIComponent(orgSlug)}/members/${encodeURIComponent(userName)}`
        );
    }

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

    clearCredentials() {
        this.invalidateCache();
        storage.removeItem(`${this.url}_jwt_token`);
        storage.removeItem(`${this.url}_jwt_token_expires`);
        storage.removeItem(`${this.url}_username`);

        // Clear cookie if needed
        if (typeof window !== "undefined") {
            if (window.location.origin === this.url) {
                document.cookie = `jwtToken=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
            }
        }
    }

    /**
     * Pure check: returns true if the user has a valid, non-expired token.
     * No side effects.
     */
    isLoggedIn() {
        return this.getAuthToken() !== null && this.getAuthTokenExpiration() > new Date();
    }

    /**
     * Check login status and clear stale credentials if expired.
     * Use this when you want to enforce logout on expiration.
     */
    ensureLoggedIn() {
        const loggedIn = this.isLoggedIn();
        if (!loggedIn) this.clearCredentials();
        return loggedIn;
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
     * callers that treat HTTP statuses as results (HQ-05).
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

    async headRequest(endpoint) {
        return this.makeRequest(endpoint, "HEAD");
    }

    async patchRequest(endpoint, body = {}) {
        return this.makeRequest(endpoint, "PATCH", body);
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

    async patchFormData(endpoint, formData) {
        if (!(formData instanceof FormData))
            throw new Error('Expected FormData instance');
        return this.makeRequest(endpoint, "PATCH", formData);
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
     * rejected with 401. The app decides what to do (HQ-04: end the session, go to Login).
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



    // Get detailed user information
    async usersDetailed() {
        return await this.getRequest('/users/detailed');
    }

    /**
     * Lists all tasks across all users and datasets (admin only).
     * @param {Object} [filter]
     * @param {string} [filter.toolId]
     * @param {string} [filter.state]
     * @param {string} [filter.userId]
     * @param {number} [filter.skip]
     * @param {number} [filter.take]
     * @returns {Promise<Object>} { items, total, skip, take }
     */
    async adminTasks({ toolId, state, userId, skip = 0, take = 50 } = {}) {
        const q = new URLSearchParams();
        if (toolId) q.append('toolId', toolId);
        if (state) q.append('state', state);
        if (userId) q.append('userId', userId);
        q.append('skip', String(skip));
        q.append('take', String(take));
        return this.getRequest(`/sys/tasks?${q}`);
    }

    /**
     * Deletes a concluded task from the global admin task list (admin only).
     * @param {string} id Task id
     * @returns {Promise<Object>} { deleted }
     */
    async adminDeleteTask(id) {
        if (!id) throw new Error('Invalid task id');
        return this.postRequest(`/sys/tasks/${encodeURIComponent(id)}/delete`, {});
    }

    // User update method (email and roles)
    async updateUser(userName, email, roles) {
        return await this.putRequest(`/users/${encodeURIComponent(userName)}`, {
            email: email,
            roles: roles
        });
    }

    // Role management
    async createRole(roleName) {
        return await this.postRequest('/users/roles', {roleName: roleName});
    }

    async deleteRole(roleName) {
        return await this.deleteRequest(`/users/roles/${encodeURIComponent(roleName)}`);
    }

    async updateUserRoles(userName, roles) {
        const result = await this.putRequest(`/users/${encodeURIComponent(userName)}`, {
            email: null, // Will be handled by the updateUser method instead
            roles: roles
        });
        // PUT /users/{userName} returns 200 OK with empty body on success
        return result || {}; // Return empty object if result is null/undefined
    }

    // User organization management
    async getUserOrganizations(userName) {
        return await this.getRequest(`/users/${encodeURIComponent(userName)}/orgs`);
    }

    async addUserToOrganization(userName, orgSlug, permissions) {
        return await this.postRequest(`/users/${encodeURIComponent(userName)}/orgs`, {
            orgSlug,
            permissions
        });
    }

    async removeUserFromOrganization(userName, orgSlug) {
        return await this.deleteRequest(`/users/${encodeURIComponent(userName)}/orgs/${encodeURIComponent(orgSlug)}`);
    }

    async updateUserOrganizationPermissions(userName, orgSlug, permissions) {
        return await this.putRequest(`/users/${encodeURIComponent(userName)}/orgs/${encodeURIComponent(orgSlug)}`, {
            permissions
        });
    }

    // User storage info
    async getUserStorageInfo(userName) {
        return await this.getRequest(`/users/${encodeURIComponent(userName)}/storage`);
    }

    // Change user password (admin function)
    async changeUserPassword(userName, currentPassword, newPassword) {
        const result = await this.putRequest(`/users/${encodeURIComponent(userName)}/changepwd`, {
            currentPassword,
            newPassword
        });
        // PUT /users/{userName}/changepwd returns 200 OK with empty body on success
        return result || {}; // Return empty object if result is null/undefined
    }

}