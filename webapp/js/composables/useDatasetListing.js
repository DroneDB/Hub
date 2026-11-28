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
import { isPathRemoved } from '@/features/dataset/explorer/treeSelection';
import { isSameDataset } from '@/libs/build/datasetIdentity';
import { useLatestOnly } from '@/composables/useLatestOnly';
import { deletedEntriesEvent } from '@/libs/dataset/deletedEntries';

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
     * The tree hears of items of any folder, one folder at a time: a tree node takes the items for the folder it
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

    /** Opens `folder` (null or '' is the root) as a click on its crumb does: the tree shows it, and the list follows. */
    const open = folder => emitter.emit('folderOpened', ddb.pathutils.getTree(folder || '/'));

    /**
     * Entries that left the dataset paths they had (deleted, renamed, moved): the list drops them and the tree hears of
     * it. The list never shows a folder that is not there, nor an empty list for a folder that has files:
     *  - the folder on show left with them (the tree acts on a folder while the list shows what it holds): the folder
     *    that held the outermost of them opens instead (the tree opens the nearest folder it has);
     *  - the list showed only what left (items picked in the tree are listed on their own, without the rest of their
     *    folder): the folder on show opens.
     */
    function removed(paths) {
        const shown = files.value.length;
        drop(paths);
        if (!paths.length) return;
        emitter.emit('deleteEntries', deletedEntriesEvent(dataset, paths));
        const holders = paths.filter(path => isPathRemoved(currentPath.value, [path]));
        if (holders.length) open(ddb.pathutils.getParentFolder(holders.reduce((a, b) => (b.length < a.length ? b : a))));
        else if (shown > 0 && files.value.length === 0) open(currentPath.value);
    }

    /**
     * The entries the list shows for new entries that it does not show yet (entriesInView): an entry of the folder on
     * show as itself, a deeper one as the folder below the folder on show that holds it.
     */
    const notShownInView = entries => entriesInView(entries, currentPath.value)
        .filter(e => !files.value.some(f => f.entry.path === e.path));

    /**
     * An entry created or rewritten on the server (merge, align output, the map's measurements, a README, the photo of
     * an annotation): the list shows it when it is in the folder, the tree shows it wherever it is; an item
     * already on show is replaced (its size and date follow) and stays selected. A file written into a folder the list
     * does not have (the first photo of an annotation creates `annotations/`) brings that folder to the list and the
     * tree, as an upload does; a folder the list has stays as it is.
     */
    async function addEntry(path) {
        const entry = await dataset.listOne(path);
        const shown = files.value.find(f => f.entry.path === entry.path);
        const folders = notShownInView([entry]).filter(e => e !== entry).map(e => itemFor(dataset, e));
        added([...folders, itemFor(dataset, entry, shown ? { selected: shown.selected } : {})]);
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
        if (isSameDataset(data.dataset, dataset) && isTerminalState(data.newState)) refreshBuild(data.filePath);
    };
    BuildManager.on('buildStateChanged', onBuildStateChanged);
    if (getCurrentScope()) onScopeDispose(() => BuildManager.off('buildStateChanged', onBuildStateChanged));

    /**
     * Uploaded entries. The list shows them as the folder on show sees them (a subfolder's content as its top folder, the
     * in-view filter); the tree hears of every entry by its own parent folder, whatever is on show: a nested
     * `a/b/c.jpg` with the root on show, a folder that the list already has, an upload that ends in another folder. One
     * event per parent folder, no entry twice (the top folder of the list stands in for a folder the entries do not name).
     * A file uploaded again under a name on show replaces its item (size, date, hash and thumbnail follow, the selection
     * stays) and its build is followed again.
     */
    function uploaded(entries) {
        const shown = new Map(files.value.map(f => [f.entry.path, f]));
        const replaced = entries
            .filter(e => shown.has(e.path) && !ddb.entry.isDirectory(e))
            .map(e => itemFor(dataset, e, { selected: shown.get(e.path).selected }));
        const items = [...replaced, ...notShownInView(entries).map(e => itemFor(dataset, e))];
        if (items.length) put(items.filter(i => inView(i.entry.path)));
        // The items of the list stand for their entries where they are the same entry (one object for list and tree)
        const forTree = new Map(items.map(i => [i.entry.path, i]));
        for (const e of entries) if (!forTree.has(e.path)) forTree.set(e.path, itemFor(dataset, e));
        announce([...forTree.values()]);
        // Whatever the list shows: a file replaced under its name may need a build, as a new one does
        BuildManager.onFilesAdded(dataset, entries);
    }

    /**
     * Re-reads the folder on show (and `destPath` for the tree) after a server-side change
     * that may have replaced entries (extract, import).
     */
    const latestReload = useLatestOnly();
    async function reload(destPath) {
        // An answer that comes after the folder on show changed, or after a newer reload started, belongs to a list
        // the user has left: it must not put the items of the old folder under the new one
        const current = latestReload();
        const folder = currentPath.value || null;
        const stale = () => !current() || (currentPath.value || null) !== folder;
        try {
            const items = ((await dataset.list(folder || undefined)) || []).map(e => itemFor(dataset, e));
            if (stale()) return;
            files.value = sortItems(items);
            if (items.length) {
                emitter.emit('addItems', items);
                BuildManager.onFilesAdded(dataset, items.map(i => i.entry));
            }
            const dest = destPath || null;
            if (dest && dest !== folder) {
                // Best effort: a tree node reloads when expanded anyway
                const destItems = ((await dataset.list(dest).catch(() => [])) || []).map(e => itemFor(dataset, e));
                if (destItems.length && !stale()) emitter.emit('addItems', destItems);
            }
        } catch (e) {
            console.warn('Could not refresh the file list:', e);
        }
    }

    return { files, currentPath, isLoading, selected, inView, put, drop, added, removed, addEntry, uploaded, reload, refreshBuild };
}
