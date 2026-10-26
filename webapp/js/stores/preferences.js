// @ts-check
/**
 * Account sync of the preferences that follow the user (ACCOUNT_SECTIONS). Local storage stays
 * the source for every view; this store only moves values between it and the account:
 *
 *  - on login it loads the account's preferences: the account wins for the fields it has, a
 *    field it lacks keeps its local value and is sent (an empty account is seeded this way);
 *  - a local change marks its section dirty and a debounced PATCH sends the dirty sections,
 *    one request at a time. A section is sent whole; a key without a value is sent as null and
 *    a section without any value as null (the account forgets it).
 *
 * The store is the only subscriber to the login state of the sync; it does not subscribe to
 * the client's events (the auth store does).
 */
import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import reg from '@/libs/api/sharedRegistry';
import { useAuthStore } from '@/stores/auth';
import { useNotify } from '@/composables/useNotify';
import { ACCOUNT_SECTIONS, PREF, RENAMED_PREFS, applyAccountValue, getPref, onPrefChange, removePref } from '@/libs/preferences';

const ENDPOINT = '/users/preferences';
const SAVE_DELAY_MS = 600;

/** Section name -> its keys and the field each has in the section. @type {Map<string, { key: string, field: string }[]>} */
const SECTIONS = new Map();
for (const [key, [section, field]] of Object.entries(ACCOUNT_SECTIONS)) {
    if (!SECTIONS.has(section)) SECTIONS.set(section, []);
    SECTIONS.get(section)?.push({ key, field });
}

/** @param {unknown} value @returns {value is Record<string, any>} */
const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);

/**
 * What of a local value goes to the account: derived or navigation data stays out.
 * @type {Record<string, (value: Record<string, any>) => unknown>}
 */
const TO_ACCOUNT = {
    // The WMS layer list is large and fetched again when the map settings need it
    [PREF.CUSTOM_BASEMAP]: config => Object.fromEntries(Object.entries(config).filter(([field]) => field !== 'wmsLayers')),
    // The position of the page (currentPage, scrollTop) is not a preference
    [PREF.ORG_PAGE]: ({ itemsPerPage, ownedOnly }) => ({ itemsPerPage, ownedOnly })
};

/** @param {string} key @returns {boolean} */
const hasLocalValue = key => getPref(key, null) !== null;

/**
 * The account form of a section from the local values: every field, null for a key without a
 * value; null when no key has one.
 * @param {string} name
 */
function buildSection(name) {
    const fields = /** @type {Record<string, unknown>} */ ({});
    let any = false;
    for (const { key, field } of SECTIONS.get(name) ?? []) {
        const value = getPref(key, null);
        any ||= value !== null;
        fields[field] = isObject(value) && TO_ACCOUNT[key] ? TO_ACCOUNT[key](value) : value;
    }
    return any ? fields : null;
}

/** @param {Iterable<string>} names */
const buildBody = names => Object.fromEntries([...names].map(name => [name, buildSection(name)]));

/** @param {unknown} e */
const isConflict = e => !!e && typeof e === 'object' && /** @type {any} */ (e).status === 409;

