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
 * The width in px each breakpoint starts at. A phone layout is below `sm`, a tablet layout below
 * `lg`: the toolbars that move tools into an overflow menu (HubToolbar) read these too.
 * @type {Readonly<Record<Breakpoint, number>>}
 */
export const BREAKPOINT_PX = Object.freeze({ sm: 576, md: 768, lg: 992, xl: 1200, xxl: 1400 });

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

// ---- Stacked cards (D-026, FR-XC-20) ---------------------------------------------------------

/**
 * Below this breakpoint a table is one stacked card per row (the one renderer is `.stacked-table`
 * in css/app.scss, which reads the same 576 px). From it up the table is a table: its secondary
 * columns come in at their own breakpoint.
 * @type {Breakpoint}
 */
export const STACK_BELOW = 'sm';

/** The class of a table (a plain <table>, or the DataTable root) that stacks below `sm` */
export const STACKED_TABLE_CLASS = 'stacked-table';

/** The media query of the stacked cards: below `sm`, as the renderer of css/app.scss (575.98 px) */
export const STACKED_MEDIA_QUERY = `(max-width: ${BREAKPOINT_PX[STACK_BELOW] - 0.02}px)`;

/** The media query of the tablet layout: below `lg` (991.98 px), where a side panel opens over the content as a drawer */
export const TABLET_MEDIA_QUERY = `(max-width: ${BREAKPOINT_PX.lg - 0.02}px)`;

/**
 * The `pt` of a sortable PrimeVue Column of a stacked table: on a phone the header is hidden (a card has
 * no header), so its sortable cells leave the tab order, where they would take an invisible focus.
 * @param {boolean} stacked  the cards are shown (useStackedLayout)
 * @returns {Record<string, any>}
 */
export function sortableHeaderPt(stacked) {
    return stacked ? { headerCell: { tabindex: '-1' } } : {};
}

/**
 * The classes of a stacked table's cell (<th> or <td>): on a phone it is always shown (a card shows
 * every field), and from `sm` up it is a table cell that appears at `breakpoint`.
 * @param {Breakpoint} [breakpoint]  the width the column joins the table at; none: every width
 * @returns {string} e.g. 'stack-col stack-col-md'
 */
export function stackedFrom(breakpoint) {
    if (breakpoint === undefined || breakpoint === STACK_BELOW) return 'stack-col';
    if (!BREAKPOINTS.includes(breakpoint)) throw new Error(`Unknown breakpoint: ${breakpoint}`);
    return `stack-col stack-col-${breakpoint}`;
}

/**
 * The attributes of a stacked table's <td>: the cell classes, and the label the card prints before
 * the value (the header is hidden on a phone). A cell without a label (the name, the actions)
 * takes the whole width of the card.
 * @param {string} [label]
 * @param {Breakpoint} [breakpoint]
 * @returns {{ class: string, 'data-label'?: string }}
 */
export function stackedCell(label, breakpoint) {
    return label ? { class: stackedFrom(breakpoint), 'data-label': label } : { class: stackedFrom(breakpoint) };
}

/**
 * The props of a PrimeVue Column of a stacked table, to spread on it:
 * <Column header="Email" v-bind="stackedColumn('Email', 'lg')">. `bodyCell` adds attributes to the
 * body cell (a style, a class), `pt` other parts of the Column (its header content).
 * @param {string} [label]  the card's label of the value; none for the cell that needs none
 * @param {Breakpoint} [breakpoint]
 * @param {Record<string, any>} [bodyCell]
 * @param {Record<string, any>} [pt]
 * @returns {{ headerClass: string, bodyClass: string, pt: Record<string, any> }}
 */
export function stackedColumn(label, breakpoint, bodyCell = {}, pt = {}) {
    const cls = stackedFrom(breakpoint);
    return {
        headerClass: cls,
        bodyClass: cls,
        pt: { ...pt, bodyCell: label ? { 'data-label': label, ...bodyCell } : { ...bodyCell } }
    };
}

/**
 * A slug as the pieces it may wrap between: after each hyphen, never inside a word. The cell renders
 * them with a <wbr> between the pieces (FR-ADM-11).
 * @param {string} slug
 * @returns {string[]} 'my-org-x' gives ['my-', 'org-', 'x']
 */
export function breakAfterHyphens(slug) {
    return String(slug ?? '').match(/[^-]+-*|-+/g) ?? [];
}
