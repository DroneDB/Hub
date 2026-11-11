// @ts-check
/**
 * useGeoSubfolder - the Map tab of a folder that has nothing to put on the map, while a subfolder has (FR-MAP-10): the
 * photos of a dataset are in `images/`, its root has none. A search of the dataset for one entry type under the folder
 * finds them; the first subfolder that holds some is the hint ("Photos are in images/ - Show"). No recursive listing
 * and no toggle: the user opens the subfolder, the map then shows its entries.
 *
 *   const { hint } = useGeoSubfolder({ dataset, files: () => props.files, currentPath: () => props.currentPath,
 *                                      loading: () => props.loading, active: () => props.active });
 *   hint.value   // null, or { folder: 'images', path: 'site/images', text: 'Photos are in images/' }
 *
 * It asks only while the map is on show, for a folder that has a subfolder and no geo entry of its own: the geotagged
 * photos first, then the other types of the map one at a time, up to the first that some subfolder holds (the server
 * returns only that type, not the whole index). The answer is kept for the folder while the page is open; a change of
 * what the folder holds, or another dataset, asks again. An answer that a later visit overtook is dropped.
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
    return { folder: first, path: `${prefix}${first}`, text: `${photos ? 'Photos' : 'Map files'} are in ${first}/` };
}

const T = ddb.entry.type;
/**
 * The entry types the search asks for, one request each, in this order, up to the first that a subfolder holds: the
 * photos (the common case), then the other types that have a place on the map.
 */
export const GEO_SEARCH_TYPES = Object.freeze([
    T.GEOIMAGE, T.GEORASTER, T.POINTCLOUD, T.VECTOR, T.GEOPANORAMA, T.GEOVIDEO, T.MODEL, T.GAUSSIAN_SPLAT, T.TILES3D
]);

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
     * The first subfolder that holds entries of the first type the search finds under `folder`.
     * @param {any} ds @param {string | null} folder @param {AbortSignal} signal
     */
    async function search(ds, folder, signal) {
        for (const type of GEO_SEARCH_TYPES) {
            const found = await ds.search('*', { path: folder ?? undefined, recursive: true, type, signal });
            const answer = geoSubfolderOf(found, folder);
            if (answer) return answer;
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
