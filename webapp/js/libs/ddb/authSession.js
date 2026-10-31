/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The signed-in session of a Registry client: sign-in
 * and sign-out, the JWT and its expiry in storage, the same-origin cookie, the refresh
 * timer. `Registry` keeps the public methods (reg.login(), reg.getAuthToken(), ...) and
 * delegates here.
 */
import { ApiError } from './apiError';
import { safeStorage as storage } from '../preferences';

const refreshTimers = {};

/** How long sign-in waits for the Registry to expire its auth cookie before going on without it. */
export const EXPIRE_COOKIE_TIMEOUT_MS = 5000;

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

export default class AuthSession {
    /** @param {import('./registry').default} registry */
    constructor(registry) {
        this.registry = registry;
        this._refreshPromise = null;
    }

    // Login
    async login(username, password, xAuthToken = null) {
        const formData = new FormData();
        if (username) formData.append('username', username);
        if (password) formData.append('password', password);
        if (xAuthToken) formData.append('token', xAuthToken);

        try {
            const res = await this.registry.postFormData('/users/authenticate', formData);

            if (res && res.token) {
                // A server-set (HttpOnly) cookie of the previous user would silently win over the
                // one setCredentials writes: have it expired first
                await this.expireServerCookie();
                this.setCredentials(res.username, res.token, res.expires);
                this.setAutoRefreshToken();
                this.registry.emit("login", res.username);

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

    async changePwd(oldPassword, newPassword) {
        const formData = new FormData();
        formData.append('oldPassword', oldPassword);
        formData.append('newPassword', newPassword);
        const res = await this.registry.postFormData('/users/changePwd', formData);
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
            const res = await this.registry.postRequest('/users/authenticate/refresh');

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
        if (refreshTimers[this.registry.url]) {
            clearTimeout(refreshTimers[this.registry.url]);
            delete refreshTimers[this.registry.url];
        }

        refreshTimers[this.registry.url] = setTimeout(async () => {
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
        if (refreshTimers[this.registry.url]) {
            clearTimeout(refreshTimers[this.registry.url]);
            delete refreshTimers[this.registry.url];
        }
        // Clear cached features
        this.registry.features.clear();
        this.clearCredentials();
        this.expireServerCookie();
        this.registry.emit("logout");
    }

    /**
     * The server sets the auth cookie HttpOnly on a Basic auth sign-in, and script can neither
     * clear nor overwrite that one (the browser drops a script-written cookie of the same name):
     * ask the Registry to expire it. Best effort: the returned promise always resolves, at the
     * latest after EXPIRE_COOKIE_TIMEOUT_MS (the request is then aborted). Sign-in awaits it
     * before writing its own cookie; sign-out does not wait.
     * @returns {Promise<void>}
     */
    expireServerCookie() {
        if (!this._isSameOrigin()) return Promise.resolve();
        const abort = new AbortController();
        const timer = setTimeout(() => abort.abort(), EXPIRE_COOKIE_TIMEOUT_MS);
        return this.registry.fetchRaw('/users/logout', { method: 'POST', signal: abort.signal })
            .then(() => { }, () => { /* best effort */ })
            .finally(() => clearTimeout(timer));
    }

    /** Whether this registry is the page's origin, so the auth cookie is the page's. */
    _isSameOrigin() {
        return typeof window !== "undefined" && window.location.origin === this.registry.url;
    }

    setCredentials(username, token, expires) {
        // Cached answers belong to the previous identity
        if (storage.getItem(`${this.registry.url}_username`) !== username) this.registry.invalidateCache();
        storage.setItem(`${this.registry.url}_username`, username);
        storage.setItem(`${this.registry.url}_jwt_token`, token);
        storage.setItem(`${this.registry.url}_jwt_token_expires`, expires);

        // Set cookie if the URL matches the current window
        if (this._isSameOrigin()) {
            const expiresDate = new Date(expires * 1000).toUTCString();
            const isSecure = window.location.protocol === 'https:';
            document.cookie = `jwtToken=${token};expires=${expiresDate};path=/;SameSite=Strict${isSecure ? ';Secure' : ''}`;
        }
    }

    getAuthToken() {
        const expiration = this.getAuthTokenExpiration();
        if (expiration && expiration > new Date()) {
            return storage.getItem(`${this.registry.url}_jwt_token`);
        }
        return null;
    }

    /**
     * Get username from storage without triggering side effects.
     * Used internally to avoid circular calls with isLoggedIn().
     */
    _getUsernameFromStorage() {
        return storage.getItem(`${this.registry.url}_username`);
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
        const expires = storage.getItem(`${this.registry.url}_jwt_token_expires`);
        if (expires) {
            return new Date(expires * 1000);
        }
        return null;
    }

    clearCredentials() {
        this.registry.invalidateCache();
        storage.removeItem(`${this.registry.url}_jwt_token`);
        storage.removeItem(`${this.registry.url}_jwt_token_expires`);
        storage.removeItem(`${this.registry.url}_username`);

        // Clear cookie if needed
        if (this._isSameOrigin()) {
            document.cookie = `jwtToken=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
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
}
