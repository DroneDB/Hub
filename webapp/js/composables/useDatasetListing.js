/**
 * useDatasetListing - the items of the folder on show on the dataset page: kept sorted, and every change announced on the event bus
 * so the tree and the map follow (addItems / deleteEntries). The build fields of an item (the
 * artifacts the entry lists, its build status) are read again when its build job ends.
 *
 *   const listing = useDatasetListing(dataset);
 *   listing.added([itemFor(dataset, entry)]);   listing.removed(['a.jpg']);
 */
import { ref, computed, getCurrentScope, onScopeDispose } from 'vue';
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

    /** New items (any folder): those of the folder on show join the list; the tree hears of all. */
    function added(items) {
        const here = items.filter(i => inView(i.entry.path));
        if (here.length) put(here);
        if (items.length) emitter.emit('addItems', items);
    }

    function removed(paths) {
        drop(paths);
        if (paths.length) emitter.emit('deleteEntries', paths);
    }

    /** An entry created on the server (merge, align output): shown when it is in the folder. */
    async function addEntry(path) {
        const entry = await dataset.listOne(path);
        if (inView(entry.path) && !files.value.some(f => f.entry.path === entry.path)) added([itemFor(dataset, entry)]);
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

    /** Uploaded entries as the folder on show sees them (subfolders as their top folder). */
    function uploaded(entries) {
        const items = entriesInView(entries, currentPath.value)
            .filter(e => !files.value.some(f => f.entry.path === e.path))
            .map(e => itemFor(dataset, e));
        if (!items.length) return;
        added(items);
        BuildManager.onFilesAdded(dataset, entries);
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
