// @ts-check
/**
 * useViewLayers - the layer operations of the map viewer on the working state of a view.
 *
 * It resolves each layer of the state to what the file is now, builds the MapCore `files` from
 * them, and adds, removes and replaces layers through the rules of `libs/views/layerRules`
 * (which also keep the split dividers, the base file and the elevation model in step).
 *
 * - `files` are in draw order: a base file that is not a georaster first (it is not a layer), then
 *   the layers from the bottom up. A layer that is missing or cannot be drawn is a placeholder
 *   that keeps its place. `files` keeps the same array while the paths and what they resolve to
 *   are the same, so changing an opacity, an eye or the order of the settings does not make the
 *   map build its layers again.
 * - A file picked to add or to put in a layer's place is resolved again before it is used (it may
 *   have been built or uploaded since it was last resolved), so it never shows as missing while
 *   it loads, and a file that is not a georaster is refused with a warning.
 * - A newer resolve supersedes an older one: the latest takes everything that is still
 *   unresolved, so the answer of an overtaken request is dropped and nothing is lost.
 * - A view in Viewer only (`embed`) neither adds, replaces nor removes a layer.
 *
 *   const layers = useViewLayers({ dataset, state, setState, baseEntry, savedData, dialogs, embed });
 */
import { shallowRef, computed, watch } from 'vue';
import ddb from 'ddb';
import { isGeoraster } from '@/libs/entryTypes';
import { resolveLayers, toMapFiles, pickGeoraster } from '@/libs/map/georasterLayers';
import { MAX_LAYERS } from '@/libs/views/viewState';
import { addLayer, removeLayer, replaceLayer, startSplit } from '@/libs/views/layerRules';
import { useNotify } from '@/composables/useNotify';

/** @typedef {import('@/libs/views/viewState').ViewState} ViewState */

export const AT_LIMIT_TITLE = `A view shows at most ${MAX_LAYERS} rasters`;

/**
 * Whether two lists of MapCore files draw the same thing.
 * @param {any[]} a @param {any[]} b
 */
function sameFiles(a, b) {
    return a.length === b.length && a.every((f, i) => f.path === b[i].path && f.entry === b[i].entry && f.label === b[i].label
        && f.placeholder?.kind === b[i].placeholder?.kind && f.placeholder?.text === b[i].placeholder?.text);
}

/**
 * @param {object} ctx
 * @param {any} ctx.dataset  the dataset
 * @param {import('vue').Ref<ViewState|null>} ctx.state  the working state; null until it is loaded
 * @param {(next: ViewState) => void} ctx.setState  replaces the working state
 * @param {import('vue').Ref<any>} ctx.baseEntry  the entry of the base file, null when it is missing or not known
 * @param {() => any} [ctx.savedData]  the data of the saved view the state belongs to, null for a new view
 * @param {{ open: (component: any, props: any) => Promise<any> }} ctx.dialogs
 * @param {boolean} [ctx.embed]
 * @param {(path: string) => void} [ctx.onAdded]  called with the path of a layer that add() put in the view (the map says where it is)
 */
