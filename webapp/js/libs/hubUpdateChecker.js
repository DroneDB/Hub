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

const STORAGE_KEY = 'hubUpdateNotice';
const SESSION_GUARD_KEY = 'hubUpdateAttempted';

/* global __HUB_VERSION__ */
const BUNDLE_VERSION =
    typeof __HUB_VERSION__ !== 'undefined' ? __HUB_VERSION__ : null;

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
    try {
        if (sessionStorage.getItem(SESSION_GUARD_KEY) === serverVersion) {
            // eslint-disable-next-line no-console
            console.warn(
                `[hub-update] Mismatch persists after reload (bundle=${BUNDLE_VERSION}, server=${serverVersion}). Skipping further reloads in this session.`
            );
            return false;
        }
    } catch (_) {
        // sessionStorage unavailable (private mode, etc.): proceed without the guard.
    }

    const notice = {
        from: BUNDLE_VERSION,
        to: serverVersion,
        at: new Date().toISOString()
    };

    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(notice));
    } catch (_) {
        // localStorage unavailable: still reload (notice will be skipped).
    }
    try {
        sessionStorage.setItem(SESSION_GUARD_KEY, serverVersion);
    } catch (_) {
        // best-effort
    }

    // eslint-disable-next-line no-console
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
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        localStorage.removeItem(STORAGE_KEY);
        // Also clear the per-tab loop guard so a future legitimate
        // upgrade can trigger a reload again.
        try { sessionStorage.removeItem(SESSION_GUARD_KEY); } catch (_) { /* */ }
        return JSON.parse(raw);
    } catch (_) {
        return null;
    }
}

export const __TEST__ = { STORAGE_KEY, SESSION_GUARD_KEY, BUNDLE_VERSION };
