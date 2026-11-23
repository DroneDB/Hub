// @ts-check
/**
 * What a set of map measurements amounts to: the summed length of its lines, area of its areas and
 * net volume of its stockpiles, in the user's units. The measurement list shows it for the rows the
 * user selected ("2 lines 340 m · 3 areas 1,240 m² · 1 pile 85 m³").
 *
 * The sums are metric (geodesic, as the label of each measurement is) and formatted once, so the
 * total is not a sum of rounded labels. A point, a contour label or a profile has no size to add;
 * a stockpile that was never computed has no volume and is left out of its total.
 */
import { areaParts, countOf, formatVolume, lengthParts } from '@/libs/format';
import { geodesicArea, geodesicLength } from './geodesic';

/**
 * @typedef {{ count: number, total: number }} Sum
 * @typedef {{ length: Sum, area: Sum, volume: Sum }} Totals
 */

/**
 * The sums of the measurements of each kind that has a size (metric: m, m², m³).
 * @param {{ type: string, feature?: any }[]} items  rows of the measurement list ({ type, feature })
 * @returns {Totals}
 */
export function measurementTotals(items) {
    /** @type {Totals} */
    const totals = { length: { count: 0, total: 0 }, area: { count: 0, total: 0 }, volume: { count: 0, total: 0 } };
    /** @param {Sum} sum @param {number} value */
    const add = (sum, value) => {
        if (!Number.isFinite(value)) return;
        sum.count++;
        sum.total += value;
    };
    for (const { type, feature } of items) {
        const geometry = feature && feature.getGeometry ? feature.getGeometry() : null;
        if (type === 'length' && geometry) add(totals.length, geodesicLength(geometry));
        else if (type === 'area' && geometry) add(totals.area, geodesicArea(geometry));
        else if (type === 'stockpile' && feature) {
            const volume = feature.get('netVolume');
            if (typeof volume === 'number') add(totals.volume, volume);
        }
    }
    return totals;
}

/**
 * The text of the totals: one part per kind that has any ("2 lines 340 m"), joined by " · "; empty
 * when no item has a size.
 * @param {{ type: string, feature?: any }[]} items
 * @param {string} [units]  'metric' or 'imperial'
 * @returns {string}
 */
export function measurementTotalsText(items, units = 'metric') {
    const { length, area, volume } = measurementTotals(items);
    const parts = [];
    if (length.count) parts.push(`${countOf(length.count, 'line')} ${lengthParts(length.total, units).text}`);
    if (area.count) parts.push(`${countOf(area.count, 'area')} ${areaParts(area.total, units).text}`);
    if (volume.count) parts.push(`${countOf(volume.count, 'pile')} ${formatVolume(volume.total, units)}`);
    return parts.join(' · ');
}
