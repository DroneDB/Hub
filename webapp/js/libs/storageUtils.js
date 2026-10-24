/**
 * Named user preferences of the dataset and organisation pages, stored through
 * libs/preferences.js (HQ-02).
 */
import { getPref, setPref, removePref, PREF } from '@/libs/preferences';

/**
 * @returns {{sortColumn: string, sortDirection: 'asc'|'desc', itemsPerPage: number}|null}
 */
export function getDatasetTablePreferences() {
    return getPref(PREF.DATASET_TABLE, null);
}

export function saveDatasetTablePreferences(sortColumn, sortDirection, itemsPerPage) {
    setPref(PREF.DATASET_TABLE, { sortColumn, sortDirection, itemsPerPage });
}

export function clearDatasetTablePreferences() {
    removePref(PREF.DATASET_TABLE);
}

/** @returns {boolean} open a dataset right after creating it */
export function getOpenAfterCreatePreference() {
    return getPref(PREF.OPEN_AFTER_CREATE, false) === true;
}

/** @param {boolean} value */
export function saveOpenAfterCreatePreference(value) {
    setPref(PREF.OPEN_AFTER_CREATE, !!value);
}

export function getOrgPagePreferences() {
    return getPref(PREF.ORG_PAGE, null);
}

export function saveOrgPagePreferences(itemsPerPage, ownedOnly, currentPage = 1, scrollTop = 0) {
    setPref(PREF.ORG_PAGE, { itemsPerPage, ownedOnly, currentPage, scrollTop });
}
