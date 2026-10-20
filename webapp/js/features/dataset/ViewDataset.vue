<template>
    <div id="browser" class="cui app">
        <Message v-model="error" />
        <Panel split="vertical" class="main" amount="23.6%" mobile-amount="0%" tablet-amount="30%"
               mobile-collapsed>
            <template #first>
                <div class="sidebar">
                    <FileBrowser v-show="!isMobile" ref="fileBrowser" :root-nodes="rootNodes" :can-write="canWrite" :dataset="dataset" @open-item="handleOpenItem"
                                 @selection-changed="handleFileSelectionChanged" @current-uri-changed="handleCurrentUriChanged"
                                 @open-properties="handleFileBrowserOpenProperties"
                                 @delete-selecteditems="openDeleteItemsDialogFromFileBrowser"
                                 @move-selected-items="openRenameItemsDialogFromFileBrowser"
                                 @transfer-selected-items="openTransferItemsDialogFromFileBrowser"
                                 @set-as-cover="setAsCover"
                                 @download-items="handleDownloadItems"
                                 @share-embed="handleShareEmbed"
                                 @create-folder="handleCreateFolder"
                                 @select-all="handleSelectAll"
                                 @open-as-text="handleOpenAsText" @error="handleError" @merge-multispectral="openMergeMultispectralDialog" @mask-borders="openMaskBordersDialog" @align-geo-raster="openAlignDialog" @extract-item="openExtractDialog" @set-crs="openSetCrsDialog"
                                 @copy-selected-items="clipboardCopySelected" @cut-selected-items="clipboardCutSelected" @paste-from-clipboard="clipboardPaste" @download-build-artifact="handleDownloadBuildArtifact" />
                </div>
            </template>
            <template #second>
                <TabSwitcher ref="mainTabSwitcher" :tabs="mainTabs" :selected-tab="startTab" position="top" button-width="auto"
                             :hide-single="false" @tab-change="handleMainTabChange">
                    <template v-if="isMobile" #filebrowser>
                        <FileBrowser ref="mobileFileBrowser" :root-nodes="rootNodes" :can-write="canWrite" :dataset="dataset" @open-item="handleOpenItem"
                                     @selection-changed="handleFileSelectionChanged" @current-uri-changed="handleCurrentUriChanged"
                                     @open-properties="handleFileBrowserOpenProperties"
                                     @delete-selecteditems="openDeleteItemsDialogFromFileBrowser"
                                     @move-selected-items="openRenameItemsDialogFromFileBrowser"
                                     @transfer-selected-items="openTransferItemsDialogFromFileBrowser"
                                     @set-as-cover="setAsCover"
                                     @download-items="handleDownloadItems"
                                     @share-embed="handleShareEmbed"
                                     @create-folder="handleCreateFolder"
                                     @select-all="handleSelectAll"
                                     @open-as-text="handleOpenAsText" @error="handleError" @merge-multispectral="openMergeMultispectralDialog" @mask-borders="openMaskBordersDialog" @align-geo-raster="openAlignDialog" @extract-item="openExtractDialog" @set-crs="openSetCrsDialog"
                                     @copy-selected-items="clipboardCopySelected" @cut-selected-items="clipboardCutSelected" @paste-from-clipboard="clipboardPaste" @download-build-artifact="handleDownloadBuildArtifact" />
                    </template>
                    <template #map>
                        <Map v-if="openedTabs.map" ref="mapViewer" lazyload :files="fileBrowserFiles" :dataset="dataset" :can-write="canWrite" :can-delete="canDelete" @scroll-to="handleScrollTo"
                             @open-item="handleOpenItem" @vue:mounted="handleLazyTabMounted('map')" />
                    </template>
                    <template #explorer>
                        <!-- Grid View (Explorer) with optional Detail Panel -->
                        <div v-if="viewMode === 'grid'" class="detail-layout">
                            <div class="detail-main" :class="{ 'with-detail': selectedDetailFile && !isMobile }">
                                <Explorer ref="explorer" :files="fileBrowserFiles" :tools="explorerTools" :current-path="currentPath"
                                          :dataset="dataset" :view-mode="viewMode" :can-write="canWrite" :is-loading-files="isLoadingFiles" @open-item="handleOpenItem" @create-folder="handleCreateFolder"
                                          @delete-selecteditems="openDeleteItemsDialog" @move-selected-items="openRenameItemsDialog"
                                          @transfer-selected-items="openTransferItemsDialog"
                                          @set-as-cover="setAsCover"
                                          @open-properties="handleExplorerOpenProperties"
                                          @share-embed="handleShareEmbed" @download-items="handleDownloadItems" @build-started="handleBuildStarted" @build-error="handleBuildError"
                                          @open-as-text="handleOpenAsText" @selection-changed="handleTableSelectionChanged" @merge-multispectral="openMergeMultispectralDialog" @mask-borders="openMaskBordersDialog" @align-geo-raster="openAlignDialog" @extract-item="openExtractDialog" @set-crs="openSetCrsDialog"
                                          @copy-selected-items="clipboardCopySelected" @cut-selected-items="clipboardCutSelected" @paste-from-clipboard="clipboardPaste" @download-build-artifact="handleDownloadBuildArtifact" />
                            </div>
                            <div v-if="selectedDetailFile && !isMobile" class="detail-side">
                                <DetailPanel :file="selectedDetailFile" :dataset="dataset"
                                             @close="handleDetailPanelClose"
                                             @open="handleDetailPanelOpen"
                                             @share="handleDetailPanelShare"
                                             @build-started="handleBuildStarted"
                                             @build-error="handleBuildError" />
                            </div>
                        </div>

                        <!-- Table View with optional Detail Panel -->
                        <div v-else class="detail-layout">
                            <div class="detail-main" :class="{ 'with-detail': selectedDetailFile && !isMobile }">
                                <TableView ref="tableview" :files="fileBrowserFiles" :tools="explorerTools" :current-path="currentPath"
                                           :dataset="dataset" :view-mode="viewMode" :expanded-grid="expandedGrid" :can-write="canWrite" :is-loading-files="isLoadingFiles" @open-item="handleOpenItem" @create-folder="handleCreateFolder"
                                           @delete-selecteditems="openDeleteItemsDialog" @move-selected-items="openRenameItemsDialog"
                                           @transfer-selected-items="openTransferItemsDialog"
                                           @set-as-cover="setAsCover"
                                           @open-properties="handleExplorerOpenProperties"
                                           @share-embed="handleShareEmbed" @download-items="handleDownloadItems" @build-started="handleBuildStarted" @build-error="handleBuildError"
                                           @open-as-text="handleOpenAsText"
                                           @selection-changed="handleTableSelectionChanged" @merge-multispectral="openMergeMultispectralDialog" @mask-borders="openMaskBordersDialog" @align-geo-raster="openAlignDialog" @extract-item="openExtractDialog" @set-crs="openSetCrsDialog"
                                           @copy-selected-items="clipboardCopySelected" @cut-selected-items="clipboardCutSelected" @paste-from-clipboard="clipboardPaste" @download-build-artifact="handleDownloadBuildArtifact" />
                            </div>
                            <div v-if="selectedDetailFile && !isMobile" class="detail-side">
                                <DetailPanel :file="selectedDetailFile" :dataset="dataset"
                                             @close="handleDetailPanelClose"
                                             @open="handleDetailPanelOpen"
                                             @share="handleDetailPanelShare"
                                             @build-started="handleBuildStarted"
                                             @build-error="handleBuildError" />
                            </div>
                        </div>
                    </template>
                    <template #tasks>
                        <TaskHistory v-if="openedTabs.tasks" :dataset="dataset" :can-write="canWrite" />
                    </template>
                    <template v-if="isMobile" #properties>
                        <DetailPanel :file="selectedDetailFile" :dataset="dataset"
                                     @close="handleDetailPanelClose"
                                     @open="handleDetailPanelOpen"
                                     @share="handleDetailPanelShare"
                                     @build-started="handleBuildStarted"
                                     @build-error="handleBuildError" />
                    </template>
                </TabSwitcher>
            </template>
        </Panel>
        <Properties v-if="showProperties" :files="contextMenuFiles" @on-close="handleCloseProperties" />
        <SettingsDialog v-if="showSettings" :dataset="dataset" :can-write="canWrite" @on-close="handleSettingsClose"
                        @add-markdown="handleAddMarkdown" @rescan-requested="handleRescanRequested" />
        <AddToDatasetDialog v-if="uploadDialogOpen" :path="currentPath" :organization="dataset.org" :dataset="dataset.ds"
                            :files-to-upload="filesToUpload" :open="true" @on-close="handleAddClose" @import-from-url="handleUploadImportFromUrl" />
        <DeleteDialog v-if="deleteDialogOpen" :files="contextMenuFiles" @on-close="handleDeleteClose" />
        <DeleteResultDialog v-if="deleteResultDialogOpen"
                            :deleted="deleteResultData.deleted"
                            :failed="deleteResultData.failed"
                            @on-close="handleDeleteResultClose" />
        <RescanResultDialog v-if="rescanResultDialogOpen"
                            :result="rescanResultData"
                            @on-close="handleRescanResultClose" />
        <RescanConfirmDialog v-if="rescanConfirmDialogOpen"
                             @on-close="handleRescanConfirmClose" />
        <BuildConfirmDialog v-if="buildConfirmDialogOpen"
                            @confirm="handleBuildConfirmOk"
                            @cancel="buildConfirmDialogOpen = false" />
        <ConfirmDialog v-if="setCoverDialogOpen"
                       title="Replace Dataset Cover"
                       message="A dataset cover already exists. Do you want to replace it? This action is irreversible."
                       confirm-text="Replace"
                       confirm-button-class="danger"
                       @on-close="handleSetCoverClose" />
        <RenameDialog v-if="renameDialogOpen" :busy="isBusy" :file="fileToRename" :all-entries="fileBrowserFiles" @on-close="handleRenameClose" />
        <MergeMultispectralDialog v-if="mergeMultispectralDialogOpen" :files="mergeMultispectralFiles" :dataset="dataset" @on-close="handleMergeMultispectralClose" />
        <AlignDialog v-if="alignDialogOpen" :source-entry="alignSourceEntry" :dataset="dataset" :all-entries="fileBrowserFiles" @on-close="handleAlignClose" />
        <MaskBordersDialog v-if="maskBordersDialogOpen" :entry="maskBordersDialogEntry" @on-close="handleMaskBordersDialogClose" />
        <ExtractDialog v-if="extractDialogOpen" :file="extractFile" :dataset="dataset" @on-close="handleExtractClose" />
        <SetCrsDialog v-if="setCrsDialogOpen" :file="setCrsFile" :dataset="dataset" @on-close="handleSetCrsClose" />
        <ImportFromUrlDialog v-if="importUrlDialogOpen" :dataset="dataset"
                             :initial-url="importUrlInitial" :initial-folder="currentPath || ''" @on-close="handleImportUrlClose" />
        <ConfirmDialog v-if="maskBordersConfirmOpen"
                       title="Mask Borders"
                       :message="`The file <strong>${maskBordersOutputPath}</strong> already exists. Do you want to overwrite it?`"
                       confirm-text="Overwrite"
                       confirm-button-class="danger"
                       @on-close="handleMaskBordersConfirm" />
        <NewFolderDialog v-if="createFolderDialogOpen" :busy="isBusy" @on-close="handleNewFolderClose" />
        <TransferDialog v-if="transferDialogOpen" :files="contextMenuFiles" :source-org="dataset.org"
                        :source-ds="dataset.ds" @on-close="handleTransferClose" />
        <PasteConflictDialog v-if="pasteConflictDialogOpen"
                             :items="pasteConflictData ? pasteConflictData.items : []"
                             @resolve="handlePasteConflictResolve" />
        <PasteResultDialog v-if="pasteResultDialogOpen"
                           :mode="pasteResultData ? pasteResultData.mode : 'copy'"
                           :succeeded="pasteResultData ? pasteResultData.succeeded : []"
                           :failed="pasteResultData ? pasteResultData.failed : {}"
                           :skipped="pasteResultData ? pasteResultData.skipped : []"
                           @on-close="handlePasteResultClose" />
        <ClipboardPanel v-if="dataset" />
        <Alert v-if="errorDialogOpen" :title="errorMessageTitle" @on-close="handleErrorDialogClose">
            {{ errorMessage }}
        </Alert>
        <Loader v-if="isBusy" />
        <ShareEmbed v-if="shareFile" :file="shareFile" @on-close="handleCloseShareEmbed" />
        <FileAvailabilityDialog
            v-if="showAvailabilityDialog"
            :show="showAvailabilityDialog"
            :title="availabilityDialogData.title"
            :message="availabilityDialogData.message"
            :status="availabilityDialogData.status"
            :actions="availabilityDialogData.actions"
            :build-state="availabilityDialogData.buildState"
            :dataset="dataset"
            :entry="availabilityDialogData.entry"
            @close="handleAvailabilityDialogClose"
            @build-started="handleBuildStarted"
            @build-completed="handleBuildCompleted"
            @build-failed="handleBuildFailed"
            @timeout="handleBuildTimeout"
            @error="handleError"
        />
        <TextEditorDialog
            v-if="textEditorDialogOpen"
            :dataset="dataset"
            :entry="textEditorEntry"
            :readonly="textEditorReadonly"
            @on-close="handleTextEditorClose"
            @saved="handleTextEditorSaved"
        />
        <PdfViewerDialog
            v-if="pdfViewerOpen"
            :dataset="dataset"
            :entry="pdfViewerEntry"
            @close="handlePdfViewerClose"
        />
        <FsLightbox
            v-if="lightboxSources.length > 0"
            :key="lightboxKey"
            :toggler="lightboxToggler"
            :slide="lightboxSlide"
            :sources="lightboxSources"
            :on-open="handleLightboxOpen"
            :on-close="handleLightboxClose"
            :on-show="handleLightboxShow"
            type="image"
            :load-only-current-source="true"
        />
        <div v-if="lightboxOpen" class="lightbox-toolbar-extra">
            <div class="lightbox-open-fullsize" title="Open in new tab" @click="openLightboxDirectLink">
                <i class="fa-solid fa-up-right-from-square" />
            </div>
        </div>
        <div v-if="lightboxOpen && lightboxCurrentEntry" class="lightbox-info-overlay">
            <div class="lightbox-info-name">{{ lightboxCurrentEntry.name }}</div>
            <div v-if="lightboxCurrentEntry.coords" class="lightbox-info-coords">
                <i class="fa-solid fa-location-dot me-1" />{{ lightboxCurrentEntry.coords }}
            </div>
            <div v-if="lightboxCurrentEntry.altitude !== null" class="lightbox-info-altitude">
                <i class="fa-solid fa-arrows-up-down me-1" />{{ lightboxCurrentEntry.altitude }} m
            </div>
        </div>
        <VideoLightbox v-if="videoLightboxVisible || videoLightboxSrc" :visible="videoLightboxVisible" :src="videoLightboxSrc" :entry="videoLightboxEntry"
                       @close="closeVideoLightbox" />
    </div>