export function useViewLayers({ dataset, state, setState, baseEntry, savedData = () => null, dialogs, embed = false, onAdded = () => {} }) {
    const notify = useNotify();

    /** @type {import('vue').ShallowRef<import('@/libs/map/georasterLayers').ResolvedLayers>} */
    const resolved = shallowRef(new Map());
    let turn = 0;

    // Derived from the state as plain values, so what depends on them does not run again for an
    // opacity, a position or any other setting that leaves the paths as they are
    const hasState = computed(() => !!state.value);
    const layerKey = computed(() => JSON.stringify(state.value ? state.value.layers.map(l => l.path) : []));
    /** @type {import('vue').ComputedRef<string[]>} */
    const layerPaths = computed(() => JSON.parse(layerKey.value));
    const basePath = computed(() => (state.value ? state.value.base.path : ''));
    const baseIsRaster = computed(() => layerPaths.value.includes(basePath.value));
    const pending = computed(() => hasState.value && layerPaths.value.some(p => !resolved.value.has(p)));

    /**
     * Resolves what is not resolved yet, and the `fresh` paths again. Only the latest call stores
     * its answer; every call returns its own.
     * @param {string[]} [fresh]
     */
    async function resolve(fresh = []) {
        const mine = ++turn;
        const known = new Map(resolved.value);
        for (const p of fresh) known.delete(p);
        const next = await resolveLayers(dataset, [...layerPaths.value, ...fresh], known);
        if (mine === turn) resolved.value = next;
        return next;
    }
    watch(layerKey, () => { if (pending.value) resolve(); }, { immediate: true });

    // Empty until every layer is resolved, so the map builds its layers once, with all of them
    const files = computed(/** @param {any[]} [previous] */ previous => {
        if (!hasState.value || pending.value) return previous && !previous.length ? previous : [];
        /** @type {any[]} */
        const list = [];
        if (!baseIsRaster.value && baseEntry.value) {
            list.push({ path: dataset.remoteUri(basePath.value), entry: baseEntry.value, label: ddb.pathutils.basename(basePath.value), selected: false });
        }
        // MapCore draws the later file above the earlier ones; index 0 of the layers is the top
        list.push(...toMapFiles(dataset, [...layerPaths.value].reverse(), resolved.value));
        return previous && sameFiles(previous, list) ? previous : list;
    });

    // The layers whose file is not the one the saved view was saved with. A new view has none:
    // there is nothing it was saved with.
    const changedKey = computed(() => {
        const data = savedData();
        if (!data) return '[]';
        const changed = layerPaths.value.filter(path => {
            const savedHash = data.layers.find(/** @param {any} l */ l => l.path === path)?.hash;
            const r = resolved.value.get(path);
            return !!savedHash && r?.status === 'ok' && !!r.entry.hash && r.entry.hash !== savedHash;
        });
        return JSON.stringify(changed);
    });
    /** @type {import('vue').ComputedRef<string[]>} */
    const changedPaths = computed(() => JSON.parse(changedKey.value));

    const atLimit = computed(() => layerPaths.value.length >= MAX_LAYERS);
    const canAdd = computed(() => !embed && hasState.value && !atLimit.value);
    const addTitle = computed(() => (atLimit.value ? AT_LIMIT_TITLE : 'Add layer'));

    /**
     * The hash of the file at `path` as it is now, for a state that is about to be saved: the
     * hash in the state stays for a file that is missing, so that a save does not forget which
     * version the view was made with.
     * @param {string} path
     */
    function hashOf(path) {
        const r = resolved.value.get(path);
        if (r && r.status !== 'missing' && r.entry) return r.entry.hash || '';
        if (baseEntry.value && baseEntry.value.path === path) return baseEntry.value.hash || '';
        const s = state.value;
        if (!s) return '';
        return s.layers.find(l => l.path === path)?.hash ?? (s.base.path === path ? s.base.hash : '');
    }

    /** The entry of the file at `path`, or null when it is missing or not known. @param {string} path */
    function entryOf(path) {
        const r = resolved.value.get(path);
        if (r && r.status !== 'missing' && r.entry) return r.entry;
        return baseEntry.value && baseEntry.value.path === path ? baseEntry.value : null;
    }

    /**
     * Opens the picker, then checks the picked file: the file `{ path, hash }`, or null when the
     * picker is cancelled, the file is already a layer or it is not a georaster of the dataset.
     * @param {string} title @param {string} near  the path whose folder the picker starts in
     */
    async function pickFile(title, near) {
        const picked = await pickGeoraster(dialogs, dataset, { title, near, exclude: layerPaths.value });
        if (!picked || !picked.path || layerPaths.value.includes(picked.path)) return null;
        const path = picked.path;
        const r = (await resolve([path])).get(path);
        if (!r || r.status === 'missing' || !isGeoraster(r.entry)) {
            notify.warn(`${path} is not a georaster of this dataset.`, { summary: 'Cannot add the layer' });
            return null;
        }
        return { path, hash: r.entry.hash || '' };
    }

    /**
     * Applies a layer rule to the state as it is now (it may have changed while the picker was
     * open); true when the rule changed it.
     * @param {(state: ViewState) => ViewState} rule
     */
    function apply(rule) {
        const current = state.value;
        if (!current) return false;
        const next = rule(current);
        if (next === current) return false;
        setState(next);
        return true;
    }

    /** Adds a georaster the user picks, on top; true when one was added. */
    async function add() {
        if (!canAdd.value || !state.value) return false;
        const file = await pickFile('Add layer', layerPaths.value[0] ?? basePath.value);
        const added = !!file && apply(s => addLayer(s, file));
        if (added && file) onAdded(file.path);
        return added;
    }

    /**
     * For a view that starts from one file and a "compare to" request: the first layer picked
     * turns the split on. A cancelled picker leaves the view as it is.
     */
    async function pickFirst() {
        if (embed) return;
        if (await add()) apply(startSplit);
    }

    /** @param {string} path  a layer of the view */
    function remove(path) {
        if (embed) return;
        apply(s => {
            const i = s.layers.findIndex(l => l.path === path);
            return i < 0 ? s : removeLayer(s, i);
        });
    }

    /**
     * Puts a georaster the user picks in the place of a layer (a missing file, usually).
     * @param {string} path  a layer of the view
     */
    async function repick(path) {
        if (embed || !layerPaths.value.includes(path)) return;
        const file = await pickFile('Pick another raster', path);
        if (!file) return;
        apply(s => {
            const i = s.layers.findIndex(l => l.path === path);
            return i < 0 ? s : replaceLayer(s, i, file);
        });
    }

    return { files, changedPaths, canAdd, atLimit, addTitle, resolved, pending, hashOf, entryOf, add, pickFirst, remove, repick };
}
