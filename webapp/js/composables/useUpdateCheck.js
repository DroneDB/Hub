// @ts-check
/**
 * useUpdateCheck - what the server knows about newer Registry releases, and the usage
 * declaration and contact an admin gives, shared by every component that shows them.
 *
 * The header indicator, the release-notes dialog and the Configuration card read the same
 * cache. `load()` asks the server once per session and only for an admin on a server whose
 * update check is on; a failure leaves the cache empty without a message (an indicator that
 * cannot reach the server has nothing to say) and is not retried. The cache is cleared when
 * the user logs out. The Configuration page, which an admin opened on purpose, loads with
 * `ignoreGate` and `force` to see the current values and any error.
 */
import { ref, shallowRef, computed, watch, getCurrentScope } from 'vue';
import reg from '@/libs/api/sharedRegistry';
import { Features } from '@/libs/features';
import { isWebUrl } from '@/libs/sanitize';
import { useAuthStore } from '@/stores/auth';

/** The declaration of a deployment that already holds a licence: no licence prompt then. */
export const LICENSED_DECLARATION = 'commercial_licensed';

/**
 * @typedef {object} UpdateInfo
 * @property {string|null} latestVersion
 * @property {string} currentVersion
 * @property {boolean} isUpdateAvailable
 * @property {boolean} isSecurityUpdate
 * @property {string|null} compareUrl
 * @property {string|null} changelogUrl
 * @property {string|null} releaseNotes
 * @property {string} licenseRequestUrl
 * @property {string|null} useDeclaration
 * @property {string|null} contactEmail
 */

// Shared by all callers (one cache per page)
const updateInfo = shallowRef(/** @type {UpdateInfo|null} */ (null));
const loading = ref(false);
const error = ref(/** @type {string|null} */ (null));
let loaded = false;
let inFlight = /** @type {Promise<void>|null} */ (null);
// Bumped by reset(): an answer that arrives after a logout must not fill the next session's cache
let generation = 0;

function reset() {
    generation++;
    updateInfo.value = null;
    error.value = null;
    loading.value = false;
    loaded = false;
    inFlight = null;
}

/**
 * Test hook: the specs start each case from an empty cache (the state is module-wide).
 * The app itself resets on logout.
 */
export const resetUpdateCheck = reset;

/** An address the page may link to: http(s) only, anything else (a javascript: URL) is dropped. */
function webUrl(value) {
    return isWebUrl(value) ? value : null;
}

/**
 * The links the notes dialog and the Configuration card show, from the server's answer.
 * The Hub never builds these: it only refuses addresses that are not web pages.
 * @param {UpdateInfo|null|undefined} info
 * @returns {{ changes: string|null, licence: string|null }} licence is null for a licensed deployment
 */
export function updateLinks(info) {
    return {
        changes: webUrl(info?.compareUrl) || webUrl(info?.changelogUrl),
        licence: info?.useDeclaration === LICENSED_DECLARATION ? null : webUrl(info?.licenseRequestUrl)
    };
}

export function useUpdateCheck() {
    const auth = useAuthStore();

    // An admin on a server that checks for updates
    const enabled = computed(() => auth.isLoggedIn && auth.isAdmin && !!auth.feature(Features.UPDATE_CHECK_ENABLED));
    const updateAvailable = computed(() => enabled.value && !!updateInfo.value?.isUpdateAvailable);

    // The session ended (or changed user): what was learnt belongs to the previous one
    if (getCurrentScope()) watch(() => auth.isLoggedIn, isLoggedIn => { if (!isLoggedIn) reset(); });

    /**
     * @param {{ force?: boolean, ignoreGate?: boolean }} [options]
     *   force: ask again even when an answer is cached; ignoreGate: ask when the server's update
     *   check is off too (the Configuration page still shows the declaration and the licence link)
     */
    function load({ force = false, ignoreGate = false } = {}) {
        if (!ignoreGate && !enabled.value) return Promise.resolve();
        if (inFlight) return inFlight;
        if (loaded && !force) return Promise.resolve();

        const mine = generation;
        loading.value = true;
        error.value = null;
        const request = (async () => {
            try {
                const info = await reg.sys.updateInfo();
                if (mine === generation) updateInfo.value = info;
            } catch (e) {
                if (mine === generation) {
                    updateInfo.value = null;
                    error.value = e instanceof Error ? e.message : String(e);
                }
            } finally {
                if (mine === generation) {
                    loaded = true;
                    loading.value = false;
                    inFlight = null;
                }
            }
        })();
        inFlight = request;
        return request;
    }

    /**
     * Save the declaration and contact; the server answers with the new state, which replaces the cache.
     * A rejected request throws to the caller.
     * @param {{ useDeclaration: string|null, contactEmail: string|null, contactConsent: boolean }} settings
     */
    async function saveSettings(settings) {
        const info = await reg.sys.saveUpdateCheckSettings(settings);
        updateInfo.value = info;
        error.value = null;
        loaded = true;
        return info;
    }

    return { updateInfo, loading, error, enabled, updateAvailable, load, saveSettings };
}
