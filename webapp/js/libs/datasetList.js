/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * datasetListQuery - the server page the organization page asks for: the server
 * searches, sorts and pages the datasets, and checks the covers of that page only, so the
 * browser receives and loads the rows it shows and nothing else.
 */

// Sort fields of GET /orgs/{org}/ds (DatasetListQuery on the server)
const DATASET_SORT_FIELDS = ['name', 'creationDate', 'entries', 'size', 'visibility'];

/**
 * @param {object} view what the page shows
 * @param {number} view.page 1-based page
 * @param {number} view.pageSize rows per page
 * @param {string} [view.search] search text (name, slug, tagline)
 * @param {string} [view.sortColumn] one of DATASET_SORT_FIELDS (default name)
 * @param {'asc'|'desc'} [view.sortDirection]
 * @returns {{skip: number, take: number, q?: string, sort: string, desc: boolean}}
 */
export function datasetListQuery({ page, pageSize, search, sortColumn, sortDirection }) {
    const take = Math.max(1, pageSize | 0);
    const skip = (Math.max(1, page | 0) - 1) * take;
    const q = (search || '').trim();
    return {
        skip,
        take,
        ...(q ? { q } : {}),
        sort: DATASET_SORT_FIELDS.includes(sortColumn) ? sortColumn : 'name',
        desc: sortDirection === 'desc'
    };
}