export const usePreferencesStore = defineStore('preferences', () => {
    const auth = useAuthStore();
    const notify = useNotify();

    /** @type {import('vue').Ref<'idle'|'loading'|'saving'|'error'>} */
    const status = ref('idle');
    /** Names of the sections to send. @type {Set<string>} */
    const dirty = new Set();
    /** Names of the sections of the request in flight. @type {Set<string>} */
    const inFlight = new Set();
    /** @type {ReturnType<typeof setTimeout>|null} */
    let timer = null;
    /** Bumped when the session ends or changes: the answers of an older one are dropped. */
    let session = 0;
    let loading = false;
    let sending = false;
    let warned = false;
    /** @type {Promise<void>|null} */
    let loadRunning = null;
    /** @type {(() => void)|null} */
    let unsubscribe = null;

    function clearTimer() {
        if (timer !== null) clearTimeout(timer);
        timer = null;
    }

    /** @param {string} name */
    function markSection(name) {
        if (!auth.isLoggedIn || !SECTIONS.has(name)) return;
        dirty.add(name);
        if (!loading) status.value = 'saving';
        clearTimer();
        timer = setTimeout(() => { timer = null; void send(); }, SAVE_DELAY_MS);
    }

    /** @type {import('@/libs/preferences').PrefListener} */
    function onLocalChange(key, _value, origin) {
        if (origin === 'local' && Object.hasOwn(ACCOUNT_SECTIONS, key)) markSection(ACCOUNT_SECTIONS[key][0]);
    }

    /** The send failed or the load did: keep what is pending, say so once per session. @param {unknown} error */
    function fail(error) {
        status.value = 'error';
        console.warn('Preferences are not synced with the account', error);
        if (!warned) {
            warned = true;
            notify.warn('Your preferences could not be saved to your account. They are kept on this device and sent again with your next change.',
                { summary: 'Preferences' });
        }
    }

    /**
     * Reads the account and applies it to the sections that are not dirty or being sent (those
     * hold a newer local change): the account wins for the fields it has; a field it lacks that has a
     * local value is marked dirty. A field the account holds under its old name (RENAMED_PREFS) counts
     * as the new field, and its section is marked dirty so the next save leaves the old name out.
     * Returns false when it failed or the session ended meanwhile.
     * @param {number} sessionId
     */
    async function fetchAndApply(sessionId) {
        loading = true;
        status.value = 'loading';
        let account;
        try {
            account = await reg.getRequest(ENDPOINT, { cache: false });
        } catch (e) {
            if (sessionId !== session) return false;
            loading = false;
            fail(e);
            return false;
        }
        if (sessionId !== session) return false;
        loading = false;

        const sections = isObject(account) ? account : {};
        for (const [name, fields] of SECTIONS) {
            if (dirty.has(name) || inFlight.has(name)) continue;
            const stored = Object.hasOwn(sections, name) ? sections[name] : null;
            /** @param {string | undefined} field */
            const holds = field => !!field && isObject(stored) && Object.hasOwn(stored, field);
            for (const { key, field } of fields) {
                const oldField = RENAMED_PREFS[key]?.field;
                if (holds(field)) applyAccountValue(key, stored[field]);
                else if (holds(oldField)) applyAccountValue(key, stored[/** @type {string} */ (oldField)]);
                else if (hasLocalValue(key)) dirty.add(name);
                if (holds(oldField)) dirty.add(name);
            }
        }
        status.value = dirty.size ? 'saving' : 'idle';
        return true;
    }

    /** Sends the dirty sections, one request at a time, until none is left or a change is waiting out its delay. */
    async function send() {
        if (sending || loading || !auth.isLoggedIn) return;
        const sessionId = session;
        sending = true;
        let reloaded = false;
        try {
            while (dirty.size && timer === null && !loading) {
                const names = [...dirty];
                dirty.clear();
                names.forEach(name => inFlight.add(name));
                status.value = 'saving';
                try {
                    await reg.patchRequest(ENDPOINT, buildBody(names), { invalidate: ENDPOINT });
                } catch (e) {
                    if (sessionId !== session) return;
                    inFlight.clear();
                    names.forEach(name => dirty.add(name));
                    // The account changed during the save: read it, then send what is still pending
                    if (isConflict(e) && !reloaded) {
                        reloaded = true;
                        if (!await fetchAndApply(sessionId)) return;
                        continue;
                    }
                    fail(e);
                    return;
                }
                if (sessionId !== session) return;
                inFlight.clear();
                reloaded = false;
            }
            status.value = dirty.size ? 'saving' : 'idle';
        } finally {
            if (sessionId === session) sending = false;
        }
    }

    /** Sends what is pending now, without waiting out the delay. */
    function sendNow() {
        clearTimer();
        return send();
    }

    /** Reads the account's preferences and reconciles (see fetchAndApply), then sends what is pending. */
    function load() {
        if (!auth.isLoggedIn) return Promise.resolve();
        loadRunning ??= (async () => {
            const sessionId = session;
            try {
                if (await fetchAndApply(sessionId)) await sendNow();
            } finally {
                if (sessionId === session) loadRunning = null;
            }
        })();
        return loadRunning;
    }

    function start() {
        unsubscribe ??= onPrefChange(onLocalChange);
        return load();
    }

    /** Logout or user switch: nothing is sent for the old session. Local values stay. */
    function stop() {
        session++;
        clearTimer();
        dirty.clear();
        inFlight.clear();
        unsubscribe?.();
        unsubscribe = null;
        loading = false;
        sending = false;
        warned = false;
        loadRunning = null;
        status.value = 'idle';
    }

    /**
     * Back to the defaults: removes the section's local values and sends the section as null.
     * Open views follow, as the removal is a preference change.
     * @param {string} name
     */
    function resetSection(name) {
        for (const { key } of SECTIONS.get(name) ?? []) removePref(key);
        markSection(name);
    }

    function resetAll() {
        for (const name of SECTIONS.keys()) resetSection(name);
    }

    // A new session starts for every login and every change of user
    watch(() => (auth.isLoggedIn ? `user:${auth.username}` : ''), who => {
        stop();
        if (who) void start();
    }, { immediate: true });

    return { status, sections: [...SECTIONS.keys()], load, resetSection, resetAll };
});
