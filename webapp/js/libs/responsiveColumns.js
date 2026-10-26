// @ts-check
/**
 * Table columns that leave a narrow screen: a secondary column is hidden below a Bootstrap
 * breakpoint and shown as a table cell from that width up, so a phone keeps the columns that
 * identify a row and its actions. Every table (PrimeVue DataTable or plain <table>) collapses
 * through these helpers, so the header, the body and the loading skeleton of a column always
 * hide together.
 */

/**
 * @typedef {'sm'|'md'|'lg'|'xl'|'xxl'} Breakpoint  Bootstrap breakpoint the column appears from:
 *   sm 576px, md 768px, lg 992px, xl 1200px, xxl 1400px
 */

const BREAKPOINTS = Object.freeze(['sm', 'md', 'lg', 'xl', 'xxl']);

/**
 * The classes of a cell (<th>, <td> or a Column's header/body) shown from `breakpoint` up.
 * @param {Breakpoint} breakpoint
 * @returns {string} e.g. 'd-none d-md-table-cell'
 */
export function showFrom(breakpoint) {
    // A misspelt breakpoint would hide the column on every screen: fail where it is written
    if (!BREAKPOINTS.includes(breakpoint)) throw new Error(`Unknown breakpoint: ${breakpoint}`);
    return `d-none d-${breakpoint}-table-cell`;
}

/**
 * The header and body classes of a PrimeVue Column shown from `breakpoint` up,
 * to spread on it: <Column v-bind="columnFrom('md')">.
 * @param {Breakpoint} breakpoint
 * @returns {{ headerClass: string, bodyClass: string }}
 */
export function columnFrom(breakpoint) {
    const cls = showFrom(breakpoint);
    return { headerClass: cls, bodyClass: cls };
}
