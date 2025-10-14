/**
 * Local Storage utility functions for managing user preferences
 */

const DATASET_TABLE_PREFS_KEY = 'dataset_table_prefs';

/**
 * Get dataset table preferences from Local Storage
 * @returns {Object|null} The preferences object with sortColumn, sortDirection, and itemsPerPage, or null if not found
 */
export function getDatasetTablePreferences() {
    try {
        const prefs = localStorage.getItem(DATASET_TABLE_PREFS_KEY);
        if (prefs) {
            return JSON.parse(prefs);
        }
    } catch (e) {
        console.error('Error reading dataset table preferences from Local Storage:', e);
    }
    return null;
}

/**
 * Save dataset table preferences to Local Storage
 * @param {string} sortColumn - The column to sort by
 * @param {string} sortDirection - The sort direction ('asc' or 'desc')
 * @param {number} itemsPerPage - The number of items per page
 */
export function saveDatasetTablePreferences(sortColumn, sortDirection, itemsPerPage) {
    const prefs = {
        sortColumn,
        sortDirection,
        itemsPerPage
    };
    try {
        localStorage.setItem(DATASET_TABLE_PREFS_KEY, JSON.stringify(prefs));
    } catch (e) {
        console.error('Error saving dataset table preferences to Local Storage:', e);
    }
}

/**
 * Clear dataset table preferences from Local Storage
 */
export function clearDatasetTablePreferences() {
    try {
        localStorage.removeItem(DATASET_TABLE_PREFS_KEY);
    } catch (e) {
        console.error('Error clearing dataset table preferences from Local Storage:', e);
    }
}
