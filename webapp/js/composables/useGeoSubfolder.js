// @ts-check
/**
 * useGeoSubfolder - the Map tab of a folder that has nothing to put on the map, while a subfolder has: the
 * photos of a dataset are in `images/`, its root has none. The first subfolder that holds some is the hint ("Photos
 * are in images - Show"); no toggle: the user opens the subfolder, the map then shows its entries.
 *
 * The Registry is asked for the first entry of each type that can have a place on the map below the folder (a search
 * with a limit of one): a few answers of one entry, however many photos `images/` holds. A Registry older than the
 * limit answers with every entry: then, for the rest of the page's life with that Registry, the subfolders are asked
 * about one at a time instead, each for its own entries.
 *
 *   const { hint } = useGeoSubfolder({ dataset, files: () => props.files, currentPath: () => props.currentPath,
 *                                      loading: () => props.loading, active: () => props.active });
 *   hint.value   // null, or { folder: 'images', path: 'site/images', text: 'Photos are in images' }
 *
 * It asks only while the map is on show, for a folder that has a subfolder and no geo entry of its own. Folder by
 * folder (an older Registry), the subfolders go in name order, each followed down its own tree, up to the first that
 * holds a geo entry (at most MAX_FOLDER_PROBES folders: without a limit the server answers a recursive search with
 * every entry it finds, which on a large dataset is the whole index). The answer is kept for the folder while the
 * page is open; a change of what the folder holds, or another dataset, asks again. An answer that a later visit
 * overtook is dropped.
 */
import { ref, watch, toValue, getCurrentScope, onScopeDispose } from 'vue';
import ddb from 'ddb';
import { isAbort } from '@/composables/useRequestScope';

/**
 * Whether an entry has a place on the map.
 * @param {any} entry
 */
export const isGeoEntry = entry => !!entry && !ddb.entry.isDirectory(entry) && !!(entry.point_geom || entry.polygon_geom);

/**
 * The subfolder of `folder` that holds the geo entries to show, and how to say what is in it: the first subfolder by
 * name when several hold some; "Photos" when all of its geo entries are geotagged photos.
 * @param {any[]} entries  the entries a search under `folder` found (any of them, geo or not)
 * @param {string | null} folder  the folder searched, dataset-relative; null at the root
 * @returns {{ folder: string, path: string, text: string } | null}
 */
export function geoSubfolderOf(entries, folder) {
    const prefix = folder ? `${folder.replace(/\/+$/, '')}/` : '';
    /** @type {Map<string, any[]>} */
    const byFolder = new Map();
    for (const entry of entries || []) {
        if (!isGeoEntry(entry) || typeof entry.path !== 'string' || !entry.path.startsWith(prefix)) continue;
        const rest = entry.path.slice(prefix.length);
        const slash = rest.indexOf('/');
        // An entry of the folder itself is not in a subfolder
        if (slash <= 0) continue;
        const name = rest.slice(0, slash);
        byFolder.set(name, [...(byFolder.get(name) ?? []), entry]);
    }
    const first = [...byFolder.keys()].sort((a, b) => a.localeCompare(b))[0];
    if (first === undefined) return null;
    const photos = /** @type {any[]} */ (byFolder.get(first)).every(e => e.type === ddb.entry.type.GEOIMAGE);
    return { folder: first, path: `${prefix}${first}`, text: `${photos ? 'Photos' : 'Map files'} are in ${first}` };
}

/**
 * The most folders one look asks about. The hint is a help: a dataset with a deep tree and nothing on the map in it
 * gets no hint rather than a request for every folder.
 */
export const MAX_FOLDER_PROBES = 30;

const T = ddb.entry.type;
/**
 * The entry types that can have a place on the map (isGeoEntry): the photos first, the most common. The others (a
 * plain image, a video, a document) never have one.
 */
export const GEO_TYPES = Object.freeze([T.GEOIMAGE, T.GEORASTER, T.POINTCLOUD, T.VECTOR, T.MODEL, T.GEOVIDEO, T.GEOPANORAMA, T.TILES3D, T.GAUSSIAN_SPLAT]);

/** The entries each probe asks for: is there one of the type below the folder */
const PROBE_LIMIT = 1;

/**
 * The registries that answered a search with more entries than its limit (older than the limit): asked folder by
 * folder from then on. By registry, as all its datasets answer alike.
 * @type {WeakSet<object>}
 */
const ignoresLimit = new WeakSet();

/** The subfolder of `folder` an entry is in ('' for an entry of the folder itself). @param {string} path @param {string} prefix */
const topOf = (path, prefix) => {
    const rest = path.slice(prefix.length);
    const slash = rest.indexOf('/');
    return slash > 0 ? rest.slice(0, slash) : '';
};

/**
 * The hint from the first entry of each geo type below `folder`: the subfolder of the one that comes first by path,
 * as the Registry orders a search. Its entries are contiguous in that order, so the first entry of a type that is
 * not in it says that the subfolder has none of the type: "Photos" when every first entry found in it is a photo.
 * @param {any[]} entries @param {string | null} folder
 */
function hintOfFirstEntries(entries, folder) {
    const prefix = folder ? `${folder.replace(/\/+$/, '')}/` : '';
    const geo = entries.filter(e => isGeoEntry(e) && typeof e.path === 'string' && e.path.startsWith(prefix) && topOf(e.path, prefix))
        .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    if (!geo.length) return null;
    const top = topOf(geo[0].path, prefix);
    return geoSubfolderOf(geo.filter(e => topOf(e.path, prefix) === top), folder);
}

