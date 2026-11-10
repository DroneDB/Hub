<template>
    <div id="browser" class="cui app">
        <Message v-model="error" />
        <!-- The dataset is not there, not for this user, or needs a sign-in: the page state in place of the panels -->
        <ResourceState v-if="loadKind" :kind="loadKind" resource="dataset" :name="params.ds" />
        <!-- One layout decision, from the window's width (phoneLayout, below sm): the panel hides its first pane and the
             tabs get Browser and Properties; the tabs (the second pane) are never rendered again when it changes -->
        <Panel v-else split="vertical" class="main" amount="23.6%" first-size="var(--ddb-panel-tree-width)" tablet-amount="30%" storage-key="dataset" :mobile-collapsed="phoneLayout">
            <template #first>
                <div class="sidebar">
                    <FileBrowser ref="fileBrowser" v-bind="treeProps" v-on="treeEvents" />
                </div>
            </template>
            <template #second>
                <TabSwitcher ref="tabs" :tabs="mainTabs" :selected-tab="initialTab ?? mainTabs[0].key" position="top"
                             :hide-single="false" bottom-nav-phone @tab-change="onTabChange">
                    <template v-if="phoneLayout" #filebrowser>
                        <FileBrowser ref="mobileFileBrowser" v-bind="treeProps" v-on="treeEvents" />
                    </template>
                    <template #map>
                        <Map v-if="openedTabs.map" ref="mapViewer" lazyload :files="listing.files.value" :dataset="dataset"
                             :current-path="listing.currentPath.value" :loading="listing.isLoading.value" :active="activeTab === 'map'"
                             :can-write="canWrite" :can-delete="canDelete" @scroll-to="file => explorer && explorer.scrollTo && explorer.scrollTo(file)"
                             @show-folder="showFolder" @open-item="openItem" @vue:mounted="onMapMounted"
                             @file-written="onMapFileWritten" @file-removed="path => listing.removed([path])" />
                    </template>
                    <template #explorer>
                        <div class="explorer-tab">
                            <!-- An import into this dataset runs (FR-UPL-10): the page says so with its progress, and links to the Tasks tab -->
                            <div v-if="runningImport" class="import-banner" role="status">
                                <i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true" />
                                <span>{{ importBannerText }}</span>
                                <Button label="View in Tasks" severity="secondary" size="small" text @click="tabs.activateTab('tasks')" />
                            </div>
                            <div class="detail-layout">
                                <div class="detail-main" :class="{ 'with-detail': showDetail }">
                                    <Explorer v-if="viewMode === 'grid'" ref="explorer" v-bind="explorerProps" :tile-size="tileSize" v-on="fileEvents" />
                                    <TableView v-else ref="explorer" v-bind="explorerProps" :expanded-grid="expandedGrid" v-on="fileEvents" />
                                </div>
                                <div v-if="showDetail" id="dataset-detail-side" ref="detailSide" class="detail-side">
                                    <DetailPanel :file="detailFile" :selection="listing.selected.value" :can-write="canWrite" :dataset="dataset" :views="views" v-on="detailEvents" />
                                </div>
                                <!-- Below lg, the drawer the user closed comes back from here, not with the next selection -->
                                <Button v-if="detailReopenable" ref="detailReopen" class="detail-reopen" icon="fa-solid fa-circle-info" label="Details"
                                        severity="secondary" aria-controls="dataset-detail-side" aria-expanded="false" @click="openDrawer" />
                            </div>
                        </div>
                    </template>
                    <template #tasks>
                        <TaskHistory v-if="openedTabs.tasks" :dataset="dataset" :can-write="canWrite" />
                    </template>
                    <template v-if="phoneLayout" #properties>
                        <DetailPanel :file="detailFile" :selection="listing.selected.value" :can-write="canWrite" :dataset="dataset" :views="views" v-on="detailEvents" />
                    </template>
                </TabSwitcher>
            </template>
        </Panel>
        <DialogHost :dialogs="dialogs" />
        <ClipboardPanel />
        <Loader v-if="busy" />
        <DatasetLightbox ref="lightbox" :dataset="dataset" />
    </div>