</template>

<script>
import SettingsDialog from './dialogs/SettingsDialog.vue';
const AddToDatasetDialog = lazyComponent(() => import(/* webpackChunkName: "dataset-upload" */ './dialogs/AddToDatasetDialog.vue'));
import DeleteDialog from './dialogs/DeleteDialog.vue';
import DeleteResultDialog from './dialogs/DeleteResultDialog.vue';
import RescanResultDialog from './dialogs/RescanResultDialog.vue';
import RescanConfirmDialog from './dialogs/RescanConfirmDialog.vue';
import BuildConfirmDialog from './dialogs/BuildConfirmDialog.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import RenameDialog from './dialogs/RenameDialog.vue';
import NewFolderDialog from './dialogs/NewFolderDialog.vue';
import TransferDialog from './dialogs/TransferDialog.vue';
import PasteConflictDialog from './dialogs/PasteConflictDialog.vue';
import PasteResultDialog from './dialogs/PasteResultDialog.vue';
import ClipboardPanel from '@/components/ClipboardPanel.vue';
import Message from '@/components/Message.vue';
import FileBrowser from './explorer/FileBrowser.vue';
// The map tab mounts on first activation; prefetched so opening it is instant on a warm connection
const Map = lazyComponent(() => import(/* webpackChunkName: "dataset-map", webpackPrefetch: true */ '@/features/viewers/map/Map.vue'), { showLoader: false });
import Explorer from './explorer/Explorer.vue';
import TableView from './explorer/TableView.vue';
import DetailPanel from './explorer/DetailPanel.vue';
import Properties from './explorer/Properties.vue';
import TabSwitcher from '@/components/TabSwitcher.vue';
import Panel from '@/components/Panel.vue';
import Alert from '@/components/Alert.vue';
import Loader from '@/components/Loader.vue';
import ShareEmbed from './ShareEmbed.vue';
const TaskHistory = lazyComponent(() => import(/* webpackChunkName: "dataset-tasks" */ './TaskHistory.vue'), { showLoader: false });
import FileAvailabilityDialog from './dialogs/FileAvailabilityDialog.vue';
const TextEditorDialog = lazyComponent(() => import(/* webpackChunkName: "dataset-editor" */ './dialogs/TextEditorDialog.vue'));
const PdfViewerDialog = lazyComponent(() => import(/* webpackChunkName: "dataset-dialogs" */ '@/features/viewers/map/PdfViewerDialog.vue'));
const MergeMultispectralDialog = lazyComponent(() => import(/* webpackChunkName: "dataset-dialogs" */ './dialogs/MergeMultispectralDialog.vue'));
const AlignDialog = lazyComponent(() => import(/* webpackChunkName: "dataset-dialogs" */ './dialogs/AlignDialog.vue'));
const MaskBordersDialog = lazyComponent(() => import(/* webpackChunkName: "dataset-dialogs" */ './dialogs/MaskBordersDialog.vue'));
const ExtractDialog = lazyComponent(() => import(/* webpackChunkName: "dataset-dialogs" */ './dialogs/ExtractDialog.vue'));
const SetCrsDialog = lazyComponent(() => import(/* webpackChunkName: "dataset-dialogs" */ './dialogs/SetCrsDialog.vue'));
const ImportFromUrlDialog = lazyComponent(() => import(/* webpackChunkName: "dataset-dialogs" */ './dialogs/ImportFromUrlDialog.vue'));
const FsLightbox = lazyComponent(() => import(/* webpackChunkName: "dataset-lightbox" */ 'fslightbox-vue'), { showLoader: false });
const VideoLightbox = lazyComponent(() => import(/* webpackChunkName: "dataset-lightbox" */ './VideoLightbox.vue'), { showLoader: false });

