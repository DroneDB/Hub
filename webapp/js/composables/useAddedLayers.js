// @ts-check
/**
 * useAddedLayers - the georasters added on top of the file a single-file map is open on.
 *
 * The main file stays first and is never removed; the added layers follow in the order they were
 * added (the last on top). They live in the `layer` query parameters of the address, so the link
 * of the map is the map: they are read once, when the file is known, and written (without a
 * navigation) whenever one is added or removed. Reordering or changing the opacity of a layer is
 * a view setting and does not touch the address.
 *
 * Only a map on a georaster takes layers: for any other file the parameters are ignored and
 * there is no add action.
 */
import { ref, shallowRef, computed, watch } from 'vue';
import ddb from 'ddb';
import { isGeoraster } from '@/libs/entryTypes';
import { MAX_ADDED_LAYERS, parseLayerParams, encodeLayerParam } from '@/libs/map/layerQuery';
import { resolveLayers, toMapFiles, pickGeoraster } from '@/libs/map/georasterLayers';
import { replaceQueryKeys } from '@/libs/routeQuery';
import { useNotify } from '@/composables/useNotify';

/**
 * @param {object} ctx
 * @param {{ query: Record<string, any> }} ctx.route
 * @param {{ open: (component: any, props: any) => Promise<any> }} ctx.dialogs
 * @param {import('vue').Ref<any>} ctx.dataset  the dataset, set before the entry
 * @param {import('vue').Ref<any>} ctx.entry    the entry of the main file, null until it loads
 * @param {import('vue').Ref<string>} ctx.ddbURI  the main file's remote URI
 */
export function useAddedLayers({ route, dialogs, dataset, entry, ddbURI }) {
    const notify = useNotify();

    /** @type {import('vue').Ref<string[]>} dataset paths, in the order they were added */
    const addedPaths = ref([]);
    /** @type {import('vue').ShallowRef<Map<string, any>>} what each added path is now */
    const resolved = shallowRef(new Map());
    // The layers of the opening address are resolved: until then the map has no files, so it
    // is built once with all of them
    const ready = ref(false);

    const mainPath = computed(() => (entry.value ? entry.value.path : ''));
    const canAdd = computed(() => !!dataset.value && isGeoraster(entry.value));
    const atLimit = computed(() => addedPaths.value.length >= MAX_ADDED_LAYERS);
    const addTitle = computed(() => (atLimit.value ? `Up to ${MAX_ADDED_LAYERS} layers can be added` : ''));
    const pending = computed(() => !!entry.value && !ready.value);

    let started = false;
    async function load() {
        const paths = isGeoraster(entry.value) ? parseLayerParams(route.query.layer, mainPath.value) : [];
        // Never rejects: a layer that cannot be read stays as a placeholder
        if (paths.length) resolved.value = await resolveLayers(dataset.value, paths, resolved.value);
        addedPaths.value = paths;
        ready.value = true;
    }
    watch(entry, e => {
        if (!e || started) return;
        started = true;
        load();
    }, { immediate: true });

    // The main file as the map always had it, then the added layers
    const files = computed(() => {
        if (!ready.value || !entry.value) return [];
        const main = {
            path: ddbURI.value,
            entry: entry.value,
            label: ddb.pathutils.basename(entry.value.path),
            selected: false
        };
        return [main, ...toMapFiles(dataset.value, addedPaths.value, resolved.value)];
    });

    function writeQuery() {
        replaceQueryKeys({ layer: addedPaths.value.map(encodeLayerParam) });
    }

    async function add() {
        if (!canAdd.value || atLimit.value) return;
        const picked = await pickGeoraster(dialogs, dataset.value, {
            title: 'Add layer',
            near: mainPath.value,
            exclude: [mainPath.value, ...addedPaths.value]
        });
        if (!picked || !picked.path) return;
        const path = picked.path;
        if (path === mainPath.value || addedPaths.value.includes(path) || atLimit.value) return;
        // Resolved before it is listed, so it never shows as a missing file while it loads; and
        // again when it was added before and removed: it may have been built or uploaded since
        resolved.value = await resolveLayers(dataset.value, [path], resolved.value, { fresh: true });
        const r = resolved.value.get(path);
        if (!r || r.status === 'missing' || !isGeoraster(r.entry)) {
            notify.warn(`${path} is not a georaster of this dataset.`, { summary: 'Cannot add the layer' });
            return;
        }
        // Added after the picker closed: the limit may have been reached by then
        if (addedPaths.value.includes(path) || atLimit.value) return;
        addedPaths.value = [...addedPaths.value, path];
        writeQuery();
    }

    /** @param {string} path  dataset path of an added layer */
    function remove(path) {
        if (!addedPaths.value.includes(path)) return;
        addedPaths.value = addedPaths.value.filter(p => p !== path);
        writeQuery();
    }

    return { addedPaths, files, pending, canAdd, atLimit, addTitle, add, remove };
}
