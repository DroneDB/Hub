import reg from './sharedRegistry';

// Extend the registry with additional user management methods
const extendedRegistry = {
    ...reg,

    // Check if user management is enabled
    async isUserManagementEnabled() {
        return await reg.getRequest('/users/management-enabled');
    },

    // Get detailed user information
    async usersDetailed() {
        return await reg.getRequest('/users/detailed');
    },

    // Get user roles
    async userRoles() {
        return await reg.getRequest('/users/roles');
    },

    // User creation with email support
    async addUser(username, password, roles = [], email = '') {
        return await reg.postRequest('/users', {
            userName: username,
            email: email,
            password,
            roles: roles
        });
    },

    // User update method (email and roles)
    async updateUser(userName, email, roles) {
        return await reg.putRequest(`/users/${encodeURIComponent(userName)}`, {
            email: email,
            roles: roles
        });
    },

    // Role management
    async createRole(roleName) {
        return await reg.postRequest('/users/roles', {roleName: roleName});
    },

    async deleteRole(roleName) {
        return await reg.deleteRequest(`/users/roles/${encodeURIComponent(roleName)}`);
    },

    async updateUserRoles(userName, roles) {
        const result = await reg.putRequest(`/users/${encodeURIComponent(userName)}`, {
            email: null, // Will be handled by the updateUser method instead
            roles: roles
        });
        // PUT /users/{userName} returns 200 OK with empty body on success
        return result || {}; // Return empty object if result is null/undefined
    },

    // User organization management
    async getUserOrganizations(userName) {
        return await reg.getRequest(`/users/${encodeURIComponent(userName)}/orgs`);
    },

    async setUserOrganizations(userName, orgSlugs) {
        const formData = new FormData();
        if (orgSlugs && orgSlugs.length > 0) {
            orgSlugs.forEach(slug => formData.append('orgSlugs', slug));
        }
        return await reg.putFormData(`/users/${encodeURIComponent(userName)}/orgs`, formData);
    },

    // Get all organizations
    async getOrganizations() {
        return await reg.getRequest('/orgs');
    },

    // Create organization
    async createOrganization(orgData) {
        const formData = new FormData();
        if (orgData.slug) formData.append('slug', orgData.slug);
        if (orgData.name) formData.append('name', orgData.name);
        if (orgData.description) formData.append('description', orgData.description);
        if (orgData.isPublic !== undefined) formData.append('isPublic', orgData.isPublic);

        return await reg.postFormData('/orgs', formData);
    },

    // Delete organization
    async deleteOrganization(orgSlug) {
        return await reg.deleteRequest(`/orgs/${encodeURIComponent(orgSlug)}`);
    },

    // User storage info
    async getUserStorageInfo(userName) {
        return await reg.getRequest(`/users/${encodeURIComponent(userName)}/storage`);
    },

    // Delete user
    async deleteUser(userName) {
        return await reg.deleteRequest(`/users/${encodeURIComponent(userName)}`);
    },

    // Change user password (admin function)
    async changeUserPassword(userName, currentPassword, newPassword) {
        const result = await reg.putRequest(`/users/${encodeURIComponent(userName)}/changepwd`, {
            currentPassword,
            newPassword
        });
        // PUT /users/{userName}/changepwd returns 200 OK with empty body on success
        return result || {}; // Return empty object if result is null/undefined
    }
};

export default extendedRegistry;