/**
 * The folders a listing holds, by path.
 * @param {any[]} entries  the entries of one folder
 * @param {string | null} folder  the folder's dataset-relative path, null at the root
 * @returns {string[]}
 */
const subfoldersOf = (entries, folder) => (entries || [])
    .filter(e => e && typeof e.path === 'string' && ddb.entry.isDirectory(e) && e.path.startsWith(folder ? `${folder.replace(/\/+$/, '')}/` : ''))
    .map(e => e.path)
    .sort((a, b) => a.localeCompare(b));

/**
 * What the folder holds, as far as the answer goes: its entries (path and type). The answer kept for a folder is
 * used only while this is the same.
 * @param {any[]} items
 */
const listingKey = items => items.map(f => `${f.entry?.type}:${f.entry?.path}`).sort().join('\n');

/**
 * @param {object} options
 * @param {any} options.dataset  the ddb Dataset, or a ref or getter of it (null: nothing is asked)
 * @param {() => any[]} options.files  the items of the folder on show (`{ entry }`)
 * @param {() => string | null | undefined} options.currentPath  the folder on show, null at the root
 * @param {() => boolean} [options.loading]  the folder is still being listed (nothing is asked then)
 * @param {() => boolean} [options.active]  the map is on show (nothing is asked while it is hidden)
 */
export function useGeoSubfolder({ dataset, files, currentPath, loading = () => false, active = () => true }) {
    /** @type {import('vue').Ref<{ folder: string, path: string, text: string } | null>} */
    const hint = ref(null);
    let turn = 0;
    /** @type {AbortController | null} */
    let controller = null;
    /** The answer for each folder ('' the root), with what the folder held when it was asked */
    /** @type {Map<string, { listing: string, answer: { folder: string, path: string, text: string } | null }>} */
    const answers = new Map();
    let answersOf = null;

    const items = () => files() ?? [];
    const hasGeo = () => items().some(f => isGeoEntry(f.entry));
    const hasFolder = () => items().some(f => f.entry && ddb.entry.isDirectory(f.entry));

    /**
     * The first subfolder that holds geo entries at any depth: the first entry of each geo type below the folder, the
     * photos first (an older Registry answers that one with all its photos and is then asked folder by folder).
     * @param {any} ds @param {string | null} folder @param {AbortSignal} signal
     */
    async function search(ds, folder, signal) {
        const registry = ds.registry ?? ds;
        if (ignoresLimit.has(registry)) return walk(ds, folder, signal);
        const probe = (/** @type {number} */ type) => ds.search('*', { path: folder ?? undefined, recursive: true, type, limit: PROBE_LIMIT, signal });
        const [first, ...others] = GEO_TYPES;
        const photos = (await probe(first)) || [];
        if (photos.length > PROBE_LIMIT) {
            ignoresLimit.add(registry);
            return hintOfFirstEntries(photos, folder) ?? walk(ds, folder, signal);
        }
        const rest = (await Promise.all(others.map(type => probe(type)))).map(found => found || []);
        // A Registry older than the limit, below a folder with at most one photo: what it answered still holds the first entries
        if (rest.some(found => found.length > PROBE_LIMIT)) ignoresLimit.add(registry);
        return hintOfFirstEntries([...photos, ...rest.flat()], folder);
    }

    /**
     * Folder by folder (a Registry that has no limit): the folders are asked one at a time, each for its own entries (a
     * recursive search returns every entry of the dataset that has a place): the subfolders of a folder come after it
     * and the next subfolder of `folder` only when it had none, so the first hit ends it.
     * @param {any} ds @param {string | null} folder @param {AbortSignal} signal
     */
    async function walk(ds, folder, signal) {
        let budget = MAX_FOLDER_PROBES;
        for (const top of subfoldersOf(items().map(f => f.entry), folder)) {
            const queue = [top];
            while (queue.length) {
                if (budget-- <= 0) return null;
                const path = /** @type {string} */ (queue.shift());
                const found = await ds.search('*', { path, recursive: false, signal });
                const answer = geoSubfolderOf(found, folder);
                if (answer) return answer;
                queue.push(...subfoldersOf(found, path));
            }
        }
        return null;
    }

    async function look() {
        const mine = ++turn;
        controller?.abort();
        controller = null;
        hint.value = null;
        // Nothing to ask while the map is hidden or the folder loads, when it has entries of its own to show, or when it
        // has no subfolder
        const ds = toValue(dataset);
        if (!ds || !active() || loading() || hasGeo() || !hasFolder()) return;
        if (answersOf !== ds) {
            answers.clear();
            answersOf = ds;
        }
        const folder = currentPath() || null;
        const listing = listingKey(items());
        const kept = answers.get(folder ?? '');
        if (kept && kept.listing === listing) {
            hint.value = kept.answer;
            return;
        }
        controller = new AbortController();
        try {
            const answer = await search(ds, folder, controller.signal);
            answers.set(folder ?? '', { listing, answer });
            if (mine === turn) hint.value = answer;
        } catch (e) {
            // The hint is a help, not the map: a search that fails leaves the empty map as it was (and asks again next time)
            if (!isAbort(e)) console.warn('Could not look for geo entries in the subfolders:', e);
        }
    }

    // The booleans, not the list: a change of the items that leaves the answer as it is does not ask again
    watch([() => currentPath() || null, () => loading(), hasGeo, hasFolder, () => !!active()], look, { immediate: true });
    if (getCurrentScope()) onScopeDispose(() => { turn++; controller?.abort(); });

    return { hint };
}
