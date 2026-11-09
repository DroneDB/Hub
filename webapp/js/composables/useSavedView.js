// @ts-check
/**
 * useSavedView - what the map viewer opens: a saved view (route /r/:org/:ds/views/:uid) or a
 * file (route /r/:org/:ds/view/:encodedPath/map), as a working state the user changes, and the
 * saving of that state as a view.
 *
 * - The identity of the page is `view:<uid>` or `file:<base path>`. The working state is kept in
 *   the browser's history entry under that identity, so a reload shows the same view and a state
 *   left by another page (or an edited one) is never shown: a state read back is validated like
 *   saved data, and used only when its identity is the page's.
 * - A file route starts from the base file alone, or from the base file and the `add` values of
 *   the address; `add` and `pick` are read once and then taken off the address, which never holds
 *   the view.
 * - A new view that loses its base file (the base layer is removed) moves to the file route of
 *   the layer that takes its place; a saved view keeps its name and address. A save that creates
 *   a view moves the page to the saved view's route. Both go through the router, with the working
 *   state in the new entry, and neither reloads: a route change to the identity the page already
 *   has is not a new page.
 * - Leaving a saved view with unsaved changes (another page, a reload, closing the tab) asks
 *   first: Save, Discard or Cancel (useLeaveGuard). A route change to the identity the page has is
 *   not a leave, and an embedded view never asks.
 * - Names are only ever given to dialogs and toasts as text (a ConfirmDialog renders its message
 *   as HTML, so no name goes into one; its title is text).
 *
 *   const hashOf = shallowRef(null);                 // set to useViewLayers' hashOf once it exists
 *   const view = useSavedView({ route: useRoute(), router: useRouter(), dialogs, embed, hashOf });
 */
import { ref, shallowRef, computed, watch, unref } from 'vue';
import ddb from 'ddb';
import reg from '@/libs/api/sharedRegistry';
import { b64decode, b64urlDecode } from '@/libs/base64';
import { isGeoraster, canOpenInMap } from '@/libs/entryTypes';
import { readHistoryState, writeHistoryState, replaceQueryKeys, currentLocation } from '@/libs/routeQuery';
import { validateState, workingState, defaultState, buildEntryState, sameView } from '@/libs/views/viewState';
import { listViews, saveNewView, updateView, viewChange } from '@/libs/views/viewStore';
import { fileViewUrl, savedViewUrl } from '@/libs/views/viewLinks';
import { useViewerEntry } from '@/composables/useViewerEntry';
import { askViewName } from '@/composables/useViewActions';
import { useNotify } from '@/composables/useNotify';
import { useLeaveGuard } from '@/composables/useLeaveGuard';
import ConfirmDialog from '@/components/ConfirmDialog.vue';

/** @typedef {import('@/libs/views/viewState').ViewState} ViewState */
/** @typedef {import('@/libs/views/viewStore').SavedView} SavedView */

// The history entry key of the working state
export const HISTORY_KEY = 'mapView';

/** The error a viewer shows for a view that does not exist. */
export const UNKNOWN_VIEW = 'This view does not exist. It may have been deleted.';
const NEWER_VERSION = 'it was saved by a newer version of the application';

/** @param {unknown} value */
const asList = value => (Array.isArray(value) ? value : value == null ? [] : [value]);

/**
 * The identity of the page a route shows: `view:<uid>`, or `file:<base path>`; '' when the route
 * names neither.
 * @param {{ params: Record<string, any> }} route
 */
export function routeIdentity(route) {
    const { uid, encodedPath } = route.params;
    if (uid) return `view:${uid}`;
    if (!encodedPath) return '';
    try {
        return `file:${b64decode(String(encodedPath))}`;
    } catch {
        return '';
    }
}

/**
 * The paths of the `add` values of an address (base64url); a value that cannot be decoded is
 * left out. The view builder drops the paths that are not safe, repeated or over the limit.
 * @param {unknown} values
 * @returns {string[]}
 */
function addPathsOf(values) {
    /** @type {string[]} */
    const paths = [];
    for (const value of asList(values)) {
        if (typeof value !== 'string') continue;
        try {
            paths.push(b64urlDecode(value));
        } catch {
            // Links are edited by hand: a value that is not a path asks for nothing
        }
    }
    return paths;
}

/**
 * Why a saved view cannot be opened, or null.
 * @param {SavedView} view
 */
