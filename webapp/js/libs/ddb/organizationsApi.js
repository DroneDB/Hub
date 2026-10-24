/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Organisations and their members (HQ-05, moved out of registry.js): `reg.orgs`.
 * Datasets of one organisation are reached with `reg.Organization(slug)`.
 */
import Organization from './organization';

export default class OrganizationsApi {
    /** @param {import('./registry').default} registry */
    constructor(registry) {
        this.registry = registry;
    }

    async createOrganization(slugOrData, name, description, isPublic) {
        if (!this.registry.ensureLoggedIn())
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

        return await this.registry.postFormData('/orgs', formData);
    }

    async updateOrganization(slug, name, description, isPublic) {
        if (!this.registry.ensureLoggedIn())
            throw new Error("not logged in");

        const formData = new FormData();
        formData.append('slug', slug);
        if (name !== undefined) formData.append('name', name);
        if (description !== undefined) formData.append('description', description);
        if (isPublic !== undefined) formData.append('isPublic', isPublic);
        return await this.registry.putFormData(`/orgs/${slug}`, formData);
    }

    async getOrganizations(ownedOnly = false) {
        const res = await this.registry.getRequest(`/orgs${ownedOnly ? '?ownedOnly=true' : ''}`);
        return res.map(org => new Organization(this.registry, org));
    }

    async deleteOrganization(orgSlug) {

        if (!this.registry.ensureLoggedIn())
            throw new Error("not logged in");

        return await this.registry.deleteRequest(`/orgs/${orgSlug}`);
    }

    /**
     * Gets all members of an organization
     * @param {string} orgSlug - The organization slug
     * @returns {Promise<Array>} List of organization members
     */
    async getOrganizationMembers(orgSlug) {
        if (!this.registry.ensureLoggedIn())
            throw new Error("not logged in");

        return await this.registry.getRequest(`/orgs/${encodeURIComponent(orgSlug)}/members`);
    }

    /**
     * Adds a member to an organization
     * @param {string} orgSlug - The organization slug
     * @param {string} userName - The username to add
     * @param {number} permissions - Permission level (0=ReadOnly, 1=ReadWrite, 2=ReadWriteDelete, 3=Admin)
     * @returns {Promise<void>}
     */
    async addOrganizationMember(orgSlug, userName, permissions = 1) {
        if (!this.registry.ensureLoggedIn())
            throw new Error("not logged in");

        return await this.registry.postRequest(`/orgs/${encodeURIComponent(orgSlug)}/members`, {
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
        if (!this.registry.ensureLoggedIn())
            throw new Error("not logged in");

        return await this.registry.putRequest(
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
        if (!this.registry.ensureLoggedIn())
            throw new Error("not logged in");

        return await this.registry.deleteRequest(
            `/orgs/${encodeURIComponent(orgSlug)}/members/${encodeURIComponent(userName)}`
        );
    }
}
