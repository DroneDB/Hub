// @ts-check
/**
 * The filters, the page and the order of the admin Tasks list (FR-PRC-28), as the page keeps them in
 * the address (`?toolId=&state=&userId=&skip=&take=&sortField=&sortOrder=`): a reload or a shared link
 * shows the same list. A key at its default is left out of the address.
 */

/** The columns the server orders by (the whitelist of the Registry) */
export const TASK_SORT_FIELDS = Object.freeze(['createdAt', 'state', 'toolId']);

/** The page sizes of the list */
export const TASK_PAGE_SIZES = Object.freeze([10, 25, 50, 100]);

const DEFAULT_SORT_FIELD = 'createdAt';
const DEFAULT_SORT_ORDER = -1;
const DEFAULT_TAKE = 10;

/**
 * @typedef {object} TaskFilters
 * @property {string} toolId  '' for all tools
 * @property {string} state   '' for all states
 * @property {string} userId  '' for all users
 * @property {number} skip
 * @property {number} take
 * @property {string} sortField  one of TASK_SORT_FIELDS
 * @property {1|-1} sortOrder    1 ascending, -1 descending
 */

/** @param {any} value the first value of a query key */
const first = value => (Array.isArray(value) ? value[0] : value);

/**
 * The filters of an address' query; anything that is not valid is the default, and `skip` is the
 * start of the page it falls in.
 * @param {Record<string, any>} query
 * @returns {TaskFilters}
 */
export function readTaskFilters(query = {}) {
    const text = key => (typeof first(query[key]) === 'string' ? first(query[key]) : '');
    const skip = Number.parseInt(text('skip'), 10);
    const take = Number.parseInt(text('take'), 10);
    const sortField = text('sortField');
    const size = TASK_PAGE_SIZES.includes(take) ? take : DEFAULT_TAKE;
    return {
        toolId: text('toolId'),
        state: text('state'),
        userId: text('userId'),
        // The start of a page: an offset inside a page (?skip=7) is the page it falls in
        skip: Number.isInteger(skip) && skip > 0 ? Math.floor(skip / size) * size : 0,
        take: size,
        sortField: TASK_SORT_FIELDS.includes(sortField) ? sortField : DEFAULT_SORT_FIELD,
        sortOrder: text('sortOrder') === 'asc' ? 1 : DEFAULT_SORT_ORDER
    };
}

/**
 * The query keys to write for `filters` (replaceQueryKeys): null removes a key at its default.
 * @param {TaskFilters} filters
 * @returns {Record<string, string|null>}
 */
export function taskFilterKeys(filters) {
    return {
        toolId: filters.toolId || null,
        state: filters.state || null,
        userId: filters.userId || null,
        skip: filters.skip > 0 ? String(filters.skip) : null,
        take: filters.take !== DEFAULT_TAKE ? String(filters.take) : null,
        sortField: filters.sortField !== DEFAULT_SORT_FIELD ? filters.sortField : null,
        sortOrder: filters.sortOrder === 1 ? 'asc' : null
    };
}

/**
 * The start of the last page of `total` tasks, `take` a page: where a list whose `skip` is past the end
 * (a link to page 100 of a list that has since shrunk) goes back to.
 * @param {number} total
 * @param {number} take
 * @returns {number}
 */
export function lastPageSkip(total, take) {
    if (!(total > 0) || !(take > 0)) return 0;
    return Math.floor((total - 1) / take) * take;
}

/**
 * Whether a filter (a tool, a state, a user) hides tasks; the page and the order do not.
 * @param {Pick<TaskFilters, 'toolId'|'state'|'userId'>} filters
 */
export function hasTaskFilters(filters) {
    return !!(filters.toolId || filters.state || filters.userId);
}
