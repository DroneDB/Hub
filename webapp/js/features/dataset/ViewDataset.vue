<template>
    <div id="browser" class="cui app">
        <Message v-model="error" />
        <Panel split="vertical" class="main" amount="23.6%" mobile-amount="0%" tablet-amount="30%" mobile-collapsed>
            <template #first>
                <div class="sidebar">
                    <FileBrowser v-show="!isMobile" ref="fileBrowser" v-bind="treeProps" v-on="treeEvents" />
                </div>
            </template>
            <template #second>
                <TabSwitcher ref="tabs" :tabs="mainTabs" :selected-tab="mainTabs[0].key" position="top" button-width="auto"
                             :hide-single="false" @tab-change="onTabChange">
                    <template v-if="isMobile" #filebrowser>
                        <FileBrowser ref="mobileFileBrowser" v-bind="treeProps" v-on="treeEvents" />
                    </template>
                    <template #map>
                        <Map v-if="openedTabs.map" ref="mapViewer" lazyload :files="listing.files.value" :dataset="dataset"
                             :can-write="canWrite" :can-delete="canDelete" @scroll-to="file => explorer && explorer.scrollTo && explorer.scrollTo(file)"
                             @open-item="openItem" @vue:mounted="onMapMounted" />
                    </template>
                    <template #explorer>
                        <div class="detail-layout">
                            <div class="detail-main" :class="{ 'with-detail': detailFile && !isMobile }">
                                <Explorer v-if="viewMode === 'grid'" ref="explorer" v-bind="explorerProps" v-on="fileEvents" />
                                <TableView v-else ref="explorer" v-bind="explorerProps" :expanded-grid="expandedGrid" v-on="fileEvents" />
                            </div>
                            <div v-if="detailFile && !isMobile" class="detail-side">
                                <DetailPanel :file="detailFile" :dataset="dataset" v-on="detailEvents" />
                            </div>
                        </div>
                    </template>
                    <template #tasks>
                        <TaskHistory v-if="openedTabs.tasks" :dataset="dataset" :can-write="canWrite" />
                    </template>
                    <template v-if="isMobile" #properties>
                        <DetailPanel :file="detailFile" :dataset="dataset" v-on="detailEvents" />
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
 * detail panel, the Map and Tasks tabs. HQ-09: the page composes; what it does lives in
 * useDatasetListing (the folder on show), useDatasetActions (every file operation through
 * its dialog, on the dialog registry), useDatasetClipboard, useOpenItem and
 * useDatasetShortcuts; the toolbar is libs/dataset/explorerTools; the lightbox is a component.
 */
