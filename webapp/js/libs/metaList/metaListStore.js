// @ts-check
/**
 * A list kept in a dataset meta key, one JSON item per entry (saved map views, report definitions),
 * readable by everyone who can read the dataset and written by its writers (the server checks).
 *
 * The dataset info response does not carry these keys: they are read with `meta/get/<key>`, and
 * read again from the server (no cached answer) before every write and conflict check, so two
 * writers see each other's saves.
 *
 * A meta list item cannot be changed in place, so an update adds the new item first and then
 * removes the old ones: a failed add leaves the old item, a failed remove leaves a duplicate.
 * An entry's identity is therefore its `uid`, kept in the item data, not the meta id; when items
 * share a uid the latest wins (meta mtime, then the update time, then meta id), and the next
 * update removes the others.
 *
 * The store knows nothing of what an entry holds: the caller gives the key, the uid prefix, the
 * caps and `validate`, and gets the entries with the reason one cannot be opened.
 */
import { compareText } from '@/libs/compareText';
import { isNotFound } from '@/libs/ddb/apiError';

const UID_LENGTH = 8;

/**
 * @typedef {{ id: string, mtime: number, data: any }} MetaItem  data is the parsed JSON object
 * @typedef {{ id: string, uid: string, name: string, data: any, newerVersion: boolean, error: string|null }} MetaEntry
 *   `error` is why the entry cannot be opened (it fails `validate`), or null
 * @typedef {{ id: string, error: string }} InvalidItem
 *   a meta item that is not an entry at all (not a JSON object, or no uid or name to tell it by):
 *   only its meta id is known, which is what a writer deletes it by
 * @typedef {{ error: string|null, newerVersion?: boolean }} Validation
 *
 * @typedef {object} MetaListConfig
 * @property {string} key  the meta key
 * @property {string} uidPrefix  entry uids are this prefix and 8 base36 characters
 * @property {number} maxItems  entries a dataset may hold
 * @property {number} maxBytes  UTF-8 bytes of the JSON an entry may take
 * @property {number} maxNameLength
 * @property {{ one: string, many: string }} label  what an entry is called in messages ("view", "saved views")
 * @property {(data: any) => Validation} validate  why the data of an entry cannot be opened; a later version is not an error
 * @property {(data: any) => string|null} [precheck]  a save problem to report before `validate`'s, in its own words
 * @property {string} [tooLarge]  the message for data over `maxBytes`
 * @property {{ createdBy: string|null, createdAt: string|null, updatedBy: string|null, updatedAt: string|null }} [audit]
 *   the data field of each audit value, null for one that is not kept (the defaults are the names themselves)
 */

/** Item data is the JSON text the Registry stores. @param {unknown} data */
function parsed(data) {
    if (typeof data !== 'string') return data;
    try {
        return JSON.parse(data);
    } catch {
        return null;
    }
}

const isObject = /** @param {unknown} x */ x => !!x && typeof x === 'object' && !Array.isArray(x);

/**
 * A meta list store.
 * @param {MetaListConfig} config
 */
