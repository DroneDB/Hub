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

const OPEN_AFTER_CREATE_KEY = 'open_dataset_after_create';

/**
 * Get the preference for opening a dataset after creation
 * @returns {boolean} True if the user wants to open the dataset after creation, false otherwise
 */
export function getOpenAfterCreatePreference() {
    try {
        return localStorage.getItem(OPEN_AFTER_CREATE_KEY) === 'true';
    } catch (e) {
        console.error('Error reading open after create preference from Local Storage:', e);
    }
    return false;
}

/**
 * Save the preference for opening a dataset after creation
 * @param {boolean} value - True to open the dataset after creation, false otherwise
 */
export function saveOpenAfterCreatePreference(value) {
    try {
        localStorage.setItem(OPEN_AFTER_CREATE_KEY, value.toString());
    } catch (e) {
        console.error('Error saving open after create preference to Local Storage:', e);
    }
}
