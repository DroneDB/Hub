<template>
    <div id="table-view-container">
        <ContextMenu :items="contextMenu" />
        <Toolbar v-if="tools" :tools="tools" />
        <div v-if="currentPath">
            <PathBreadcrumb :path="currentPath" root-path="/" class="m-3" @navigate="goToPath" />
        </div>
        <!-- A click on the empty area clears the selection, Escape does it from the keyboard -->
        <div id="table-view" ref="tableview" :class="{ dropping }" role="presentation"
             @keydown.esc="clearSelection"
             @drop="explorerDropHandler($event)"
             @dragleave="explorerDragLeave($event)"
             @dragenter="explorerDragEnter($event)"
             @dragover.prevent
             @click="onClick">
            <DataTable :value="sortedFiles" :paginator="false" scrollable scroll-height="flex" size="small"
                       data-key="path" striped-rows
                       :row-class="rowClass"
                       :pt="{ bodyRow: rowPt }"
                       @row-click="onRowClick"
                       @row-dblclick="onRowDblClick"
                       @row-contextmenu="onRowContextMenu">
                <Column header="" style="width: 3rem; text-align: center;">
                    <template #body="{ data }">
                        <i v-if="isBuildLoading(data)" class="fa-solid fa-circle-notch fa-spin loading-icon" />
                        <template v-else-if="expandedGrid">
                            <img v-if="getThumbnail(data)" class="thumb-preview" loading="lazy" decoding="async" :src="getThumbnail(data)" :alt="data.label + ' preview'" @error="onThumbError(data)">
                            <i v-else class="icon" :class="data.icon" />
                        </template>
                        <i v-else class="icon" :class="data.icon" />
                        <i v-if="getBuildBadge(data)" class="icon badge" :class="getBuildBadge(data)" :title="getBuildBadgeTooltip(data)" />
                    </template>
                </Column>
                <Column field="label" style="min-width: 12.5rem;">
                    <template #header>
                        <SortHeader label="Name" column="name" :sort-column="sortColumn" :direction="sortDirection" @sort="sortBy" />
                    </template>
                    <template #body="{ data }">
                        <span class="file-name">{{ data.label }}</span>
                    </template>
                </Column>
                <Column style="width: 7.5rem;" v-bind="columnFrom('md')">
                    <template #header>
                        <SortHeader label="Type" column="type" :sort-column="sortColumn" :direction="sortDirection" @sort="sortBy" />
                    </template>
                    <template #body="{ data }">
                        <span class="file-type">{{ getFileType(data) }}</span>
                    </template>
                </Column>
                <Column style="width: 6.25rem;">
                    <template #header>
                        <SortHeader label="Size" column="size" :sort-column="sortColumn" :direction="sortDirection" @sort="sortBy" />
                    </template>
                    <template #body="{ data }">
                        <span class="file-size">{{ getFileSize(data) }}</span>
                    </template>
                </Column>
                <Column style="width: 12rem" v-bind="columnFrom('lg')">
                    <template #header>
                        <SortHeader label="Modified" column="modified" :sort-column="sortColumn" :direction="sortDirection" @sort="sortBy" />
                    </template>
                    <template #body="{ data }">
                        <div class="file-date">
                            <div>{{ getModifiedDate(data) }}</div>
                            <small v-show="expandedGrid" class="relative-time">{{ getFileModifiedDateRel(data) }}</small>
                        </div>
                    </template>
                </Column>
                <template #empty>
                    <LoadingSpinner v-if="isLoadingFiles" />
                    <div v-else class="text-center p-4">
                        <i class="fa-regular fa-folder-open" style="font-size: 2rem; opacity: 0.5;" />
                        <p class="mt-2">This folder is empty</p>
                    </div>
                </template>
            </DataTable>
        </div>
    </div>
</template>

