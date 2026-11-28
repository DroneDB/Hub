// @ts-check
/**
 * The defaults of the report settings: the schema and the template of an organization that has
 * stored none, and the names of the sections. They are data, with no client of the Registry, so the
 * report model (which the PDF renderer runs with no DOM) can use them; reportSettings re-exports
 * them with the endpoints and the rules of the settings dialog.
 */
import { PRIMARY } from '@/libs/palette';
import { SECTION_KINDS } from '@/libs/reports/reportDefinition';

/** @typedef {{ id: string, name: string, colour: string }} SchemaChoice  a category or a severity */
/** @typedef {{ id: string, name: string, closed: boolean }} SchemaStatus */
/** @typedef {{ categories: SchemaChoice[], severities: SchemaChoice[], statuses: SchemaStatus[] }} AnnotationSchema */
/** @typedef {'cover' | 'summary' | 'overview' | 'tables' | 'items' | 'notes'} SectionKind */
/**
 * @typedef {object} ReportTemplate
 * @property {string} id
 * @property {string} name
 * @property {string | null} logo  the asset name; only the logo endpoints set it
 * @property {string} primary
 * @property {string} accent
 * @property {'A4' | 'Letter'} paper
 * @property {'portrait' | 'landscape'} orientation
 * @property {string} headerText
 * @property {string} footerText
 * @property {string} disclaimer  markdown
 * @property {SectionKind[]} defaultSections
 * @property {BreakdownChart} [breakdownChart]  how the summary draws its counts; a template stored before it existed has
 *   none and draws bars (`breakdownChartOf`)
 */
/** @typedef {'bars' | 'donuts'} BreakdownChart */

/**
 * How the summary of a report can draw its counts by kind, category, severity and status: a bar per count, as long as
 * the count is of the largest of its group, or a donut per group with a slice per count.
 */
export const BREAKDOWN_CHARTS = Object.freeze(/** @type {BreakdownChart[]} */ (['bars', 'donuts']));

/**
 * How a template draws the counts of the summary: bars when it names none (it was stored before the choice existed) or
 * names one this Hub does not know.
 * @param {{ breakdownChart?: unknown } | null | undefined} template
 * @returns {BreakdownChart}
 */
export const breakdownChartOf = template =>
    BREAKDOWN_CHARTS.includes(/** @type {any} */ (template?.breakdownChart)) ? /** @type {BreakdownChart} */ (template?.breakdownChart) : 'bars';

/** What the settings dialog and the report call the sections (their kinds and order are the definition's: SECTION_KINDS). */
export const SECTION_LABELS = Object.freeze(/** @type {Record<SectionKind, string>} */ ({
    cover: 'Cover',
    summary: 'Summary',
    overview: 'Overview map',
    tables: 'Tables',
    items: 'Items',
    notes: 'Notes'
}));

/** @type {<T>(value: T) => T} */
function deepFreeze(value) {
    if (value && typeof value === 'object') {
        for (const inner of Object.values(value)) deepFreeze(inner);
        Object.freeze(value);
    }
    return value;
}

/** The schema of an organization that has stored none. */
export const DEFAULT_SCHEMA = deepFreeze(/** @type {AnnotationSchema} */ ({
    categories: [
        { id: 'general', name: 'General', colour: '#64748b' },
        { id: 'defect', name: 'Defect', colour: '#dc2626' },
        { id: 'observation', name: 'Observation', colour: PRIMARY[500] },
        { id: 'safety', name: 'Safety', colour: '#eab308' },
        { id: 'stockpile', name: 'Stockpile', colour: '#7c3aed' }
    ],
    severities: [
        { id: 'low', name: 'Low', colour: '#16a34a' },
        { id: 'medium', name: 'Medium', colour: '#eab308' },
        { id: 'high', name: 'High', colour: '#dc2626' },
        { id: 'critical', name: 'Critical', colour: '#7f1d1d' }
    ],
    statuses: [
        { id: 'open', name: 'Open', closed: false },
        { id: 'in-progress', name: 'In progress', closed: false },
        { id: 'resolved', name: 'Resolved', closed: true }
    ]
}));

/** The template of an organization that has stored none (and the start of a new one). */
export const DEFAULT_TEMPLATE = deepFreeze(/** @type {ReportTemplate} */ ({
    id: 'standard',
    name: 'Standard',
    logo: null,
    primary: PRIMARY[500],
    accent: '#0891b2',
    paper: 'A4',
    orientation: 'portrait',
    headerText: '',
    footerText: '',
    disclaimer: '',
    defaultSections: [...SECTION_KINDS],
    breakdownChart: 'bars'
}));

/**
 * A copy that the caller can edit (the defaults are frozen).
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function cloneSettings(value) {
    return JSON.parse(JSON.stringify(value));
}
