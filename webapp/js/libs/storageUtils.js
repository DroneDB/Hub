/**
 * Named user preferences of the dataset and organisation pages, stored through
 * libs/preferences.js.
 */
import { getPref, setPref, onPrefChange, PREF, PREF_DEFAULTS } from '@/libs/preferences';
import { ORG_SORT_FIELDS, SORT_DIRECTIONS } from '@/libs/organizationList';
import { LIST_VIEWS } from '@/libs/listViews';

/** @param {unknown} value @returns {Record<string, any>|null} */
const asObject = value => (value && typeof value === 'object' && !Array.isArray(value) ? value : null);

/** A stored field stands for its default when it has the default's type and, unless a boolean, is not empty. */
const usable = (value, fallback) => typeof value === typeof fallback && (typeof value === 'boolean' || !!value);

/**
 * The values a field of a settings object accepts when it has a fixed set (settings key -> field
 * -> values). A stored value outside the set (a hand-edited store, an account written by a newer
 * Hub) stands for the default.
 * @type {Record<string, Record<string, readonly string[]>>}
 */
const FIELD_CHOICES = {
    [PREF.DATASET_TABLE]: { view: LIST_VIEWS },
    [PREF.ORG_PAGE]: { sortColumn: ORG_SORT_FIELDS, sortDirection: SORT_DIRECTIONS, view: LIST_VIEWS }
};

/** @param {string} key @param {string} name @param {unknown} value */
const allowed = (key, name, value) => !FIELD_CHOICES[key]?.[name] || FIELD_CHOICES[key][name].includes(/** @type {string} */ (value));

/**
 * The settings object stored under `key` (a PREF key whose default is an object): every field of
 * the default, taken from storage when usable there.
 * @param {string} key
 * @returns {Record<string, any>}
 */
function readSettings(key) {
    const stored = asObject(getPref(key, null)) ?? {};
    return Object.fromEntries(Object.entries(PREF_DEFAULTS[key]).map(([name, fallback]) =>
        [name, usable(stored[name], fallback) && allowed(key, name, stored[name]) ? stored[name] : fallback]));
}

/**
 * `value` when the organisation list accepts it for the field (sortColumn, sortDirection, view),
 * else the default of the field.
 * @param {'sortColumn'|'sortDirection'|'view'} field
 * @param {unknown} value
 * @returns {string}
 */
export function orgPageChoice(field, value) {
    return allowed(PREF.ORG_PAGE, field, value) ? /** @type {string} */ (value) : PREF_DEFAULTS[PREF.ORG_PAGE][field];
}

/**
 * Stores `settings` under `key` only when they differ from what reads there: a page that took its
 * values from storage (the Preferences page, another tab, the account) does not write them back
 * as a change of its own, which would send stale values to the account.
 * @param {string} key
 * @param {Record<string, any>} settings
 */
function saveSettings(key, settings) {
    const current = readSettings(key);
    if (Object.keys(current).every(name => current[name] === settings[name])) return;
    setPref(key, settings);
}

/**
 * Calls `apply(settings)` with the settings read under `key` after they change.
 * @param {string} key
 * @param {(settings: Record<string, any>) => void} apply
 * @returns {() => void} unsubscribe
 */
function followSettings(key, apply) {
    return onPrefChange(changed => { if (changed === key) apply(readSettings(key)); });
}

/**
 * @typedef {object} DatasetTableSettings
 * @property {string} sortColumn
 * @property {'asc'|'desc'} sortDirection
 * @property {number} itemsPerPage
 * @property {'list'|'map'} view
 */

/** @returns {DatasetTableSettings} the stored settings of the dataset table over the defaults */
export function getDatasetTablePreferences() {
    return /** @type {DatasetTableSettings} */ (readSettings(PREF.DATASET_TABLE));
}

/**
 * Stores the settings that changed over the stored ones, so a page that changes one of them
 * (the sort) keeps the others (the view).
 * @param {Partial<DatasetTableSettings>} changes
 */
export function saveDatasetTablePreferences(changes) {
    saveSettings(PREF.DATASET_TABLE, { ...readSettings(PREF.DATASET_TABLE), ...changes });
}

/** @param {(settings: DatasetTableSettings) => void} apply @returns {() => void} unsubscribe */
export const followDatasetTablePreferences = apply => followSettings(PREF.DATASET_TABLE, apply);

/** @returns {boolean} open a dataset right after creating it */
export function getOpenAfterCreatePreference() {
    return getPref(PREF.OPEN_AFTER_CREATE, PREF_DEFAULTS[PREF.OPEN_AFTER_CREATE]) === true;
}

/** @param {boolean} value */
export function saveOpenAfterCreatePreference(value) {
    setPref(PREF.OPEN_AFTER_CREATE, !!value);
}

/**
 * @typedef {object} OrgPageSettings
 * @property {number} itemsPerPage
 * @property {boolean} ownedOnly
 * @property {string} sortColumn one of ORG_SORT_FIELDS
 * @property {'asc'|'desc'} sortDirection
 * @property {'list'|'map'} view
 */

/**
 * The organisation page's list settings, which follow the account (its position is stored apart).
 * @returns {OrgPageSettings}
 */
export function getOrgPageSettings() {
    return /** @type {OrgPageSettings} */ (readSettings(PREF.ORG_PAGE));
}

/**
 * Stores the settings that changed over the stored ones, so a page that changes one of them
 * (the sort) keeps the others (the view another page set).
 * @param {Partial<OrgPageSettings>} changes
 */
export function saveOrgPageSettings(changes) {
    saveSettings(PREF.ORG_PAGE, { ...readSettings(PREF.ORG_PAGE), ...changes });
}

/** @param {(settings: OrgPageSettings) => void} apply @returns {() => void} unsubscribe */
export const followOrgPageSettings = apply => followSettings(PREF.ORG_PAGE, apply);

/**
 * Where the organisation page was left; it stays on the device. A position inside the settings
 * written by an older Hub counts only while no position is stored.
 * @returns {{currentPage?: number, scrollTop?: number}}
 */
export function getOrgPagePosition() {
    const position = asObject(getPref(PREF.ORG_PAGE_POSITION, null)) ?? asObject(getPref(PREF.ORG_PAGE, null)) ?? {};
    return { currentPage: position.currentPage, scrollTop: position.scrollTop };
}

export function saveOrgPagePosition(currentPage = 1, scrollTop = 0) {
    setPref(PREF.ORG_PAGE_POSITION, { currentPage, scrollTop });
}