<script>
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import Toolbar from '@/features/dataset/explorer/HubToolbar.vue';
import Keyboard from '@/libs/keyboard';
import { getFileSizeDisplay, formatModifiedDate, formatModifiedTimeAgo } from '@/libs/propertiesUtils';
import emitter from '@/libs/eventBus';
import { buildStandardContextMenu } from '@/libs/contextMenuItems';
import { isBuildableFile, hasActiveBuild, isBuildLoading, getBuildBadge, getBuildBadgeTooltip } from '@/libs/build/buildHelpers';
import { getTypeDisplayName } from '@/libs/entryTypes';
import { sortFileRows, nextSort } from '@/libs/dataset/fileSort';
import { hasThumbnail } from '@/libs/entryTypeCapabilities';

import ddb from 'ddb';
const { pathutils, entry, thumbs } = ddb;

import ContextMenu from '@/features/dataset/explorer/ContextMenu';
import PathBreadcrumb from '@/components/PathBreadcrumb.vue';
import SortHeader from '@/components/SortHeader.vue';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import { getCurrentInstance } from 'vue';
import { useDragDrop } from '@/composables/useDragDrop';
import { useFileSelection } from '@/composables/useFileSelection';
import { columnFrom } from '@/libs/responsiveColumns';

/**
 * TableView - Flat-list table view for dataset files.
 *
 * Renders dataset entries in a sortable DataTable with multi-selection,
 * drag-and-drop support, and a context menu for file operations.
 */
