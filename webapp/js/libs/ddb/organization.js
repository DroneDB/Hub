/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Dataset from './dataset';
import Visibility from './visibility';

export default class Organization {
    constructor(registry, org) {
        this.registry = registry;
        this.org = org;
    }

    /**
     * The datasets of the organization.
     * @param {object} [opts]
     * @param {boolean} [opts.includeThumbnailCheck] whether each dataset has a cover (costs a
     *   server-side check per dataset: combine with `slugs` for the rows shown)
     * @param {string[]} [opts.slugs] only these datasets
     */
    async datasets(opts) {
        return this.registry.getRequest(this.datasetsUrl(opts));
    }

    /**
     * One page of the datasets, searched and sorted by the server.
     * @param {{skip: number, take: number, q?: string, sort?: string, desc?: boolean}} query (datasetListQuery)
     * @param {object} [opts]
     * @param {boolean} [opts.includeThumbnailCheck] whether each dataset of the page has a cover
     * @param {AbortSignal} [opts.signal]
     * @returns {Promise<{items: Array, total: number}>} the page and how many datasets match
     */
    async datasetsPage(query, opts = {}) {
        let total = null;
        const items = await this.registry.getRequest(this.datasetsUrl({ ...query, includeThumbnailCheck: opts.includeThumbnailCheck }), {
            cache: false,
            signal: opts.signal,
            // A missing header (a server without paging) leaves the total to the items
            onHeaders: headers => {
                const count = headers.get('X-Total-Count');
                if (count != null) total = Number(count);
            }
        });
        return { items, total: Number.isFinite(total) ? total : items.length };
    }

    datasetsUrl(opts) {
        const params = new URLSearchParams();
        if (opts?.includeThumbnailCheck) params.set('includeThumbnailCheck', 'true');
        if (opts?.slugs?.length) params.set('slugs', opts.slugs.join(','));
        for (const key of ['skip', 'take', 'q', 'sort']) {
            if (opts?.[key] !== undefined && opts[key] !== null && opts[key] !== '') params.set(key, String(opts[key]));
        }
        if (opts?.desc) params.set('desc', 'true');
        const query = params.toString();
        return `/orgs/${this.org}/ds${query ? '?' + query : ''}`;
    }

    async info(){
        return this.registry.getRequest(`/orgs/${this.org}/`);
    }

    Dataset(ds) {
        return new Dataset(this.registry, this.org, ds);
    }

    async createDataset(slug, name, visibility = Visibility.PRIVATE, tagline = null) {
        const formData = new FormData();
        formData.append('slug', slug);
        if (name) formData.append('name', name);
        if (visibility !== undefined) formData.append('visibility', visibility);
        if (tagline) formData.append('tagline', tagline);
        return await this.registry.postFormData(`/orgs/${this.org}/ds`, formData);
    }

    // Import sources enabled on this server (registered AND allow-listed).
    async importSources() {
        return await this.registry.getRequest(`/orgs/${this.org}/import/sources`);
    }

    // Probe an import source (reachability, estimated size, suggested name/slug) without creating anything.
    async verifyImport(sourceType, params) {
        return await this.registry.postRequest(`/orgs/${this.org}/import/verify`, { sourceType, params });
    }

    // Browse the remote structure of an import source (organizations or datasets) without creating anything.
    // browseType: 'organizations' | 'datasets'
    async browseImport(sourceType, params, browseType) {
        return await this.registry.postRequest(`/orgs/${this.org}/import/browse`, {
            sourceType,
            params,
            browseType
        });
    }

    // Create an empty dataset and start importing the source into it. Returns { taskId, orgSlug, dsSlug, datasetUrl }.
    async createImport({ sourceType, params, slug, name, visibility }) {
        return await this.registry.postRequest(`/orgs/${this.org}/import`, {
            sourceType, params, slug, name, visibility
        });
    }

};
