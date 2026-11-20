// @ts-check
/**
 * organizationList - how the organizations page shows its list: the page holds every organization
 * the user can see, so it sorts them in the browser (the datasets of an organization are sorted
 * by the server, see datasetList.js) and builds each row from the server's organization the same
 * way whether it was listed or just created.
 */
import { compareText } from '@/libs/compareText';
import { parseTimestamp } from '@/libs/utils';

/** Fields the list can be sorted by. */
export const ORG_SORT_FIELDS = Object.freeze(['name', 'creationDate', 'lastModified', 'datasetCount']);

/** What the sort controls call each field. */
export const ORG_SORT_LABELS = Object.freeze({
    name: 'Name',
    creationDate: 'Creation date',
    lastModified: 'Last modified',
    datasetCount: 'Number of datasets'
});

/** The sort fields as the options of a select. */
export const ORG_SORT_OPTIONS = Object.freeze(ORG_SORT_FIELDS.map(value => ({ value, label: ORG_SORT_LABELS[value] })));

/** The two sort directions. */
export const SORT_DIRECTIONS = Object.freeze(['asc', 'desc']);

/**
 * The row of an organization from the server's organization. The date of the last change and the
 * count of datasets are null for an organization the user is not a member of: they stay null
 * (unknown), never 0.
 * @param {any} org the server's organization
 */
export function organizationRow(org) {
    return {
        slug: org.slug,
        name: org.name,
        editing: false,
        deleting: false,
        description: org.description,
        creationDate: parseTimestamp(org.creationDate),
        lastModified: parseTimestamp(org.lastModified),
        datasetCount: Number.isFinite(org.datasetCount) ? org.datasetCount : null,
        owner: org.owner,
        isPublic: org.isPublic,
        permissions: org.permissions
    };
}

/** @param {unknown} value @returns {value is number} */
const known = value => typeof value === 'number' && Number.isFinite(value);

/**
 * The organizations ordered by `column`, in `direction`: a new array (the list is not changed),
 * stable, with the organizations that have no value for a date or a count after the others in
 * both directions, and equal ones ordered by slug. Names compare the way people read them
 * (compareText) and an organization without a name sorts as its slug, which is what its card shows.
 * An unknown column sorts by name.
 * @template {{ slug: string, name?: string|null, creationDate?: number|null, lastModified?: number|null, datasetCount?: number|null }} T
 * @param {readonly T[]} list
 * @param {string} column one of ORG_SORT_FIELDS
 * @param {'asc'|'desc'|string} direction
 * @returns {T[]}
 */
export function sortOrganizations(list, column, direction) {
    const sign = direction === 'desc' ? -1 : 1;
    const field = ORG_SORT_FIELDS.includes(column) ? column : 'name';

    /** @param {T} a @param {T} b */
    function compareField(a, b) {
        if (field === 'name') return sign * compareText(a.name || a.slug, b.name || b.slug);
        const x = /** @type {any} */ (a)[field];
        const y = /** @type {any} */ (b)[field];
        if (!known(x) || !known(y)) return known(x) ? -1 : known(y) ? 1 : 0;
        return sign * (x - y);
    }

    return [...list].sort((a, b) => compareField(a, b) || compareText(a.slug, b.slug));
}
