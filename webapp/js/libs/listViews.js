// @ts-check
/**
 * listViews - the two ways the organizations page and an organization's datasets page show their
 * items: as a list (cards, table) or as pins on a map of where the datasets are.
 */

/** The views, in the order the toggle shows them. */
export const LIST_VIEWS = Object.freeze(['list', 'map']);

/** The view a page opens in until the user chooses another. */
export const DEFAULT_LIST_VIEW = 'list';

/** The views as the options of a select button. */
export const LIST_VIEW_OPTIONS = Object.freeze([
    Object.freeze({ value: 'list', label: 'List', icon: 'fa-solid fa-list' }),
    Object.freeze({ value: 'map', label: 'Map', icon: 'fa-solid fa-map-location-dot' })
]);
