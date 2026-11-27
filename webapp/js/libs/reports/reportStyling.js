// @ts-check
/**
 * What the report model says about how an item and a count look, so that the live page and the PDF draw them alike: the
 * colour of a category or a severity (the organization's schema has them), the colour of a status (the schema has none:
 * a closed status is green, an open one the colour of its place in the list), the badges of an item, the marks of a row
 * and the headline figures (KPIs) of a report. Every colour goes with a text that says the same: no meaning is carried
 * by colour alone.
 *
 * Pure: no DOM, no OpenLayers.
 */
import { choiceLabel } from '@/libs/map/annotationIds';
import { formatNumber } from '@/libs/format';
import { KIND_SINGULAR, OWNER_TAGS } from '@/libs/reports/reportKinds';

/** The colour of an item or a count that has no value for a field */
export const UNSET_COLOUR = '#94a3b8';
/** A closed status, done */
export const CLOSED_COLOUR = '#16a34a';
/** Overdue: the red of what needs action (red is the colour of a critical state in a report, as on the map) */
export const OVERDUE_COLOUR = '#dc2626';
/** The open statuses, in the order of the schema's list (no orange: blue, cyan, purple, slate) */
const OPEN_STATUS_COLOURS = Object.freeze(['#0070e0', '#0891b2', '#7c3aed', '#475569', '#1e293b']);

/**
 * @typedef {{ id: string, name: string, colour?: string, closed?: boolean }} Choice
 * @typedef {{ categories: Choice[], severities: Choice[], statuses: Choice[] }} Schema
 * @typedef {{ key: string, label: string, colour: string, tone?: 'closed' | 'open' | 'alert' }} Badge
 */

/**
 * The colour of a status of the schema: green when it is closed, else the colour of its place among the open ones.
 * @param {Choice[]} statuses @param {string | null | undefined} id
 */
export function statusColour(statuses, id) {
    if (!id) return UNSET_COLOUR;
    const status = statuses.find(s => s.id === id);
    if (!status) return UNSET_COLOUR;
    if (status.closed) return CLOSED_COLOUR;
    const open = statuses.filter(s => !s.closed);
    return OPEN_STATUS_COLOURS[open.indexOf(status) % OPEN_STATUS_COLOURS.length];
}

/** @param {Choice[]} statuses @param {string | null | undefined} id */
export const isClosedStatus = (statuses, id) => statuses.some(s => s.id === id && s.closed === true);

/**
 * The colour of a value of a field of an item.
 * @param {Schema} schema @param {'category' | 'severity' | 'status'} field @param {string | null | undefined} id
 */
export function choiceColour(schema, field, id) {
    if (field === 'status') return statusColour(schema.statuses, id);
    const list = field === 'category' ? schema.categories : schema.severities;
    return (id && list.find(c => c.id === id)?.colour) || UNSET_COLOUR;
}

/**
 * The badges of an item: its category, severity and status (those it has), then Overdue.
 * @param {{ category: string | null, severity: string | null, status: string | null, overdue: boolean }} item
 * @param {Schema} schema
 * @returns {Badge[]}
 */
export function itemBadges(item, schema) {
    /** @type {Badge[]} */
    const badges = [];
    if (item.category) badges.push({ key: 'category', label: choiceLabel(schema.categories, item.category), colour: choiceColour(schema, 'category', item.category) });
    if (item.severity) badges.push({ key: 'severity', label: choiceLabel(schema.severities, item.severity), colour: choiceColour(schema, 'severity', item.severity) });
    if (item.status) {
        const closed = isClosedStatus(schema.statuses, item.status);
        badges.push({ key: 'status', label: choiceLabel(schema.statuses, item.status), colour: statusColour(schema.statuses, item.status), tone: closed ? 'closed' : 'open' });
    }
    if (item.overdue) badges.push({ key: 'overdue', label: 'Overdue', colour: OVERDUE_COLOUR, tone: 'alert' });
    return badges;
}

/**
 * The colour marks of a row of a table: the colour of each field the row shows, and whether the item is overdue.
 * @param {{ category: string | null, severity: string | null, status: string | null, overdue: boolean }} item
 * @param {Schema} schema
 */
export function rowMarks(item, schema) {
    return {
        category: item.category ? choiceColour(schema, 'category', item.category) : null,
        severity: item.severity ? choiceColour(schema, 'severity', item.severity) : null,
        status: item.status ? statusColour(schema.statuses, item.status) : null,
        closed: isClosedStatus(schema.statuses, item.status),
        overdue: item.overdue
    };
}

/** @param {string} hex @returns {[number, number, number] | null} */
function rgbOf(hex) {
    const match = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? ''));
    if (!match) return null;
    const n = parseInt(match[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * A colour mixed with white: `amount` 0 is the colour, 1 is white. A colour that is not #rrggbb gives a light grey.
 * @param {string} hex @param {number} amount
 */
export function tint(hex, amount) {
    const rgb = rgbOf(hex);
    if (!rgb) return '#f8fafc';
    return `#${rgb.map(c => Math.round(c + (255 - c) * amount).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * A colour mixed with the dark ink of a report: `amount` 0 is the colour, 1 the ink. A light colour (a yellow) written
 * on its own light fill is read only once it is darker.
 * @param {string} hex @param {number} amount
 */
export function shade(hex, amount) {
    const rgb = rgbOf(hex);
    if (!rgb) return '#1f2937';
    const ink = [0x1f, 0x29, 0x37];
    return `#${rgb.map((c, i) => Math.round(c + (ink[i] - c) * amount).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * The colour of a text written on a fill: white on a dark one, a dark ink on a light one (relative luminance).
 * @param {string} hex
 */
export function textOn(hex) {
    const rgb = rgbOf(hex);
    if (!rgb) return '#1f2937';
    const [r, g, b] = rgb.map(c => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#1f2937' : '#ffffff';
}

/** The kind of an item as a line: "Volume · 2D". @param {{ kind: import('./reportKinds').MeasurementKind, owner: string }} item */
export const kindLabel = item => `${KIND_SINGULAR[item.kind]} · ${/** @type {Record<string, string>} */ (OWNER_TAGS)[item.owner] ?? ''}`.trim();

/**
 * @typedef {{ key: string, label: string, value: string, detail: string, tone: 'neutral' | 'info' | 'alert' | 'done' }} Kpi
 */

/**
 * The headline figures of a report: how many items, how many are open, how many overdue and how many are closed. The
 * texts are the ones every renderer writes.
 * @param {{ status: string | null, overdue: boolean }[]} items
 * @param {Schema} schema
 * @returns {Kpi[]}
 */
export function reportKpis(items, schema) {
    const withStatus = items.filter(i => i.status);
    const closed = withStatus.filter(i => isClosedStatus(schema.statuses, i.status)).length;
    const open = withStatus.length - closed;
    const overdue = items.filter(i => i.overdue).length;
    const share = withStatus.length ? Math.round((closed / withStatus.length) * 100) : 0;
    const count = (/** @type {number} */ n) => formatNumber(n, 0);
    return [
        { key: 'items', label: items.length === 1 ? 'Item' : 'Items', value: count(items.length), detail: `${count(withStatus.length)} with a status`, tone: 'neutral' },
        { key: 'open', label: 'Open', value: count(open), detail: open ? 'need action' : 'nothing open', tone: open ? 'info' : 'done' },
        { key: 'overdue', label: 'Overdue', value: count(overdue), detail: overdue ? 'past their due date' : 'none late', tone: overdue ? 'alert' : 'done' },
        { key: 'closed', label: 'Closed', value: count(closed), detail: `${share} % of the items with a status`, tone: 'done' }
    ];
}
