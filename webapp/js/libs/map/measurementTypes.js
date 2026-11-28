// @ts-check
/**
 * The name and the icon of each kind of map measurement, as the measurement list shows them (a row with no name of
 * its own is called by its kind), and the order of its rows.
 */
import { AREA_ICON, LENGTH_ICON, POINT_ICON, STOCKPILE_ICON } from '@/libs/glyphs';
import { compareText } from '@/libs/compareText';

/** @type {Record<string, { label: string, icon: string }>} */
const TYPES = {
    point: { label: 'Point', icon: POINT_ICON },
    length: { label: 'Length', icon: LENGTH_ICON },
    area: { label: 'Area', icon: AREA_ICON },
    stockpile: { label: 'Stockpile', icon: STOCKPILE_ICON },
    profile: { label: 'Profile', icon: 'fa-solid fa-route' },
    contour: { label: 'Contour', icon: 'fa-solid fa-map-pin' }
};

/** @param {string} [type] @returns {string} */
export const measurementTypeLabel = type => TYPES[type ?? '']?.label ?? (type || 'Unknown');

/** @param {string} [type] @returns {string} */
export const measurementTypeIcon = type => TYPES[type ?? '']?.icon ?? 'fa-solid fa-question';

/**
 * What a row of the list is called: its name, else its kind.
 * @param {{ name?: string, type?: string }} item
 */
export const measurementName = item => item.name || measurementTypeLabel(item.type);

/**
 * The order of the rows of the list: the numbered annotations by their reference (2 before 10), then the others by
 * name ("Marker 2" before "Marker 10"), then by when they were made. The map hands its measurements in the order of
 * its spatial index, which means nothing to a user and would make a Shift range take rows at random.
 * @param {{ ref?: string, name?: string, type?: string, feature?: any }} a
 * @param {{ ref?: string, name?: string, type?: string, feature?: any }} b
 */
export function compareMeasurements(a, b) {
    if (!!a.ref !== !!b.ref) return a.ref ? -1 : 1;
    return compareText(a.ref, b.ref)
        || compareText(measurementName(a), measurementName(b))
        || compareText(a.feature?.get?.('createdAt'), b.feature?.get?.('createdAt'));
}

/**
 * The question asked before measurements are deleted, as libs/deleteConfirmation options: the same from the
 * measurement list, the delete button of a point's callout and the Delete of a properties dialog. Each item is named
 * as its row is (measurementName), with its value after it; one point is an "annotation", anything else a
 * "measurement" (several items are "<n> items" either way).
 * @param {{ name?: string, type?: string, value?: string }[]} items
 * @returns {{ kind: string, items: { name: string, note: string }[] }}
 */
export function measurementDeleteQuestion(items) {
    return {
        kind: items.length === 1 && items[0].type === 'point' ? 'annotation' : 'measurement',
        items: items.map(m => ({ name: measurementName(m), note: m.value ? `(${m.value})` : '' }))
    };
}