import emitter from '@/libs/eventBus';
import { lazyComponent } from '@/libs/lazyComponent';
import { useRequestScope, isAbort } from '@/composables/useRequestScope';
import icons from '@/libs/icons';
import reg from '@/libs/api/sharedRegistry';
import { setTitle } from '@/libs/utils';
import { openInBrowser } from '@/libs/openInBrowser';
import { isMobile } from '@/libs/responsive';
import { renameDataset } from '@/libs/api/registryUtils';
import { b64encode } from '@/libs/base64';
import BuildManager from '@/libs/build/buildManager';
import FileAvailabilityChecker from '@/libs/build/fileAvailabilityChecker';
import { isFileBuilt } from '@/libs/build/buildHelpers';
import { shouldOpenAsText, isPdfFile } from '@/libs/textFileUtils';

import ddb from 'ddb';
import { coordAll } from '@turf/meta';
const { pathutils, utils } = ddb;

import { defaultViewFor } from '@/libs/openItemDefaults';
import { isArchiveFile } from '@/libs/entryTypes';
import { getFilesFromClipboard, isHttpUrl } from '@/libs/dragDropUtils';

// Import mixins
import dialogManager from '@/composables/useDialogManager';
import fileOperations from '@/composables/useFileOperations';
import { useBuildEvents } from '@/composables/useBuildEvents';
import { useHeavyTask } from '@/composables/useHeavyTask';
import { Features } from '@/libs/features';
import { getPref, setPref, PREF } from '@/libs/preferences';
import { isUnauthorized } from '@/libs/ddb/apiError';
import { mapStores, mapState } from 'pinia';
import { useDatasetSessionStore } from '@/stores/datasetSession';
import { downloadFromDataset, downloadBuildArtifact, notifyDownloadError } from '@/libs/datasetDownloads';

/**
 * ViewDataset - Main dataset page hosting the explorer, map viewer, and
 * asset-specific viewers (point cloud, 3D, panorama, splat, etc.).
 *
 * Orchestrates per-dataset state: file listing, tab management, upload,
 * build monitoring, settings, and all context-menu operations.
 */