export function createMetaListStore(config) {
    const { key, uidPrefix, maxItems, maxBytes, maxNameLength, label, validate, precheck } = config;
    const audit = { createdBy: 'createdBy', createdAt: 'createdAt', updatedBy: 'updatedBy', updatedAt: 'updatedAt', ...config.audit };
    const tooLarge = config.tooLarge ?? `This ${label.one} is too large to save: it can take at most ${maxBytes} bytes.`;

    /** @param {unknown} name */
    const validName = name => typeof name === 'string' && name.trim().length >= 1 && name.trim().length <= maxNameLength;

    /** @param {string} name  why an entry cannot be saved under this name, or null */
    const nameProblem = name => validName(name) ? null : `The name must be 1 to ${maxNameLength} characters long.`;

    /**
     * The meta items as the server holds them, data parsed. An item whose data is not a JSON
     * object is not an entry: it is returned apart, by its meta id.
     * @param {any} dataset @param {boolean} fresh  read from the server, not from the request cache
     * @returns {Promise<{ items: MetaItem[], invalid: InvalidItem[] }>}
     */
    async function readItems(dataset, fresh) {
        /** @type {any} */
        let raw;
        try {
            raw = await dataset.metaGet(key, '', { cache: !fresh });
        } catch (e) {
            // The Registry answers 404 for a key with no value: nothing has been saved
            if (isNotFound(e)) return { items: [], invalid: [] };
            throw e;
        }
        if (!Array.isArray(raw)) return { items: [], invalid: [] };
        /** @type {MetaItem[]} */
        const items = [];
        /** @type {InvalidItem[]} */
        const invalid = [];
        for (const item of raw) {
            const data = parsed(item && item.data);
            if (!isObject(data)) {
                invalid.push({ id: String(item && item.id), error: 'The item is not a JSON object.' });
                continue;
            }
            items.push({ id: String(item.id), mtime: Number(item.mtime) || 0, data });
        }
        return { items, invalid };
    }

    /** @param {MetaItem} a @param {MetaItem} b  > 0 when `a` is later */
    function compareAge(a, b) {
        if (a.mtime !== b.mtime) return a.mtime - b.mtime;
        const ua = String(a.data[audit.updatedAt ?? ''] || '');
        const ub = String(b.data[audit.updatedAt ?? ''] || '');
        if (ua !== ub) return ua < ub ? -1 : 1;
        return a.id === b.id ? 0 : (a.id < b.id ? -1 : 1);
    }

    /**
     * The entries of some items: the ones with a uid and a name (an item without them cannot be
     * told or shown: it is returned apart), one per uid (the latest), sorted by name.
     * @param {MetaItem[]} items
     * @returns {{ entries: MetaEntry[], invalid: InvalidItem[] }}
     */
    function select(items) {
        /** @type {Map<string, MetaItem>} */
        const latest = new Map();
        /** @type {InvalidItem[]} */
        const invalid = [];
        for (const item of items) {
            const { uid, name } = item.data;
            if (typeof uid !== 'string' || !uid) {
                invalid.push({ id: item.id, error: 'The item has no uid.' });
                continue;
            }
            if (!validName(name)) {
                invalid.push({ id: item.id, error: 'The item has no valid name.' });
                continue;
            }
            const current = latest.get(uid);
            if (!current || compareAge(item, current) > 0) latest.set(uid, item);
        }
        const entries = [...latest.values()]
            .map(item => {
                const check = validate(item.data);
                return { id: item.id, uid: item.data.uid, name: item.data.name.trim(), data: item.data, newerVersion: !!check.newerVersion, error: check.error };
            })
            .sort((a, b) => compareText(a.name, b.name));
        return { entries, invalid };
    }

    /**
     * Why data cannot be saved under this name, or null: the name, the size, `precheck`, `validate`.
     * @param {string} name @param {any} data  the item to store
     */
    function saveProblem(name, data) {
        const problem = nameProblem(name);
        if (problem) return problem;
        if (new TextEncoder().encode(JSON.stringify(data)).length > maxBytes) return tooLarge;
        const early = precheck ? precheck(data) : null;
        if (early) return early;
        const { error } = validate(data);
        return error ? `This ${label.one} cannot be saved: ${error}.` : null;
    }

    /**
     * A uid: the prefix and 8 base36 characters, not in `taken`.
     * @param {Iterable<string>} taken
     */
    function newUid(taken) {
        const used = new Set(taken);
        let uid;
        do {
            const bytes = crypto.getRandomValues(new Uint8Array(UID_LENGTH));
            uid = uidPrefix + Array.from(bytes, b => (b % 36).toString(36)).join('');
        } while (used.has(uid));
        return uid;
    }

    /**
     * The entries of the dataset, one per uid, sorted by name, and the items that are no entry.
     * An entry that fails validation is listed with its `error` (the caller says why it cannot
     * open it; a writer can still delete it), and so is one of a later version (`newerVersion`).
     * @param {any} dataset
     * @param {{ fresh?: boolean }} [options]  fresh: bypass the request cache
     * @returns {Promise<{ entries: MetaEntry[], invalid: InvalidItem[] }>}
     */
    async function list(dataset, { fresh = false } = {}) {
        const read = await readItems(dataset, fresh);
        const picked = select(read.items);
        return { entries: picked.entries, invalid: [...read.invalid, ...picked.invalid] };
    }

    /** The audit fields of a write by `user` at `at`. @param {string} user @param {string} at */
    function stamp(user, at) {
        /** @type {Record<string, string>} */
        const fields = {};
        if (audit.updatedBy) fields[audit.updatedBy] = user;
        if (audit.updatedAt) fields[audit.updatedAt] = at;
        return fields;
    }

    /**
     * Saves a new entry: `body` is its data, to which the store adds the uid, the name and the
     * audit fields.
     * @param {any} dataset @param {object} body
     * @param {{ name: string, user: string, now?: Date }} options
     * @returns {Promise<MetaEntry>}
     */
    async function saveNew(dataset, body, { name, user, now = new Date() }) {
        const { items } = await readItems(dataset, true);
        if (select(items).entries.length >= maxItems) {
            throw new Error(`This dataset has ${maxItems} ${label.many}. Delete one to save a new ${label.one}.`);
        }
        const at = now.toISOString();
        const data = {
            ...body, uid: newUid(items.map(i => i.data.uid)), name: String(name).trim(),
            ...(audit.createdBy ? { [audit.createdBy]: user } : {}),
            ...(audit.createdAt ? { [audit.createdAt]: at } : {}),
            ...stamp(user, at)
        };
        const problem = saveProblem(name, data);
        if (problem) throw new Error(problem);
        const item = await dataset.metaAdd(key, data);
        return { id: String(item.id), uid: data.uid, name: data.name, data, newerVersion: !!validate(data).newerVersion, error: null };
    }

    /**
     * Stores a new version of an entry (body, name or both): the new item is added first, then
     * every other item of its uid is removed. The creation fields stay; without a body, the
     * saved data stays as it is.
     * @param {any} dataset @param {string} uid
     * @param {{ body?: object, name?: string, user: string, now?: Date }} options
     * @returns {Promise<MetaEntry>}
     */
    async function update(dataset, uid, { body, name, user, now = new Date() }) {
        const { items } = await readItems(dataset, true);
        const current = select(items).entries.find(e => e.uid === uid);
        if (!current) throw new Error(`This ${label.one} was deleted.`);
        const nextName = name !== undefined ? name.trim() : current.name;
        const data = {
            ...(body ?? current.data),
            uid,
            name: nextName,
            ...(audit.createdBy ? { [audit.createdBy]: current.data[audit.createdBy] || '' } : {}),
            ...(audit.createdAt ? { [audit.createdAt]: current.data[audit.createdAt] || now.toISOString() } : {}),
            ...stamp(user, now.toISOString())
        };
        const problem = saveProblem(nextName, data);
        if (problem) throw new Error(problem);

        const item = await dataset.metaAdd(key, data);
        const newId = String(item.id);
        const stale = items.filter(i => i.data.uid === uid && i.id !== newId);
        // A failed remove leaves a duplicate that the latest item hides; the next update retries it
        await Promise.all(stale.map(i => dataset.metaRemove(i.id).catch(/** @param {any} e */ e => console.error(`Cannot remove an old ${label.one} item:`, e))));
        return { id: newId, uid, name: nextName, data, newerVersion: !!validate(data).newerVersion, error: null };
    }

    /** Deletes every item of an entry. @param {any} dataset @param {string} uid */
    async function remove(dataset, uid) {
        const { items } = await readItems(dataset, true);
        for (const i of items.filter(item => item.data.uid === uid)) await dataset.metaRemove(i.id);
    }

    /**
     * Deletes one meta item by its meta id: the way out for an item that is no entry (see `list`).
     * @param {any} dataset @param {string} id
     */
    async function removeItem(dataset, id) {
        await dataset.metaRemove(id);
    }

    /**
     * What happened to an entry since it was loaded from meta item `loadedId`: 'deleted',
     * 'changed' (another save) or null.
     * @param {any} dataset @param {string} uid @param {string} loadedId
     * @returns {Promise<'deleted'|'changed'|null>}
     */
    async function change(dataset, uid, loadedId) {
        const current = (await list(dataset, { fresh: true })).entries.find(e => e.uid === uid);
        if (!current) return 'deleted';
        return current.id === loadedId ? null : 'changed';
    }

    return { key, list, saveNew, update, remove, removeItem, change, newUid, nameProblem, saveProblem };
}
