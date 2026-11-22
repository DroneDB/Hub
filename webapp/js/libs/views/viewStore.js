// @ts-check
/**
 * Saved map views: the items of the dataset meta list `views`, readable by everyone who can read
 * the dataset and written by its writers (the server checks). The list logic (reads that bypass
 * the request cache before a write, update as add-then-remove, identity by `uid`, the change
 * check) is the shared meta list store; this module gives it what a view is.
 *
 * A view is listed even when it fails validation, with its `error` (the viewer says why it cannot
 * open it; a writer can still delete it); an item that is not a view at all (no JSON object, no
 * uid or name) is skipped, and logged.
 */
import { MAX_NAME_LENGTH, MAX_VIEW_BYTES, MAX_VIEWS, validateState, workingState, isSafeLayerPath } from './viewState';
import { createMetaListStore } from '@/libs/metaList/metaListStore';

export const VIEWS_KEY = 'views';

/**
 * @typedef {import('@/libs/metaList/metaListStore').MetaEntry} SavedView
 *   `error` is why the view cannot be opened (it fails validation), or null
 */

const store = createMetaListStore({
    key: VIEWS_KEY,
    uidPrefix: 'v_',
    maxItems: MAX_VIEWS,
    maxBytes: MAX_VIEW_BYTES,
    maxNameLength: MAX_NAME_LENGTH,
    label: { one: 'view', many: 'saved views' },
    validate: validateState,
    precheck: data => Array.isArray(data.layers) && !data.layers.every(/** @param {any} l */ l => isSafeLayerPath(l && l.path))
        ? 'A layer path is not valid.' : null,
    tooLarge: 'This view is too large to save. Remove plant health settings or layers and try again.'
});

/**
 * The saved views of the dataset, one per uid, sorted by name. A view that fails validation is
 * listed with its `error`, and so is a view of a later version (`newerVersion`).
 * @param {any} dataset
 * @param {{ fresh?: boolean }} [options]  fresh: bypass the request cache
 * @returns {Promise<SavedView[]>}
 */
export async function listViews(dataset, options) {
    const { entries, invalid } = await store.list(dataset, options);
    for (const item of invalid) console.error('Skipping a saved view that cannot be told:', item.id, item.error);
    return entries;
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
export const saveProblem = store.saveProblem;

/**
 * A view uid: `v_` and 8 base36 characters, not in `taken`.
 * @param {Iterable<string>} taken
 */
export const newViewUid = store.newUid;

/**
 * Saves a new view.
 * @param {any} dataset @param {import('./viewState').ViewState} state
 * @param {{ name: string, user: string, now?: Date }} options
 * @returns {Promise<SavedView>}
 */
export function saveNewView(dataset, state, options) {
    return store.saveNew(dataset, workingState(state), options);
}

/**
 * Stores a new version of a saved view (state, name or both): the new item is added first, then
 * every other item of its uid is removed. The creation fields stay; without a state, the saved
 * data stays as it is.
 * @param {any} dataset @param {string} uid
 * @param {{ state?: import('./viewState').ViewState, name?: string, user: string, now?: Date }} options
 * @returns {Promise<SavedView>}
 */
export function updateView(dataset, uid, { state, ...options }) {
    return store.update(dataset, uid, { ...options, body: state ? workingState(state) : undefined });
}

/** Deletes every item of a saved view. @param {any} dataset @param {string} uid */
export const deleteView = store.remove;

/**
 * What happened to a saved view since it was loaded from meta item `loadedId`: 'deleted',
 * 'changed' (another save) or null.
 * @param {any} dataset @param {string} uid @param {string} loadedId
 * @returns {Promise<'deleted'|'changed'|null>}
 */
export const viewChange = store.change;
