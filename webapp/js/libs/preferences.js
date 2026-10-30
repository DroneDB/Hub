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
import { DEFAULT_LIST_VIEW } from '@/libs/listViews';

/** Keys, so a preference shared by several views has one spelling. */
export const PREF = Object.freeze({
    MEASURE_UNIT: 'measureUnitPref',
    CURRENCY: 'currency', // ISO 4217 code of the prices the user sees (a label: nothing is converted)
    BASEMAP: 'selectedBasemap',
    CUSTOM_BASEMAP: 'customBasemap',
    SHOW_DIRECTION_INDICATORS: 'showDirectionIndicators',
    SHOW_FLIGHT_PATH: 'showFlightPath',
    FILE_VIEW_MODE: 'fileViewMode',
    TABLE_EXPANDED_GRID: 'tableExpandedGrid',
    SORT_DESCENDING: 'sortDescending',
    LOCATIONS_MAP_NAMES: 'locationsMapNames', // true: the map of dataset locations shows the names of its pins; device only
    SPLAT_NAV_MODE: 'ddb.splat.navMode',
    SPLAT_QUALITY: 'ddb.splat.quality', // 'auto' | 'low' | 'medium' | 'high': how much detail the splat viewer draws
    SPLAT_VIEW_SETTINGS: 'ddb.splat.viewSettings', // [[remote URI, { upAxis, tiltRoll, tiltPitch, pointScale }], ...] of the splats opened, oldest first; device only (a list that grows with use)
    DATASET_TABLE: 'dataset_table_prefs',
    OPEN_AFTER_CREATE: 'open_dataset_after_create',
    ORG_PAGE: 'org_page_prefs',
    ORG_PAGE_POSITION: 'org_page_position', // { currentPage, scrollTop } of the organisations page
    UNIFIED_VIEWER: 'unified-viewer-settings',
    MODEL_LIGHTING: 'model-lighting-settings',
    BUILD_NOTIFICATIONS: 'buildNotifications', // 'none' | 'all' | 'failed': which ended builds the server e-mails
    STOCKPILE_MATERIALS: 'stockpileMaterials', // { overrides, custom }: the user's stockpile materials (libs/stockpileMaterials.js)
    PANEL_SIZES: 'panelSizes', // { '<storageKey>.<desktop|tablet>': first pane % } of HubPanel
    HUB_UPDATE_NOTICE: 'hubUpdateNotice',
    HUB_UPDATE_ATTEMPTED: 'hubUpdateAttempted', // sessionStorage
    CLIPBOARD: 'ddb:hub:clipboard' // sessionStorage
});

/**
 * Preferences that were stored under another name: PREF key -> the key on the device and the field
 * in the account's section they had. A value found under the old name is carried over to the new
 * one the first time the preference is read or written (`adoptRenamedPref`), and the account sync
 * does the same with the old field (stores/preferences.js).
 * @type {Readonly<Record<string, { key: string, field: string }>>}
 */
