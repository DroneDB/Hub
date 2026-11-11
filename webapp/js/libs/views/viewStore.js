// @ts-check
/**
 * Saved map views: the items of the dataset meta list `views`, readable by everyone who can read
 * the dataset and written by its writers (the server checks).
 *
 * The dataset info response does not carry them: they are read with `meta/get/views`, and read
 * again from the server (no cached answer) before every write and conflict check, so two writers
 * see each other's saves.
 *
 * A meta list item cannot be changed in place, so an update adds the new item first and then
 * removes the old ones: a failed add leaves the old item, a failed remove leaves a duplicate.
 * A view's identity is therefore its `uid`, kept in the item data, not the meta id; when items
 * share a uid the latest wins (meta mtime, then updatedAt, then meta id), and the next update
 * removes the others.
 */
import { VIEW_VERSION, MAX_NAME_LENGTH, MAX_VIEW_BYTES, MAX_VIEWS, validateState, workingState, isSafeLayerPath } from './viewState';
import { compareText } from '@/libs/compareText';
import { isNotFound } from '@/libs/ddb/apiError';

export const VIEWS_KEY = 'views';

/**
 * @typedef {{ id: string, mtime: number, data: any }} MetaItem
 * @typedef {{ id: string, uid: string, name: string, data: any, newerVersion: boolean, error: string|null }} SavedView
 *   `error` is why the item cannot be opened (it fails validation), or null
 */

const validName = /** @param {unknown} name */ name => typeof name === 'string' && name.trim().length >= 1 && name.trim().length <= MAX_NAME_LENGTH;

/** Item data is the JSON text the Registry stores. @param {unknown} data */
function parsed(data) {
    if (typeof data !== 'string') return data;
    try {
        return JSON.parse(data);
    } catch {
        return null;
    }
}

/**
 * The meta items as the server holds them, data parsed. An item whose data is not a JSON object
 * is skipped (and logged): it is nobody's saved view.
 * @param {any} dataset @param {boolean} fresh  read from the server, not from the request cache
 * @returns {Promise<MetaItem[]>}
 */
async function readItems(dataset, fresh) {
    /** @type {any} */
    let raw;
    try {
        raw = await dataset.metaGet(VIEWS_KEY, '', { cache: !fresh });
    } catch (e) {
        // The Registry answers 404 for a key with no value: no view has been saved
        if (isNotFound(e)) return [];
        throw e;
    }
    if (!Array.isArray(raw)) return [];
    /** @type {MetaItem[]} */
    const items = [];
    for (const item of raw) {
        const data = parsed(item && item.data);
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
            console.error('Skipping a saved view that is not a JSON object:', item && item.id);
            continue;
        }
        items.push({ id: String(item.id), mtime: Number(item.mtime) || 0, data });
    }
    return items;
}

/** @param {MetaItem} a @param {MetaItem} b  > 0 when `a` is later */
function compareAge(a, b) {
    if (a.mtime !== b.mtime) return a.mtime - b.mtime;
    const ua = String(a.data.updatedAt || '');
    const ub = String(b.data.updatedAt || '');
    if (ua !== ub) return ua < ub ? -1 : 1;
    return a.id === b.id ? 0 : (a.id < b.id ? -1 : 1);
}

/**
 * The saved views of some items: the ones with a uid and a name (an item without them cannot be
 * told or shown, and is logged), one per uid (the latest), sorted by name.
 * @param {MetaItem[]} items
 * @returns {SavedView[]}
 */
function latestViews(items) {
    /** @type {Map<string, MetaItem>} */
    const latest = new Map();
    for (const item of items) {
        const { uid, name } = item.data;
        if (typeof uid !== 'string' || !uid || !validName(name)) {
            console.error('Skipping a saved view without a valid uid or name:', item.id);
            continue;
        }
        const current = latest.get(uid);
        if (!current || compareAge(item, current) > 0) latest.set(uid, item);
    }
    return [...latest.values()]
        .map(item => {
            const check = validateState(item.data);
            return { id: item.id, uid: item.data.uid, name: item.data.name.trim(), data: item.data, newerVersion: check.newerVersion, error: check.error };
        })
        .sort((a, b) => compareText(a.name, b.name));
}

/**
 * The saved views of the dataset, one per uid, sorted by name. A view that fails validation is
 * listed with its `error` (the viewer says why it cannot open it; a writer can still delete it),
 * and so is a view of a later version (`newerVersion`).
 * @param {any} dataset
 * @param {{ fresh?: boolean }} [options]  fresh: bypass the request cache
 * @returns {Promise<SavedView[]>}
 */
export async function listViews(dataset, { fresh = false } = {}) {
    return latestViews(await readItems(dataset, fresh));
}

/**
 * The saved views that show a file, as a layer or as the base file.
 * @param {SavedView[]} views @param {string} path  dataset-relative
 */
