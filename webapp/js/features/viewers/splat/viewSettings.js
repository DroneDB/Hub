// @ts-check
/**
 * What the user chose to see a splat with, remembered per entry on this device: the up axis,
 * the tilt calibration and the point size. A user who cannot write the dataset has no sidecar to
 * save them in, and for everyone they are the default when the sidecar has no orientation.
 * Precedence: the sidecar's orientation, then what is remembered here, then the defaults.
 *
 * The map of entries only ever grows with the splats a user opens, so it keeps the most recent
 * MAX_ENTRIES and drops the least recently changed. It is local to the device (not in the
 * account preferences): it would be an unbounded list to send with every change.
 */
import { getPref, setPref, PREF } from '@/libs/preferences';
import { DEFAULT_UP_AXIS, isUpAxis } from './upAxis';

/** Entries kept; the least recently changed is dropped past it. */
export const MAX_ENTRIES = 200;
/** The tilt calibration range in degrees (each of roll and pitch) */
export const TILT_LIMIT = 45;
/** The point size range (a factor on the splat scales) */
export const POINT_SCALE_RANGE = Object.freeze({ min: 0.25, max: 3 });

/** The view settings of an entry that has none. */
export const VIEW_DEFAULTS = Object.freeze({ upAxis: DEFAULT_UP_AXIS, tiltRoll: 0, tiltPitch: 0, pointScale: 1 });

/** @typedef {{ upAxis: import('./upAxis').UpAxis, tiltRoll: number, tiltPitch: number, pointScale: number }} ViewSettings */

/** @param {unknown} v @param {number} min @param {number} max @returns {number | undefined} */
const finiteIn = (v, min, max) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : undefined);

/**
 * The usable fields of a stored (or about to be stored) settings object: a field that is missing
 * or not of its type is left out, a number is brought into its range.
 * @param {any} raw
 * @returns {Partial<ViewSettings>}
 */
export function sanitizeViewSettings(raw) {
    /** @type {Partial<ViewSettings>} */
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    if (isUpAxis(raw.upAxis)) out.upAxis = raw.upAxis;
    const roll = finiteIn(raw.tiltRoll, -TILT_LIMIT, TILT_LIMIT);
    if (roll !== undefined) out.tiltRoll = roll;
    const pitch = finiteIn(raw.tiltPitch, -TILT_LIMIT, TILT_LIMIT);
    if (pitch !== undefined) out.tiltPitch = pitch;
    const scale = finiteIn(raw.pointScale, POINT_SCALE_RANGE.min, POINT_SCALE_RANGE.max);
    if (scale !== undefined) out.pointScale = scale;
    return out;
}

/**
 * The settings a splat opens with before its sidecar is read: what is remembered for it over the
 * defaults. The sidecar's orientation is applied on top of this (useSplatCameras).
 * @param {Partial<ViewSettings>} remembered
 * @returns {ViewSettings}
 */
export const openingViewSettings = remembered => ({ ...VIEW_DEFAULTS, ...remembered });

/**
 * The store over a pair of read / write functions of the stored list, `[key, settings]` pairs
 * oldest first. Storage that fails or holds something else is a store with no entries.
 * @param {object} [options]
 * @param {() => unknown} [options.load]
 * @param {(list: [string, Partial<ViewSettings>][]) => void} [options.save]
 * @param {number} [options.cap]
 */
export function createViewSettingsStore({
    load = () => getPref(PREF.SPLAT_VIEW_SETTINGS, null),
    save = list => setPref(PREF.SPLAT_VIEW_SETTINGS, list),
    cap = MAX_ENTRIES
} = {}) {
    /** @returns {[string, Partial<ViewSettings>][]} */
    function read() {
        let stored;
        try {
            stored = load();
        } catch {
            return [];
        }
        if (!Array.isArray(stored)) return [];
        return stored
            .filter(pair => Array.isArray(pair) && typeof pair[0] === 'string')
            .map(pair => /** @type {[string, Partial<ViewSettings>]} */ ([pair[0], sanitizeViewSettings(pair[1])]));
    }

    return {
        /**
         * What is remembered for the entry (only the fields that are; none for an unknown entry).
         * @param {string} key  the entry's remote URI (dataset and path)
         * @returns {Partial<ViewSettings>}
         */
        get(key) {
            return read().find(([k]) => k === key)?.[1] ?? {};
        },

        /**
         * Remembers `changes` for the entry on top of what was: it becomes the most recent entry
         * and the oldest ones past the cap are dropped. A failing storage loses the setting, not the page.
         * @param {string} key
         * @param {Partial<ViewSettings>} changes
         */
        set(key, changes) {
            const list = read();
            const index = list.findIndex(([k]) => k === key);
            const before = index < 0 ? {} : list.splice(index, 1)[0][1];
            list.push([key, { ...before, ...sanitizeViewSettings(changes) }]);
            try {
                save(list.slice(-cap));
            } catch (e) {
                console.warn('The view settings of the splat could not be stored', e);
            }
        }
    };
}

/** The store on the device's preferences. */
export const viewSettingsStore = createViewSettingsStore();
