// @ts-check
/**
 * Georaster layers of a dataset on the map: what each path is now (an entry that can be drawn, a
 * missing file, a file that cannot be drawn), the MapCore files for them, and the picker that
 * adds one. The compare view and the single-file map's added layers share it, so both resolve,
 * label and pick a layer the same way.
 *
 * It holds no Vue state (the callers keep the resolved Map in a ref), hence a lib and not a
 * composable. The Map is replaced, never mutated, so a shallowRef sees the change.
 */
import ddb from 'ddb';
import FileAvailabilityChecker from '@/libs/build/fileAvailabilityChecker';
import { isGeoraster } from '@/libs/entryTypes';
import FolderPicker from '@/components/FolderPicker.vue';

const { pathutils } = ddb;

/**
 * @typedef {{ status: 'ok' | 'missing' | 'unavailable', entry: any, reason: string }} ResolvedLayer
 * @typedef {Map<string, ResolvedLayer>} ResolvedLayers  path -> what the file is now
 */

/** @type {ResolvedLayer} */
const MISSING = Object.freeze({ status: 'missing', entry: null, reason: 'Missing' });

/**
 * What a layer's file is now: its entry, or why it cannot be shown.
 * @param {any} dataset
 * @param {string} path
 * @returns {Promise<ResolvedLayer>}
 */
export async function resolveLayer(dataset, path) {
    let entry;
    try {
        entry = await dataset.listOne(path);
    } catch {
        return { status: 'missing', entry: null, reason: 'Missing' };
    }
    if (!isGeoraster(entry)) return { status: 'unavailable', entry, reason: 'Not a georaster' };
    try {
        const availability = await FileAvailabilityChecker.check(dataset, entry, 'map');
        if (!availability.available) return { status: 'unavailable', entry, reason: availability.title || 'Not available' };
    } catch (/** @type {any} */ e) {
        return { status: 'unavailable', entry, reason: e?.message || 'Not available' };
    }
    return { status: 'ok', entry, reason: '' };
}

/**
 * Resolves the paths that are not in `resolved` yet and returns a new Map with them added; the
 * given Map is left as it is. One path that fails does not stop the others: it ends as a
 * missing or unavailable layer.
 *
 * With `fresh`, every given path is resolved again, also one in `resolved`: a file taken off the
 * map and picked back later may have been built, uploaded or removed since. The other paths of
 * `resolved` are kept as they are.
 * @param {any} dataset
 * @param {string[]} paths
 * @param {ResolvedLayers} [resolved]
 * @param {{ fresh?: boolean }} [options]
 * @returns {Promise<ResolvedLayers>}
 */
export async function resolveLayers(dataset, paths, resolved = new Map(), { fresh = false } = {}) {
    const todo = [...new Set(paths)].filter(p => fresh || !resolved.has(p));
    // resolveLayer reports every failure as a status, so none of these rejects
    const results = await Promise.all(todo.map(p => resolveLayer(dataset, p)));
    const next = new Map(resolved);
    todo.forEach((p, i) => next.set(p, results[i]));
    return next;
}

/**
 * The MapCore files for these layers, in the order of `paths` (the caller decides which is on
 * top: MapCore draws the later files above the earlier ones). A layer that is not ok becomes a
 * placeholder that keeps its place; a path never resolved counts as missing.
 * @param {any} dataset
 * @param {string[]} paths
 * @param {ResolvedLayers} resolved
 */
export function toMapFiles(dataset, paths, resolved) {
    return paths.map(path => {
        const r = resolved.get(path) || MISSING;
        const uri = dataset.remoteUri(path);
        const label = pathutils.basename(path);
        if (r.status === 'ok') return { path: uri, entry: r.entry, label, selected: false };
        return {
            path: uri, entry: null, label, selected: false,
            placeholder: { path, kind: r.status === 'missing' ? 'missing' : 'unavailable', text: `${r.reason}: ${path}` }
        };
    });
}

/**
 * Opens the file picker on georasters of the dataset. Resolves to what the picker returns
 * (`{ path, entry }`), or null when it is closed without a choice.
 * @param {{ open: (component: any, props: any) => Promise<any> }} dialogs
 * @param {any} dataset
 * @param {{ title: string, near?: string, exclude?: string[] }} options  `near`: a path whose folder the picker starts in; `exclude`: paths that cannot be chosen
 * @returns {Promise<{ path: string, entry?: any } | null>}
 */
export function pickGeoraster(dialogs, dataset, { title, near = '', exclude = [] }) {
    return dialogs.open(FolderPicker, {
        dataset,
        mode: 'file',
        title,
        initialPath: pathutils.getParentFolder(near) || '',
        accept: isGeoraster,
        exclude,
        // What the disabled rows say (FR-MAP-22)
        excludeReason: 'Already on the map',
        rejectReason: 'Not a map layer'
    });
}