export default {
    components: {
        LoadingSpinner,
        Toolbar, ContextMenu, PathBreadcrumb, SortHeader, DataTable, Column
    },
    inject: { showBuildConfirm: { default: null } },
    props: {
        files: { type: Array, required: true },
        currentPath: { type: String, default: null },
        tools: { type: Array, default: null },
        dataset: { type: Object, required: true },
        expandedGrid: { type: Boolean, default: false },
        canWrite: { type: Boolean, default: false },
        isLoadingFiles: { type: Boolean, default: false }
    },
    emits: ['openItem', 'openAsText', 'moveSelectedItems', 'openProperties', 'shareEmbed', 'downloadItems', 'transferSelectedItems', 'setAsCover', 'createFolder', 'deleteSelecteditems', 'selectionChanged', 'buildStarted', 'buildError', 'mergeMultispectral', 'maskBorders', 'extractItem', 'setCrs', 'copySelectedItems', 'cutSelectedItems', 'pasteFromClipboard', 'downloadBuildArtifact'],
    setup(props) {
        const instance = getCurrentInstance();
        return {
            ...useDragDrop(props, { selectedFiles: () => instance.proxy.selectedFiles }),
            // Ranges follow the rows as sorted on screen
            selection: useFileSelection(() => instance.proxy.sortedFiles, f => f.path),
            columnFrom
        };
    },
    data: function () {
        const self = this;
        const ctx = {
            getSelectedEntries: () => self.selectedFiles,
            get canWrite() { return self.canWrite; },
            get dataset() { return self.dataset; },
            get showBuildConfirm() { return self.showBuildConfirm; },
            emit: (...args) => self.$emit(...args),
            onSelectAllNone: () => {
                if (self.selectedFiles.length === self.files.length) {
                    self.deselectAll();
                } else {
                    self.selectAll();
                }
            },
            component: self
        };

        let contextMenu = buildStandardContextMenu(ctx);

        return {
            loading: false,
            contextMenu,
            sortColumn: 'name',
            sortDirection: 'asc',
            thumbnailCache: new Map(), // path -> thumbnail URL, or null if unsupported/unavailable
            // Paths whose thumbnail failed to load (e.g. build artifact missing).
            // Component-scoped (cleared on mount / dataset switch) so failures
            // stick for this list without cross-dataset poisoning (Fix 1 Q7).
            failedThumbs: new Set()
        };
    },
    computed: {
        selectedFiles: function () {
            return this.files.filter(f => f.selected);
        },
        sortedFiles: function() {
            return sortFileRows(this.files, this.sortColumn, this.sortDirection);
        },
        // Row events find their file by the row's position (the header is row 0)
        rowPt: function () {
            const fileOf = e => {
                const row = e.target.closest('tr');
                return row ? this.sortedFiles[row.rowIndex - 1] : undefined;
            };
            return {
                tabindex: 0,
                // Enter opens, Space selects (with Shift/Ctrl like a click)
                onKeydown: e => {
                    if (e.target.tagName !== 'TR') return;
                    const file = fileOf(e);
                    if (!file) return;
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        this.handleOpen(file);
                    } else if (e.key === ' ') {
                        e.preventDefault();
                        this.handleSelection(e, file);
                    }
                },
                onDragstart: e => {
                    const file = fileOf(e);
                    if (file) this.startDrag(e, file);
                },
                onDrop: e => {
                    const file = fileOf(e);
                    if (file) this.onDrop(e, file);
                },
                onDragenter: e => {
                    const file = fileOf(e);
                    if (file) this.itemDragEnter(e, file);
                    else e.preventDefault();
                },
                onDragover: e => {
                    const file = fileOf(e);
                    if (file) this.itemDragOver(e, file);
                    else e.preventDefault();
                },
                onDragleave: e => {
                    const file = fileOf(e);
                    if (file) this.itemDragLeave(e, file);
                },
                draggable: this.canWrite
            };
        }
    },
    watch: {
        files: {
            handler() {
                // Reset loading state when files change (folder opened)
                this.loading = false;
                if (this.expandedGrid) this.prepareThumbnails();
            }
        },
        expandedGrid: {
            handler(enabled) {
                if (enabled) this.prepareThumbnails();
                else this.thumbnailCache.clear();
            },
            immediate: true
        },
        dataset: {
            handler() {
                // Dataset switch: reset the failed set so entries heal on the new dataset.
                this.failedThumbs.clear();
            }
        }
    },
    mounted: function () {
        // Failed-thumbnail tracking is component-scoped: fresh set per mount.
        this.failedThumbs.clear();
    },
    methods: {
        rowClass(data) {
            const classes = [];
            if (data.selected) classes.push('row-selected');
            if (data.entry && this.dropTargetPath === data.entry.path) classes.push('drop-target');
            return classes.join(' ');
        },

        onRowClick(event) {
            this.handleSelection(event.originalEvent, event.data);
        },

        onRowDblClick(event) {
            this.handleOpen(event.data);
        },

        onRowContextMenu(event) {
            this.handleRightClick(event.originalEvent, event.data);
        },

        goToPath: function (path) {
            emitter.emit("folderOpened", pathutils.getTree(path));
        },

        // startDrag, onDrop and explorerDropHandler come from useDragDrop() (setup)

        onClick: function (e) {
            // Clicked an empty area (DataTable wrapper or empty body)
            const target = e.target;
            if (target.id === 'table-view' || target.closest('.p-datatable-empty-message') || (!target.closest('tr') && target.closest('.p-datatable'))) {
                this.clearSelection();
            }
        },

        selectAll: function () {
            this.selection.selectAll();
            this.applySelection();
        },

        deselectAll: function () {
            this.selection.clear();
            this.applySelection();
        },

        clearSelection: function () {
            this.deselectAll();
        },

        // The explorer items carry the selection (the map and the file grid share them)
        applySelection: function () {
            this.files.forEach(f => { f.selected = this.selection.has(f); });
        },

        select: function (file, mods) {
            this.selection.load(this.selectedFiles);
            this.selection.toggle(this.sortedFiles.indexOf(file), mods);
            this.applySelection();
        },

        handleOpen: async function (file) {
            if (entry.isDirectory(file.entry)) {
                this.loading = true;
                emitter.emit("folderOpened", pathutils.getTree(file.entry.path));
            } else {
                this.$emit('openItem', file);
            }
        },

        handleSelection: function (evt, file) {
            Keyboard.updateState(evt);
            this.select(file, { shift: Keyboard.isShiftPressed(), ctrl: Keyboard.isCtrlPressed() });
            this.$emit('selectionChanged', file);
        },

        handleRightClick: function (evt, file) {
            Keyboard.updateState(evt);
            this.select(file, { right: true });
        },

        sortBy: function(column) {
            const next = nextSort(this.sortColumn, this.sortDirection, column);
            this.sortColumn = next.column;
            this.sortDirection = next.direction;
        },

        getFileType: function(file) {
            return getTypeDisplayName(file.entry.type);
        },

        getFileSize: function(file) {
            return getFileSizeDisplay(file.entry);
        },

        getModifiedDate: function(file) {
            return formatModifiedDate(file.entry.mtime);
        },

        getFileModifiedDateRel: function(file) {
            return formatModifiedTimeAgo(file.entry.mtime);
        },

        // Returns the cached thumbnail URL for a file, or null if unsupported/not yet available
        getThumbnail: function(file) {
            const cached = this.thumbnailCache.get(file.entry.path);
            return cached || null;
        },

        // Thumbnail failed to load (e.g. build not ready) - fall back to icon and
        // remember the path so the next prepareThumbnails() does not re-add the
        // same failing URL (avoids an unbounded retry loop on scroll).
        onThumbError: function(file) {
            this.failedThumbs.add(file.entry.path);
            this.thumbnailCache.delete(file.entry.path);
        },

        // Populate thumbnail URLs for the current file list (synchronous URL construction for ddb:// paths)
        prepareThumbnails: function() {
            this.thumbnailCache.clear();
            if (!this.files) return;

            for (const file of this.files) {
                if (!hasThumbnail(file.entry.type)) continue;
                // Skip paths whose thumbnail already failed in this component
                // instance; they heal on remount / dataset switch.
                if (this.failedThumbs.has(file.entry.path)) continue;
                try {
                    this.thumbnailCache.set(file.entry.path, thumbs.fetch(file.path, 48, file.entry.hash));
                } catch {
                    // Unsupported URI scheme or fetch error - fall back to icon
                }
            }
        },

        // Build management methods (delegated to shared helpers)
        isBuildableFile: function(file) {
            return isBuildableFile(this.dataset, file);
        },

        hasActiveBuild: function(file) {
            return hasActiveBuild(this.dataset, file);
        },

        isBuildLoading: function(file) {
            return isBuildLoading(this.dataset, file);
        },

        getBuildBadge: function(file) {
            return getBuildBadge(this.dataset, file);
        },

        getBuildBadgeTooltip: function(file) {
            return getBuildBadgeTooltip(this.dataset, file);
        },

        onTabActivated: function () {
            // Called when the tab becomes active
            // Currently no specific action needed for table view
        },

        onPanelResized: function () {
            // Called when the panel is resized
            // Currently no specific action needed for table view
        }
    }
}
</script>

