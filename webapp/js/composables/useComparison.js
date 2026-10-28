/**
 * useComparison - the compare view's comparison: it reads it from the URL (layer paths, a
 * working state or a saved comparison), resolves each layer to its dataset entry, owns the
 * state the map shows, keeps the URL up to date (one history entry) and saves it in the
 * dataset meta.
 *
 * Layers whose file is missing or cannot be drawn stay in the comparison as placeholders, so
 * a save never drops them; the user picks another file or removes them.
 *
 *   const cmp = useComparison({ route, dialogs });   // route: useRoute()
 */
import { ref, shallowRef, computed, watch, onScopeDispose } from 'vue';
import ddb from 'ddb';
import reg from '@/libs/api/sharedRegistry';
import { setTitle } from '@/libs/utils';
import { permissionsOf } from '@/libs/datasetPermissions';
import FileAvailabilityChecker from '@/libs/build/fileAvailabilityChecker';
import { parseCompareQuery, compareQuery, workingState, sameComparison, MAX_LAYERS } from '@/libs/compare/compareState';
import { addLayer, removeLayer, replaceLayer } from '@/libs/compare/layerRules';
import { savedComparisons, savedChange, saveNew, updateSaved } from '@/libs/compare/comparisonStore';
import { askComparisonName } from '@/composables/useComparisonActions';
import { useNotify } from '@/composables/useNotify';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import FolderPicker from '@/components/FolderPicker.vue';

const { pathutils } = ddb;
const URL_DELAY_MS = 500;
const isGeoraster = entry => !!entry && entry.type === ddb.entry.type.GEORASTER;

/**
 * @param {{ route: any, dialogs: ReturnType<typeof import('./useDialogs').useDialogs> }} ctx
 */