export default {
    components: {
        
        Message,
        FileBrowser,
        Map,
        Explorer,
        TableView,
        DetailPanel,
        Properties,
        TabSwitcher,
        SettingsDialog,
        Panel,
        AddToDatasetDialog,
        DeleteDialog,
        DeleteResultDialog,
        RescanResultDialog,
        RescanConfirmDialog,
        BuildConfirmDialog,
        ConfirmDialog,
        RenameDialog,
        NewFolderDialog,
        TransferDialog,
        PasteConflictDialog,
        PasteResultDialog,
        ClipboardPanel,
        Alert,
        Loader,
        ShareEmbed,
        TaskHistory,
        FileAvailabilityDialog,
        TextEditorDialog,
        PdfViewerDialog,
        MergeMultispectralDialog,
        AlignDialog,
        MaskBordersDialog,
        ExtractDialog,
        SetCrsDialog,
        ImportFromUrlDialog,
        FsLightbox,
        VideoLightbox
    },
    mixins: [dialogManager, fileOperations],
    provide: function () {
        return {
            showBuildConfirm: (file, onConfirm) => this.showBuildConfirm(file, onConfirm),
            // Drag-and-drop from the explorer, table and tree (libs/dragDropUtils)
            datasetDrop: {
                upload: files => this.openUploadDialog(files),
                move: (source, dest) => this.handleMoveItem(source, dest)
            }
        };
    },
    setup() {
        const { runHeavyTask } = useHeavyTask();
        return { requestSignal: useRequestScope().signal, runHeavyTask, ...useBuildEvents() };
    },
    data: function () {
        const mobile = isMobile();

        let mainTabs = [];

        if (mobile) {
            mainTabs.unshift({
                label: 'Browser',
                icon: 'fa-solid fa-sitemap',
                key: 'filebrowser'
            });
        }

        mainTabs = mainTabs.concat([{
            label: 'Files',
            icon: 'fa-solid fa-folder-open',
            key: 'explorer'
        }]);

        if (mobile) {
            mainTabs.push({
                label: 'Properties',
                icon: 'fa-solid fa-circle-info',
                key: 'properties'
            });
        }

        mainTabs = mainTabs.concat([{
            label: 'Map',
            icon: 'fa-solid fa-map',
            key: 'map'
        }, {
            label: 'Tasks',
            icon: 'fa-solid fa-list-check',
            key: 'tasks'
        }]);

        const savedViewMode = getPref(PREF.FILE_VIEW_MODE, 'grid');

        // Load expanded grid preference (table view: thumbnails + relative time vs icons + date only)
        const savedExpandedGrid = getPref(PREF.TABLE_EXPANDED_GRID, true);

        return {
            // Lazy tabs (HUB-02): mounted on first activation, then kept
            openedTabs: { map: false, tasks: false },
            startTab: mainTabs[0].key,
            error: "",
            isMobile: mobile,
            mainTabs: mainTabs,
            fileBrowserFiles: [],
            isLoadingFiles: true,
            selectedUsingFileBrowserList: false,
            explorerTools: [],
            dataset: reg.Organization(this.$route.params.org)
                .Dataset(this.$route.params.ds),
            currentPath: null,
            viewMode: savedViewMode, // 'grid' or 'table'
            expandedGrid: savedExpandedGrid, // Table view: thumbnails + relative time vs icons + date only
            selectedDetailFile: null, // For DetailPanel in table view
            rootDatasetEntry: null, // Root dataset entry with permissions

            // True while a bulk-download task (ZIP compression) is active for this
            // dataset. Set via the global event bus by TaskHistory; disables all
            // download triggers so the server cannot receive concurrent requests.

            // File availability dialog
            showAvailabilityDialog: false,
            availabilityDialogData: {
                title: '',
                message: '',
                status: '',
                actions: [],
                buildState: null,
                entry: null
            },

            // Text editor dialog
            textEditorDialogOpen: false,
            textEditorEntry: null,
            textEditorReadonly: false,

            // Build confirm dialog
            buildConfirmDialogOpen: false,

            // PDF viewer dialog
            pdfViewerOpen: false,
            pdfViewerEntry: null,

            // Image lightbox
            lightboxToggler: false,
            lightboxSlide: 1,
            lightboxSources: [],
            lightboxEntries: [],
            lightboxOpen: false,
            lightboxCurrentSlide: 1,
            lightboxKey: 0,

            // Video lightbox
            videoLightboxVisible: false,
            videoLightboxSrc: '',
            videoLightboxEntry: null,

            // Helper references for mixins
            icons: icons,
            pathutils: pathutils,
            ddb: ddb,
            BuildManager: BuildManager,
            renameDataset: renameDataset
        };
    },
    computed: {
        ...mapStores(useDatasetSessionStore),
        ...mapState(useDatasetSessionStore, ['activeBulkDownload', 'settingsRequests']),
        selectedFiles: function () {
            return this.fileBrowserFiles.filter(f => f.selected);
        },
        contextMenuFiles: function () {
            if (this.selectedUsingFileBrowserList) {
                return this.fileBrowserFiles;
            } else {
                return this.selectedFiles;
            }
        },
        // Dataset permissions from backend
        datasetPermissions: function () {
            // Get permissions from the root dataset entry
            if (this.rootDatasetEntry &&
                this.rootDatasetEntry.properties &&
                this.rootDatasetEntry.properties.permissions) {
                return this.rootDatasetEntry.properties.permissions;
            }
            // Default to no permissions if not available
            return { canRead: false, canWrite: false, canDelete: false };
        },
        canRead: function () {
            return this.datasetPermissions.canRead;
        },
        canWrite: function () {
            return this.datasetPermissions.canWrite;
        },
        canDelete: function () {
            return this.datasetPermissions.canDelete;
        },
        lightboxCurrentEntry: function () {
            const idx = this.lightboxCurrentSlide - 1;
            if (idx < 0 || idx >= this.lightboxEntries.length) return null;
            const item = this.lightboxEntries[idx];
            const name = pathutils.basename(item.path);
            let coords = null;
            let altitude = null;
            if (item.entry && item.entry.point_geom) {
                try {
                    const c = coordAll(item.entry.point_geom)[0];
                    if (c && c.length >= 2) {
                        coords = `${c[1].toFixed(6)}, ${c[0].toFixed(6)}`;
                        if (c.length >= 3 && c[2] !== 0) {
                            altitude = c[2].toFixed(1);
                        }
                    }
                } catch { /* no geo data */ }
            }
            return { name, coords, altitude };
        }
    },
    watch: {
        // The header toolbar's Settings button
        settingsRequests: function () {
            this.showSettings = true;
        },

        viewMode: function() {
            // When viewMode changes, rebuild explorerTools to show the correct icon
            this.updateExplorerTools();

            // The grid's thumbnails load as they become visible (HUB-03): nothing to trigger
        },

        fileBrowserFiles: {
            deep: true,
            handler: function () {
                this.datasetSessionStore.setSelectedFiles(this.selectedFiles);
            }
        },

        selectedFiles: {
            handler: function () {
                this.updateExplorerTools();
            }
        }
    },
    mounted: function () {
        document.getElementById("app").classList.add("fullpage");
        setTitle(this.$route.params.ds);

        // Initialize BuildManager
        BuildManager.registerDataset(this.dataset);
        BuildManager.loadBuilds(this.dataset).catch(error => {
            console.warn('Error loading builds:', error);
        });

        // Listen for Delete key to delete selected files
        document.addEventListener('keydown', this.handleKeyDown);

        // Listen for OS paste (files and URL text from clipboard)
        document.addEventListener('paste', this.handleOsPaste);

        // Build notifications (stop with the page)
        this.watchBuildEvents(() => this.dataset, (message, title) => this.showError(message, title));
    },
    beforeUnmount: function () {
        document.getElementById("app").classList.remove("fullpage");

        // Remove Delete key listener
        document.removeEventListener('keydown', this.handleKeyDown);

        // Remove OS paste listener
        document.removeEventListener('paste', this.handleOsPaste);


        // Cleanup event bus listeners

        // Cleanup BuildManager
        BuildManager.unregisterDataset(this.dataset);
    },
    methods: {
        // Handle Delete key press to delete selected files
        handleKeyDown(e) {
            // Don't trigger if we're in an input field or content-editable
            const tagName = e.target.tagName.toLowerCase();
            if (tagName === 'input' || tagName === 'textarea' || e.target.isContentEditable) return;

            // Don't trigger if any dialog is already open
            const anyDialogOpen = this.deleteDialogOpen || this.renameDialogOpen || this.uploadDialogOpen ||
                this.createFolderDialogOpen || this.transferDialogOpen || this.showProperties ||
                this.showSettings || this.textEditorDialogOpen || this.importUrlDialogOpen ||
                this.pasteConflictDialogOpen || this.pasteResultDialogOpen;
            if (anyDialogOpen) return;

            // Shortcuts typed in the tree act on the tree selection, which
            // selectedFiles (the explorer selection) does not reflect.
            const treeBrowser = this.fileBrowserForTreeTarget(e.target);
            if (treeBrowser) {
                treeBrowser.handleTreeKeyDown(e);
                return;
            }

            // Clipboard shortcuts: Ctrl/Cmd + C / X / V
            if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
                const k = e.key.toLowerCase();
                if (k === 'c' && this.selectedFiles.length > 0) {
                    e.preventDefault();
                    this.clipboardCopySelected();
                    return;
                }
                if (k === 'x' && this.canWrite && this.selectedFiles.length > 0) {
                    e.preventDefault();
                    this.clipboardCutSelected();
                    return;
                }
                // NOTE: Ctrl+V is handled by the unified handleOsPaste listener so
                // that OS file paste and URL paste take priority over the internal
                // Hub clipboard. The keydown branch is intentionally removed here.
            }

            // Delete key
            if (e.key !== 'Delete') return;

            // Check if we have selected files and can write
            if (this.canWrite && this.selectedFiles.length > 0) {
                e.preventDefault();
                this.selectedUsingFileBrowserList = false;
                this.deleteDialogOpen = true;
            }
        },

        // The FileBrowser whose tree contains `target`, or null.
        fileBrowserForTreeTarget(target) {
            if (!target || typeof target.closest !== 'function' || !target.closest('.tree-view')) return null;
            const browsers = [this.$refs.fileBrowser, this.$refs.mobileFileBrowser];
            return browsers.find(fb => fb && fb.$el && fb.$el.contains(target)) || null;
        },

        handlePasteConflictResolve(mode) {
            this.pasteConflictDialogOpen = false;
            const data = this.pasteConflictData;
            this.pasteConflictData = null;
            if (data && typeof data.resolve === 'function') data.resolve(mode);
        },

        // Unified OS paste handler (Ctrl+V from the OS / file manager).
        // Priority: (1) OS files -> upload, (2) http(s) URL text -> import, (3) Hub internal clipboard.
        // NOTE: The 'paste' event fires for Ctrl+V on the document; text in an <input> or
        // <textarea> is handled by the browser natively and this listener is not reached
        // because of the target check below.
        handleOsPaste(e) {
            // Skip when focus is inside any editable element - the browser handles it.
            const tag = e.target && e.target.tagName ? e.target.tagName.toLowerCase() : '';
            if (tag === 'input' || tag === 'textarea' || (e.target && e.target.isContentEditable)) return;

            // Skip when any dialog is already open.
            const anyDialogOpen = this.deleteDialogOpen || this.renameDialogOpen || this.uploadDialogOpen ||
                this.createFolderDialogOpen || this.transferDialogOpen || this.showProperties ||
                this.showSettings || this.textEditorDialogOpen || this.importUrlDialogOpen ||
                this.pasteConflictDialogOpen || this.pasteResultDialogOpen;
            if (anyDialogOpen) return;

            // 1. OS files in clipboard -> upload.
            if (this.canWrite) {
                const files = getFilesFromClipboard(e);
                if (files.length > 0) {
                    e.preventDefault();
                    this.openUploadDialog(files);
                    return;
                }
            }

            // 2. http/https URL text -> import from URL dialog.
            if (this.canWrite && e.clipboardData) {
                const text = e.clipboardData.getData('text/plain') || e.clipboardData.getData('text');
                if (isHttpUrl(text)) {
                    e.preventDefault();
                    this.openImportUrlDialog(text.trim());
                    return;
                }
            }

            // 3. Fallback: internal Hub clipboard (copy/cut dataset files).
            if (this.canWrite) {
                this.clipboardPaste();
            }
        },

        // Called when the user clicks "Import from URL" inside the Upload dialog.
        handleUploadImportFromUrl() {
            this.uploadDialogOpen = false;
            this.filesToUpload = null;
            this.openImportUrlDialog('');
        },

        handlePasteResultClose() {
            this.pasteResultDialogOpen = false;
            this.pasteResultData = null;
        },

        // View mode switching
        switchViewMode(mode) {
            // Close any open context menu before switching views
            window.dispatchEvent(new MouseEvent('click'));

            this.viewMode = mode;
            setPref(PREF.FILE_VIEW_MODE, mode);
        },

        toggleViewMode() {
            this.switchViewMode(this.viewMode === 'grid' ? 'table' : 'grid');
        },

        toggleExpandedGrid() {
            this.expandedGrid = !this.expandedGrid;
            setPref(PREF.TABLE_EXPANDED_GRID, this.expandedGrid);
            this.updateExplorerTools();
        },

        handleRefresh() {
            if (this.$refs.fileBrowser) {
                this.$refs.fileBrowser.refreshAndNavigate(this.currentPath);
            }
        },

        showBuildConfirm(file, onConfirm) {
            this._buildConfirmCallback = onConfirm;
            this.buildConfirmDialogOpen = true;
        },

        handleBuildConfirmOk() {
            this.buildConfirmDialogOpen = false;
            if (typeof this._buildConfirmCallback === 'function') {
                this._buildConfirmCallback();
                this._buildConfirmCallback = null;
            }
        },

        handleTableSelectionChanged(file) {
            // Update selected file for DetailPanel
            const selectedFiles = this.fileBrowserFiles.filter(f => f.selected);

            // Use the clicked file if it's selected, otherwise pick the first selected file
            const newDetailFile = selectedFiles.length > 0
                ? (file && file.selected ? file : selectedFiles[0])
                : null;

            // If the detail panel is already open, update immediately (no reflow).
            // If it's closed, delay opening to avoid reflow that disrupts double-click.
            clearTimeout(this._detailPanelTimeout);
            if (this.selectedDetailFile || !newDetailFile) {
                this.selectedDetailFile = newDetailFile;
            } else {
                this._detailPanelTimeout = setTimeout(() => {
                    this.selectedDetailFile = newDetailFile;
                }, 250);
            }
        },

        handleDetailPanelClose() {
            clearTimeout(this._detailPanelTimeout);
            this.selectedDetailFile = null;
        },

        handleDetailPanelOpen(file) {
            this.handleOpenItem(file);
        },

        handleDetailPanelShare(file) {
            this.handleShareEmbed(file);
        },

        rootNodes: async function () {

            try {

                const entries = await this.dataset.info({ signal: this.requestSignal });

                // Save the root dataset entry (contains permissions)
                if (entries.length > 0) {
                    this.rootDatasetEntry = entries[0];
                }

                // Set title
                if (entries.length > 0 && entries[0]?.properties?.meta?.name) {
                    setTitle(entries[0]?.properties?.meta?.name.data);
                }

                return entries.map(e => {
                    return {
                        icon: icons.getForType(e.type, e.path),
                        label: utils.entryLabel(e),
                        path: e.path,
                        expanded: true,
                        entry: e,
                        isExpandable: ddb.entry.isDirectory(e)
                    };
                });

            } catch (e) {
                // Left the dataset while it was loading
                if (isAbort(e)) return [];
                // A 401 is handled by reg.onUnauthorized (sign in, then come back)
                if (!isUnauthorized(e)) this.showError(e, "Dataset");
                return [];
            }
        },

        handleOpenItem: async function (node, view, options) {
            clearTimeout(this._detailPanelTimeout);
            // If it's a directory, navigate into it
            if (ddb.entry.isDirectory(node.entry)) {
                emitter.emit("folderOpened", pathutils.getTree(node.entry.path));
                return;
            }

            if (!view) view = defaultViewFor(node.entry);

            // .3tz files (OGC 3D Tiles archives) indexed by older ddb may appear as Generic.
            // Fall back to the Unified Viewer by extension so double-click works correctly.
            if (!view && /\.3tz$/i.test(node.entry.path || '')) view = 'unified';

            // Archives are indexed as generic files but we can extract them. When the
            // user can write, make "Extract" the default action (matches the context menu).
            if (!view && this.canWrite && isArchiveFile(node.entry)) {
                this.openExtractDialog(node);
                return;
            }

            // Check if file should open as text
            if (!view && shouldOpenAsText(node.entry)) {
                this.openTextEditor(node.entry, false);
                return;
            }

            if (view) {
                // Plant Health opens the map tab with the panel
                if (view === 'planthealth') {
                    if (this.$refs.mainTabSwitcher) {
                        this.$refs.mainTabSwitcher.activateTab('map');
                    }
                    this.withMap(map => {
                        if (map.openPlantHealth) map.openPlantHealth(node, options);
                    });
                    return;
                }

                // Pre-opening check of file availability
                try {
                    const availability = await FileAvailabilityChecker.check(
                        this.dataset,
                        node.entry,
                        view
                    );

                    if (!availability.available) {
                        // File not available - show dialog
                        this.showFileNotAvailableDialog(availability, node);
                        return;
                    }

                    // File available - proceed with opening
                    const [, path] = ddb.utils.datasetPathFromUri(node.path);
                    const url = `/r/${this.$route.params.org}/${this.$route.params.ds}/view/${b64encode(path)}/${view}`;
                    window.open(url, `${path}-${view}`);

                } catch (error) {
                    this.showError(error.message, "Error");
                }
            } else {
                // Open PDF in viewer
                if (isPdfFile(node.entry)) {
                    this.openPdfViewer(node.entry);
                    return;
                }

                // Open images in lightbox
                const entryType = node.entry.type;
                if (entryType === ddb.entry.type.IMAGE || entryType === ddb.entry.type.GEOIMAGE) {
                    this.openImageLightbox(node);
                } else if (entryType === ddb.entry.type.VIDEO || entryType === ddb.entry.type.GEOVIDEO) {
                    this.openVideoLightbox(node);
                } else {
                    openInBrowser(node.path);
                }
            }
        },

        getImageFiles: function () {
            return this.fileBrowserFiles.filter(f => {
                const t = f.entry.type;
                return t === ddb.entry.type.IMAGE || t === ddb.entry.type.GEOIMAGE;
            });
        },

        openImageLightbox: function (node) {
            const imageFiles = this.getImageFiles();
            if (imageFiles.length === 0) return;

            const [, nodePath] = ddb.utils.datasetPathFromUri(node.path);

            this.lightboxSources = imageFiles.map(f => {
                const [, p] = ddb.utils.datasetPathFromUri(f.path);
                return this.dataset.thumbUrl(p, 1024);
            });

            this.lightboxEntries = imageFiles.map(f => {
                const [, p] = ddb.utils.datasetPathFromUri(f.path);
                return { path: p, entry: f.entry };
            });

            const idx = imageFiles.findIndex(f => {
                const [, p] = ddb.utils.datasetPathFromUri(f.path);
                return p === nodePath;
            });

            this.lightboxSlide = (idx >= 0 ? idx : 0) + 1;
            this.lightboxCurrentSlide = this.lightboxSlide;

            // Force remount of FsLightbox with new sources, then toggle
            this.lightboxKey++;
            this.$nextTick(() => {
                this.$nextTick(() => {
                    this.lightboxToggler = !this.lightboxToggler;
                });
            });
        },

        handleLightboxOpen: function (instance) {
            this.lightboxOpen = true;
            if (instance && instance.stageIndexes) {
                this.lightboxCurrentSlide = instance.stageIndexes.current + 1;
            }
            // Intercept slide number updates to track current slide
            if (instance && typeof instance.sn === 'function') {
                const origSn = instance.sn.bind(instance);
                const self = this;
                instance.sn = function (slideNumber) {
                    origSn(slideNumber);
                    self.lightboxCurrentSlide = slideNumber;
                };
            }
        },

        handleLightboxShow: function (instance) {
            if (instance && instance.stageIndexes) {
                this.lightboxCurrentSlide = instance.stageIndexes.current + 1;
            }
        },

        handleLightboxClose: function () {
            this.lightboxOpen = false;
        },

        openVideoLightbox: function (node) {
            const [, p] = ddb.utils.datasetPathFromUri(node.path);
            this.videoLightboxSrc = this.dataset.downloadUrl(p, { inline: true });
            this.videoLightboxEntry = { ...node.entry, path: p };
            this.videoLightboxVisible = true;
        },

        closeVideoLightbox: function () {
            this.videoLightboxVisible = false;
            this.videoLightboxSrc = '';
            this.videoLightboxEntry = null;
        },


        openLightboxDirectLink: function () {
            const idx = this.lightboxCurrentSlide - 1;
            if (idx >= 0 && idx < this.lightboxEntries.length) {
                const entry = this.lightboxEntries[idx];
                const url = this.dataset.downloadUrl(entry.path, { inline: true });
                window.open(url, '_blank');
            }
        },

        openLightboxFullSize: function () {
            const idx = this.lightboxCurrentSlide - 1;
            if (idx >= 0 && idx < this.lightboxEntries.length) {
                const entry = this.lightboxEntries[idx];
                const url = this.dataset.downloadUrl(entry.path, { inline: true });
                window.open(url, '_blank');
            }
        },

        openTextEditor: function(entry, readonly = false) {
            this.textEditorEntry = entry;
            this.textEditorReadonly = readonly || !this.canWrite;
            this.textEditorDialogOpen = true;
        },

        handleOpenAsText: function(node) {
            this.openTextEditor(node.entry, false);
        },

        handleTextEditorClose: function() {
            this.textEditorDialogOpen = false;
            this.textEditorEntry = null;
        },

        openPdfViewer: function(entry) {
            this.pdfViewerEntry = entry;
            this.pdfViewerOpen = true;
        },

        handlePdfViewerClose: function() {
            this.pdfViewerOpen = false;
            this.pdfViewerEntry = null;
        },

        handleTextEditorSaved: function(path) {
            this.$notify.success(`File saved: ${path}`, { summary: 'File Saved' });
        },

        showFileNotAvailableDialog: function(availability, node) {
            this.availabilityDialogData = {
                title: availability.title,
                message: availability.message,
                status: availability.status,
                actions: availability.actions,
                buildState: availability.buildState,
                entry: node.entry
            };
            this.showAvailabilityDialog = true;
        },

        handleAvailabilityDialogClose: function() {
            this.showAvailabilityDialog = false;
        },

        handleBuildCompleted: function(entry) {
            this.showAvailabilityDialog = false;
            this.$notify.success(`Build completed for ${entry.path}. Opening viewer...`, { summary: 'Build Completed' });

            // Automatically open the viewer
            setTimeout(() => {
                const view = defaultViewFor(entry);
                if (view) {
                    const [, path] = ddb.utils.datasetPathFromUri(entry.path);
                    const url = `/r/${this.$route.params.org}/${this.$route.params.ds}/view/${b64encode(path)}/${view}`;
                    window.open(url, `${path}-${view}`);
                }
            }, 500);
        },

        handleBuildFailed: function(buildState) {
            this.showError(`Build failed for ${buildState.path}`, "Build Error");
        },

        handleBuildTimeout: function() {
            this.showError("Timeout while waiting for build completion. Please try again later.", "Timeout");
            this.showAvailabilityDialog = false;
        },


        addComponentTab: function (uri, label, icon, component, view) {
            if (!this.$refs.mainTabSwitcher.hasTab(label)) {
                this.$refs.mainTabSwitcher.addTab({
                    label,
                    icon,
                    key: `${uri}-${view}`,
                    hideLabel: false,
                    canClose: true,
                    component,
                    props: {
                        uri
                    }
                }, { activate: true });
            } else {
                this.$refs.mainTabSwitcher.activateTab(label);
            }
        },



        handleFileSelectionChanged: function (fileBrowserFiles) {
            this.fileBrowserFiles.forEach(f => f.selected = false);
            this.fileBrowserFiles = fileBrowserFiles;
            this.isLoadingFiles = false;

            // Update selectedDetailFile for Properties tab (mobile)
            // When a single non-directory file is selected from the tree, show its details
            if (fileBrowserFiles.length === 1 && fileBrowserFiles[0].entry && !ddb.entry.isDirectory(fileBrowserFiles[0].entry)) {
                this.selectedDetailFile = fileBrowserFiles[0];
            } else {
                this.selectedDetailFile = null;
            }
        },

        handleSelectAll: function () {
            this.fileBrowserFiles.forEach(f => f.selected = true);
        },

        handleCurrentUriChanged: function (currentUri) {
            this.currentPath = currentUri != null ? utils.pathFromUri(currentUri).replace(/^\//, "") : null;
            this.isLoadingFiles = true;
        },



        handleScrollTo: function (file) {
            if (this.$refs.explorer) {
                this.$refs.explorer.scrollTo(file);
            }
        },

        handleError: function (e) {
            this.showError(e, "Error");
        },

        handleDownloadItems: async function (files) {
            if (!files || files.length === 0) return;

            // Block any download trigger while a bulk-download task is active.
            if (this.activeBulkDownload) {
                this.$notify.warn('A download archive is already being prepared. Please wait for it to complete.', { summary: 'Download in progress' });
                return;
            }

            const paths = files.map(f => {
                // Files from Explorer/TableView have f.entry.path
                // Files from FileBrowser have f.entry.path too (they are tree nodes)
                if (f.entry && f.entry.path !== undefined) return f.entry.path;
                // Fallback: parse URI if f.path is a URI
                const { path } = utils.parseUri(f.path);
                return path;
            });

            try {
                await downloadFromDataset({
                    dataset: this.dataset, paths, files,
                    signedIn: reg.isLoggedIn(),
                    thresholdBytes: reg.features.value(Features.BULK_DOWNLOAD_ASYNC_THRESHOLD_BYTES),
                    runTask: this.runHeavyTask
                });
            } catch (e) {
                notifyDownloadError(e);
            }
        },

        /**
         * Handles the downloadBuildArtifact event from context menu.
         * Double-checks build status (async) then opens the direct download URL.
         */
        handleDownloadBuildArtifact: async function (file) {
            if (!file || !file.entry) return;

            // Async double-check: isFileBuilt does a HEAD request if cache is stale
            const built = await isFileBuilt(this.dataset, file);
            if (!built) {
                this.$notify.warn('This file has not been built yet. Run Build first.', { summary: 'Not available' });
                return;
            }

            try {
                await downloadBuildArtifact(this.dataset, file.entry.path);
            } catch (e) {
                notifyDownloadError(e);
            }
        },

        // Relay the active main tab to the global toolbar (Header) so it can gate
        // the Download/Share actions to the Files tab only.
        handleMainTabChange: function (key) {
            // Tabs whose code loads on first use (HUB-02) stay mounted once opened
            if (key in this.openedTabs) this.openedTabs[key] = true;
            this.datasetSessionStore.setActiveTab(key);
        },

        // A lazily loaded tab mounts after its activation was signalled: forward it now
        handleLazyTabMounted: function (key) {
            this.$nextTick(() => {
                const node = key === 'map' ? this.$refs.mapViewer : null;
                if (node && this.$refs.mainTabSwitcher?.activeTab === key && node.onTabActivated) node.onTabActivated();
                if (key === 'map' && node && this._pendingMapActions) {
                    const actions = this._pendingMapActions;
                    this._pendingMapActions = null;
                    actions.forEach(action => action(node));
                }
            });
        },

        // Runs `action` with the map viewer, once its code has loaded if it has not yet
        withMap: function (action) {
            this.$nextTick(() => {
                if (this.$refs.mapViewer) action(this.$refs.mapViewer);
                else (this._pendingMapActions ??= []).push(action);
            });
        },

        updateExplorerTools: function() {
            // Rebuild explorer tools based on current selection and view mode
            this.explorerTools = [];

            // Upload and create folder only if user has write permissions
            if (this.canWrite) {
                this.explorerTools.push({
                    id: 'upload',
                    title: "Upload",
                    icon: "fa-solid fa-plus",
                    onClick: () => {
                        this.uploadDialogOpen = true;
                    }
                }, {
                    id: 'newfolder',
                    title: "Create folder",
                    icon: "fa-solid fa-folder",
                    onClick: () => {
                        this.createFolderDialogOpen = true;
                    }
                });
            }

            // Select All button - hidden when all files are already selected
            if (this.fileBrowserFiles.length > 0 && this.selectedFiles.length < this.fileBrowserFiles.length) {
                this.explorerTools.push({
                    id: 'select-all',
                    title: "Select All",
                    icon: "fa-regular fa-square-check",
                    onClick: () => {
                        this.fileBrowserFiles.forEach(f => f.selected = true);
                    }
                });
            }

            // Deselect All button - only visible when at least one file is selected
            if (this.selectedFiles.length > 0) {
                this.explorerTools.push({
                    id: 'deselect-all',
                    title: "Deselect All",
                    icon: "fa-regular fa-square",
                    onClick: () => {
                        this.fileBrowserFiles.forEach(f => f.selected = false);
                    }
                });
            }

            // Rename and delete only if user has write permissions and files are selected
            if (this.canWrite && this.selectedFiles.length == 1) {
                this.explorerTools.push({
                    id: 'rename',
                    title: "Rename",
                    icon: "fa-solid fa-pen-to-square",
                    onClick: () => {
                        this.fileToRename = this.selectedFiles[0];
                        this.renameDialogOpen = true;
                    }
                });
            }

            if (this.canWrite && this.selectedFiles.length > 0) {
                this.explorerTools.push({
                    id: 'remove',
                    title: "Remove",
                    icon: "fa-solid fa-trash",
                    onClick: () => {
                        this.selectedUsingFileBrowserList = false;
                        this.deleteDialogOpen = true;
                    }
                });

                this.explorerTools.push({
                    id: 'separator'
                });

                let addedOpen = false;

                if (this.selectedFiles.length === 1) {
                    this.explorerTools.push({
                        id: 'share-embed',
                        title: "Share/Embed",
                        icon: "fa-solid fa-share-nodes",
                        onClick: () => {
                            this.handleShareEmbed(this.selectedFiles[0]);
                        }
                    });

                    if ([ddb.entry.type.GEORASTER, ddb.entry.type.POINTCLOUD].indexOf(this.selectedFiles[0].entry.type) !== -1) {
                        this.explorerTools.push({
                            id: 'open-map',
                            title: "Open Map",
                            icon: "fa-solid fa-map",
                            onClick: () => {
                                this.handleOpenItem(this.selectedFiles[0], 'map');
                            }
                        });
                        addedOpen = true;
                    }
                    if ([ddb.entry.type.POINTCLOUD].indexOf(this.selectedFiles[0].entry.type) !== -1) {
                        this.explorerTools.push({
                            id: 'open-pointcloud',
                            title: "Open Point Cloud",
                            icon: "fa-solid fa-cube",
                            onClick: () => {
                                this.handleOpenItem(this.selectedFiles[0], 'pointcloud');
                            }
                        });
                        addedOpen = true;
                    }
                    if ([ddb.entry.type.MODEL].indexOf(this.selectedFiles[0].entry.type) !== -1) {
                        this.explorerTools.push({
                            id: 'open-3dmodel',
                            title: "Open 3D Model",
                            icon: "fa-solid fa-cube",
                            onClick: () => {
                                this.handleOpenItem(this.selectedFiles[0], 'model');
                            }
                        });
                        addedOpen = true;
                    }
                    if ([ddb.entry.type.PANORAMA, ddb.entry.type.GEOPANORAMA].indexOf(this.selectedFiles[0].entry.type) !== -1) {
                        this.explorerTools.push({
                            id: 'open-panorama',
                            title: "Open Panorama",
                            icon: "fa-solid fa-globe",
                            onClick: () => {
                                this.handleOpenItem(this.selectedFiles[0], 'panorama');
                            }
                        });
                        addedOpen = true;
                    }
                }

                if (!addedOpen) {
                    this.explorerTools.push({
                        id: 'open',
                        title: "Open",
                        icon: "fa-solid fa-folder-open",
                        onClick: () => {
                            this.handleOpenItem(this.selectedFiles[0]);
                        }
                    });
                }
            }

            // Add spacer and view mode toggle button
            this.explorerTools.push({
                id: 'spacer'
            });

            this.explorerTools.push({
                id: 'refresh',
                title: "Refresh",
                icon: "fa-solid fa-rotate-right",
                onClick: () => {
                    this.handleRefresh();
                }
            });

            // Expanded grid toggle (thumbnails + relative time) only applies to table view
            if (this.viewMode === 'table') {
                this.explorerTools.push({
                    id: 'expanded-grid',
                    title: "Expanded Table View",
                    icon: "fa-solid fa-table-cells-large",
                    selected: this.expandedGrid,
                    onClick: () => {
                        this.toggleExpandedGrid();
                    }
                });
            }

            // Show only the button to switch to the opposite view
            if (this.viewMode === 'grid') {
                this.explorerTools.push({
                    id: 'view-toggle',
                    title: "Table View",
                    icon: "fa-solid fa-list",
                    onClick: () => {
                        this.toggleViewMode();
                    }
                });
            } else {
                this.explorerTools.push({
                    id: 'view-toggle',
                    title: "Grid View",
                    icon: "fa-solid fa-table-cells",
                    onClick: () => {
                        this.toggleViewMode();
                    }
                });
            }
        }
    }
}
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

