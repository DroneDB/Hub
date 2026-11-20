// @ts-check
/**
 * The colour scheme of the page, light or dark (FR-XC-21, FR-NAV-07, D-044): the Appearance
 * preference of this device (System, Light or Dark) and, for System, the scheme of the operating
 * system. An embedded view always follows the system.
 *
 * The dark scheme is the class `app-dark` on <html>: the PrimeVue preset (theme.js) and the --ddb-*
 * tokens (css/_variables.scss) take their dark values under it; `data-bs-theme` gives Bootstrap's
 * utilities (text-muted) theirs. The inline script of
 * public/index.html applies the same rule before the app mounts, so the first paint has the right
 * scheme (colorScheme.spec.js runs that script against `resolveScheme`). `startColorScheme` then
 * keeps the class in step with the preference (this tab and the others) and the system.
 *
 * Canvas code (OpenLayers styles, charts) cannot use var(): it reads a token with `colorToken`
 * when it draws, and draws again on `onColorSchemeChange`.
 */
import { hexRgba } from '@/libs/palette';
import { PREF, getPref, onPrefChange, prefChoice } from '@/libs/preferences';

/** The class on <html> under which every colour takes its dark value. */
export const DARK_CLASS = 'app-dark';

/** The media query of the system's dark scheme. */
export const SYSTEM_DARK_QUERY = '(prefers-color-scheme: dark)';

/** @typedef {'light'|'dark'} ColorScheme */
/** @typedef {'system'|'light'|'dark'} Appearance */

/**
 * The scheme to show.
 * @param {unknown} appearance  the stored Appearance preference (anything else reads as System)
 * @param {boolean} systemDark  the system asks for the dark scheme
 * @param {boolean} [embedded]  an embedded view, which follows the system whatever the preference
 * @returns {ColorScheme}
 */
export function resolveScheme(appearance, systemDark, embedded = false) {
    const choice = embedded ? 'system' : prefChoice(PREF.APPEARANCE, appearance);
    if (choice === 'system') return systemDark ? 'dark' : 'light';
    return /** @type {ColorScheme} */ (choice);
}

/**
 * Whether the page is an embedded view: `embed=` with a value in the query (as main.js reads it),
 * or a page inside a frame.
 * @param {Window} [win]
 */
export function isEmbedded(win = window) {
    if (/[?&]embed=[^&]/.test(win.location.search)) return true;
    try {
        return win.self !== win.top;
    } catch {
        return true;
    }
}

/** The scheme the page shows now. @returns {ColorScheme} */
export const currentScheme = () => (document.documentElement.classList.contains(DARK_CLASS) ? 'dark' : 'light');

/** @type {Set<(scheme: ColorScheme) => void>} */
const listeners = new Set();

/**
 * Calls `listener(scheme)` after the page changes scheme. Returns the unsubscribe.
 * @param {(scheme: ColorScheme) => void} listener
 * @returns {() => void}
 */
export function onColorSchemeChange(listener) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

/**
 * Shows `scheme`, and tells the subscribers when it is a change.
 * @param {ColorScheme} scheme
 */
export function applyScheme(scheme) {
    if (scheme === currentScheme()) return;
    document.documentElement.classList.toggle(DARK_CLASS, scheme === 'dark');
    document.documentElement.setAttribute('data-bs-theme', scheme);
    for (const listener of [...listeners]) {
        try {
            listener(scheme);
        } catch (e) {
            console.error('Colour scheme listener failed', e);
        }
    }
}

/**
 * Applies the scheme and keeps it in step with the Appearance preference and, while that is System,
 * with the system's scheme. Returns the stop.
 * @param {{ embedded?: boolean }} [options]
 * @returns {() => void}
 */
export function startColorScheme({ embedded = false } = {}) {
    const media = typeof window.matchMedia === 'function' ? window.matchMedia(SYSTEM_DARK_QUERY) : null;
    const update = () => applyScheme(resolveScheme(getPref(PREF.APPEARANCE, 'system'), !!media?.matches, embedded));
    update();
    media?.addEventListener('change', update);
    const stopPref = onPrefChange(key => { if (key === PREF.APPEARANCE) update(); });
    return () => {
        media?.removeEventListener('change', update);
        stopPref();
    };
}

/**
 * The current value of a colour token (`--ddb-...`) for canvas code, which cannot use var(); `fallback`
 * when the stylesheets do not define it (tests, a page without them).
 * @param {string} name
 * @param {string} [fallback]
 * @returns {string}
 */
export function colorToken(name, fallback = '') {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/**
 * A #rrggbb colour token as a number (0x1a1a2e), for three.js and Giro3D; 0 when the token is not
 * a #rrggbb colour.
 * @param {string} name
 * @returns {number}
 */
export function tokenHex(name) {
    const value = colorToken(name);
    return /^#[0-9a-f]{6}$/i.test(value) ? parseInt(value.slice(1), 16) : 0;
}

/**
 * A colour token with an alpha, as a canvas colour: a #rrggbb token (--ddb-map-shot) or an
 * "r, g, b" triplet token (--ddb-glass-rgb). Another value is returned as it is, '' when the
 * token is not defined.
 * @param {string} name
 * @param {number} [alpha]  0 to 1
 * @returns {string}
 */
export function tokenRgba(name, alpha = 1) {
    const value = colorToken(name);
    if (/^#[0-9a-f]{6}$/i.test(value)) return hexRgba(value, alpha);
    if (/^\d+,\s*\d+,\s*\d+$/.test(value)) return `rgba(${value}, ${alpha})`;
    return value;
}
