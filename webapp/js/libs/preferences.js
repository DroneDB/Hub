// @ts-check
/**
 * User preferences in Web Storage. The only module that touches
 * localStorage/sessionStorage: access never throws (private mode, quota, disabled
 * storage fall back to memory for the page's lifetime) and values are encoded one way.
 *
 * Strings are stored as they are, everything else as JSON; `getPref` decodes by the
 * type of its fallback, so keys written as raw strings by older Hub versions still read.
 */

/** Keys, so a preference shared by several views has one spelling. */
export const PREF = Object.freeze({
    MEASURE_UNIT: 'measureUnitPref',
    BASEMAP: 'selectedBasemap',
    CUSTOM_BASEMAP: 'customBasemap',
    SHOW_DIRECTION_INDICATORS: 'showDirectionIndicators',
    SHOW_FLIGHT_PATH: 'showFlightPath',
    FILE_VIEW_MODE: 'fileViewMode',
    TABLE_EXPANDED_GRID: 'tableExpandedGrid',
    SORT_DESCENDING: 'sortDescending',
    SPLAT_NAV_MODE: 'ddb.splat.navMode',
    DATASET_TABLE: 'dataset_table_prefs',
    OPEN_AFTER_CREATE: 'open_dataset_after_create',
    ORG_PAGE: 'org_page_prefs',
    UNIFIED_VIEWER: 'unified-viewer-settings',
    NEXUS_LIGHTING: 'nexus-lighting-settings',
    HUB_UPDATE_NOTICE: 'hubUpdateNotice',
    HUB_UPDATE_ATTEMPTED: 'hubUpdateAttempted', // sessionStorage
    CLIPBOARD: 'ddb:hub:clipboard' // sessionStorage
});

/** @typedef {{ session?: boolean }} StoreOption  session: sessionStorage instead of localStorage */

/** @type {Record<'local'|'session', Map<string, string>>} */
const memory = { local: new Map(), session: new Map() };
/** @type {Record<'local'|'session', Storage|null|undefined>} */
const available = { local: undefined, session: undefined };

/** @param {'local'|'session'} kind @returns {Storage|null} */
function storage(kind) {
    if (available[kind] === undefined) {
        try {
            const s = kind === 'session' ? window.sessionStorage : window.localStorage;
            const probe = '__hub_pref_probe__';
            s.setItem(probe, probe);
            s.removeItem(probe);
            available[kind] = s;
        } catch {
            available[kind] = null;
        }
    }
    return available[kind];
}

/** Raw string access with the memory fallback (for callers that store their own format). */
export const safeStorage = {
    /** @param {string} key @param {StoreOption} [o] @returns {string|null} */
    getItem(key, { session = false } = {}) {
        const kind = session ? 'session' : 'local';
        try {
            const s = storage(kind);
            return s ? s.getItem(key) : (memory[kind].get(key) ?? null);
        } catch {
            return memory[kind].get(key) ?? null;
        }
    },
    /** @param {string} key @param {string} value @param {StoreOption} [o] */
    setItem(key, value, { session = false } = {}) {
        const kind = session ? 'session' : 'local';
        try {
            const s = storage(kind);
            if (s) s.setItem(key, value); else memory[kind].set(key, value);
        } catch {
            memory[kind].set(key, value);
        }
    },
    /** @param {string} key @param {StoreOption} [o] */
    removeItem(key, { session = false } = {}) {
        const kind = session ? 'session' : 'local';
        memory[kind].delete(key);
        try { storage(kind)?.removeItem(key); } catch { /* nothing stored */ }
    }
};

/**
 * @template T
 * @param {string} key
 * @param {T} [fallback]
 * @param {StoreOption} [options]
 * @returns {T}
 */
export function getPref(key, fallback, options) {
    const raw = safeStorage.getItem(key, options);
    if (raw === null) return /** @type {T} */ (fallback ?? null);
    if (typeof fallback === 'string') return /** @type {T} */ (/** @type {unknown} */ (raw));
    try {
        return JSON.parse(raw);
    } catch {
        return fallback === undefined || fallback === null ? /** @type {T} */ (/** @type {unknown} */ (raw)) : fallback;
    }
}

/**
 * @param {string} key
 * @param {unknown} value  null/undefined removes the key
 * @param {StoreOption} [options]
 */
export function setPref(key, value, options) {
    if (value === null || value === undefined) {
        safeStorage.removeItem(key, options);
        return;
    }
    safeStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value), options);
}

/** @param {string} key @param {StoreOption} [options] */
export function removePref(key, options) {
    safeStorage.removeItem(key, options);
}
