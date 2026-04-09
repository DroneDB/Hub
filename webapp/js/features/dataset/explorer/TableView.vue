<template>
    <div id="table-view-container">
        <ContextMenu :items="contextMenu" />
        <Toolbar :tools="tools" v-if="tools" />
        <div v-if="currentPath">
            <Breadcrumb :home="breadcrumbHome" :model="breadcrumbItems" class="m-3">
                <template #item="{ item }">
                    <a v-if="item.command" class="bc-link" @click="item.command()">
                        <i v-if="item.icon" :class="item.icon"></i>
                        <template v-else>{{ item.label }}</template>
                    </a>
                    <span v-else class="bc-active">{{ item.label }}</span>
                </template>
                <template #separator> / </template>
            </Breadcrumb>
            <!--<div class="ui divider"></div>-->
        </div>
        <div ref="tableview" id="table-view" :class="{ dropping }"
            @drop="explorerDropHandler($event)"
            @dragleave="explorerDragLeave($event)"
            @dragenter="explorerDragEnter($event)"
            @dragover.prevent
            @click="onClick">
            <DataTable :value="sortedFiles" :paginator="false" scrollable scrollHeight="flex" size="small"
                dataKey="path" stripedRows
                :rowClass="rowClass"
                :pt="{ bodyRow: rowPt }"
                @row-click="onRowClick"
                @row-dblclick="onRowDblClick"
                @row-contextmenu="onRowContextMenu">
                <Column header="" style="width: 3rem; text-align: center;">
                    <template #body="{ data }">
                        <i v-if="!isBuildLoading(data)" class="icon" :class="data.icon"></i>
                        <i v-else class="fa-solid fa-circle-notch fa-spin loading-icon"></i>
                        <i v-if="getBuildBadge(data)" class="icon badge" :class="getBuildBadge(data)"></i>
                    </template>
                </Column>
                <Column field="label" style="min-width: 12.5rem;">
                    <template #header>
                        <span @click="sortBy('name')" class="sortable-header">
                            Name
                            <i v-if="sortColumn === 'name'" class="fa-solid" :class="sortDirection === 'asc' ? 'fa-angle-up' : 'fa-angle-down'"></i>
                        </span>
                    </template>
                    <template #body="{ data }">
                        <span class="file-name">{{ data.label }}</span>
                    </template>
                </Column>
                <Column style="width: 7.5rem;">
                    <template #header>
                        <span @click="sortBy('type')" class="sortable-header">
                            Type
                            <i v-if="sortColumn === 'type'" class="fa-solid" :class="sortDirection === 'asc' ? 'fa-angle-up' : 'fa-angle-down'"></i>
                        </span>
                    </template>
                    <template #body="{ data }">
                        <span class="file-type">{{ getFileType(data) }}</span>
                    </template>
                </Column>
                <Column style="width: 6.25rem;">
                    <template #header>
                        <span @click="sortBy('size')" class="sortable-header">
                            Size
                            <i v-if="sortColumn === 'size'" class="fa-solid" :class="sortDirection === 'asc' ? 'fa-angle-up' : 'fa-angle-down'"></i>
                        </span>
                    </template>
                    <template #body="{ data }">
                        <span class="file-size">{{ getFileSize(data) }}</span>
                    </template>
                </Column>
                <Column style="width: 12rem">
                    <template #header>
                        <span @click="sortBy('modified')" class="sortable-header">
                            Modified
                            <i v-if="sortColumn === 'modified'" class="fa-solid" :class="sortDirection === 'asc' ? 'fa-angle-up' : 'fa-angle-down'"></i>
                        </span>
                    </template>
                    <template #body="{ data }">
                        <span class="file-date">{{ getModifiedDate(data) }}</span>
                    </template>
                </Column>
                <template #empty>
                    <div v-if="isLoadingFiles" class="text-center p-4">
                        <i class="fa-solid fa-circle-notch fa-spin"></i>
                    </div>
                    <div v-else class="text-center p-4">
                        <i class="fa-regular fa-folder-open" style="font-size: 2rem; opacity: 0.5;"></i>
                        <p class="mt-2">This folder is empty</p>
                    </div>
                </template>
            </DataTable>
        </div>
    </div>
</template>

<script>
import Toolbar from '@/components/Toolbar.vue';
import Keyboard from '@/libs/keyboard';
import Mouse from '@/libs/mouse';
import { clone } from '@/libs/utils';
import { isInternalDrag, dragDropMixin } from '@/libs/dragDropUtils';
import emitter from '@/libs/eventBus';
import { buildStandardContextMenu } from '@/libs/contextMenuItems';
import { isBuildableFile, hasActiveBuild, isBuildLoading, getBuildBadge, buildFile } from '@/libs/build/buildHelpers';
import { getTypeDisplayName } from '@/libs/entryTypes';
import { formatFileSize } from '@/libs/textFileUtils';

