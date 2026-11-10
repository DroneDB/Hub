/**
 * User, role and task administration: `reg.admin`.
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
     * @param {string} [filter.sortField] the column to order by: createdAt (the default), state or toolId
     * @param {'asc'|'desc'} [filter.sortOrder] the direction (descending by default)
     * @returns {Promise<Object>} { items, total, skip, take }
     */
    async adminTasks({ toolId, state, userId, skip = 0, take = 50, sortField, sortOrder } = {}) {
        const q = new URLSearchParams();
        if (toolId) q.append('toolId', toolId);
        if (state) q.append('state', state);
        if (userId) q.append('userId', userId);
        q.append('skip', String(skip));
        q.append('take', String(take));
        if (sortField) q.append('sortField', sortField);
        if (sortOrder) q.append('sortOrder', sortOrder);
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

    /**
     * Updates a user (admin only): the roles and, when given, the e-mail address. An `undefined` e-mail is left out of the
     * request, and the Registry keeps the address as it is (also when it manages the profile itself); an empty one removes it.
     * @param {string} userName
     * @param {string|undefined} email
     * @param {string[]} roles
     */
    async updateUser(userName, email, roles) {
        /** @type {{ email?: string, roles: string[] }} */
        const body = { roles };
        if (email !== undefined) body.email = email;
        return await this.registry.putRequest(`/users/${encodeURIComponent(userName)}`, body);
    }

    /**
     * Sets or removes the storage quota of a user (FR-ADM-16). Only the quota key of the user's metadata is sent: the Registry
     * merges it into the metadata, which keeps its other keys. This is the one place that names the key (`MagicStrings.MaxStorageKey`).
     * @param {string} userName
     * @param {number|null} megabytes  the quota in MB; null removes it (no limit)
     */
    async setUserQuota(userName, megabytes) {
        return await this.registry.postRequest(`/users/${encodeURIComponent(userName)}/meta`, { maxStorageMB: megabytes ?? null });
    }

    /**
     * Disables a user: they can no longer sign in (the server adds the system role 'deactivated').
     * 204; 404 for an unknown user, 400 for your own account or the last active admin.
     * @param {string} userName
     */
    async disableUser(userName) {
        return await this.registry.postRequest(`/users/${encodeURIComponent(userName)}/disable`, {});
    }

    /**
     * Enables a disabled user (the server removes the system role 'deactivated'). 204; 404 for an unknown user.
     * @param {string} userName
     */
    async enableUser(userName) {
        return await this.registry.postRequest(`/users/${encodeURIComponent(userName)}/enable`, {});
    }

    // Role management
    async createRole(roleName) {
        return await this.registry.postRequest('/users/roles', {roleName: roleName});
    }

    async deleteRole(roleName) {
        return await this.registry.deleteRequest(`/users/roles/${encodeURIComponent(roleName)}`);
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