export const RENAMED_PREFS = Object.freeze({
    // The lighting of the 3D models, kept as the Nexus viewer's before bm3d
    [PREF.MODEL_LIGHTING]: Object.freeze({ key: 'nexus-lighting-settings', field: 'nexusLighting' })
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
 * Moves the value a renamed preference had under its old name to the new one: when the new key
 * holds nothing and the old one does, the old value is copied; the old key is removed either way
 * (a value under it is then out of date). Nothing is notified: it runs before the first read or
 * write of the new key. Safe to call on every access (one lookup for the other keys).
 * @param {string} key  a PREF key
 * @param {StoreOption} [options]
 */
function adoptRenamedPref(key, options) {
    const renamed = Object.hasOwn(RENAMED_PREFS, key) && !options?.session ? RENAMED_PREFS[key] : null;
    if (!renamed) return;
    const old = safeStorage.getItem(renamed.key);
    if (old === null) return;
    if (safeStorage.getItem(key) === null) safeStorage.setItem(key, old);
    safeStorage.removeItem(renamed.key);
}

/**
 * @template T
 * @param {string} key
 * @param {T} [fallback]
 * @param {StoreOption} [options]
 * @returns {T}
 */
export function getPref(key, fallback, options) {
    adoptRenamedPref(key, options);
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
    [PREF.CURRENCY]: ['units', 'currency'],
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
    [PREF.SPLAT_QUALITY]: ['viewers', 'splatQuality'],
    [PREF.MODEL_LIGHTING]: ['viewers', 'modelLighting'],
    [PREF.UNIFIED_VIEWER]: ['viewers', 'unifiedLighting'],
    [PREF.BUILD_NOTIFICATIONS]: ['notifications', 'builds'],
    [PREF.STOCKPILE_MATERIALS]: ['stockpiles', 'materials']
});

/**
 * Account preferences the server acts on (it e-mails by them): the account's value is the
 * user's decision, so on load a field the account lacks clears the device's value instead of
 * being sent from it. Otherwise a value left on a shared device by another user, or one that
 * another device has since reset, would turn e-mails on for an account that never asked.
 * A change made here is still sent as usual.
 */
export const ACCOUNT_OWNED = /** @type {readonly string[]} */ (Object.freeze([PREF.BUILD_NOTIFICATIONS]));

/** Object.freeze that keeps the property types wide (number, not 10). @template T @param {T} value @returns {Readonly<T>} */
const frozen = value => Object.freeze(value);

/**
 * What each account preference is while nothing is stored, keyed like ACCOUNT_SECTIONS: the views
 * that read a preference and the Preferences page take it from here, so they cannot disagree.
 */
export const PREF_DEFAULTS = frozen({
    [PREF.MEASURE_UNIT]: 'metric',
    [PREF.CURRENCY]: 'USD',
    [PREF.BASEMAP]: 'satellite',
    [PREF.CUSTOM_BASEMAP]: null,
    [PREF.SHOW_DIRECTION_INDICATORS]: false,
    [PREF.SHOW_FLIGHT_PATH]: true,
    [PREF.FILE_VIEW_MODE]: 'grid',
    [PREF.TABLE_EXPANDED_GRID]: true,
    [PREF.SORT_DESCENDING]: false,
    [PREF.DATASET_TABLE]: frozen({ sortColumn: 'name', sortDirection: /** @type {'asc'|'desc'} */ ('asc'), itemsPerPage: 10, view: DEFAULT_LIST_VIEW }),
    [PREF.OPEN_AFTER_CREATE]: false,
    [PREF.ORG_PAGE]: frozen({ itemsPerPage: 10, ownedOnly: true, sortColumn: 'name', sortDirection: /** @type {'asc'|'desc'} */ ('asc'), view: DEFAULT_LIST_VIEW }),
    [PREF.SPLAT_NAV_MODE]: 'fly',
    [PREF.SPLAT_QUALITY]: 'auto',
    [PREF.MODEL_LIGHTING]: frozen({ ambientIntensity: 0.4, directionalIntensity: 0.7, shininess: 25 }),
    [PREF.UNIFIED_VIEWER]: frozen({ ambientIntensity: 3, directionalIntensity: 1.8, hemisphereIntensity: 3 }),
    // Opt-in: the server sends nothing for a missing or unknown value either
    [PREF.BUILD_NOTIFICATIONS]: 'none',
    // The built-in materials as they are
    [PREF.STOCKPILE_MATERIALS]: frozen({ overrides: frozen({}), custom: frozen([]) })
});

/**
 * The values a preference with a fixed set of choices accepts. A stored value outside the set (a
 * hand-edited store, an account written by a newer Hub) is not one of them: `prefChoice` reads it
 * as the default instead of letting a view act on a value it does not know.
 */
export const PREF_CHOICES = frozen({
    [PREF.SPLAT_NAV_MODE]: frozen(['fly', 'earth']),
    [PREF.SPLAT_QUALITY]: frozen(['auto', 'low', 'medium', 'high'])
});

/**
 * `value` when it is one of the choices of the preference, else the preference's default.
 * @param {keyof typeof PREF_CHOICES} key
 * @param {unknown} value
 * @returns {string}
 */
export function prefChoice(key, value) {
    return PREF_CHOICES[key].includes(/** @type {never} */ (value)) ? /** @type {string} */ (value) : PREF_DEFAULTS[key];
}

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
    adoptRenamedPref(key, options);
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