.lightbox-toolbar-extra {
    position: fixed;
    right: 90px;
    background: rgba(35,35,35,.65);
    top: 0px;
    height: 45px;
    width: 45px;
    z-index: 1000000001;
    display: flex;
    align-items: center;
    justify-content: center;
}

.lightbox-direct-link,
.lightbox-open-fullsize {
    cursor: pointer;
    color: var(--ddb-text-on-dark);
    font-size: var(--ddb-font-size-lg);
    padding: var(--ddb-spacing-sm) var(--ddb-spacing-md);
    border-radius: var(--ddb-radius-sm);
    transition: color 0.2s, background-color 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
}

.lightbox-direct-link:hover,
.lightbox-open-fullsize:hover {
    color: var(--ddb-text-on-color);
    background-color: rgba(255, 255, 255, 0.15);
}

.lightbox-info-overlay {
    position: fixed;
    bottom: var(--ddb-spacing-xl);
    left: 50%;
    transform: translateX(-50%);
    z-index: 1000000001;
    background: var(--ddb-overlay-bg);
    color: var(--ddb-text-on-dark);
    padding: var(--ddb-spacing-sm) var(--ddb-spacing-lg);
    border-radius: var(--ddb-radius-md);
    font-size: var(--ddb-font-size-base);
    display: flex;
    align-items: center;
    gap: var(--ddb-spacing-lg);
    white-space: nowrap;
    backdrop-filter: blur(var(--ddb-spacing-xs));
    pointer-events: none;
    user-select: none;
    max-width: 90vw;
    overflow: hidden;
    text-overflow: ellipsis;
}

.lightbox-info-name {
    font-weight: 600;
    max-width: var(--ddb-tooltip-max-width);
    overflow: hidden;
    text-overflow: ellipsis;
}

.lightbox-info-coords,
.lightbox-info-altitude {
    display: flex;
    align-items: center;
    opacity: 0.9;
}
</style>
