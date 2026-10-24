/**
 * Hub update detection.
 *
 * Compares the bundle-time `__HUB_VERSION__` (injected by webpack from
 * `package.json`) against the version reported by the server in
 * `/sys/features#hubVersion`. On any mismatch (upgrade OR downgrade) we
 * persist a notice in `localStorage` and force a hard reload so the
 * browser re-fetches `index.html` (the server already sends
 * `Cache-Control: no-cache` for it). Hashed JS/CSS chunks change names
 * across builds, so the new document picks up new assets automatically.
 *
 * After the reload the SPA re-runs `loadFeatures()` and the versions
 * match: at that point `consumePendingUpdateNotice()` returns the stored
 * record so the UI can show a one-shot dialog.
 */

import { getPref, setPref, removePref, safeStorage, PREF } from '@/libs/preferences';
const SESSION = { session: true };

/* global __HUB_VERSION__ */
const BUNDLE_VERSION =
    typeof __HUB_VERSION__ !== 'undefined' ? __HUB_VERSION__ : null;

/** The Hub version this bundle was built from (package.json), or null outside webpack. */
export const HUB_VERSION = BUNDLE_VERSION;

/**
 * If the server reports a Hub version different from the one this bundle
 * was built with, persist a notice and force a reload. Returns `true`
 * when a reload was triggered (caller should stop further bootstrap).
 *
 * @param {string|null|undefined} serverVersion The Hub version exposed by /sys/features.
 * @param {{ isEmbed?: boolean, isProduction?: boolean }} ctx Runtime flags.
 * @returns {boolean} `true` if a reload is in progress.
 */
export function checkAndHandleUpdate(serverVersion, ctx) {
    const opts = ctx || {};

    if (opts.isEmbed) return false;
    if (opts.isProduction === false) return false;
    if (!serverVersion || !BUNDLE_VERSION) return false;
    if (serverVersion === BUNDLE_VERSION) return false;

    // Loop guard: if we already tried to reload for this exact target in
    // the current tab session, give up to avoid an infinite refresh loop
    // when the server keeps reporting a version the browser cannot pick
    // up (stale proxy, mid-deploy, etc.).
    if (safeStorage.getItem(PREF.HUB_UPDATE_ATTEMPTED, SESSION) === serverVersion) {
        console.warn(
            `[hub-update] Mismatch persists after reload (bundle=${BUNDLE_VERSION}, server=${serverVersion}). Skipping further reloads in this session.`
        );
        return false;
    }

    const notice = {
        from: BUNDLE_VERSION,
        to: serverVersion,
        at: new Date().toISOString()
    };

    setPref(PREF.HUB_UPDATE_NOTICE, notice);
    safeStorage.setItem(PREF.HUB_UPDATE_ATTEMPTED, serverVersion, SESSION);

     
    console.info(
        `[hub-update] Server Hub ${serverVersion} differs from bundle ${BUNDLE_VERSION}. Reloading...`
    );
    window.location.reload();
    return true;
}

/**
 * Pops the post-update notice (if any) so the UI can show it once.
 * @returns {{from: string, to: string, at: string} | null}
 */
export function consumePendingUpdateNotice() {
    const notice = getPref(PREF.HUB_UPDATE_NOTICE, null);
    if (!notice) return null;
    removePref(PREF.HUB_UPDATE_NOTICE);
    // Also clear the per-tab loop guard so a future legitimate
    // upgrade can trigger a reload again.
    safeStorage.removeItem(PREF.HUB_UPDATE_ATTEMPTED, SESSION);
    return notice;
}

export const __TEST__ = { STORAGE_KEY: PREF.HUB_UPDATE_NOTICE, SESSION_GUARD_KEY: PREF.HUB_UPDATE_ATTEMPTED, BUNDLE_VERSION };
