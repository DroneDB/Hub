// @ts-check
/**
 * User preferences in Web Storage. The only module that touches
 * localStorage/sessionStorage: access never throws (private mode, quota, disabled
 * storage fall back to memory for the page's lifetime) and values are encoded one way.
 *
 * Strings are stored as they are, everything else as JSON; `getPref` decodes by the
 * type of its fallback, so keys written as raw strings by older Hub versions still read.
 *
 * `onPrefChange` tells subscribers when a stored value changes, whoever changed it, so open
 * views follow the Preferences page, other tabs and the account.
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
    ORG_PAGE_POSITION: 'org_page_position', // { currentPage, scrollTop } of the organisations page
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
 * The preferences that follow the user's account: PREF key -> [section, field] in the account's
 * preferences object. The other keys stay on the device.
 */
export const ACCOUNT_SECTIONS = Object.freeze({
    [PREF.MEASURE_UNIT]: ['units', 'measurement'],
    [PREF.BASEMAP]: ['map', 'basemap'],
    [PREF.CUSTOM_BASEMAP]: ['map', 'customBasemap'],
    [PREF.SHOW_DIRECTION_INDICATORS]: ['map', 'showDirectionIndicators'],
    [PREF.SHOW_FLIGHT_PATH]: ['map', 'showFlightPath'],
    [PREF.FILE_VIEW_MODE]: ['explorer', 'viewMode'],
    [PREF.TABLE_EXPANDED_GRID]: ['explorer', 'tableExpandedGrid'],
    [PREF.SORT_DESCENDING]: ['explorer', 'sortDescending'],
    [PREF.DATASET_TABLE]: ['datasets', 'table'],
    [PREF.OPEN_AFTER_CREATE]: ['datasets', 'openAfterCreate'],
    [PREF.ORG_PAGE]: ['orgs', 'list'],
    [PREF.SPLAT_NAV_MODE]: ['viewers', 'splatNavMode'],
    [PREF.NEXUS_LIGHTING]: ['viewers', 'nexusLighting'],
    [PREF.UNIFIED_VIEWER]: ['viewers', 'unifiedLighting']
});

/** Object.freeze that keeps the property types wide (number, not 10). @template T @param {T} value @returns {Readonly<T>} */
const frozen = value => Object.freeze(value);

/**
 * What each account preference is while nothing is stored, keyed like ACCOUNT_SECTIONS: the views
 * that read a preference and the Preferences page take it from here, so they cannot disagree.
 */
export const PREF_DEFAULTS = frozen({
    [PREF.MEASURE_UNIT]: 'metric',
    [PREF.BASEMAP]: 'satellite',
    [PREF.CUSTOM_BASEMAP]: null,
    [PREF.SHOW_DIRECTION_INDICATORS]: false,
    [PREF.SHOW_FLIGHT_PATH]: true,
    [PREF.FILE_VIEW_MODE]: 'grid',
    [PREF.TABLE_EXPANDED_GRID]: true,
    [PREF.SORT_DESCENDING]: false,
    [PREF.DATASET_TABLE]: frozen({ sortColumn: 'name', sortDirection: /** @type {'asc'|'desc'} */ ('asc'), itemsPerPage: 10 }),
    [PREF.OPEN_AFTER_CREATE]: false,
    [PREF.ORG_PAGE]: frozen({ itemsPerPage: 10, ownedOnly: true }),
    [PREF.SPLAT_NAV_MODE]: 'fly',
    [PREF.NEXUS_LIGHTING]: frozen({ ambientIntensity: 0.4, directionalIntensity: 0.7, shininess: 25 }),
    [PREF.UNIFIED_VIEWER]: frozen({ ambientIntensity: 3, directionalIntensity: 1.8, hemisphereIntensity: 3 })
});

/**
 * 'local': setPref/removePref in this tab. 'tab': another tab, through the storage event.
 * 'account': applyAccountValue.
 * @typedef {'local'|'tab'|'account'} PrefOrigin
 */
/**
 * `value` is what was written (null when removed) for 'local' and 'account'. For 'tab' it is the
 * stored value decoded without a fallback; a subscriber that decodes by the type of its own
 * fallback reads `getPref(key, fallback, options)` instead.
 * @typedef {(key: string, value: unknown, origin: PrefOrigin) => void} PrefListener
 */

/** @type {Set<PrefListener>} */
const listeners = new Set();
/** @type {Set<string>} */
const knownKeys = new Set(Object.values(PREF));
let storageListening = false;

/** @param {string} key @param {unknown} value @param {PrefOrigin} origin */
function notifyChange(key, value, origin) {
    for (const listener of [...listeners]) {
        try {
            listener(key, value, origin);
        } catch (e) {
            console.error('Preference listener failed', e);
        }
    }
}

/** Another tab changed localStorage: tell the subscribers to read the stored value. @param {StorageEvent} event */
function onStorageEvent(event) {
    if (event.storageArea !== storage('local')) return;
    if (!event.key || !knownKeys.has(event.key)) return;
    notifyChange(event.key, getPref(event.key), 'tab');
}

/**
 * Calls `listener(key, value, origin)` after a stored preference changes (not for session
 * writes, and not for a write of the text already stored). Returns the unsubscribe.
 * @param {PrefListener} listener
 * @returns {() => void}
 */
export function onPrefChange(listener) {
    if (!storageListening && typeof window !== 'undefined') {
        // lifetime: app (one listener for the whole page, added by the first subscriber)
        window.addEventListener('storage', onStorageEvent);
        storageListening = true;
    }
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

/** Forgets every subscriber and the storage listener. For tests only. */
export function _resetPrefListenersForTests() {
    listeners.clear();
    if (storageListening) window.removeEventListener('storage', onStorageEvent);
    storageListening = false;
}

/**
 * @param {string} key
 * @param {unknown} value  null/undefined removes the key
 * @param {StoreOption | undefined} options
 * @param {PrefOrigin} origin
 */
function write(key, value, options, origin) {
    const before = safeStorage.getItem(key, options);
    let after = null;
    if (value === null || value === undefined) {
        safeStorage.removeItem(key, options);
    } else {
        after = typeof value === 'string' ? value : JSON.stringify(value);
        safeStorage.setItem(key, after, options);
    }
    if (!options?.session && after !== before) notifyChange(key, value ?? null, origin);
}

/**
 * @param {string} key
 * @param {unknown} value  null/undefined removes the key
 * @param {StoreOption} [options]
 */
export function setPref(key, value, options) {
    write(key, value, options, 'local');
}

/** @param {string} key @param {StoreOption} [options] */
export function removePref(key, options) {
    write(key, null, options, 'local');
}

/**
 * Writes a value that came from the account: like setPref, with origin 'account' (the account
 * sync does not send it back).
 * @param {string} key
 * @param {unknown} value  null/undefined removes the key
 */
export function applyAccountValue(key, value) {
    write(key, value, undefined, 'account');
}