import ddb from 'ddb';
const { pathutils, entry } = ddb;

import ContextMenu from '@/components/ContextMenu';
import Breadcrumb from 'primevue/breadcrumb';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';

export default {
    mixins: [dragDropMixin],
    components: {
        Toolbar, ContextMenu, Breadcrumb, DataTable, Column
    },
    emits: ['openItem', 'openAsText', 'moveSelectedItems', 'openProperties', 'shareEmbed', 'downloadItems', 'transferSelectedItems', 'setAsCover', 'createFolder', 'deleteSelecteditems', 'moveItem', 'selectionChanged', 'buildStarted', 'buildError', 'mergeMultispectral'],
    props: ['files', 'currentPath', 'tools', 'dataset', 'viewMode', 'canWrite', 'isLoadingFiles'],
    data: function () {
        const self = this;
        const ctx = {
            getSelectedEntries: () => self.selectedFiles,
            get canWrite() { return self.canWrite; },
            get dataset() { return self.dataset; },
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
            dropping: false,
            contextMenu,
            sortColumn: 'name',
            sortDirection: 'asc',
            rangeStartIdx: null
        };
    },
    watch: {
        files: {
            handler() {
                // Reset loading state when files change (folder opened)
                this.loading = false;
            }
        }
    },
    computed: {
        selectedFiles: function () {
            return this.files.filter(f => f.selected);
        },
        breadcrumbs: function () {
            if (this.currentPath == null || this.currentPath.length == 0) return null;

            var folders = this.currentPath.split('/');
            var cur = "";
            var bc = [];

            for (var el of folders) {
                cur += '/' + el;

                bc.push({
                    path: cur.substring(1),
                    name: el
                });
            }

            if (bc.length > 0) {
                bc.unshift({
                    path: "/",
                    name: "~"
                })
            }

            return bc;
        },
        breadcrumbHome: function () {
            if (!this.breadcrumbs || this.breadcrumbs.length === 0) return null;
            const home = this.breadcrumbs[0];
            return {
                icon: 'fa-solid fa-home',
                command: () => this.goTo(home)
            };
        },
        breadcrumbItems: function () {
            if (!this.breadcrumbs || this.breadcrumbs.length <= 1) return [];
            return this.breadcrumbs.slice(1).map((b, idx, arr) => {
                if (idx < arr.length - 1) {
                    return { label: b.name, command: () => this.goTo(b) };
                }
                return { label: b.name };
            });
        },
        sortedFiles: function() {
            const sorted = [...this.files];

            sorted.sort((a, b) => {
                // Folders first
                let aDir = ddb.entry.isDirectory(a.entry);
                let bDir = ddb.entry.isDirectory(b.entry);

                if (aDir && !bDir) return -1;
                else if (!aDir && bDir) return 1;

                // Then sort by column
                let result = 0;
                switch(this.sortColumn) {
                    case 'name':
                        result = a.label.toLowerCase().localeCompare(b.label.toLowerCase());
                        break;
                    case 'type':
                        result = this.getFileType(a).localeCompare(this.getFileType(b));
                        break;
                    case 'size':
                        const sizeA = a.entry.size || 0;
                        const sizeB = b.entry.size || 0;
                        result = sizeA - sizeB;
                        break;
                    case 'modified':
                        const modA = a.entry.mtime || 0;
                        const modB = b.entry.mtime || 0;
                        result = modA - modB;
                        break;
                }

                return this.sortDirection === 'asc' ? result : -result;
            });

            return sorted;
        },
        rowPt: function () {
            const self = this;
            return {
                onDragstart(e) {
                    const row = e.target.closest('tr');
                    if (!row) return;
                    const idx = row.rowIndex - 1; // account for header row
                    const file = self.sortedFiles[idx];
                    if (file) self.startDrag(e, file);
                },
                onDrop(e) {
                    e.stopPropagation();
                    const row = e.target.closest('tr');
                    if (!row) return;
                    const idx = row.rowIndex - 1;
                    const file = self.sortedFiles[idx];
                    if (file) self.onDrop(e, file);
                },
                onDragenter(e) { e.preventDefault(); },
                onDragover(e) { e.preventDefault(); },
                onMousedown(e) { e.preventDefault(); },
                draggable: true
            };
        }
    },
    methods: {
        rowClass(data) {
            return data.selected ? 'row-selected' : '';
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

        goTo: function (itm) {
            emitter.emit("folderOpened", pathutils.getTree(itm.path));
        },

        startDrag: (evt, item) => {
            evt.dataTransfer.dropEffect = 'move';
            evt.dataTransfer.effectAllowed = 'move';

            evt.dataTransfer.setData('item', JSON.stringify(clone(item)));
        },

        onDrop(evt, item) {
            this.dropping = false;

            // If this is a drop from the OS (not an internal drag), delegate to upload handler
            if (!isInternalDrag(evt)) {
                this.explorerDropHandler(evt);
                return;
            }

            // Check if user has write permission
            if (!this.canWrite) return;

            if (entry.isDirectory(item.entry)) {
                const destFolder = item.entry.path;
                const sourceItem = JSON.parse(evt.dataTransfer.getData('item'));
                this.drop(sourceItem, destFolder);

                this.selectedFiles.forEach(selItem => {
                    if (selItem.entry.path == sourceItem.entry.path) return;
                    this.drop(selItem, destFolder);
                });
            }
        },

        drop(sourceItem, destFolder) {
            if (entry.isDirectory(sourceItem.entry) && (destFolder + '/').startsWith(sourceItem.entry.path + '/')) {
                console.log("Cannot copy a folder on itself or one of its descendants");
                return;
            }

            const destPath = pathutils.join(destFolder, pathutils.basename(sourceItem.entry.path));
            this.$emit('moveItem', sourceItem, destPath);
        },

        onClick: function (e) {
            // Clicked an empty area (DataTable wrapper or empty body)
            const target = e.target;
            if (target.id === 'table-view' || target.closest('.p-datatable-empty-message') || (!target.closest('tr') && target.closest('.p-datatable'))) {
                this.clearSelection();
            }
        },

        selectAll: function () {
            this.files.forEach(f => f.selected = true);
        },

        deselectAll: function () {
            this.files.forEach(f => f.selected = false);
        },

        clearSelection: function () {
            this.files.forEach(f => f.selected = false);
            this.rangeStartIdx = null;
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

            const idx = this.sortedFiles.indexOf(file);

            if (Keyboard.isShiftPressed() && this.selectedFiles.length > 0 && this.rangeStartIdx !== null) {
                // Range selection
                this.selectedFiles.forEach(f => f.selected = false);
                this.selectRange(this.rangeStartIdx, idx);
                return;
            } else if (Keyboard.isCtrlPressed()) {
                // Toggle selection
                file.selected = !file.selected;
                if (file.selected) this.rangeStartIdx = idx;
            } else {
                // Single selection
                this.selectedFiles.forEach(f => f.selected = false);
                file.selected = true;
                this.rangeStartIdx = idx;
            }

            // Emit selection changed event
            this.$emit('selectionChanged', file);
        },

        handleRightClick: function (evt, file) {
            Keyboard.updateState(evt);

            // If right-clicking on an unselected item, select only that item
            if (!file.selected) {
                this.selectedFiles.forEach(f => f.selected = false);
                file.selected = true;
            }
        },

        selectRange: function (startIdx, endIdx) {
            const [low, high] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];

            for (let i = low; i <= high; i++) {
                this.sortedFiles[i].selected = true;
            }
        },

        sortBy: function(column) {
            if (this.sortColumn === column) {
                this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                this.sortColumn = column;
                this.sortDirection = 'asc';
            }
        },

        getFileType: function(file) {
            return getTypeDisplayName(file.entry.type);
        },

        getFileSize: function(file) {
            if (entry.isDirectory(file.entry)) return '';
            if (!file.entry.size) return '';
            return formatFileSize(file.entry.size);
        },

        getModifiedDate: function(file) {
            if (!file.entry.mtime) return '--';

            const date = new Date(file.entry.mtime * 1000);
            return date.toLocaleString();
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

        buildSelectedFile: async function() {
            if (this.selectedFiles.length !== 1) return;
            const file = this.selectedFiles[0];
            try {
                await buildFile(this.dataset, file);
            } catch (error) {
                this.$emit('buildError', { file, error: error.message });
            }
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

    :deep(.p-breadcrumb) {
        background: transparent;
        border: none;
        padding: 0;
        font-size: 1rem;

        .p-breadcrumb-separator {
            color: var(--ddb-text-muted);
            margin: 0 0.25rem;
        }
    }

    .bc-link {
        color: var(--ddb-link);
        cursor: pointer;
        text-decoration: none;

        &:hover {
            text-decoration: underline;
        }
    }

    .bc-active {
        color: inherit;
        font-weight: 600;
    }
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

    .sortable-header {
        cursor: pointer;
        user-select: none;
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;

        &:hover {
            color: var(--ddb-primary);
        }
    }

    tr {
        cursor: pointer;
    }

    tr.row-selected {
        background-color: var(--ddb-selected-bg) !important;

        &:hover {
            background-color: var(--ddb-selected-active-bg) !important;
        }
    }

    .icon-column i.icon {
        margin: 0;
    }

    .icon-column i.icon.badge {
        margin-left: var(--ddb-spacing-xs);
        font-size: var(--ddb-font-size-base);
    }

    .loading-icon {
        color: var(--ddb-text-muted);
    }

    .file-name {
        word-break: break-all;
    }

    .file-size, .file-date {
        text-align: right;
        display: block;
    }

    .file-date {
        white-space: nowrap;
    }
}
</style>
