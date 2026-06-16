<template>
    <div id="browser" class="cui app">
        <Message bindTo="error" />
        <Panel split="vertical" class="main" amount="23.6%" mobileAmount="0%" tabletAmount="30%"
            mobileCollapsed>
            <template #first>
            <div class="sidebar">
                <FileBrowser v-show="!isMobile" ref="fileBrowser" :rootNodes="rootNodes" :canWrite="canWrite" :dataset="dataset" @openItem="handleOpenItem"
                    @selectionChanged="handleFileSelectionChanged" @currentUriChanged="handleCurrentUriChanged"
                    @openProperties="handleFileBrowserOpenProperties"
                    @deleteSelecteditems="openDeleteItemsDialogFromFileBrowser"
                    @moveSelectedItems="openRenameItemsDialogFromFileBrowser"
                    @transferSelectedItems="openTransferItemsDialogFromFileBrowser"
                    @setAsCover="setAsCover"
                    @downloadItems="handleDownloadItems"
                    @shareEmbed="handleShareEmbed"
                    @createFolder="handleCreateFolder"
                    @selectAll="handleSelectAll"
                    @openAsText="handleOpenAsText" @error="handleError" @mergeMultispectral="openMergeMultispectralDialog" @maskBorders="handleMaskBorders" @alignGeoRaster="openAlignDialog" @extractItem="openExtractDialog"
                    @copySelectedItems="clipboardCopySelected" @cutSelectedItems="clipboardCutSelected" @pasteFromClipboard="clipboardPaste" />
            </div>
            </template>
            <template #second>
            <TabSwitcher :tabs="mainTabs" :selectedTab="startTab" position="top" buttonWidth="auto" :hideSingle="false"
                ref="mainTabSwitcher">
                <template v-if="isMobile" v-slot:filebrowser>
                    <FileBrowser :rootNodes="rootNodes" :canWrite="canWrite" :dataset="dataset" @openItem="handleOpenItem"
                        @selectionChanged="handleFileSelectionChanged" @currentUriChanged="handleCurrentUriChanged"
                        @openProperties="handleFileBrowserOpenProperties"
                        @deleteSelecteditems="openDeleteItemsDialogFromFileBrowser"
                        @moveSelectedItems="openRenameItemsDialogFromFileBrowser"
                        @transferSelectedItems="openTransferItemsDialogFromFileBrowser"
                        @setAsCover="setAsCover"
                        @downloadItems="handleDownloadItems"
                        @shareEmbed="handleShareEmbed"
                        @createFolder="handleCreateFolder"
                        @selectAll="handleSelectAll"
                        @openAsText="handleOpenAsText" @error="handleError" @mergeMultispectral="openMergeMultispectralDialog" @maskBorders="handleMaskBorders" @alignGeoRaster="openAlignDialog" @extractItem="openExtractDialog"
                        @copySelectedItems="clipboardCopySelected" @cutSelectedItems="clipboardCutSelected" @pasteFromClipboard="clipboardPaste" />
                </template>
                <template v-slot:map>
                    <Map ref="mapViewer" lazyload :files="fileBrowserFiles" :dataset="dataset" :canWrite="canWrite" :canDelete="canDelete" @scrollTo="handleScrollTo"
                        @openItem="handleOpenItem" />
                </template>
                <template v-slot:explorer>
                    <!-- Grid View (Explorer) with optional Detail Panel -->
                    <div v-if="viewMode === 'grid'" class="detail-layout">
                        <div class="detail-main" :class="{ 'with-detail': selectedDetailFile && !isMobile }">
                            <Explorer ref="explorer" :files="fileBrowserFiles" :tools="explorerTools" :currentPath="currentPath"
                                :dataset="dataset" :viewMode="viewMode" :canWrite="canWrite" :isLoadingFiles="isLoadingFiles" @openItem="handleOpenItem" @createFolder="handleCreateFolder"
                                @deleteSelecteditems="openDeleteItemsDialog" @moveSelectedItems="openRenameItemsDialog"
                                @transferSelectedItems="openTransferItemsDialog"
                                @setAsCover="setAsCover"
                                @openProperties="handleExplorerOpenProperties"
                                @shareEmbed="handleShareEmbed" @downloadItems="handleDownloadItems" @buildStarted="handleBuildStarted" @buildError="handleBuildError"
                                @openAsText="handleOpenAsText" @selectionChanged="handleTableSelectionChanged" @mergeMultispectral="openMergeMultispectralDialog" @maskBorders="handleMaskBorders" @alignGeoRaster="openAlignDialog" @extractItem="openExtractDialog"
                                @copySelectedItems="clipboardCopySelected" @cutSelectedItems="clipboardCutSelected" @pasteFromClipboard="clipboardPaste" />
                        </div>
                        <div v-if="selectedDetailFile && !isMobile" class="detail-side">
                            <DetailPanel :file="selectedDetailFile" :dataset="dataset"
                                @close="handleDetailPanelClose"
                                @open="handleDetailPanelOpen"
                                @share="handleDetailPanelShare"
                                @buildStarted="handleBuildStarted"
                                @buildError="handleBuildError" />
                        </div>
                    </div>

                    <!-- Table View with optional Detail Panel -->
                    <div v-else class="detail-layout">
                        <div class="detail-main" :class="{ 'with-detail': selectedDetailFile && !isMobile }">
                            <TableView ref="tableview" :files="fileBrowserFiles" :tools="explorerTools" :currentPath="currentPath"
                                :dataset="dataset" :viewMode="viewMode" :canWrite="canWrite" :isLoadingFiles="isLoadingFiles" @openItem="handleOpenItem" @createFolder="handleCreateFolder"
                                @deleteSelecteditems="openDeleteItemsDialog" @moveSelectedItems="openRenameItemsDialog"
                                @transferSelectedItems="openTransferItemsDialog"
                                @setAsCover="setAsCover"
                                @openProperties="handleExplorerOpenProperties"
                                @shareEmbed="handleShareEmbed" @downloadItems="handleDownloadItems" @buildStarted="handleBuildStarted" @buildError="handleBuildError"
                                @openAsText="handleOpenAsText"
                                @selectionChanged="handleTableSelectionChanged" @mergeMultispectral="openMergeMultispectralDialog" @maskBorders="handleMaskBorders" @alignGeoRaster="openAlignDialog" @extractItem="openExtractDialog"
                                @copySelectedItems="clipboardCopySelected" @cutSelectedItems="clipboardCutSelected" @pasteFromClipboard="clipboardPaste" />
                        </div>
                        <div v-if="selectedDetailFile && !isMobile" class="detail-side">
                            <DetailPanel :file="selectedDetailFile" :dataset="dataset"
                                @close="handleDetailPanelClose"
                                @open="handleDetailPanelOpen"
                                @share="handleDetailPanelShare"
                                @buildStarted="handleBuildStarted"
                                @buildError="handleBuildError" />
                        </div>
                    </div>
                </template>
                <template v-slot:tasks>
                    <TaskHistory :dataset="dataset" :canWrite="canWrite" />
                </template>
                <template v-if="isMobile" v-slot:properties>
                    <DetailPanel :file="selectedDetailFile" :dataset="dataset"
                        @close="handleDetailPanelClose"
                        @open="handleDetailPanelOpen"
                        @share="handleDetailPanelShare"
                        @buildStarted="handleBuildStarted"
                        @buildError="handleBuildError" />
                </template>
            </TabSwitcher>
            </template>
        </Panel>
        <Properties v-if="showProperties" :files="contextMenuFiles" @onClose="handleCloseProperties" />
        <SettingsDialog v-if="showSettings" :dataset="dataset" :canWrite="canWrite" @onClose="handleSettingsClose"
            @addMarkdown="handleAddMarkdown" @rescanRequested="handleRescanRequested" />
        <AddToDatasetDialog v-if="uploadDialogOpen" @onClose="handleAddClose" :path="currentPath"
            :organization="dataset.org" :dataset="dataset.ds" :filesToUpload="filesToUpload" :open="true">
        </AddToDatasetDialog>
        <DeleteDialog v-if="deleteDialogOpen" @onClose="handleDeleteClose" :files="contextMenuFiles"></DeleteDialog>
        <DeleteResultDialog v-if="deleteResultDialogOpen"
            :deleted="deleteResultData.deleted"
            :failed="deleteResultData.failed"
            @onClose="handleDeleteResultClose">
        </DeleteResultDialog>
        <RescanResultDialog v-if="rescanResultDialogOpen"
            :result="rescanResultData"
            @onClose="handleRescanResultClose">
        </RescanResultDialog>
        <RescanConfirmDialog v-if="rescanConfirmDialogOpen"
            @onClose="handleRescanConfirmClose">
        </RescanConfirmDialog>
        <BuildConfirmDialog v-if="buildConfirmDialogOpen"
            @confirm="handleBuildConfirmOk"
            @cancel="buildConfirmDialogOpen = false" />
        <ConfirmDialog v-if="setCoverDialogOpen"
            title="Replace Dataset Cover"
            message="A dataset cover already exists. Do you want to replace it? This action is irreversible."
            confirmText="Replace"
            confirmButtonClass="danger"
            @onClose="handleSetCoverClose" />
        <RenameDialog v-if="renameDialogOpen" :busy="isBusy" @onClose="handleRenameClose" :file="fileToRename"></RenameDialog>
        <MergeMultispectralDialog v-if="mergeMultispectralDialogOpen" @onClose="handleMergeMultispectralClose" :files="mergeMultispectralFiles" :dataset="dataset" />
        <AlignDialog v-if="alignDialogOpen" @onClose="handleAlignClose" :source-entry="alignSourceEntry" :dataset="dataset" :all-entries="fileBrowserFiles" />
        <ExtractDialog v-if="extractDialogOpen" @onClose="handleExtractClose" :file="extractFile" :dataset="dataset" />
        <ConfirmDialog v-if="maskBordersConfirmOpen"
            title="Mask Borders"
            :message="`The file <strong>${maskBordersOutputPath}</strong> already exists. Do you want to overwrite it?`"
            confirmText="Overwrite"
            confirmButtonClass="danger"
            @onClose="handleMaskBordersConfirm" />
        <NewFolderDialog v-if="createFolderDialogOpen" :busy="isBusy" @onClose="handleNewFolderClose"></NewFolderDialog>
        <TransferDialog v-if="transferDialogOpen" @onClose="handleTransferClose" :files="contextMenuFiles"
            :sourceOrg="dataset.org" :sourceDs="dataset.ds"></TransferDialog>
        <PasteConflictDialog v-if="pasteConflictDialogOpen"
            :items="pasteConflictData ? pasteConflictData.items : []"
            @resolve="handlePasteConflictResolve" />
        <PasteResultDialog v-if="pasteResultDialogOpen"
            :mode="pasteResultData ? pasteResultData.mode : 'copy'"
            :succeeded="pasteResultData ? pasteResultData.succeeded : []"
            :failed="pasteResultData ? pasteResultData.failed : {}"
            :skipped="pasteResultData ? pasteResultData.skipped : []"
            @onClose="handlePasteResultClose" />
        <ClipboardPanel v-if="dataset" />
        <Alert :title="errorMessageTitle" v-if="errorDialogOpen" @onClose="handleErrorDialogClose">
            {{ errorMessage }}
        </Alert>
        <Loader v-if="isBusy"></Loader>
        <Toast position="bottom-left" />
        <ShareEmbed v-if="shareFile" @onClose="handleCloseShareEmbed" :file="shareFile" />
        <FileAvailabilityDialog
            v-if="showAvailabilityDialog"
            :show="showAvailabilityDialog"
            :title="availabilityDialogData.title"
            :message="availabilityDialogData.message"
            :status="availabilityDialogData.status"
            :actions="availabilityDialogData.actions"
            :buildState="availabilityDialogData.buildState"
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
            @onClose="handleTextEditorClose"
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
            :onOpen="handleLightboxOpen"
            :onClose="handleLightboxClose"
            :onShow="handleLightboxShow"
            type="image"
            :loadOnlyCurrentSource="true"
        />
        <div v-if="lightboxOpen" class="lightbox-toolbar-extra">
            <div class="lightbox-open-fullsize" @click="openLightboxDirectLink" title="Open in new tab">
                <i class="fa-solid fa-up-right-from-square"></i>
            </div>
        </div>
        <div v-if="lightboxOpen && lightboxCurrentEntry" class="lightbox-info-overlay">
            <div class="lightbox-info-name">{{ lightboxCurrentEntry.name }}</div>
            <div v-if="lightboxCurrentEntry.coords" class="lightbox-info-coords">
                <i class="fa-solid fa-location-dot me-1"></i>{{ lightboxCurrentEntry.coords }}
            </div>
            <div v-if="lightboxCurrentEntry.altitude !== null" class="lightbox-info-altitude">
                <i class="fa-solid fa-arrows-up-down me-1"></i>{{ lightboxCurrentEntry.altitude }} m
            </div>
        </div>
        <VideoLightbox :visible="videoLightboxVisible" :src="videoLightboxSrc" :entry="videoLightboxEntry"
            @close="closeVideoLightbox" />
    </div>
