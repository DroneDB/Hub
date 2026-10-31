// @ts-check
/**
 * Saved comparisons: the items of the dataset meta list `comparisons`, readable by everyone who
 * can read the dataset and written by its writers (the server checks).
 *
 * A meta list item cannot be changed in place, so an update adds the new item first and then
 * removes the old one: a failed add leaves the old item, a failed remove leaves a duplicate.
 * The comparison's identity is therefore its `uid`, kept in the item data, not the meta id; when
 * items share a uid the latest wins (meta mtime, then updatedAt, then meta id), and the next
 * update removes the others.
 */
import { validateState, workingState, isSafeLayerPath } from './compareState';
import { compareText } from '@/libs/compareText';

export const COMPARISONS_KEY = 'comparisons';
export const MAX_NAME_LENGTH = 100;
// Every saved comparison comes with each dataset info response
export const MAX_SAVED_BYTES = 16 * 1024;

/**
 * @typedef {{ id: string, mtime: number, data: any }} MetaItem
 * @typedef {{ id: string, uid: string, name: string, data: any, newerVersion: boolean }} SavedComparison
 */

/** @param {unknown} data */
function parsed(data) {
    if (typeof data !== 'string') return data;
    try {
        return JSON.parse(data);
    } catch {
        return null;
    }
}

const validName = /** @param {unknown} name */ name => typeof name === 'string' && name.trim().length >= 1 && name.trim().length <= MAX_NAME_LENGTH;

/**
 * The meta list items of a dataset root entry (dataset.info()[0]), data parsed.
 * @param {any} rootEntry
 * @returns {MetaItem[]}
 */
export function metaItems(rootEntry) {
    const raw = rootEntry && rootEntry.properties && rootEntry.properties.meta && rootEntry.properties.meta[COMPARISONS_KEY];
    if (!Array.isArray(raw)) return [];
    return raw.map(item => ({ id: String(item.id), mtime: Number(item.mtime) || 0, data: parsed(item.data) }))
        .filter(item => item.data && typeof item.data === 'object');
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
 * The saved comparisons: valid items (or items of a later version with a valid uid and name),
 * one per uid (the latest), sorted by name.
 * @param {any} rootEntry
 * @returns {SavedComparison[]}
 */
export function savedComparisons(rootEntry) {
    /** @type {Map<string, MetaItem & { newerVersion: boolean }>} */
    const latest = new Map();
    for (const item of metaItems(rootEntry)) {
        const { uid, name } = item.data;
        if (typeof uid !== 'string' || !uid || !validName(name)) continue;
        const check = validateState(item.data);
        if (check.error) continue;
        const current = latest.get(uid);
        if (!current || compareAge(item, current) > 0) latest.set(uid, { ...item, newerVersion: check.newerVersion });
    }
    return [...latest.values()]
        .map(item => ({ id: item.id, uid: item.data.uid, name: item.data.name.trim(), data: item.data, newerVersion: item.newerVersion }))
        .sort((a, b) => compareText(a.name, b.name));
}

/**
 * The saved comparisons that show a file.
 * @param {SavedComparison[]} saved @param {string} path  dataset-relative
 */
export function comparisonsUsing(saved, path) {
    return saved.filter(c => !c.newerVersion && c.data.layers.some(/** @param {any} l */ l => l.path === path));
}

/** @param {SavedComparison[]} saved */
function newUid(saved) {
    const taken = new Set(saved.map(c => c.uid));
    let uid;
    do {
        uid = `c_${Math.random().toString(36).slice(2, 10)}`;
    } while (taken.has(uid) || uid.length < 6);
    return uid;
}

/**
 * Why a comparison cannot be saved under this name, or null.
 * @param {string} name @param {any} data  the item to store
 */
export function saveProblem(name, data) {
    if (!validName(name)) return `The name must be 1 to ${MAX_NAME_LENGTH} characters long.`;
    if (new TextEncoder().encode(JSON.stringify(data)).length > MAX_SAVED_BYTES) {
        return 'This comparison is too large to save. Remove plant health settings or layers and try again.';
    }
    if (!data.layers.every(/** @param {any} l */ l => isSafeLayerPath(l.path))) return 'A layer path is not valid.';
    return null;
}

/** The saved comparisons as the server has them now. @param {any} dataset */
export async function loadSaved(dataset) {
    const entries = await dataset.info();
    return { rootEntry: entries[0], saved: savedComparisons(entries[0]) };
}

/**
 * What happened to a saved comparison since it was loaded with meta item `loadedId`:
 * 'deleted', 'changed' (another save) or null.
 * @param {any} dataset @param {string} uid @param {string} loadedId
 * @returns {Promise<'deleted'|'changed'|null>}
 */
export async function savedChange(dataset, uid, loadedId) {
    const { saved } = await loadSaved(dataset);
    const current = saved.find(c => c.uid === uid);
    if (!current) return 'deleted';
    return current.id === loadedId ? null : 'changed';
}

/**
 * Saves a new comparison.
 * @param {any} dataset @param {import('./compareState').ComparisonState} state
 * @param {{ name: string, user: string, now?: Date }} options
 * @returns {Promise<SavedComparison>}
 */
export async function saveNew(dataset, state, { name, user, now = new Date() }) {
    const { saved } = await loadSaved(dataset);
    const at = now.toISOString();
    const data = { ...workingState(state), uid: newUid(saved), name: name.trim(), createdBy: user, createdAt: at, updatedBy: user, updatedAt: at };
    const problem = saveProblem(name, data);
    if (problem) throw new Error(problem);
    const item = await dataset.metaAdd(COMPARISONS_KEY, data);
    return { id: String(item.id), uid: data.uid, name: data.name, data, newerVersion: false };
}

/**
 * Stores a new version of a saved comparison (state, name or both): the new item is added
 * first, then every other item of its uid is removed. The creation fields stay.
 * @param {any} dataset @param {string} uid
 * @param {{ state?: import('./compareState').ComparisonState, name?: string, user: string, now?: Date }} options
 * @returns {Promise<SavedComparison>}
 */
export async function updateSaved(dataset, uid, { state, name, user, now = new Date() }) {
    const { rootEntry, saved } = await loadSaved(dataset);
    const current = saved.find(c => c.uid === uid);
    if (!current) throw new Error('This comparison was deleted.');
    const nextName = name !== undefined ? name.trim() : current.name;
    const data = {
        ...workingState(state || current.data),
        uid,
        name: nextName,
        createdBy: current.data.createdBy || '',
        createdAt: current.data.createdAt || now.toISOString(),
        updatedBy: user,
        updatedAt: now.toISOString()
    };
    const problem = saveProblem(nextName, data);
    if (problem) throw new Error(problem);

    const item = await dataset.metaAdd(COMPARISONS_KEY, data);
    const newId = String(item.id);
    const stale = metaItems(rootEntry).filter(i => i.data.uid === uid && i.id !== newId);
    // A failed remove leaves a duplicate that the latest item hides; the next update retries it
    await Promise.all(stale.map(i => dataset.metaRemove(i.id).catch(/** @param {any} e */ e => console.error('Cannot remove an old comparison item:', e))));
    return { id: newId, uid, name: nextName, data, newerVersion: false };
}

/** Deletes every item of a saved comparison. @param {any} dataset @param {string} uid */
export async function deleteSaved(dataset, uid) {
    const { rootEntry } = await loadSaved(dataset);
    const items = metaItems(rootEntry).filter(i => i.data.uid === uid);
    for (const i of items) await dataset.metaRemove(i.id);
}
