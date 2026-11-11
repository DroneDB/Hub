/**
 * useDatasetListing - the items of the folder on show on the dataset page: kept sorted, and every change announced on the event bus
 * so the tree and the map follow (addItems / deleteEntries). The build fields of an item (the
 * artifacts the entry lists, its build status) are read again when its build job ends.
 *
 *   const listing = useDatasetListing(dataset);
 *   listing.added([itemFor(dataset, entry)]);   listing.removed(['a.jpg']);
 */
import { ref, computed, getCurrentScope, onScopeDispose } from 'vue';
import ddb from 'ddb';
import emitter from '@/libs/eventBus';
import BuildManager from '@/libs/build/buildManager';
import { applyBuildFields } from '@/libs/build/entryBuild';
import { isTerminalState } from '@/libs/tasks/taskStates';
import { itemFor, sortItems, isInFolder, entriesInView } from '@/libs/dataset/explorerItems';

/** @param {any} dataset */
export function useDatasetListing(dataset) {
    const files = ref([]);
    // Folder on show, null at the root
    const currentPath = ref(null);
    const isLoading = ref(true);
    const selected = computed(() => files.value.filter(f => f.selected));

    const inView = path => isInFolder(path, currentPath.value);

    /** Local only: items replace those with the same path, the list stays sorted. */
    function put(items) {
        const paths = new Set(items.map(i => i.entry.path));
        files.value = sortItems([...files.value.filter(f => !paths.has(f.entry.path)), ...items]);
    }

    /** Local only. */
    function drop(paths) {
        const gone = new Set(paths);
        files.value = files.value.filter(f => !gone.has(f.entry.path));
    }

    /**
     * The tree hears of items of any folder (FR-EXP-36), one folder at a time: a tree node takes the items for the folder it
     * shows, so a list of several folders would put the items of one under another.
     */
    function announce(items) {
        const byFolder = new Map();
        for (const item of items) {
            const folder = ddb.pathutils.getParentFolder(item.entry.path) || '';
            byFolder.set(folder, [...(byFolder.get(folder) || []), item]);
        }
        for (const group of byFolder.values()) emitter.emit('addItems', group);
    }

    /** New items (any folder): those of the folder on show join the list; the tree hears of all. */
    function added(items) {
        const here = items.filter(i => inView(i.entry.path));
        if (here.length) put(here);
        announce(items);
    }

    function removed(paths) {
        drop(paths);
        if (paths.length) emitter.emit('deleteEntries', paths);
    }

    /**
     * An entry created or rewritten on the server (merge, align output, the map's measurements, a README):
     * the list shows it when it is in the folder, the tree shows it wherever it is (FR-EXP-36); an item
     * already on show is replaced (its size and date follow) and stays selected.
     */
    async function addEntry(path) {
        const entry = await dataset.listOne(path);
        const shown = files.value.find(f => f.entry.path === entry.path);
        added([itemFor(dataset, entry, shown ? { selected: shown.selected } : {})]);
    }

    /**
     * An entry is a snapshot of the listing that gave it: a build that ends afterwards is not in it.
     * Reads the entry again and copies its build fields (artifacts, build status) onto the item on
     * show, so the badges, the download menu and the viewers' gate follow what the build produced.
     * A path whose refresh is running is not asked twice (a state change reaches us more than once).
     */
    const refreshing = new Set();
    async function refreshBuild(path) {
        const item = files.value.find(f => f.entry.path === path);
        if (!item || refreshing.has(path)) return;
        refreshing.add(path);
        try {
            applyBuildFields(item.entry, await dataset.listOne(path));
        } catch (e) {
            console.warn(`Could not refresh the build of ${path}:`, e);
        } finally {
            refreshing.delete(path);
        }
    }

    const onBuildStateChanged = data => {
        if (data.dataset === dataset && isTerminalState(data.newState)) refreshBuild(data.filePath);
    };
    BuildManager.on('buildStateChanged', onBuildStateChanged);
    if (getCurrentScope()) onScopeDispose(() => BuildManager.off('buildStateChanged', onBuildStateChanged));

    /**
     * Uploaded entries. The list shows them as the folder on show sees them (a subfolder's content as its top folder, the
     * in-view filter); the tree hears of every entry by its own parent folder, whatever is on show (FR-EXP-36): a nested
     * `a/b/c.jpg` with the root on show, a folder that the list already has, an upload that ends in another folder. One
     * event per parent folder, no entry twice (the top folder of the list stands in for a folder the entries do not name).
     */
    function uploaded(entries) {
        const items = entriesInView(entries, currentPath.value)
            .filter(e => !files.value.some(f => f.entry.path === e.path))
            .map(e => itemFor(dataset, e));
        if (items.length) put(items.filter(i => inView(i.entry.path)));
        // The items of the list stand for their entries where they are the same entry (one object for list and tree)
        const forTree = new Map(items.map(i => [i.entry.path, i]));
        for (const e of entries) if (!forTree.has(e.path)) forTree.set(e.path, itemFor(dataset, e));
        announce([...forTree.values()]);
        if (items.length) BuildManager.onFilesAdded(dataset, entries);
    }

    /**
     * Re-reads the folder on show (and `destPath` for the tree) after a server-side change
     * that may have replaced entries (extract, import).
     */
    async function reload(destPath) {
        try {
            const folder = currentPath.value || null;
            const items = ((await dataset.list(folder || undefined)) || []).map(e => itemFor(dataset, e));
            files.value = sortItems(items);
            if (items.length) {
                emitter.emit('addItems', items);
                BuildManager.onFilesAdded(dataset, items.map(i => i.entry));
            }
            const dest = destPath || null;
            if (dest && dest !== folder) {
                // Best effort: a tree node reloads when expanded anyway
                const destItems = ((await dataset.list(dest).catch(() => [])) || []).map(e => itemFor(dataset, e));
                if (destItems.length) emitter.emit('addItems', destItems);
            }
        } catch (e) {
            console.warn('Could not refresh the file list:', e);
        }
    }

    return { files, currentPath, isLoading, selected, inView, put, drop, added, removed, addEntry, uploaded, reload, refreshBuild };
}