</template>

<script>
import Header from '@/layout/Header.vue';
import SettingsDialog from './dialogs/SettingsDialog.vue';
import AddToDatasetDialog from './dialogs/AddToDatasetDialog.vue';
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
import Map from '@/features/viewers/map/Map.vue';
import Explorer from './explorer/Explorer.vue';
import TableView from './explorer/TableView.vue';
import DetailPanel from './explorer/DetailPanel.vue';
import Properties from './explorer/Properties.vue';
import TabSwitcher from '@/components/TabSwitcher.vue';
import Panel from '@/components/Panel.vue';
import Alert from '@/components/Alert.vue';
import Loader from '@/components/Loader.vue';
import Toast from 'primevue/toast';
import ShareEmbed from './ShareEmbed.vue';
import TaskHistory from './TaskHistory.vue';
import FileAvailabilityDialog from './dialogs/FileAvailabilityDialog.vue';
import TextEditorDialog from './dialogs/TextEditorDialog.vue';
import PdfViewerDialog from '@/features/viewers/map/PdfViewerDialog.vue';
import MergeMultispectralDialog from './dialogs/MergeMultispectralDialog.vue';
import AlignDialog from './dialogs/AlignDialog.vue';
import ExtractDialog from './dialogs/ExtractDialog.vue';
import FsLightbox from 'fslightbox-vue';
import VideoLightbox from './VideoLightbox.vue';