export function useComparison({ route, dialogs }) {
    const notify = useNotify();
    const dataset = reg.Organization(String(route.params.org)).Dataset(String(route.params.ds));

    const loading = ref(true);
    const error = ref('');
    const busy = ref(false);
    const canWrite = ref(false);
    // The comparison state (libs/compare/compareState); null until loaded
    const state = shallowRef(null);
    // The saved comparison this view shows ({ id, uid, name, data }), null when not saved
    const saved = shallowRef(null);
    // path -> { status: 'ok' | 'missing' | 'unavailable', entry, reason }
    const resolved = shallowRef(new Map());
    const urlTooLong = ref(false);
    let urlTimer = null;
    let pickAfterLoad = false;

    const layerPaths = computed(() => (state.value ? state.value.layers.map(l => l.path) : []));
    const dirty = computed(() => !!saved.value && !!state.value && !sameComparison(state.value, saved.value.data));
    const canAdd = computed(() => layerPaths.value.length < MAX_LAYERS);

    /** What a layer's file is now: its entry, or why it cannot be shown. */
    async function resolveLayer(path) {
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
        } catch (e) {
            return { status: 'unavailable', entry, reason: e.message || 'Not available' };
        }
        return { status: 'ok', entry, reason: '' };
    }

    async function resolveLayers(paths) {
        const results = await Promise.all(paths.map(resolveLayer));
        const next = new Map(resolved.value);
        paths.forEach((p, i) => next.set(p, results[i]));
        resolved.value = next;
    }

    // MapCore's files: the last one is drawn on top and listed first (the leftmost band), so the
    // layers go in reverse. A layer that cannot be drawn is a placeholder that keeps its band.
    // Recomputed only when the layers change, not on every opacity or view change.
    const layersKey = computed(() => layerPaths.value.join('\n'));
    const files = computed(() => {
        const paths = layersKey.value ? layersKey.value.split('\n') : [];
        return paths.map(path => {
            const r = resolved.value.get(path) || { status: 'missing', entry: null, reason: 'Missing' };
            const uri = dataset.remoteUri(path);
            if (r.status === 'ok') return { path: uri, entry: r.entry, label: pathutils.basename(path), selected: false };
            const kind = r.status === 'missing' ? 'missing' : 'unavailable';
            return { path: uri, entry: null, label: pathutils.basename(path), selected: false, placeholder: { path, kind, text: `${r.reason}: ${path}` } };
        }).reverse();
    });

    // Layers to tell the user about: missing, not drawable, or changed since the save
    const notices = computed(() => {
        if (!state.value) return [];
        const list = [];
        for (const layer of state.value.layers) {
            const r = resolved.value.get(layer.path);
            if (!r) continue;
            if (r.status !== 'ok') list.push({ path: layer.path, kind: r.status, text: `${r.reason}: ${layer.path}` });
            else if (layer.hash && r.entry.hash && layer.hash !== r.entry.hash) {
                list.push({ path: layer.path, kind: 'changed', text: `File changed since this comparison was saved: ${layer.path}` });
            }
        }
        return list;
    });

    // ---- URL ----------------------------------------------------------------------------

    function writeUrl() {
        if (!state.value) return;
        const { query, tooLong } = compareQuery({ state: state.value, uid: saved.value?.uid, clean: !!saved.value && !dirty.value });
        urlTooLong.value = tooLong;
        if (tooLong) return;
        const qs = new URLSearchParams(query).toString();
        // Not router.replace: a navigation would reset the page title and run the route guards
        // on every change; the view reads its query once
        window.history.replaceState(window.history.state, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
    }

    /** The URL of the comparison as it is now (for Copy link): the pending update is written first. */
    function currentLink() {
        clearTimeout(urlTimer);
        writeUrl();
        return window.location.href;
    }

    function scheduleUrl() {
        clearTimeout(urlTimer);
        urlTimer = setTimeout(writeUrl, URL_DELAY_MS);
    }
    onScopeDispose(() => clearTimeout(urlTimer));

    watch([state, saved], scheduleUrl);

    function updateTitle() {
        setTitle(`${saved.value ? saved.value.name : 'Comparison'} - Compare`);
    }

    // ---- Load ---------------------------------------------------------------------------

    async function load() {
        const query = parseCompareQuery(route.query);
        if (query.error) throw new Error(query.error);

        const rootEntry = (await dataset.info())[0];
        canWrite.value = permissionsOf(rootEntry).canWrite;

        let initial = query.state;
        if (query.uid) {
            const item = savedComparisons(rootEntry).find(c => c.uid === query.uid);
            if (!item) throw new Error('This comparison does not exist. It may have been deleted.');
            if (item.newerVersion) throw new Error('This comparison was created by a newer version of the application.');
            saved.value = item;
            if (!initial) initial = workingState(item.data);
        }
        await resolveLayers(initial.layers.map(l => l.path));
        state.value = initial;
        pickAfterLoad = query.pick;
        updateTitle();
    }

    const loaded = load().then(() => true, e => {
        error.value = e.message;
        return false;
    }).finally(() => { loading.value = false; });

    // ---- Layers -------------------------------------------------------------------------

    /** The map changed the comparison (opacity, order, split, plant health, view, basemap). */
    function onMapUpdate(next) {
        state.value = next;
    }

    function indexOf(path) {
        return state.value.layers.findIndex(l => l.path === path);
    }

    function remove(path) {
        const i = indexOf(path);
        if (i >= 0) state.value = removeLayer(state.value, i);
    }

    /**
     * Opens the file picker and adds the picked georaster, or puts it in place of `replacePath`.
     * @param {string} [replacePath]
     */
    async function pick(replacePath) {
        if (!state.value || (!replacePath && !canAdd.value)) return;
        const near = replacePath || layerPaths.value[layerPaths.value.length - 1] || '';
        const picked = await dialogs.open(FolderPicker, {
            dataset,
            mode: 'file',
            title: replacePath ? 'Pick another raster' : 'Add raster to compare',
            initialPath: pathutils.getParentFolder(near) || '',
            accept: entry => isGeoraster(entry),
            exclude: layerPaths.value
        });
        if (!picked || !picked.path) return;
        const path = picked.path;
        if (layerPaths.value.includes(path)) return;
        await resolveLayers([path]);
        const r = resolved.value.get(path);
        if (r.status === 'missing' || !isGeoraster(r.entry)) {
            notify.warn(`${path} is not a georaster of this dataset.`, { summary: 'Cannot compare' });
            return;
        }
        const file = { path, hash: r.entry.hash || '' };
        const i = replacePath ? indexOf(replacePath) : -1;
        state.value = i >= 0 ? replaceLayer(state.value, i, file) : addLayer(state.value, file);
    }

    /** The picker the "Compare to..." link asks for, once the first layer is on show. */
    function pickOnFirstShow() {
        if (!pickAfterLoad) return;
        pickAfterLoad = false;
        pick();
    }

    // ---- Save ---------------------------------------------------------------------------

    // The state to store: each layer with the hash of the file it shows now (a missing file
    // keeps the hash it was saved with)
    function stateToSave() {
        const layers = state.value.layers.map(l => {
            const r = resolved.value.get(l.path);
            return r && r.status !== 'missing' && r.entry ? { ...l, hash: r.entry.hash || '' } : l;
        });
        return { ...state.value, layers };
    }

    async function run(action) {
        busy.value = true;
        try {
            await action();
        } catch (e) {
            console.error('Comparison save failed:', e);
            notify.error(e.message || String(e), { summary: 'Cannot save the comparison' });
        } finally {
            busy.value = false;
        }
    }

    async function saveAsNew() {
        const name = await askComparisonName(dialogs, { title: 'Save comparison as', initialValue: saved.value ? `${saved.value.name} (copy)` : '' });
        if (!name) return;
        await run(async () => {
            const toSave = stateToSave();
            saved.value = await saveNew(dataset, toSave, { name, user: reg.getUsername() || '' });
            state.value = toSave;
            updateTitle();
            notify.success(`Saved "${name}"`, { summary: 'Comparison saved' });
        });
    }

    async function save() {
        if (!saved.value) {
            await saveAsNew();
            return;
        }
        const change = await savedChange(dataset, saved.value.uid, saved.value.id).catch(() => null);
        if (change === 'deleted') {
            notify.warn('This comparison was deleted. Save it under a name to keep it.', { summary: 'Comparison deleted' });
            saved.value = null;
            await saveAsNew();
            return;
        }
        if (change === 'changed') {
            const choice = await dialogs.open(ConfirmDialog, {
                title: 'Comparison changed',
                message: 'Someone saved this comparison after you opened it. Overwrite their changes, or save yours as a new comparison?',
                confirmText: 'Overwrite',
                secondaryText: 'Save as new',
                secondaryButtonClass: 'secondary',
                confirmButtonClass: 'danger'
            });
            if (choice === 'secondary') {
                await saveAsNew();
                return;
            }
            if (choice !== 'confirm') return;
        }
        const uid = saved.value.uid;
        await run(async () => {
            const toSave = stateToSave();
            saved.value = await updateSaved(dataset, uid, { state: toSave, user: reg.getUsername() || '' });
            state.value = toSave;
            notify.success(`Saved "${saved.value.name}"`, { summary: 'Comparison saved' });
        });
    }

    return {
        dataset, loading, error, busy, canWrite, state, saved, files, notices, dirty, canAdd, urlTooLong, loaded,
        maxLayers: MAX_LAYERS, currentLink, onMapUpdate, remove, pick, pickOnFirstShow, save, saveAsNew
    };
}