import { ref, reactive, computed, watch, provide, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { useRoute } from 'vue-router';
import ddb from 'ddb';
import reg from '@/libs/api/sharedRegistry';
import icons from '@/libs/icons';
import { setTitle } from '@/libs/utils';
import { isMobile as detectMobile } from '@/libs/responsive';
import { lazyComponent } from '@/libs/lazyComponent';
import { Features } from '@/libs/features';
import { PREF } from '@/libs/preferences';
import { permissionsOf } from '@/libs/datasetPermissions';
import { isUnauthorized } from '@/libs/ddb/apiError';
import { isFileBuilt } from '@/libs/build/buildHelpers';
import BuildManager from '@/libs/build/buildManager';
import { downloadFromDataset, downloadBuildArtifact, notifyDownloadError } from '@/libs/datasetDownloads';
import { explorerTools } from '@/libs/dataset/explorerTools';
import { useDatasetSessionStore } from '@/stores/datasetSession';
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
import Message from '@/components/Message.vue';
import Panel from '@/components/Panel.vue';
import TabSwitcher from '@/components/TabSwitcher.vue';
import Loader from '@/components/Loader.vue';
import DialogHost from '@/components/DialogHost.vue';
import ClipboardPanel from '@/components/ClipboardPanel.vue';
import FileBrowser from './explorer/FileBrowser.vue';
import Explorer from './explorer/Explorer.vue';
import TableView from './explorer/TableView.vue';
import DetailPanel from './explorer/DetailPanel.vue';
import DatasetLightbox from './DatasetLightbox.vue';

// The Map tab mounts on first activation (prefetched: instant on a warm connection)
const Map = lazyComponent(() => import(/* webpackChunkName: "dataset-map", webpackPrefetch: true */ '@/features/viewers/map/Map.vue'), { showLoader: false });
const TaskHistory = lazyComponent(() => import(/* webpackChunkName: "dataset-tasks" */ './TaskHistory.vue'), { showLoader: false });

defineOptions({ name: 'ViewDataset' });

const route = useRoute();
const params = { org: String(route.params.org), ds: String(route.params.ds) };
const dataset = reg.Organization(params.org).Dataset(params.ds);
const session = useDatasetSessionStore();
const notify = useNotify();
const later = useTimerGroup();
const requestSignal = useRequestScope().signal;
const { runHeavyTask } = useHeavyTask();
const { watchBuildEvents, handleBuildStarted, handleBuildError } = useBuildEvents();

const error = ref('');
const busy = ref(false);
const isMobile = detectMobile();
const mainTabs = [
    ...(isMobile ? [{ label: 'Browser', icon: 'fa-solid fa-sitemap', key: 'filebrowser' }] : []),
    { label: 'Files', icon: 'fa-solid fa-folder-open', key: 'explorer' },
    ...(isMobile ? [{ label: 'Properties', icon: 'fa-solid fa-circle-info', key: 'properties' }] : []),
    { label: 'Map', icon: 'fa-solid fa-map', key: 'map' },
    { label: 'Tasks', icon: 'fa-solid fa-list-check', key: 'tasks' }
];
// Tabs whose code loads on first use (HUB-02) stay mounted once opened
const openedTabs = reactive({ map: false, tasks: false });
const viewMode = usePreference(PREF.FILE_VIEW_MODE, 'grid');
// Table view: thumbnails and relative times, or icons and dates
const expandedGrid = usePreference(PREF.TABLE_EXPANDED_GRID, true);
const detailFile = ref(null);

// Permissions are on the dataset's root entry
const rootEntry = ref(null);
const permissions = computed(() => permissionsOf(rootEntry.value));
const canWrite = computed(() => permissions.value.canWrite);
const canDelete = computed(() => permissions.value.canDelete);

const tabs = ref(null);
const explorer = ref(null);
const fileBrowser = ref(null);
const mobileFileBrowser = ref(null);
const mapViewer = ref(null);
const lightbox = ref(null);

const listing = useDatasetListing(dataset);
const dialogs = useDialogs();
const refresh = () => { if (fileBrowser.value) fileBrowser.value.refreshAndNavigate(listing.currentPath.value); };
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

function onTabChange(key) {
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

useDatasetShortcuts({
    blocked: () => dialogs.stack.value.length > 0,
    canWrite,
    selected: () => listing.selected.value,
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

// Build output: re-checks the build (a HEAD when the cache is stale), then downloads it
async function downloadArtifact(file) {
    if (!file || !file.entry) return;
    if (!await isFileBuilt(dataset, file)) {
        notify.warn('This file has not been built yet. Run Build first.', { summary: 'Not available' });
        return;
    }
    await downloadBuildArtifact(dataset, file.entry.path).catch(notifyDownloadError);
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
    detailFile.value = null;
}

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
        if (entries.length) rootEntry.value = entries[0];
        const name = entries[0]?.properties?.meta?.name;
        if (name) setTitle(name.data);
        return entries.map(e => ({
            icon: icons.getForType(e.type, e.path), label: ddb.utils.entryLabel(e), path: e.path,
            expanded: true, entry: e, isExpandable: ddb.entry.isDirectory(e)
        }));
    } catch (e) {
        // Left while loading; a 401 is reg.onUnauthorized's (sign in, then come back)
        if (!isAbort(e) && !isUnauthorized(e)) actions.showError(e, 'Dataset');
        return [];
    }
}

// ---- Bindings --------------------------------------------------------------------------

/** Events of the file list, the tree and the detail panel; `items` is what they act on. */
const commonEvents = items => ({
    openItem: onOpenItem,
    createFolder: actions.newFolder,
    deleteSelecteditems: () => actions.remove(items()),
    moveSelectedItems: () => items().length === 1 && actions.rename(items()[0]),
    transferSelectedItems: () => actions.transfer(items()),
    openProperties: () => actions.properties(items()),
    setAsCover: actions.setAsCover,
    shareEmbed: actions.share,
    downloadItems,
    downloadBuildArtifact: downloadArtifact,
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
    error: e => actions.showError(e, 'Error')
};
const fileEvents = { ...commonEvents(() => listing.selected.value), selectionChanged: onSelectionChanged };
const detailEvents = { close: closeDetail, open: file => onOpenItem(file), share: actions.share, buildStarted: handleBuildStarted, buildError: handleBuildError };

const treeProps = computed(() => ({ rootNodes, canWrite: canWrite.value, dataset }));
const tools = computed(() => explorerTools({
    canWrite: canWrite.value, files: listing.files.value, selected: listing.selected.value,
    viewMode: viewMode.value, expandedGrid: expandedGrid.value
}, {
    upload: () => actions.upload(),
    newFolder: actions.newFolder,
    selectAll,
    rename: actions.rename,
    remove: () => actions.remove(listing.selected.value),
    share: actions.share,
    open: onOpenItem,
    refresh,
    toggleExpandedGrid: () => { expandedGrid.value = !expandedGrid.value; },
    toggleViewMode: () => {
        // Close any open context menu first
        window.dispatchEvent(new MouseEvent('click'));
        viewMode.value = viewMode.value === 'grid' ? 'table' : 'grid';
    }
}));
const explorerProps = computed(() => ({
    files: listing.files.value, tools: tools.value, currentPath: listing.currentPath.value, dataset,
    viewMode: viewMode.value, canWrite: canWrite.value, isLoadingFiles: listing.isLoading.value
}));

// ---- Session and lifecycle -------------------------------------------------------------

// The header reads the selection and asks for the settings
watch(listing.files, () => session.setSelectedFiles(listing.selected.value), { deep: true });
watch(() => session.settingsRequests, () => actions.settings());

onMounted(() => {
    document.getElementById('app').classList.add('fullpage');
    setTitle(params.ds);
    BuildManager.registerDataset(dataset);
    BuildManager.loadBuilds(dataset).catch(e => console.warn('Error loading builds:', e));
    watchBuildEvents(() => dataset, (message, title) => actions.showError(message, title));
});

onBeforeUnmount(() => {
    document.getElementById('app').classList.remove('fullpage');
    BuildManager.unregisterDataset(dataset);
});
</script>

<style scoped>
.detail-layout {
    display: flex;
    height: 100%;
    overflow: hidden;
}

.detail-main {
    flex: 1;
    min-width: 0;
    overflow: auto;
}

.detail-main.with-detail {
    flex: 7;
}

.detail-side {
    flex: 3;
    min-width: 15rem;
    max-width: 25rem;
    overflow-y: auto;
    border-left: var(--ddb-border-width) solid var(--ddb-border-medium);
}
</style>
