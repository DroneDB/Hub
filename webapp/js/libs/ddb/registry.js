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

const Organization = require('./organization');
const { DEFAULT_REGISTRY } = require('./constants');

let refreshTimers = {};

const throwError = (msg, status, extraData = {}) => {
    const e = new Error(msg);
    e.status = status;
    Object.assign(e, extraData);
    throw e;
};

// Credit https://stackoverflow.com/a/38552302
function parseJwt(token) {
    if (!token) return {};
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return {};
        var base64Url = parts[1];
        if (!base64Url) return {};
        var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        var jsonPayload = decodeURIComponent(atob(base64).split('').map(function (c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
    } catch (e) {
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
    } catch (e) {
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

module.exports = class Registry {
    constructor(url = "https://" + DEFAULT_REGISTRY) {
        this.url = url;
        this.eventListeners = {};
        this._refreshingToken = false;
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
                throw new Error(`Cannot login: ${e.message}`);
            }
        }
    }

    async storageInfo() {
        if (this.isLoggedIn()) {
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
        if (!this.isLoggedIn()) {
            throw new Error("logged out");
        }

        // Prevent concurrent refresh requests
        if (this._refreshingToken) {
            return;
        }

        this._refreshingToken = true;
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
                throw new Error("logged out");
            }
            throw error;
        } finally {
            this._refreshingToken = false;
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
        // Clear cached user management status
        delete this._userManagementEnabledCache;
        this.clearCredentials();
        this.emit("logout");
    }

    setCredentials(username, token, expires) {
        storage.setItem(`${this.url}_username`, username);
        storage.setItem(`${this.url}_jwt_token`, token);
        storage.setItem(`${this.url}_jwt_token_expires`, expires);

        // Set cookie if the URL matches the current window
        if (typeof window !== "undefined") {
            if (window.location.origin === this.url) {
                const expiresDate = new Date(expires * 1000).toUTCString();
                document.cookie = `jwtToken=${token};expires=${expiresDate};path=/`;
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
        if (this.isLoggedIn()) {
            return this._getUsernameFromStorage();
        }
        return null;
    }

    isAdmin() {
        if (this.isLoggedIn()) {
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
        if (!this.isLoggedIn())
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
        if (!this.isLoggedIn())
            throw new Error("not logged in");

        const formData = new FormData();
        formData.append('slug', slug);
        if (name !== undefined) formData.append('name', name);
        if (description !== undefined) formData.append('description', description);
        if (isPublic !== undefined) formData.append('isPublic', isPublic);
        return await this.putFormData(`/orgs/${slug}`, formData);
    }

    async getOrganizations() {
        const res = await this.getRequest(`/orgs`);
        return res.map(org => new Organization(this, org));
    }

    async deleteOrganization(orgSlug) {

        if (!this.isLoggedIn())
            throw new Error("not logged in");

        return await this.deleteRequest(`/orgs/${orgSlug}`);
    }

    // ==================== Organization Member Management ====================

    /**
     * Checks if organization member management feature is enabled
     * @returns {Promise<boolean>} Whether the feature is enabled
     */
    async isOrganizationMemberManagementEnabled() {
        try {
            const res = await this.getRequest('/orgs/features/member-management');
            return res.enabled === true;
        } catch (e) {
            console.error('Failed to check member management status:', e);
            return false;
        }
    }

    /**
     * Gets all members of an organization
     * @param {string} orgSlug - The organization slug
     * @returns {Promise<Array>} List of organization members
     */
    async getOrganizationMembers(orgSlug) {
        if (!this.isLoggedIn())
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
        if (!this.isLoggedIn())
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
        if (!this.isLoggedIn())
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
        if (!this.isLoggedIn())
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

    isLoggedIn() {
        const loggedIn = this.getAuthToken() !== null && this.getAuthTokenExpiration() > new Date();
        if (!loggedIn) this.clearCredentials();
        return loggedIn;
    }

    async makeRequest(endpoint, method = "GET", body = null, contentType = null, responseType = null) {
        // Input validation
        if (typeof endpoint !== 'string' || !endpoint) {
            throw new Error('Invalid endpoint: must be a non-empty string');
        }
        if (!endpoint.startsWith('/')) {
            throw new Error("Invalid endpoint: must start with '/'");
        }
        // Validate endpoint for dangerous patterns
        if (/\.\.[\/\\]/.test(endpoint) || /[\x00-\x1f]/.test(endpoint)) {
            throw new Error('Invalid endpoint: contains dangerous characters or patterns');
        }

        try {
            const headers = {};
            const authToken = this.getAuthToken();

            if (authToken) headers.Authorization = `Bearer ${authToken}`;

            const options = {
                method: method.toUpperCase(),
                headers
            };

            // Handle request body
            if (body !== null && body !== undefined) {
                if (contentType) {
                    // Explicit content type override
                    headers['Content-Type'] = contentType;
                    if (contentType === 'application/json') {
                        options.body = JSON.stringify(body);
                    } else {
                        options.body = body;
                    }
                } else if (body instanceof FormData) {
                    // Use FormData as-is (don't set Content-Type, let browser handle it)
                    options.body = body;
                } else if (typeof body === 'string') {
                    // Send as plain text
                    headers['Content-Type'] = 'text/plain';
                    options.body = body;
                } else if (typeof body === 'object') {
                    // Default: send objects as JSON (modern approach)
                    headers['Content-Type'] = 'application/json';
                    options.body = JSON.stringify(body);
                } else {
                    // For other types, send as-is
                    options.body = body;
                }
            }

            let response;
            try {
                response = await fetch(`${this.url}${endpoint}`, options);
            } catch (fetchError) {
                // Only network errors (connection refused, DNS failure, etc.) reach here
                // fetch() throws TypeError for network failures in standard implementations
                throwError(`Network error: ${fetchError.message}`, 0, { originalError: fetchError });
            }

            // Response handling errors are not caught here - they propagate as-is
            return await this._handleResponse(response, method, responseType);

        } catch (error) {
            // Re-throw errors that already have a status (our custom API errors)
            if (error.status !== undefined) {
                throw error;
            }
            // Wrap unexpected errors
            throwError(`Request failed: ${error.message}`, 0, { originalError: error });
        }
    }

    async _handleResponse(response, method, responseType = null) {
        const status = response.status;

        // Handle successful responses first
        if (status >= 200 && status < 300) {
            // No content responses
            if (status === 204) return true;

            // HEAD requests
            if (method.toUpperCase() === "HEAD") return true;

            // Try to parse response based on content type
            return await this._parseResponseBody(response, status, responseType);
        }

        // Handle specific error status codes
        switch (status) {
            case 400:
                await this._throwResponseError(response, "Bad Request", status);
                break;
            case 401:
                await this._throwResponseError(response, "Unauthorized", status);
                break;
            case 403:
                await this._throwResponseError(response, "Forbidden", status);
                break;
            case 404:
                throwError("Not found", 404);
                break;
            case 422:
                await this._throwResponseError(response, "Unprocessable Entity", status);
                break;
            case 429:
                await this._throwResponseError(response, "Too Many Requests", status);
                break;
            case 500:
                await this._throwResponseError(response, "Internal Server Error", status);
                break;
            case 502:
                await this._throwResponseError(response, "Bad Gateway", status);
                break;
            case 503:
                await this._throwResponseError(response, "Service Unavailable", status);
                break;
            default:
                // Handle other 4xx and 5xx errors
                if (status >= 400 && status < 500) {
                    await this._throwResponseError(response, "Client Error", status);
                } else if (status >= 500) {
                    await this._throwResponseError(response, "Server Error", status);
                } else {
                    await this._throwResponseError(response, "Unexpected Response", status);
                }
                break;
        }
    }

    /**
     * Extracts error message from a JSON response body.
     * Checks common error fields: 'error', 'message'.
     * @param {Object} json - The parsed JSON response
     * @returns {string|null} The error message if found, null otherwise
     */
    _extractErrorMessage(json) {
        if (!json || typeof json !== 'object') {
            return null;
        }
        return json.error || json.message || null;
    }

    /**
     * Parses the response body based on content type.
     * Note: This method also checks for error fields in successful HTTP responses (2xx)
     * because some APIs return 200 OK with an error in the body.
     * @param {Response} response - The fetch response object
     * @param {number} status - HTTP status code
     * @param {string|null} responseType - Force response type: 'text' to always return text, null for auto-detection
     */
    async _parseResponseBody(response, status, responseType = null) {
        const contentType = response.headers.get("Content-Type");

        try {
            // Force text response if explicitly requested (useful for downloading file contents)
            if (responseType === 'text') {
                return await response.text();
            }

            // Handle JSON responses
            if (contentType && contentType.toLowerCase().includes("application/json")) {
                const json = await response.json();

                // Check for error field in successful JSON responses
                // Some APIs return HTTP 200 but include an error in the response body
                const errorMessage = this._extractErrorMessage(json);
                if (errorMessage) {
                    throwError(errorMessage, status, json);
                }

                return json;
            }

            // Handle text responses
            if (contentType && contentType.toLowerCase().includes("text/")) {
                return await response.text();
            }

            // Handle responses with no content type or other content types
            if (!contentType || contentType.trim() === '') {
                // Try to read as text for empty content type
                const text = await response.text();

                // If empty response, return true for successful status
                if (!text || text.trim() === '') {
                    return true;
                }

                // Try to parse as JSON if it looks like JSON
                if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
                    try {
                        const json = JSON.parse(text);
                        // Check for error field (same as explicit JSON content-type handling)
                        const errorMessage = this._extractErrorMessage(json);
                        if (errorMessage) {
                            throwError(errorMessage, status, json);
                        }
                        return json;
                    } catch (e) {
                        // If JSON parsing fails, return as text
                        return text;
                    }
                }

                return text;
            }

            // For other content types, try to read as text
            return await response.text();

        } catch (error) {
            // Handle parsing errors
            if (error.status) {
                // Re-throw our custom errors
                throw error;
            } else {
                throwError(`Failed to parse response: ${error.message}`, status, { originalError: error });
            }
        }
    }

    /**
     * Throws an error based on the response body content.
     * Used for non-2xx HTTP responses to extract meaningful error messages.
     * Unlike _parseResponseBody(), this always throws - it's meant for error responses.
     */
    async _throwResponseError(response, defaultMessage, status) {
        const contentType = response.headers.get("Content-Type");

        try {
            if (contentType && contentType.toLowerCase().includes("application/json")) {
                const json = await response.json();
                const errorMessage = this._extractErrorMessage(json) || defaultMessage;
                throwError(errorMessage, status, json);
            } else if (contentType && contentType.toLowerCase().includes("text/")) {
                const text = await response.text();
                throwError(text || defaultMessage, status);
            } else {
                // For other content types or no content type, try text
                const text = await response.text();
                throwError(text || defaultMessage, status);
            }
        } catch (error) {
            if (error.status) {
                // Re-throw our custom errors
                throw error;
            } else {
                // If parsing fails, throw with default message
                throwError(defaultMessage, status);
            }
        }
    }

    async getRequest(endpoint) {
        return this.makeRequest(endpoint, "GET");
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
    async postFormData(endpoint, formData) {
        if (!(formData instanceof FormData))
            throw new Error('Expected FormData instance');
        return this.makeRequest(endpoint, "POST", formData);
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

    // Check if user management is enabled (cached to avoid repeated API calls)
    async isUserManagementEnabled() {
        // Return cached value if available
        if (this._userManagementEnabledCache !== undefined) {
            return this._userManagementEnabledCache;
        }

        // Fetch from server and cache the result
        const result = await this.getRequest('/users/management-enabled');
        this._userManagementEnabledCache = result;
        return result;
    }

    // Get detailed user information
    async usersDetailed() {
        return await this.getRequest('/users/detailed');
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