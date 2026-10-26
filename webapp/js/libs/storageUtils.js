/**
 * Named user preferences of the dataset and organisation pages, stored through
 * libs/preferences.js.
 */
import { getPref, setPref, onPrefChange, PREF, PREF_DEFAULTS } from '@/libs/preferences';

/** @param {unknown} value @returns {Record<string, any>|null} */
const asObject = value => (value && typeof value === 'object' && !Array.isArray(value) ? value : null);

/** A stored field stands for its default when it has the default's type and, unless a boolean, is not empty. */
const usable = (value, fallback) => typeof value === typeof fallback && (typeof value === 'boolean' || !!value);

/**
 * The settings object stored under `key` (a PREF key whose default is an object): every field of
 * the default, taken from storage when usable there.
 * @param {string} key
 * @returns {Record<string, any>}
 */
function readSettings(key) {
    const stored = asObject(getPref(key, null)) ?? {};
    return Object.fromEntries(Object.entries(PREF_DEFAULTS[key]).map(([name, fallback]) =>
        [name, usable(stored[name], fallback) ? stored[name] : fallback]));
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
 * @returns {{sortColumn: string, sortDirection: 'asc'|'desc', itemsPerPage: number}} the stored
 * settings of the dataset table over the defaults
 */
export function getDatasetTablePreferences() {
    return readSettings(PREF.DATASET_TABLE);
}

export function saveDatasetTablePreferences(sortColumn, sortDirection, itemsPerPage) {
    saveSettings(PREF.DATASET_TABLE, { sortColumn, sortDirection, itemsPerPage });
}

/** @param {(settings: {sortColumn: string, sortDirection: 'asc'|'desc', itemsPerPage: number}) => void} apply @returns {() => void} unsubscribe */
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
 * The organisation page's list settings, which follow the account (its position is stored apart).
 * @returns {{itemsPerPage: number, ownedOnly: boolean}}
 */
export function getOrgPageSettings() {
    return readSettings(PREF.ORG_PAGE);
}

export function saveOrgPageSettings(itemsPerPage, ownedOnly) {
    saveSettings(PREF.ORG_PAGE, { itemsPerPage, ownedOnly });
}

/** @param {(settings: {itemsPerPage: number, ownedOnly: boolean}) => void} apply @returns {() => void} unsubscribe */
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
