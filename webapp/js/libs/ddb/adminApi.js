/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * User, role and task administration (HQ-05, moved out of registry.js): `reg.admin`.
 */

export default class AdminApi {
    /** @param {import('./registry').default} registry */
    constructor(registry) {
        this.registry = registry;
    }

    async users() {
        return await this.registry.getRequest(`/users`);
    }

    async userRoles() {
        return await this.registry.getRequest(`/users/roles`);
    }

    async addUser(username, password, roles = [], email = '') {
        return await this.registry.postRequest('/users', {
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

        return await this.registry.deleteRequest(url);
    }

    // Get detailed user information
    async usersDetailed() {
        return await this.registry.getRequest('/users/detailed');
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
        return this.registry.getRequest(`/sys/tasks?${q}`);
    }

    /**
     * Deletes a concluded task from the global admin task list (admin only).
     * @param {string} id Task id
     * @returns {Promise<Object>} { deleted }
     */
    async adminDeleteTask(id) {
        if (!id) throw new Error('Invalid task id');
        return this.registry.postRequest(`/sys/tasks/${encodeURIComponent(id)}/delete`, {});
    }

    // User update method (email and roles)
    async updateUser(userName, email, roles) {
        return await this.registry.putRequest(`/users/${encodeURIComponent(userName)}`, {
            email: email,
            roles: roles
        });
    }

    // Role management
    async createRole(roleName) {
        return await this.registry.postRequest('/users/roles', {roleName: roleName});
    }

    async deleteRole(roleName) {
        return await this.registry.deleteRequest(`/users/roles/${encodeURIComponent(roleName)}`);
    }

    async updateUserRoles(userName, roles) {
        const result = await this.registry.putRequest(`/users/${encodeURIComponent(userName)}`, {
            email: null, // Will be handled by the updateUser method instead
            roles: roles
        });
        // PUT /users/{userName} returns 200 OK with empty body on success
        return result || {}; // Return empty object if result is null/undefined
    }

    // User organization management
    async getUserOrganizations(userName) {
        return await this.registry.getRequest(`/users/${encodeURIComponent(userName)}/orgs`);
    }

    async addUserToOrganization(userName, orgSlug, permissions) {
        return await this.registry.postRequest(`/users/${encodeURIComponent(userName)}/orgs`, {
            orgSlug,
            permissions
        });
    }

    async removeUserFromOrganization(userName, orgSlug) {
        return await this.registry.deleteRequest(`/users/${encodeURIComponent(userName)}/orgs/${encodeURIComponent(orgSlug)}`);
    }

    async updateUserOrganizationPermissions(userName, orgSlug, permissions) {
        return await this.registry.putRequest(`/users/${encodeURIComponent(userName)}/orgs/${encodeURIComponent(orgSlug)}`, {
            permissions
        });
    }

    // User storage info
    async getUserStorageInfo(userName) {
        return await this.registry.getRequest(`/users/${encodeURIComponent(userName)}/storage`);
    }

    // Change user password (admin function)
    async changeUserPassword(userName, currentPassword, newPassword) {
        const result = await this.registry.putRequest(`/users/${encodeURIComponent(userName)}/changepwd`, {
            currentPassword,
            newPassword
        });
        // PUT /users/{userName}/changepwd returns 200 OK with empty body on success
        return result || {}; // Return empty object if result is null/undefined
    }
}