function openProblem(view) {
    if (view.newerVersion) return `This view cannot be opened: ${NEWER_VERSION}.`;
    return view.error ? `This view cannot be opened: ${view.error}.` : null;
}

/**
 * @param {object} ctx
 * @param {any} ctx.route  useRoute()
 * @param {{ replace: (location: any) => Promise<any>, currentRoute?: { value: { fullPath: string } } }} ctx.router  useRouter()
 * @param {{ open: (component: any, props: any) => Promise<any> }} ctx.dialogs
 * @param {boolean} [ctx.embed]  Viewer only: nothing is saved
 * @param {((path: string) => string|undefined) | import('vue').Ref<((path: string) => string|undefined) | null>} [ctx.hashOf]
 *   the hash of the file at a path as it is now (useViewLayers), or a ref of it set later; the hashes of a state to save
 *   are these, and the working state keeps the hashes the view was saved with until then
 */
export function useSavedView({ route, router, dialogs, embed = false, hashOf }) {
    const notify = useNotify();
    const { org, ds, uid: routeUid } = route.params;
    const uid = routeUid ? String(routeUid) : null;
    const dataset = reg.Organization(String(org)).Dataset(String(ds));

    const loading = ref(true);
    const error = ref('');
    // The error the view did not load with, for ViewerShell's page states (a missing file, no access, ...)
    /** @type {import('vue').ShallowRef<unknown>} */
    const loadError = shallowRef(null);
    const busy = ref(false);
    /** @type {import('vue').ShallowRef<ViewState|null>} */
    const state = shallowRef(null);
    /** @type {import('vue').ShallowRef<SavedView|null>} */
    const saved = shallowRef(null);
    // The meta item the state was loaded or saved from, for the check for another writer's save
    const loadedId = ref('');
    const identity = ref(routeIdentity(route));
    // Whether the address asked for the file picker (and the page was not restored from history)
    const pickOnLoad = ref(false);

    // A saved view names its base file in its data: read it first, the file follows
    /** @type {Promise<{ view: SavedView|null, problem: string|null }>|null} */
    const savedLookup = uid ? lookup(uid) : null;
    // The map opens what the explorer offers to open in it, and refuses any other file with one message
    const viewerEntry = useViewerEntry({
        accepts: canOpenInMap,
        typeLabel: 'a map',
        title: null,
        allowMissing: !!uid,
        path: savedLookup ? async () => {
            const { view, problem } = await savedLookup;
            return view && !problem ? view.data.base.path : null;
        } : undefined
    });
    const { entry, canWrite, canDelete } = viewerEntry;

    /** @param {string} wanted */
    async function lookup(wanted) {
        const view = (await listViews(dataset, { fresh: true })).find(v => v.uid === wanted) ?? null;
        return { view, problem: view ? openProblem(view) : UNKNOWN_VIEW };
    }

    // ---- Derived ---------------------------------------------------------------------------

    const isNew = computed(() => !saved.value);
    const dirty = computed(() => !!saved.value && !!state.value && !sameView(state.value, saved.value.data));
    const baseEntry = computed(() => {
        const e = entry.value;
        return e && state.value && e.path === state.value.base.path ? e : null;
    });
    const name = computed(() => {
        if (saved.value) return saved.value.name;
        return state.value ? ddb.pathutils.basename(state.value.base.path) : '';
    });
    const pageTitle = computed(() => (state.value ? `${name.value} - Map` : null));
    // The Copy link panel tells the user to save when the link would not show what the map shows:
    // a saved view that changed, or a new view that is not what its base file opens with
    const shareNote = computed(() => {
        const s = state.value;
        if (!s) return false;
        if (saved.value) return dirty.value;
        return !sameView(s, defaultState(s.base, { baseIsGeoraster: s.layers.some(l => l.path === s.base.path) }));
    });
    // The link to copy: the saved version, even when the map shows more, or the base file
    const linkTarget = computed(() => {
        if (saved.value) return { uid: saved.value.uid };
        return state.value ? { path: state.value.base.path } : null;
    });

    // ---- History entry and address ---------------------------------------------------------

    /** What the history entry holds: the identity of the page, the working state and, for a saved view, the version it came from. */
    const held = () => ({ identity: identity.value, state: state.value, ...(saved.value ? { savedId: loadedId.value } : {}) });

    function persist() {
        if (state.value) writeHistoryState(HISTORY_KEY, held());
    }

    /**
     * The state a history entry holds for this identity, or null. It is checked like saved data;
     * on a file route it must also be a view of that base file.
     * @param {{ baseIsGeoraster?: boolean }} [file]  the base file of a file route
     * @returns {{ state: ViewState, savedId?: string }|null}
     */
    function restoredState(file) {
        const found = readHistoryState(HISTORY_KEY);
        if (!found || found.identity !== identity.value) return null;
        const check = validateState(found.state);
        if (check.error || check.newerVersion) return null;
        if (file) {
            const s = found.state;
            const path = identity.value.slice('file:'.length);
            if (s.base.path !== path || s.layers.some(/** @param {any} l */ l => l.path === path) !== file.baseIsGeoraster) return null;
        }
        return { state: found.state, savedId: typeof found.savedId === 'string' ? found.savedId : undefined };
    }

    /**
     * Takes the page to another route of the same view without a reload: the identity moves
     * first, so the route change that follows is the page's own.
     * @param {string} newIdentity @param {string} path  the route's path
     */
    function moveTo(newIdentity, path) {
        identity.value = newIdentity;
        persist();
        const { query, hash } = currentLocation({ add: null, pick: null });
        return router.replace({ path, query, hash, state: { [HISTORY_KEY]: held() } })
            .catch(e => console.error('Cannot update the address:', e));
    }

    // The router's own navigations (a query key added by a dialog, for example) carry the
    // history state they knew, so the working state is written again after each; a route that
    // belongs to another page is left alone
    watch(() => route.fullPath, () => {
        if (routeIdentity(route) === identity.value) persist();
    });

    /** @param {ViewState} next  the working state after a change */
    function setState(next) {
        const previous = state.value;
        state.value = next;
        const fileRoute = !saved.value && previous && previous.base.path !== next.base.path;
        if (fileRoute) moveTo(`file:${next.base.path}`, fileViewUrl({ org: String(org), ds: String(ds) }, next.base.path));
        else persist();
    }

    // ---- Load ------------------------------------------------------------------------------

    // Why the base file did not load, as useViewerEntry caught it
    const entryError = () => viewerEntry.loadError.value ?? new Error(viewerEntry.error.value);

    async function loadSaved() {
        const { view, problem } = await /** @type {NonNullable<typeof savedLookup>} */ (savedLookup);
        if (!view || problem) throw new Error(problem ?? UNKNOWN_VIEW);
        if (!(await viewerEntry.entryLoaded)) throw entryError();
        const restored = restoredState();
        saved.value = view;
        loadedId.value = restored?.savedId ?? view.id;
        state.value = restored ? restored.state : workingState(view.data);
    }

    async function loadFile() {
        if (!(await viewerEntry.entryLoaded) || !entry.value) throw entryError();
        const base = { path: entry.value.path, hash: entry.value.hash || '' };
        const baseIsGeoraster = isGeoraster(entry.value);
        const add = addPathsOf(route.query.add);
        const pick = asList(route.query.pick).includes('1');
        // Read once: the address names the file, never the view
        replaceQueryKeys({ add: null, pick: null });
        const restored = restoredState({ baseIsGeoraster });
        state.value = restored ? restored.state : buildEntryState(base, add, { baseIsGeoraster });
        pickOnLoad.value = pick && !embed && !restored;
    }

    const loaded = (uid ? loadSaved() : loadFile()).then(() => {
        persist();
        return true;
    }, e => {
        loadError.value = e;
        error.value = e.message;
        return false;
    }).finally(() => { loading.value = false; });

    // ---- Save ------------------------------------------------------------------------------

    const canSave = () => canWrite.value && !embed && !busy.value && !!state.value;

    // One save at a time, from the click to the end of the write: the name prompt and the
    // question about another writer's save are part of it, so a second click (on the view bar or
    // the Copy link panel) while one of them is open does nothing. `busy` is the write alone.
    let saving = false;

    /** @param {() => Promise<void>} action */
    async function oneAtATime(action) {
        if (saving || !canSave()) return;
        saving = true;
        try {
            await action();
        } finally {
            saving = false;
        }
    }

    /** The working state with the hash of each file as it is now; a missing file keeps its hash. */
    function stateToSave() {
        const s = /** @type {ViewState} */ (state.value);
        const hashFor = unref(hashOf);
        /** @template {{ path: string, hash: string }} T @param {T} file */
        const hashed = file => ({ ...file, hash: hashFor?.(file.path) ?? file.hash });
        return { ...s, base: hashed(s.base), layers: s.layers.map(hashed) };
    }

    /** @param {unknown} e */
    function fail(e) {
        console.error('View save failed:', e);
        notify.error(e instanceof Error ? e.message : String(e), { summary: 'Cannot save the view' });
    }

    /** @param {() => Promise<void>} action */
    async function run(action) {
        busy.value = true;
        try {
            await action();
        } catch (e) {
            fail(e);
        } finally {
            busy.value = false;
        }
    }

    /**
     * Saves what the map shows under a name as a new view and moves the page to it.
     * @param {{ title: string, initialValue?: string }} prompt
     */
    async function createView({ title, initialValue }) {
        const chosen = await askViewName(dialogs, { title, initialValue });
        if (!chosen) return;
        await run(async () => {
            const toSave = stateToSave();
            const created = await saveNewView(dataset, toSave, { name: chosen, user: reg.getUsername() || '' });
            saved.value = created;
            loadedId.value = created.id;
            state.value = toSave;
            await moveTo(`view:${created.uid}`, savedViewUrl({ org: String(org), ds: String(ds) }, created.uid));
            notify.success(`Saved "${created.name}"`, { summary: 'View saved' });
        });
    }

    /** Asks for a name and creates a view, whether or not the page shows a saved one. */
    function createAsNew() {
        return createView(saved.value
            ? { title: 'Save view as', initialValue: `${saved.value.name} (copy)` }
            : { title: 'Save view' });
    }

    /** Save as new */
    function saveAsNew() {
        return oneAtATime(createAsNew);
    }

    /** What happened to the saved view since it was loaded, or null; a failed check is shown and stops the save. */
    async function changeSinceLoaded() {
        try {
            return { change: await viewChange(dataset, /** @type {SavedView} */ (saved.value).uid, loadedId.value) };
        } catch (e) {
            fail(e);
            return null;
        }
    }

    /** Save: a new view is created; a saved view is replaced, after the check for another writer. */
    function save() {
        return oneAtATime(saveOrReplace);
    }

    async function saveOrReplace() {
        if (!saved.value) {
            await createAsNew();
            return;
        }
        const checked = await changeSinceLoaded();
        if (!checked) return;
        if (checked.change === 'deleted') {
            notify.warn('This view was deleted. Save it under a name to keep it.', { summary: 'View deleted' });
            await createView({ title: 'Save view as', initialValue: '' });
            return;
        }
        if (checked.change === 'changed') {
            const choice = await dialogs.open(ConfirmDialog, {
                title: 'View changed',
                message: 'Someone saved this view after you opened it. Overwrite their changes, or save yours as a new view?',
                confirmText: 'Overwrite',
                secondaryText: 'Save as new',
                secondaryButtonClass: 'secondary',
                confirmButtonClass: 'danger'
            });
            if (choice === 'secondary') {
                await createAsNew();
                return;
            }
            if (choice !== 'confirm') return;
        }
        const viewUid = saved.value.uid;
        await run(async () => {
            const toSave = stateToSave();
            const updated = await updateView(dataset, viewUid, { state: toSave, user: reg.getUsername() || '' });
            saved.value = updated;
            loadedId.value = updated.id;
            // The state keeps the hashes it was saved with, so it is the saved data and not dirty
            state.value = toSave;
            persist();
            notify.success(`Saved "${updated.name}"`, { summary: 'View saved' });
        });
    }

    // ---- Leave -----------------------------------------------------------------------------

    // The changes the view bar calls unsaved; a save that does not save (a cancelled name, a
    // refused write) leaves them dirty, so the page stays
    useLeaveGuard({
        isDirty: () => !embed && canWrite.value && dirty.value,
        save,
        dialogs,
        router,
        ignore: to => routeIdentity(to) === identity.value,
        title: () => `Save changes to ${name.value}?`,
        message: 'This view has changes that are not saved. Save them before you leave?'
    });

    return {
        dataset, loading, error, loadError, loaded, canWrite, canDelete, state, setState, saved, isNew, dirty, shareNote, name, pageTitle, identity,
        baseEntry, busy, pickOnLoad, linkTarget, save, saveAsNew
    };
}
