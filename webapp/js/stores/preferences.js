// @ts-check
/**
 * Account sync of the preferences that follow the user (ACCOUNT_SECTIONS). Local storage stays
 * the source for every view; this store only moves values between it and the account:
 *
 *  - on login it loads the account's preferences: the account wins for the fields it has, a
 *    field it lacks keeps its local value and is sent (an empty account is seeded this way);
 *  - a local change marks its section dirty and a debounced PATCH sends the dirty sections,
 *    one request at a time. A section is sent whole; a key without a value is sent as null and
 *    a section without any value as null (the account forgets it). The exception is a section the
 *    server merges field by field (MERGED_SECTIONS): only the fields that changed are sent, so a
 *    device with a stale copy of the other fields cannot overwrite what another device saved.
 *
 * The store is the only subscriber to the login state of the sync; it does not subscribe to
 * the client's events (the auth store does).
 */
import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import reg from '@/libs/api/sharedRegistry';
import { useAuthStore } from '@/stores/auth';
import { useNotify } from '@/composables/useNotify';
import { ACCOUNT_OWNED, ACCOUNT_SECTIONS, PREF, RENAMED_PREFS, applyAccountValue, getPref, onPrefChange, removePref } from '@/libs/preferences';

const ENDPOINT = '/users/preferences';
const SAVE_DELAY_MS = 600;

/** Section name -> its keys and the field each has in the section. @type {Map<string, { key: string, field: string }[]>} */
const SECTIONS = new Map();
for (const [key, [section, field]] of Object.entries(ACCOUNT_SECTIONS)) {
    if (!SECTIONS.has(section)) SECTIONS.set(section, []);
    SECTIONS.get(section)?.push({ key, field });
}

/**
 * Sections the server merges field by field (a missing or null field keeps the stored value). Only the
 * changed fields of these are sent; every other section is replaced whole by the server, so it is sent whole.
 */
const MERGED_SECTIONS = new Set(['notifications']);

/**
 * Pending work per section: the fields to send, or null for the whole section.
 * @typedef {Map<string, Set<string>|null>} PendingSections
 */

/**
 * Records that `field` of section `name` (the whole section when the field is not given or the server replaces
 * the section whole) is to be sent.
 * @param {PendingSections} pending @param {string} name @param {string} [field]
 */
function addPending(pending, name, field) {
    if (!MERGED_SECTIONS.has(name) || field === undefined) {
        pending.set(name, null);
        return;
    }
    const fields = pending.get(name);
    if (fields === null) return;
    if (fields) fields.add(field);
    else pending.set(name, new Set([field]));
}

/**
 * Whether `field` of section `name` is in `pending` (the whole section counts).
 * @param {PendingSections} pending @param {string} name @param {string} field
 */
function isPending(pending, name, field) {
    if (!pending.has(name)) return false;
    const fields = pending.get(name);
    return fields === null || !!fields?.has(field);
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
    [PREF.ORG_PAGE]: ({ itemsPerPage, pageSizeChosen, ownedOnly, sortColumn, sortDirection, view }) => ({ itemsPerPage, pageSizeChosen, ownedOnly, sortColumn, sortDirection, view })
};

/** @param {string} key @returns {boolean} */
const hasLocalValue = key => getPref(key, null) !== null;

/**
 * The account form of a section from the local values: every field (or only those in `only`), null for a
 * key without a value; null when no key has one (and `only` is not given: a partial section is never null).
 * @param {string} name @param {Set<string>|null} [only]
 */
function buildSection(name, only = null) {
    const fields = /** @type {Record<string, unknown>} */ ({});
    let any = !!only;
    for (const { key, field } of SECTIONS.get(name) ?? []) {
        if (only && !only.has(field)) continue;
        const value = getPref(key, null);
        any ||= value !== null;
        fields[field] = isObject(value) && TO_ACCOUNT[key] ? TO_ACCOUNT[key](value) : value;
    }
    return any ? fields : null;
}

/** @param {PendingSections} pending */
const buildBody = pending => Object.fromEntries([...pending].map(([name, only]) => [name, buildSection(name, only)]));

/** @param {unknown} e */
const isConflict = e => !!e && typeof e === 'object' && /** @type {any} */ (e).status === 409;

export const usePreferencesStore = defineStore('preferences', () => {
    const auth = useAuthStore();
    const notify = useNotify();

    /** @type {import('vue').Ref<'idle'|'loading'|'saving'|'error'>} */
    const status = ref('idle');
    /** The sections (and fields) to send. @type {PendingSections} */
    const dirty = new Map();
    /** The sections (and fields) of the request in flight. @type {PendingSections} */
    const inFlight = new Map();
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

    /** @param {string} name @param {string} [field] the changed field; the whole section when not given */
    function markSection(name, field) {
        if (!auth.isLoggedIn || !SECTIONS.has(name)) return;
        addPending(dirty, name, field);
        if (!loading) status.value = 'saving';
        clearTimer();
        timer = setTimeout(() => { timer = null; void send(); }, SAVE_DELAY_MS);
    }

    /** @type {import('@/libs/preferences').PrefListener} */
    function onLocalChange(key, _value, origin) {
        if (origin === 'local' && Object.hasOwn(ACCOUNT_SECTIONS, key)) markSection(ACCOUNT_SECTIONS[key][0], ACCOUNT_SECTIONS[key][1]);
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
     * Reads the account and applies it to the fields that are not dirty or being sent (those
     * hold a newer local change; a whole section for the sections the server replaces whole, a field for the
     * ones it merges): the account wins for the fields it has; a field it lacks that has a
     * local value is marked dirty, except for an ACCOUNT_OWNED key, whose local value is removed. A
     * field the account holds under its old name (RENAMED_PREFS) counts as the new field, and its
     * section is marked dirty so the next save leaves the old name out.
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
            const stored = Object.hasOwn(sections, name) ? sections[name] : null;
            /** @param {string | undefined} field */
            const holds = field => !!field && isObject(stored) && Object.hasOwn(stored, field);
            // Decided before the loop: what this loop marks dirty must not hide the other fields of the section
            const held = new Set(fields.map(f => f.field).filter(f => isPending(dirty, name, f) || isPending(inFlight, name, f)));
            for (const { key, field } of fields) {
                if (held.has(field)) continue;
                const oldField = RENAMED_PREFS[key]?.field;
                if (holds(field)) applyAccountValue(key, stored[field]);
                else if (holds(oldField)) applyAccountValue(key, stored[/** @type {string} */ (oldField)]);
                else if (ACCOUNT_OWNED.includes(key)) applyAccountValue(key, null);
                else if (hasLocalValue(key)) addPending(dirty, name, field);
                if (holds(oldField)) addPending(dirty, name);
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
                const batch = new Map(dirty);
                dirty.clear();
                batch.forEach((fields, name) => inFlight.set(name, fields));
                status.value = 'saving';
                try {
                    await reg.patchRequest(ENDPOINT, buildBody(batch), { invalidate: ENDPOINT });
                } catch (e) {
                    if (sessionId !== session) return;
                    inFlight.clear();
                    for (const [name, fields] of batch) {
                        if (fields === null) addPending(dirty, name);
                        else fields.forEach(field => addPending(dirty, name, field));
                    }
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