export function viewsUsing(views, path) {
    return views.filter(v => !v.newerVersion && !v.error
        && (v.data.base.path === path || v.data.layers.some(/** @param {any} l */ l => l.path === path)));
}

/**
 * Why a view cannot be saved under this name, or null.
 * @param {string} name @param {any} data  the item to store
 */
export function saveProblem(name, data) {
    if (!validName(name)) return `The name must be 1 to ${MAX_NAME_LENGTH} characters long.`;
    if (new TextEncoder().encode(JSON.stringify(data)).length > MAX_VIEW_BYTES) {
        return 'This view is too large to save. Remove plant health settings or layers and try again.';
    }
    if (Array.isArray(data.layers) && !data.layers.every(/** @param {any} l */ l => isSafeLayerPath(l && l.path))) return 'A layer path is not valid.';
    const { error } = validateState(data);
    return error ? `This view cannot be saved: ${error}.` : null;
}

const UID_PREFIX = 'v_';
const UID_LENGTH = 8;

/**
 * A view uid: `v_` and 8 base36 characters, not in `taken`.
 * @param {Iterable<string>} taken
 */
export function newViewUid(taken) {
    const used = new Set(taken);
    let uid;
    do {
        const bytes = crypto.getRandomValues(new Uint8Array(UID_LENGTH));
        uid = UID_PREFIX + Array.from(bytes, b => (b % 36).toString(36)).join('');
    } while (used.has(uid));
    return uid;
}

/**
 * Saves a new view.
 * @param {any} dataset @param {import('./viewState').ViewState} state
 * @param {{ name: string, user: string, now?: Date }} options
 * @returns {Promise<SavedView>}
 */
export async function saveNewView(dataset, state, { name, user, now = new Date() }) {
    const items = await readItems(dataset, true);
    if (latestViews(items).length >= MAX_VIEWS) {
        throw new Error(`This dataset has ${MAX_VIEWS} saved views. Delete one to save a new view.`);
    }
    const at = now.toISOString();
    const data = {
        ...workingState(state), uid: newViewUid(items.map(i => i.data.uid)), name: name.trim(),
        createdBy: user, createdAt: at, updatedBy: user, updatedAt: at
    };
    const problem = saveProblem(name, data);
    if (problem) throw new Error(problem);
    const item = await dataset.metaAdd(VIEWS_KEY, data);
    return { id: String(item.id), uid: data.uid, name: data.name, data, newerVersion: false, error: null };
}

/**
 * Stores a new version of a saved view (state, name or both): the new item is added first, then
 * every other item of its uid is removed. The creation fields stay; without a state, the saved
 * data stays as it is.
 * @param {any} dataset @param {string} uid
 * @param {{ state?: import('./viewState').ViewState, name?: string, user: string, now?: Date }} options
 * @returns {Promise<SavedView>}
 */
export async function updateView(dataset, uid, { state, name, user, now = new Date() }) {
    const items = await readItems(dataset, true);
    const current = latestViews(items).find(v => v.uid === uid);
    if (!current) throw new Error('This view was deleted.');
    const nextName = name !== undefined ? name.trim() : current.name;
    const data = {
        ...(state ? workingState(state) : current.data),
        uid,
        name: nextName,
        createdBy: current.data.createdBy || '',
        createdAt: current.data.createdAt || now.toISOString(),
        updatedBy: user,
        updatedAt: now.toISOString()
    };
    const problem = saveProblem(nextName, data);
    if (problem) throw new Error(problem);

    const item = await dataset.metaAdd(VIEWS_KEY, data);
    const newId = String(item.id);
    const stale = items.filter(i => i.data.uid === uid && i.id !== newId);
    // A failed remove leaves a duplicate that the latest item hides; the next update retries it
    await Promise.all(stale.map(i => dataset.metaRemove(i.id).catch(/** @param {any} e */ e => console.error('Cannot remove an old view item:', e))));
    return { id: newId, uid, name: nextName, data, newerVersion: data.v > VIEW_VERSION, error: null };
}

/** Deletes every item of a saved view. @param {any} dataset @param {string} uid */
export async function deleteView(dataset, uid) {
    const items = await readItems(dataset, true);
    for (const i of items.filter(item => item.data.uid === uid)) await dataset.metaRemove(i.id);
}

/**
 * What happened to a saved view since it was loaded from meta item `loadedId`: 'deleted',
 * 'changed' (another save) or null.
 * @param {any} dataset @param {string} uid @param {string} loadedId
 * @returns {Promise<'deleted'|'changed'|null>}
 */
export async function viewChange(dataset, uid, loadedId) {
    const current = (await listViews(dataset, { fresh: true })).find(v => v.uid === uid);
    if (!current) return 'deleted';
    return current.id === loadedId ? null : 'changed';
}