<style scoped>
#table-view-container {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
}

#table-view {
    width: 100%;
    height: 100%;
    overflow-y: auto;
    user-select: none;
    flex: 1;
    min-height: 0;
}

#table-view.dropping {
    background-color: var(--ddb-bg-hover);
    box-shadow: inset 0 0 var(--ddb-spacing-sm) var(--ddb-spacing-xs) var(--ddb-text-muted);
    cursor: copy;
}

#table-view :deep(.p-datatable) {
    .p-datatable-header-cell {
        user-select: none;
    }

    .p-datatable-row-action {
        cursor: pointer;
    }


    tr {
        cursor: pointer;
    }

    tr:focus-visible {
        outline: 2px solid var(--ddb-primary);
        outline-offset: -2px;
    }

    tr.row-selected {
        background-color: var(--ddb-selected-bg) !important;

        &:hover {
            background-color: var(--ddb-selected-active-bg) !important;
        }
    }

    tr.drop-target > td {
        outline: 2px dashed var(--ddb-primary);
        outline-offset: -2px;
        background-color: var(--ddb-bg-hover) !important;
    }

    .loading-icon {
        color: var(--ddb-text-muted);
    }

    .thumb-preview {
        width: 48px;
        height: 48px;
        object-fit: cover;
        border-radius: 4px;
        display: block;
        margin: 0 auto;
    }

    .file-name {
        overflow-wrap: anywhere;
    }

    /* A sort header is a tap target */
    .sort-header {
        min-height: 2rem;
    }

    .file-size, .file-date {
        text-align: right;
        display: block;
    }

    .file-size {
        white-space: nowrap;
    }

    .file-date {
        white-space: nowrap;
    }

    .file-date .relative-time {
        font-size: 0.75rem;
        color: var(--ddb-text-muted);
        display: block;
    }
}
</style>