</template>

<script setup>
/**
 * ViewDataset - the dataset page: the folder tree, the file list (grid or table) with its
 * detail panel, the Map and Tasks tabs. The page composes; what it does lives in
 * useDatasetListing (the folder on show), useDatasetActions (every file operation through
 * its dialog, on the dialog registry), useDatasetClipboard, useOpenItem and
 * useDatasetShortcuts; the toolbar is libs/dataset/explorerTools, from the action registry
 * (libs/dataset/explorerActions) that the menus and the shortcuts read too; the lightbox is a component.
 */
import { ref, shallowRef, reactive, computed, watch, provide, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ddb from 'ddb';
import reg from '@/libs/api/sharedRegistry';
import icons from '@/libs/icons';
import { setTitle } from '@/libs/utils';
import { formatNumber } from '@/libs/format';
import { lazyComponent } from '@/libs/lazyComponent';
import { Features } from '@/libs/features';
import { PREF } from '@/libs/preferences';
import { permissionsOf } from '@/libs/datasetPermissions';
import { loadErrorKind } from '@/libs/ddb/apiError';
import { isFileBuilt } from '@/libs/build/buildHelpers';
import BuildManager from '@/libs/build/buildManager';
import taskMonitor, { datasetKey } from '@/libs/tasks/taskMonitor';
import { downloadFromDataset, downloadBuildArtifact, notifyDownloadError, needsConfirm, confirmMessage } from '@/libs/datasetDownloads';
import { describeSelection, selectionSize } from '@/libs/dataset/selection';
import { useSplatDownloads } from '@/features/viewers/splat/useSplatDownloads';
import { splatDownloadsOf, splatExportOffered } from '@/features/viewers/splat/splatDownloads';
import { explorerTools } from '@/libs/dataset/explorerTools';
import { useDatasetSessionStore } from '@/stores/datasetSession';
import { useUploadsStore } from '@/stores/uploads';
import { useRequestScope, isAbort } from '@/composables/useRequestScope';
import { useBuildEvents } from '@/composables/useBuildEvents';
import { useHeavyTask } from '@/composables/useHeavyTask';
import { usePreference } from '@/composables/usePreference';
import { useNotify } from '@/composables/useNotify';
import { useTimerGroup } from '@/composables/useTimers';
import { useDialogs } from '@/composables/useDialogs';
import { useDatasetListing } from '@/composables/useDatasetListing';
import { useDatasetActions } from '@/composables/useDatasetActions';
import { useDatasetClipboard } from '@/composables/useDatasetClipboard';
import { useOpenItem } from '@/composables/useOpenItem';
import { useDatasetShortcuts } from '@/composables/useDatasetShortcuts';
import { useViewActions } from '@/composables/useViewActions';
import { useEventListener } from '@/composables/useEventListener';
import { useStackedLayout, useMediaMatch } from '@/composables/useStackedLayout';
import { hasOpenModalOverlay, useOverlay } from '@/composables/useOverlay';
import { TABLET_MEDIA_QUERY, XWIDE_MEDIA_QUERY } from '@/libs/responsiveColumns';
import { tileSizeChoice } from './explorer/tileGeometry';
import { listViews } from '@/libs/views/viewStore';
import Button from 'primevue/button';
import Message from '@/components/HubMessage.vue';
import ResourceState from '@/components/ResourceState.vue';
import Panel from '@/features/dataset/HubPanel.vue';
import TabSwitcher from '@/features/dataset/TabSwitcher.vue';
import Loader from '@/components/HubLoader.vue';
import DialogHost from '@/components/DialogHost.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import ClipboardPanel from '@/features/dataset/ClipboardPanel.vue';
import FileBrowser from './explorer/FileBrowser.vue';
import Explorer from './explorer/DatasetExplorer.vue';
import TableView from './explorer/TableView.vue';
import DetailPanel from './explorer/DetailPanel.vue';
import DatasetLightbox from './DatasetLightbox.vue';

// The Map tab mounts on first activation (prefetched: instant on a warm connection)
const Map = lazyComponent(() => import(/* webpackChunkName: "dataset-map", webpackPrefetch: true */ '@/features/viewers/map/DatasetMap.vue'), { showLoader: false });
const TaskHistory = lazyComponent(() => import(/* webpackChunkName: "dataset-tasks" */ './TaskHistory.vue'), { showLoader: false });

defineOptions({ name: 'ViewDataset' });

const route = useRoute();
const router = useRouter();
const params = { org: String(route.params.org), ds: String(route.params.ds) };
const dataset = reg.Organization(params.org).Dataset(params.ds);
const session = useDatasetSessionStore();
const notify = useNotify();
const later = useTimerGroup();
const requestSignal = useRequestScope().signal;
const { runHeavyTask } = useHeavyTask();
const splatDownloads = useSplatDownloads(() => dataset);
const { watchBuildEvents, handleBuildStarted, handleBuildError } = useBuildEvents();

const error = ref('');
const busy = ref(false);
// The dataset did not load (not found, no access, sign in): ResourceState replaces the panels
const loadError = shallowRef(null);
const loadKind = computed(() => loadErrorKind(loadError.value));
// A dataset opened after one that did not load starts with the toolbar's actions
session.setUnavailable(false);
// The phone layout (FR-EXP-29): a window below `sm`, the breakpoint of libs/responsiveColumns.js (as the bottom
// navigation), not the screen of libs/responsive's isMobile. It follows the window (a phone that rotates, a window
// resized): there the tree is the Browser tab and the detail of a file the Properties tab, and the splitter hides its
// first pane (HubPanel mobile-collapsed). The tabs change around the ones they keep, which are not rendered again.
const phoneLayout = useStackedLayout();
const mainTabs = computed(() => [
    ...(phoneLayout.value ? [{ label: 'Browser', icon: 'fa-solid fa-sitemap', key: 'filebrowser' }] : []),
    { label: 'Files', icon: 'fa-solid fa-folder-open', key: 'explorer' },
    ...(phoneLayout.value ? [{ label: 'Properties', icon: 'fa-solid fa-circle-info', key: 'properties' }] : []),
    { label: 'Map', icon: 'fa-solid fa-map', key: 'map' },
    { label: 'Tasks', icon: 'fa-solid fa-list-check', key: 'tasks' }
]);
// The link of the task e-mail (FR-PRC-40) opens the Tasks tab: `?tab=tasks`; any other query leaves the first tab.
// It is read for the first tab; the route is followed afterwards (watch below), and the query goes once the user
// switches to another tab (onTabChange), so a reload or a shared address does not bring the old tab back.
const TASKS_TAB_QUERY = 'tasks';
const initialTab = route.query?.tab === TASKS_TAB_QUERY ? TASKS_TAB_QUERY : null;
// The tab on show
const activeTab = ref(null);
// Tabs whose code loads on first use stay mounted once opened
const openedTabs = reactive({ map: false, tasks: false });
const viewMode = usePreference(PREF.FILE_VIEW_MODE, 'grid');
// Table view: thumbnails and relative times, or icons and dates
const expandedGrid = usePreference(PREF.TABLE_EXPANDED_GRID, true);
// The size of the grid's thumbnails (FR-EXP-43): S, M or L as the user chose, else M on a 4K screen and S below it
const tileSizePref = usePreference(PREF.TILE_SIZE, '');
const xwide = useMediaMatch(XWIDE_MEDIA_QUERY);
const tileSize = computed(() => tileSizeChoice(tileSizePref.value, xwide.value));
const detailFile = ref(null);
// Below lg (and from sm) the detail panel is a drawer over the list (FR-EXP-17). Once the user closes it, a selection
// does not open it again: its Details button does. From lg it is a column that follows the selection, as before.
const belowLg = useMediaMatch(TABLET_MEDIA_QUERY);
const drawerMode = computed(() => belowLg.value && !phoneLayout.value);
const drawerClosed = ref(false);
const showDetail = computed(() => !!detailFile.value && !phoneLayout.value && !(drawerMode.value && drawerClosed.value));
const detailReopenable = computed(() => drawerMode.value && drawerClosed.value && !!detailFile.value);

// Permissions are on the dataset's root entry
const rootEntry = ref(null);
const permissions = computed(() => permissionsOf(rootEntry.value));
const canWrite = computed(() => permissions.value.canWrite);
const canDelete = computed(() => permissions.value.canDelete);
// The saved views of the dataset, sorted by name (read with meta/get/views, not from the info)
const views = ref([]);

const tabs = ref(null);
const explorer = ref(null);
const fileBrowser = ref(null);
const mobileFileBrowser = ref(null);
const mapViewer = ref(null);
const lightbox = ref(null);
const detailSide = ref(null);
const detailReopen = ref(null);

const listing = useDatasetListing(dataset);
// An upload that ends while this dataset is open shows in its listing, also one that the user started on another page
// and that went on in the background (FR-UPL-04)
const stopHearingUploads = useUploadsStore().subscribe(params.org, params.ds, { added: entries => listing.uploaded(entries) });
onBeforeUnmount(stopHearingUploads);
const dialogs = useDialogs();
// The tree that is on the page: the sidebar's, or on a phone the Browser tab's
const activeTree = () => (phoneLayout.value ? mobileFileBrowser.value : fileBrowser.value) || fileBrowser.value || mobileFileBrowser.value;
const refresh = () => {
    const tree = activeTree();
    if (tree) tree.refreshAndNavigate(listing.currentPath.value);
};
// The Map tab's "Photos are in images/ - Show" (FR-MAP-10): the tree opens that subfolder, and the map shows what it holds
const showFolder = path => { activeTree()?.refreshAndNavigate(path); };
const actions = useDatasetActions({ dataset, listing, dialogs, busy, canWrite, route: params, refresh, openItem: node => openItem(node) });
const clipboard = useDatasetClipboard({ dataset, listing, dialogs, busy, canWrite, showError: actions.showError });

// ---- Map tab ---------------------------------------------------------------------------

let pendingMapActions = [];

/** Runs `action` with the map viewer, once its code has loaded. */
function withMap(action) {
    if (mapViewer.value) action(mapViewer.value);
    else pendingMapActions.push(action);
}

// A lazily loaded tab mounts after its activation: forward it now
function onMapMounted() {
    nextTick(() => {
        const map = mapViewer.value;
        if (!map) return;
        if (tabs.value && tabs.value.activeTab === 'map') map.onTabActivated();
        pendingMapActions.splice(0).forEach(action => action(map));
    });
}

// A file the map saved (the measurements) joins the list and the tree, or replaces its old entry
function onMapFileWritten(path) {
    listing.addEntry(path).catch(e => console.warn(`Could not show ${path} in the file list:`, e));
}

// The user left the tab that `?tab=` names: the address stops saying so (replace: no history entry for a tab switch)
function dropTabQuery(key) {
    if (route.query?.tab !== TASKS_TAB_QUERY || key === TASKS_TAB_QUERY) return;
    const query = { ...route.query };
    delete query.tab;
    void router.replace({ query, hash: route.hash });
}

// `?tab=tasks` arriving while the page is open (back/forward, a link to the same dataset) shows the Tasks tab
watch(() => route.query?.tab, tab => {
    if (tab === TASKS_TAB_QUERY) tabs.value?.activateTab(TASKS_TAB_QUERY);
});

function onTabChange(key) {
    activeTab.value = key;
    dropTabQuery(key);
    if (key in openedTabs) openedTabs[key] = true;
    // The header gates Download / Share on the Files tab
    session.setActiveTab(key);
}

const { openItem } = useOpenItem({
    dataset, route: params, canWrite, dialogs, actions,
    showInLightbox: node => lightbox.value.supports(node.entry) && (lightbox.value.open(node, listing.files.value), true),
    openPlantHealth: (node, options) => {
        tabs.value.activateTab('map');
        withMap(map => map.openPlantHealth(node, options));
    }
});

// A dialog, or a modal overlay over the page (the photo or video lightbox, a modal window), takes
// the keys; a non-modal one (the draggable map popup) leaves them to the page
useDatasetShortcuts({
    blocked: () => dialogs.stack.value.length > 0 || hasOpenModalOverlay(),
    canWrite,
    selected: () => listing.selected.value,
    files: () => listing.files.value,
    selectAll: on => selectAll(on),
    treeFor: target => (target.closest && target.closest('.tree-view')
        ? [fileBrowser.value, mobileFileBrowser.value].find(fb => fb && fb.$el && fb.$el.contains(target)) || null
        : null),
    actions,
    clipboard
});

provide('showBuildConfirm', actions.confirmBuild);
// Drag and drop from the explorer, the table and the tree (libs/dragDropUtils)
provide('datasetDrop', { upload: files => actions.upload(files), move: actions.move });

// ---- Downloads -------------------------------------------------------------------------

async function downloadItems(files) {
    if (!files || !files.length) return;
    // One archive at a time per dataset
    if (session.activeBulkDownload) {
        notify.warn('A download archive is already being prepared. Please wait for it to complete.', { summary: 'Download in progress' });
        return;
    }
    // A single file downloads at once, like the header's Download; several items or a folder ask (FR-EXP-27)
    if (needsConfirm(files) && !await askDownload(files)) return;
    const paths = files.map(f => (f.entry && f.entry.path !== undefined ? f.entry.path : ddb.utils.parseUri(f.path).path));
    try {
        await downloadFromDataset({
            dataset, paths, files, signedIn: reg.isLoggedIn(), runTask: runHeavyTask,
            thresholdBytes: reg.features.value(Features.BULK_DOWNLOAD_ASYNC_THRESHOLD_BYTES)
        });
    } catch (e) {
        notifyDownloadError(e);
    }
}

/**
 * The question before an archive download, with the count and the total size. A folder's size is
 * read from the server meanwhile ("Calculating size…"), as the delete question does; the user can
 * answer before it arrives.
 */
async function askDownload(files) {
    const size = ref(null);
    const failed = ref(false);
    const reading = new AbortController();
    if (describeSelection(files).hasFolder) {
        selectionSize(dataset, files, { signal: reading.signal })
            .then(total => { size.value = total; })
            .catch(e => { if (!reading.signal.aborted) { failed.value = true; console.warn('Cannot read the size of the selection:', e); } });
    }
    const answer = await dialogs.open(ConfirmDialog, () => ({
        title: 'Download', confirmText: 'Download', cancelText: 'Cancel', confirmButtonClass: 'primary',
        message: confirmMessage(describeSelection(files), {}, { size: size.value, failed: failed.value })
    }));
    reading.abort();
    return answer === 'confirm';
}

// Build output: re-checks that the build exists (the entry's artifacts), then downloads its artifact of `role`
async function downloadArtifact(file, role) {
    if (!file || !file.entry) return;
    if (!await isFileBuilt(dataset, file)) {
        notify.warn('This file has not been built yet. Run Build first.', { summary: 'Not available' });
        return;
    }
    await downloadBuildArtifact(dataset, file.entry.path, role).catch(notifyDownloadError);
}

// A download of a splat other than the original: its artifact, or the .spz made for other tools
function downloadSplat(file, downloadId) {
    if (!file || !file.entry) return;
    const row = splatDownloadsOf(file.entry, { canExport: splatExportOffered() }).find(d => d.id === downloadId);
    if (row) splatDownloads.download(row, file.entry, () => downloadItems([file]));
}

// ---- Selection and the detail panel ----------------------------------------------------

const selectAll = on => listing.files.value.forEach(f => { f.selected = on; });

// The detail panel follows the clicked file; it opens after a moment so a double click
// does not reflow the list under the pointer
function onSelectionChanged(file) {
    const selected = listing.selected.value;
    const next = selected.length ? (file && file.selected ? file : selected[0]) : null;
    later.clear();
    if (detailFile.value || !next) detailFile.value = next;
    else later(() => { detailFile.value = next; }, 250);
}

function closeDetail() {
    later.clear();
    if (drawerMode.value) closeDrawer();
    else detailFile.value = null;
}

// The drawer keeps following the selection while it is closed, for its Details button
function closeDrawer() {
    const hadFocus = !!detailSide.value && detailSide.value.contains(document.activeElement);
    drawerClosed.value = true;
    // The focus was in the drawer and had nowhere to go back to (the overlay stack gave it to the page): the button
    nextTick(() => {
        const active = document.activeElement;
        const lost = !active || active === document.body || active.matches('h1, main');
        if (hadFocus && lost) detailReopen.value?.$el?.focus?.();
    });
}

function openDrawer() {
    drawerClosed.value = false;
}

// The drawer is a non-modal overlay (composables/useOverlay): Escape closes it, the page keeps its shortcuts. Only
// while the Files tab is on show, so a drawer on a hidden tab never takes the key.
useOverlay({
    active: () => drawerMode.value && showDetail.value && activeTab.value === 'explorer',
    container: () => detailSide.value,
    onEscape: e => { e.preventDefault(); closeDrawer(); }
});

function onOpenItem(node, view, options) {
    later.clear();
    openItem(node, view, options);
}

// The tree shows another folder (or a single file)
function onTreeSelection(files) {
    listing.files.value.forEach(f => { f.selected = false; });
    listing.files.value = files;
    listing.isLoading.value = false;
    detailFile.value = files.length === 1 && files[0].entry && !ddb.entry.isDirectory(files[0].entry) ? files[0] : null;
}

function onCurrentUriChanged(uri) {
    listing.currentPath.value = uri != null ? ddb.utils.pathFromUri(uri).replace(/^\//, '') : null;
    listing.isLoading.value = true;
}

// The dataset's root entries (and its permissions and title) for the tree
async function rootNodes() {
    try {
        const entries = await dataset.info({ signal: requestSignal });
        if (entries.length) {
            rootEntry.value = entries[0];
            session.setRootEntry(entries[0]);
        }
        const name = entries[0]?.properties?.meta?.name;
        if (name) setTitle(name.data);
        return entries.map(e => ({
            icon: icons.getForType(e.type, e.path), label: ddb.utils.entryLabel(e), path: e.path,
            expanded: true, entry: e, isExpandable: ddb.entry.isDirectory(e)
        }));
    } catch (e) {
        // Left while loading
        if (isAbort(e)) return [];
        // Not there, not for this user, or sign in (with a session, a 401 has already sent the user
        // to Login): the page state, and the header offers nothing on the dataset
        if (loadErrorKind(e)) {
            loadError.value = e;
            session.setUnavailable(true);
        } else {
            actions.showError(e, 'Dataset');
        }
        return [];
    }
}

// ---- Saved views -----------------------------------------------------------------------

// Reads started later win: an answer that arrives after a newer read began is dropped
let viewsRead = 0;

/**
 * Loads the saved views. `fresh` skips the request cache, for a list that may have changed since
 * it was read. A failed read keeps the list the page has: none on the first read (the page works
 * without them), the last one read on a read again (a network blip on focus does not empty it).
 */
async function loadViews({ fresh = false } = {}) {
    const read = ++viewsRead;
    try {
        const loaded = await listViews(dataset, { fresh });
        if (read === viewsRead) views.value = loaded;
    } catch (e) {
        console.error('Cannot load the saved views:', e);
    }
}

// Views are saved in the map, another tab: the list catches up when this tab is back
useEventListener(window, 'focus', () => loadViews({ fresh: true }));
const viewActions = useViewActions({ dataset, dialogs, onChanged: () => loadViews({ fresh: true }) });

// ---- Bindings --------------------------------------------------------------------------

/** Events of the file list, the tree and the detail panel; `items` is what they act on. */
const commonEvents = items => ({
    openItem: onOpenItem,
    createFolder: actions.newFolder,
    upload: () => actions.upload(),
    importFromUrl: () => actions.importFromUrl(''),
    refresh,
    deleteSelecteditems: () => actions.remove(items()),
    moveSelectedItems: () => items().length === 1 && actions.rename(items()[0]),
    transferSelectedItems: () => actions.transfer(items()),
    openProperties: () => actions.properties(items()),
    setAsCover: actions.setAsCover,
    shareEmbed: actions.share,
    downloadItems,
    downloadBuildArtifact: downloadArtifact,
    downloadSplat,
    exportSplatTrainingData: actions.exportSplatTrainingData,
    openAsText: node => actions.editText(node.entry),
    mergeMultispectral: actions.mergeMultispectral,
    maskBorders: actions.maskBorders,
    alignGeoRaster: actions.align,
    extractItem: actions.extract,
    setCrs: actions.setCrs,
    copySelectedItems: clipboard.copy,
    cutSelectedItems: clipboard.cut,
    pasteFromClipboard: clipboard.paste,
    buildStarted: handleBuildStarted,
    buildError: handleBuildError
});
// The tree's operations act on the folder or file it selected (listing.files)
const treeEvents = {
    ...commonEvents(() => listing.files.value),
    selectionChanged: onTreeSelection,
    currentUriChanged: onCurrentUriChanged,
    selectAll: () => selectAll(true),
    error: e => actions.showError(e, 'Error'),
    renameView: viewActions.rename,
    deleteView: viewActions.remove
};
const fileEvents = { ...commonEvents(() => listing.selected.value), selectionChanged: onSelectionChanged };
const detailEvents = {
    close: closeDetail, open: file => onOpenItem(file), share: actions.share,
    // The summary of a selection of several items: the registry's Download and Delete
    downloadItems, deleteSelecteditems: () => actions.remove(listing.selected.value),
    buildStarted: handleBuildStarted, buildError: handleBuildError
};

const treeProps = computed(() => ({ rootNodes, canWrite: canWrite.value, dataset, views: views.value }));
// The toolbar runs the actions of the registry with the handlers of the file list
const toolbarEvents = {
    ...fileEvents,
    toggleExpandedGrid: () => { expandedGrid.value = !expandedGrid.value; },
    setTileSize: size => { tileSizePref.value = size; },
    setViewMode: mode => {
        // Close any open context menu first
        window.dispatchEvent(new MouseEvent('click'));
        viewMode.value = mode;
    }
};
const toolbarContext = {
    getSelectedEntries: () => listing.selected.value,
    getFiles: () => listing.files.value,
    get canWrite() { return canWrite.value; },
    dataset,
    get viewMode() { return viewMode.value; },
    get expandedGrid() { return expandedGrid.value; },
    get tileSize() { return tileSize.value; },
    selectAll,
    emit: (event, ...args) => toolbarEvents[event]?.(...args)
};
const tools = computed(() => explorerTools(toolbarContext));
const explorerProps = computed(() => ({
    files: listing.files.value, tools: tools.value, currentPath: listing.currentPath.value, dataset,
    canWrite: canWrite.value, isLoadingFiles: listing.isLoading.value, importing: !!runningImport.value
}));

// ---- Session and lifecycle -------------------------------------------------------------

// The header reads the selection and the permissions, and asks for the settings
watch(listing.files, () => session.setSelectedFiles(listing.selected.value), { deep: true });
watch(canWrite, value => session.setCanWrite(value), { immediate: true });
watch(() => session.settingsRequests, () => actions.settings());

// The dataset was deleted while the page is open (an import that was cancelled or failed rolled
// back and deleted the dataset it created, FR-UPL-05, D-004): the same page state as a dataset that
// is not there when it is opened. The Hub deletes nothing itself.
function onDatasetGone({ dataset: gone, error: e }) {
    if (datasetKey(gone) !== datasetKey(dataset) || loadError.value) return;
    loadError.value = e;
    session.setUnavailable(true);
}

// An import into this dataset runs (FR-UPL-10, FR-XC-16): read from the background-task store, which the page follows through
// the BuildManager (the dataset's task list) and which an import started on another page keeps alive. When it ends the
// files it brought join the list.
const runningImport = ref(null);
const importBannerText = computed(() => {
    const percent = Math.round(runningImport.value?.progressPercent ?? 0);
    return `${percent > 0 ? `Importing\u2026 ${formatNumber(percent, 0)} %` : 'Importing\u2026'} \u2014 the files appear here when the import ends.`;
});
function syncRunningImport() {
    const next = taskMonitor.getImports(dataset)[0] ?? null;
    const ended = runningImport.value && !next && !loadError.value;
    runningImport.value = next;
    if (ended) listing.reload();
}
function onTasksUpdated({ dataset: changed }) {
    if (changed && datasetKey(changed) === datasetKey(dataset)) syncRunningImport();
}

onMounted(() => {
    taskMonitor.on('datasetGone', onDatasetGone);
    taskMonitor.on('tasksUpdated', onTasksUpdated);
    document.getElementById('app').classList.add('fullpage');
    setTitle(params.ds);
    loadViews();
    BuildManager.registerDataset(dataset);
    BuildManager.loadBuilds(dataset).catch(e => console.warn('Error loading builds:', e));
    watchBuildEvents(() => dataset, (message, title) => actions.showError(message, title));
});

onBeforeUnmount(() => {
    taskMonitor.off('datasetGone', onDatasetGone);
    taskMonitor.off('tasksUpdated', onTasksUpdated);
    document.getElementById('app').classList.remove('fullpage');
    BuildManager.unregisterDataset(dataset);
    session.setUnavailable(false);
    session.setRootEntry(null);
});
</script>

<style scoped>
/* The Files tab: the import banner above the list and the detail panel */
.explorer-tab {
    display: flex;
    flex-direction: column;
    height: 100%;
}

.import-banner {
    display: flex;
    flex: none;
    align-items: center;
    gap: var(--ddb-spacing-sm);
    padding: var(--ddb-spacing-xs) var(--ddb-spacing-md);
    background: var(--ddb-info-bg);
    border-bottom: var(--ddb-border-width) solid var(--ddb-border);
}

.explorer-tab > .detail-layout {
    flex: 1 1 0;
    min-height: 0;
    height: auto;
}

.detail-layout {
    display: flex;
    height: 100%;
    overflow: hidden;
}

/* The file list keeps a width of its own: the panel gives way before it (below) */
.detail-main {
    flex: 1;
    min-width: 12rem;
    overflow: auto;
}

/* The width of the panel is the token of FR-XC-33: it grows with the window up to 45rem, and the file list takes the
   rest (FR-EXP-40); in a narrow row it shrinks, to 15rem at the least */
.detail-side {
    flex: 0 1 var(--ddb-panel-detail-width);
    min-width: 15rem;
    overflow-x: hidden;
    overflow-y: auto;
    border-left: var(--ddb-border-width) solid var(--ddb-border-medium);
}

/* What the panel holds wraps inside it: a value never makes the panel wider than its column */
.detail-side > * {
    min-width: 0;
    max-width: 100%;
}

/* Below lg (992px, libs/responsiveColumns.js) the panel does not share a narrow row with the file list (the values
   of the file clipped there, FR-EXP-17): it opens over the list as a drawer */
@media (max-width: 991.98px) {
    .detail-layout {
        position: relative;
    }

    .detail-main.with-detail {
        flex: 1;
    }

    .detail-side {
        position: absolute;
        inset-block: 0;
        inset-inline-end: 0;
        z-index: 3;
        width: min(26rem, 100%);
        max-width: 100%;
        background: var(--ddb-bg-surface);
        box-shadow: var(--ddb-shadow-md);
    }

    /* The drawer the user closed: its button, in the corner the drawer opens from */
    .detail-reopen {
        position: absolute;
        inset-block-end: var(--ddb-spacing-md);
        inset-inline-end: var(--ddb-spacing-md);
        z-index: 2;
        box-shadow: var(--ddb-shadow-md);
    }
}
</style>