import emitter from '@/libs/eventBus';
import icons from '@/libs/icons';
import reg from '@/libs/api/sharedRegistry';
import { setTitle } from '@/libs/utils';
import { clone } from '@/libs/utils';
import shell from '@/dynamic/shell';
import { isMobile } from '@/libs/responsive';
import { renameDataset, entryLabel } from '@/libs/api/registryUtils';
import { b64encode } from '@/libs/base64';
import BuildManager from '@/libs/build/buildManager';
import FileAvailabilityChecker from '@/libs/build/fileAvailabilityChecker';
import { shouldOpenAsText, canOpenAsText, isPdfFile } from '@/libs/textFileUtils';

import ddb from 'ddb';
import { coordAll } from '@turf/meta';
const { pathutils, utils } = ddb;

import { OpenItemDefaults } from '@/libs/openItemDefaults';
import { isArchiveFile } from '@/libs/entryTypes';

// Import mixins
import dialogManager from '@/composables/useDialogManager';
import fileOperations from '@/composables/useFileOperations';
import buildEvents from '@/composables/useBuildEvents';
import useHeavyTask from '@/composables/useHeavyTask';
import { Features } from '@/libs/features';

export default {
    mixins: [dialogManager, fileOperations, buildEvents, useHeavyTask],
    provide: function () {
        return {
            showBuildConfirm: (file, onConfirm) => this.showBuildConfirm(file, onConfirm)
        };
    },
    components: {
        Header,
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
        Toast,
        ShareEmbed,
        TaskHistory,
        FileAvailabilityDialog,
        TextEditorDialog,
        PdfViewerDialog,
        MergeMultispectralDialog,
        AlignDialog,
        ExtractDialog,
        FsLightbox,
        VideoLightbox
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

        // Load view mode preference from localStorage
        const savedViewMode = localStorage.getItem('fileViewMode') || 'grid';

        return {
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
            selectedDetailFile: null, // For DetailPanel in table view
            rootDatasetEntry: null, // Root dataset entry with permissions

            // True while a bulk-download task (ZIP compression) is active for this
            // dataset. Set via the global event bus by TaskHistory; disables all
            // download triggers so the server cannot receive concurrent requests.
            activeBulkDownload: false,

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
            _buildConfirmCallback: null,

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

        // Listen to build state change events
        BuildManager.on('buildStateChanged', this.handleBuildStateNotification);
        BuildManager.on('buildStarted', this.handleBuildStartedNotification);
        BuildManager.on('buildError', this.handleBuildErrorNotification);
        BuildManager.on('newBuildableFilesDetected', this.handleNewBuildableFilesNotification);

        // Event bus listeners - saved as named refs for cleanup
        this._onOpenSettings = () => {
            this.showSettings = true;
        };

        this._onOpenShareDataset = () => {
            if (!this.dataset) return;
            this.handleShareEmbed({
                path: this.dataset.remoteUri(""),
                entry: null,
                scope: 'dataset'
            });
        };

        this._onDownloadLimitReached = (msg) => {
            this.$toast.add({ severity: 'error', summary: 'Download Limit', detail: msg || 'Download limit reached. Please wait for a download to finish before starting a new one.', life: 5000 });
        };

        this._onUploadItems = (msg) => {
            this.filesToUpload = msg.files;
            this.uploadDialogOpen = true;
        };

        // Single rich move handler shared by Explorer / TableView / TreeNode.
        // Lives in useFileOperations mixin (this.handleMoveItem). The dnd mixin
        // dispatches `moveItem` on the event bus; we route every emission to it.
        this._onMoveItemBus = (payload) => {
            // Payload shape: { source, dest } (mitt forwards only one arg).
            if (!payload) return;
            this.handleMoveItem(payload.source, payload.dest);
        };

        emitter.on('openSettings', this._onOpenSettings);
        emitter.on('openShareDataset', this._onOpenShareDataset);
        emitter.on('downloadLimitReached', this._onDownloadLimitReached);
        emitter.on('uploadItems', this._onUploadItems);
        emitter.on('moveItem', this._onMoveItemBus);

        this._onSetActiveBulkDownload = (active) => {
            this.activeBulkDownload = !!active;
        };
        emitter.on('setActiveBulkDownload', this._onSetActiveBulkDownload);
    },
    beforeUnmount: function () {
        document.getElementById("app").classList.remove("fullpage");

        // Remove Delete key listener
        document.removeEventListener('keydown', this.handleKeyDown);

        // Cleanup BuildManager listeners
        BuildManager.off('buildStateChanged', this.handleBuildStateNotification);
        BuildManager.off('buildStarted', this.handleBuildStartedNotification);
        BuildManager.off('buildError', this.handleBuildErrorNotification);
        BuildManager.off('newBuildableFilesDetected', this.handleNewBuildableFilesNotification);

        // Cleanup event bus listeners
        emitter.off('openSettings', this._onOpenSettings);
        emitter.off('openShareDataset', this._onOpenShareDataset);
        emitter.off('downloadLimitReached', this._onDownloadLimitReached);
        emitter.off('uploadItems', this._onUploadItems);
        emitter.off('moveItem', this._onMoveItemBus);
        emitter.off('setActiveBulkDownload', this._onSetActiveBulkDownload);

        // Cleanup BuildManager
        BuildManager.cleanup();
    },
    computed: {
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
                } catch (e) { /* no geo data */ }
            }
            return { name, coords, altitude };
        }
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
                this.showSettings || this.textEditorDialogOpen ||
                this.pasteConflictDialogOpen || this.pasteResultDialogOpen;
            if (anyDialogOpen) return;

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
                if (k === 'v' && this.canWrite) {
                    e.preventDefault();
                    this.clipboardPaste();
                    return;
                }
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

        handlePasteConflictResolve(mode) {
            this.pasteConflictDialogOpen = false;
            const data = this.pasteConflictData;
            this.pasteConflictData = null;
            if (data && typeof data.resolve === 'function') data.resolve(mode);
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
            localStorage.setItem('fileViewMode', mode);
        },

        toggleViewMode() {
            this.switchViewMode(this.viewMode === 'grid' ? 'table' : 'grid');
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

                const entries = await this.dataset.info();

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
                if (e.status === 401) {
                    this.$router.push({ name: "Login" }).catch(() => { });
                } else {
                    this.showError(e, "Dataset");
                }
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

            const t = node.entry.type;
            if (!view) view = OpenItemDefaults[t];

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
                    this.$nextTick(() => {
                        if (this.$refs.mapViewer && this.$refs.mapViewer.openPlantHealth) {
                            this.$refs.mapViewer.openPlantHealth(node, options);
                        }
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
                    const [_, path] = ddb.utils.datasetPathFromUri(node.path);
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
                    shell.openItem(node.path);
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

            const [_, nodePath] = ddb.utils.datasetPathFromUri(node.path);

            this.lightboxSources = imageFiles.map(f => {
                const [__, p] = ddb.utils.datasetPathFromUri(f.path);
                return this.dataset.thumbUrl(p, 1024);
            });

            this.lightboxEntries = imageFiles.map(f => {
                const [__, p] = ddb.utils.datasetPathFromUri(f.path);
                return { path: p, entry: f.entry };
            });

            const idx = imageFiles.findIndex(f => {
                const [__, p] = ddb.utils.datasetPathFromUri(f.path);
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
            const [_, p] = ddb.utils.datasetPathFromUri(node.path);
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
            this.$toast.add({ severity: 'success', summary: 'File Saved', detail: `File saved: ${path}`, life: 3000 });
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
            this.$toast.add({ severity: 'success', summary: 'Build Completed', detail: `Build completed for ${entry.path}. Opening viewer...`, life: 3000 });

            // Automatically open the viewer
            setTimeout(() => {
                const view = OpenItemDefaults[entry.type];
                if (view) {
                    const [_, path] = ddb.utils.datasetPathFromUri(entry.path);
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
                this.$toast.add({
                    severity: 'warn', summary: 'Download in progress',
                    detail: 'A download archive is already being prepared. Please wait for it to complete.',
                    life: 5000
                });
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

            // Authenticated selections over the configured size threshold are
            // offloaded to the async bulk-download task (spec §A.4.1).
            if (reg.isLoggedIn() && this.selectionExceedsAsyncThreshold(files)) {
                await this.startAsyncDownload(paths);
                return;
            }

            try {
                await this.dataset.downloadWithCheck(paths);
            } catch (e) {
                if (e.status === 429) {
                    this.$toast.add({ severity: 'error', summary: 'Download Limit', detail: 'Download limit reached. Please wait for a download to finish before starting a new one.', life: 5000 });
                } else {
                    this.showError(e.message || e, "Download Error");
                }
            }
        },

        // Total selection size vs the async threshold. Unknown sizes (e.g. folders)
        // force the async path for safety (spec §7.3).
        selectionExceedsAsyncThreshold: function (files) {
            const threshold = reg.getFeatureValue(Features.BULK_DOWNLOAD_ASYNC_THRESHOLD_BYTES);
            if (!threshold || threshold <= 0) return false;

            let total = 0;
            for (const f of files) {
                const size = f.entry && typeof f.entry.size === 'number' ? f.entry.size : null;
                if (size == null) return true; // unknown size → async for safety
                total += size;
            }
            return total > threshold;
        },

        startAsyncDownload: async function (paths) {
            if (this.activeBulkDownload) return; // safety guard (should already be blocked)
            try {
                const params = {};
                if (paths && paths.length) params.paths = paths;

                const result = await this.runHeavyTask(this.dataset, 'bulk-download', { params, notify: false });

                const url = this.dataset.taskResultUrl(result.taskId);
                const blob = await this.dataset.registry.makeRequest(url, 'GET', null, null, 'blob');
                const blobUrl = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = blobUrl;
                a.download = `${this.dataset.ds}.zip`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(blobUrl);
            } catch (e) {
                this.showError(e.message || e, "Download Error");
            }
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
    },
    watch: {
        viewMode: function(newMode) {
            // When viewMode changes, rebuild explorerTools to show the correct icon
            this.updateExplorerTools();

            // When switching to grid view, trigger thumbnail loading
            if (newMode === 'grid') {
                this.$nextTick(() => {
                    if (this.$refs.explorer) {
                        this.$refs.explorer.lazyLoadThumbs();
                    }
                });
            }
        },

        fileBrowserFiles: {
            deep: true,
            handler: function (newVal, oldVal) {
                if (!this.$embed)
                    emitter.emit('setSelectedFiles', this.selectedFiles);
            }
        },

        selectedFiles: {
            handler: function () {
                this.updateExplorerTools();
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
