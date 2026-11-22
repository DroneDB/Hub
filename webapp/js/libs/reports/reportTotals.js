// @ts-check
/**
 * The totals and the counts of a report: the length, area, net volume, weight and cost of its items (what each
 * kind adds to: reportKinds), kept apart by 2D and 3D, and how many items there are by kind, category, status and
 * severity. Every number comes with the text the report shows, so that the page and the PDF write the same.
 */
import { formatLength, formatArea, formatVolume, formatWeight, formatMoney, formatNumber, normalizeCurrency } from '@/libs/format';
import { choiceLabel } from '@/libs/map/annotationIds';
import { totalKeyOf, KIND_ORDER, KIND_LABELS, OWNER_TAGS } from '@/libs/reports/reportKinds';
import { VIEW } from '@/libs/map/measurementFormat';

/** What an item without a value counts as. */
export const NOT_SET = 'Not set';

/**
 * @typedef {object} TotalPart
 * @property {string} owner  'map' or 'pointCloud'
 * @property {'2D' | '3D'} tag
 * @property {number} value  metres, square metres or cubic metres
 * @property {string} text
 * @property {number} count  the items that make it
 *
 * @typedef {object} Total
 * @property {'length' | 'area' | 'volume' | 'weight' | 'cost'} key
 * @property {string} label
 * @property {string | null} currency  of a cost
 * @property {number} value
 * @property {string} text
 * @property {number} count  the items that make it
 * @property {TotalPart[]} parts  the same by 2D and 3D, the owners that have items
 * @property {string} partsText  the parts as the report writes them ("12 m 2D, 3 m 3D"); empty when there is one only
 */

/**
 * @param {Map<string, { value: number, count: number }>} byOwner
 * @param {(value: number) => string} format
 * @returns {{ value: number, text: string, count: number, parts: TotalPart[], partsText: string }}
 */
function partsOf(byOwner, format) {
    const parts = [VIEW.MAP, VIEW.POINT_CLOUD].filter(owner => byOwner.has(owner)).map(owner => {
        const { value, count } = /** @type {{ value: number, count: number }} */ (byOwner.get(owner));
        return { owner, tag: /** @type {'2D' | '3D'} */ (OWNER_TAGS[owner]), value, text: format(value), count };
    });
    const value = parts.reduce((sum, p) => sum + p.value, 0);
    const partsText = parts.length > 1 ? parts.map(p => `${p.text} ${p.tag}`).join(', ') : '';
    return { value, text: format(value), count: parts.reduce((sum, p) => sum + p.count, 0), parts, partsText };
}

/** @param {Map<string, { value: number, count: number }>} map @param {string} owner @param {number} value */
function add(map, owner, value) {
    const entry = map.get(owner) ?? { value: 0, count: 0 };
    entry.value += value;
    entry.count++;
    map.set(owner, entry);
}

/**
 * The totals of some items: the length and the area (a 2D item is its geodesic length or area, a 3D one the
 * distance or area it was saved with; a 3D height is no length), the net volume and the weight of the stockpiles,
 * and their cost per currency. A total is there only when an item adds to it. An item whose value is in a unit that
 * cannot be converted is left out, and counted in `unconverted`.
 * @param {import('./reportItems').ReportItem[]} items
 * @param {string} units  'metric' or 'imperial'
 * @param {string} [currency]  the currency of a stockpile that names none
 * @returns {{ totals: Total[], unconverted: number }}
 */
export function computeTotals(items, units, currency) {
    /** @type {Record<'length' | 'area' | 'volume' | 'weight', Map<string, { value: number, count: number }>>} */
    const sums = { length: new Map(), area: new Map(), volume: new Map(), weight: new Map() };
    /** @type {Map<string, Map<string, { value: number, count: number }>>} */
    const costs = new Map();
    let unconverted = 0;

    for (const item of items) {
        const key = totalKeyOf(item);
        if (!key) continue;
        if (key === 'volume') {
            const p = item.properties;
            if (Number.isFinite(p.netVolume)) add(sums.volume, item.owner, p.netVolume);
            if (Number.isFinite(p.weightEstimate?.tons)) add(sums.weight, item.owner, p.weightEstimate.tons);
            if (Number.isFinite(p.costEstimate?.amount)) {
                const code = normalizeCurrency(p.currency ?? p.costEstimate?.currency ?? currency);
                if (!costs.has(code)) costs.set(code, new Map());
                add(/** @type {Map<string, { value: number, count: number }>} */ (costs.get(code)), item.owner, p.costEstimate.amount);
            }
            continue;
        }
        const value = item.measured[key];
        if (value === null) {
            if (item.measured.unconvertible) unconverted++;
            continue;
        }
        add(sums[key], item.owner, value);
    }

    /** @type {Total[]} */
    const totals = [];
    /** @type {[Total['key'], string, (v: number) => string][]} */
    const kinds = [
        ['length', 'Length', v => formatLength(v, units)],
        ['area', 'Area', v => formatArea(v, units)],
        ['volume', 'Net volume', v => formatVolume(v, units)],
        ['weight', 'Weight', v => formatWeight(v, units)]
    ];
    for (const [key, label, format] of kinds) {
        if (sums[key].size) totals.push({ key, label, currency: null, ...partsOf(sums[key], format) });
    }
    for (const [code, byOwner] of [...costs].sort(([a], [b]) => a.localeCompare(b))) {
        totals.push({ key: 'cost', label: `Cost (${code})`, currency: code, ...partsOf(byOwner, v => formatMoney(v, code)) });
    }
    return { totals, unconverted };
}

/**
 * @typedef {{ key: string, label: string, count: number }} Count
 */

/**
 * How many items there are for each value of a field, in the order of the choices of the schema, then the values the
 * schema does not have (`Unknown (<id>)`), then the items without a value ("Not set"). Values with no item are not
 * listed.
 * @param {import('./reportItems').ReportItem[]} items
 * @param {'category' | 'severity' | 'status'} field
 * @param {{ id: string, name: string }[]} choices
 * @returns {Count[]}
 */
export function countByChoice(items, field, choices) {
    /** @type {Map<string, number>} */
    const counts = new Map();
    let unset = 0;
    for (const item of items) {
        const id = item[field];
        if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
        else unset++;
    }
    const known = choices.filter(c => counts.has(c.id)).map(c => ({ key: c.id, label: c.name, count: /** @type {number} */ (counts.get(c.id)) }));
    const unknown = [...counts].filter(([id]) => !choices.some(c => c.id === id)).map(([id, count]) => ({ key: id, label: choiceLabel(choices, id), count }));
    return [...known, ...unknown, ...(unset ? [{ key: '', label: NOT_SET, count: unset }] : [])];
}

/**
 * How many items there are of each kind, in the order of the tables, for the kinds that have items.
 * @param {import('./reportItems').ReportItem[]} items
 * @returns {Count[]}
 */
export function countByKind(items) {
    return KIND_ORDER.map(kind => ({ key: kind, label: KIND_LABELS[kind], count: items.filter(i => i.kind === kind).length })).filter(c => c.count > 0);
}

/** A count as text: "3 items". @param {number} count */
export const itemCountText = count => `${formatNumber(count, 0)} ${count === 1 ? 'item' : 'items'}`;
