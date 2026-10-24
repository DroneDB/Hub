<template>
    <Window id="folderPicker" :title="title" modal fixed-size max-width="80%" @close="handleClose">
        <div v-if="currentPath" class="folder-picker-breadcrumb mt-3 ms-3">
            <PathBreadcrumb :path="currentPath" @navigate="navigateTo" />
        </div>

        <div class="folder-picker-body">
            <LoadingSpinner v-if="loading" />
            <div v-else-if="sortedFiles.length === 0" class="text-center p-4">
                <i class="fa-regular fa-folder-open" style="font-size: 2rem; opacity: 0.5;" />
                <p class="mt-2">This folder is empty</p>
            </div>
            <DataTable v-else :value="sortedFiles" :paginator="false" scrollable scroll-height="flex"
                       size="small" data-key="path" striped-rows :row-class="rowClass"
                       @row-click="onRowClick" @row-dblclick="onRowDblClick">
                <Column header="" style="width: 3rem; text-align: center;">
                    <template #body="{ data }">
                        <i class="icon" :class="data.icon"
                           :style="!canSelect(data) ? 'opacity: 0.4;' : ''" />
                    </template>
                </Column>
                <Column field="label" style="min-width: 12.5rem;">
                    <template #header>
                        <SortHeader label="Name" column="name" :sort-column="sortColumn" :direction="sortDirection" @sort="sortBy" />
                    </template>
                    <template #body="{ data }">
                        <span class="file-name" :style="!canSelect(data) ? 'opacity: 0.4;' : ''">{{ data.label }}</span>
                    </template>
                </Column>
                <Column style="width: 7.5rem;">
                    <template #header>
                        <SortHeader label="Type" column="type" :sort-column="sortColumn" :direction="sortDirection" @sort="sortBy" />
                    </template>
                    <template #body="{ data }">
                        <span class="file-type" :style="!canSelect(data) ? 'opacity: 0.4;' : ''">{{ getFileType(data) }}</span>
                    </template>
                </Column>
                <Column style="width: 6.25rem;">
                    <template #header>
                        <SortHeader label="Size" column="size" :sort-column="sortColumn" :direction="sortDirection" @sort="sortBy" />
                    </template>
                    <template #body="{ data }">
                        <span class="file-size" :style="!canSelect(data) ? 'opacity: 0.4;' : ''">{{ getFileSize(data) }}</span>
                    </template>
                </Column>
                <Column style="width: 12rem">
                    <template #header>
                        <SortHeader label="Modified" column="modified" :sort-column="sortColumn" :direction="sortDirection" @sort="sortBy" />
                    </template>
                    <template #body="{ data }">
                        <span class="file-date" :style="!canSelect(data) ? 'opacity: 0.4;' : ''">{{ getModifiedDate(data) }}</span>
                    </template>
                </Column>
            </DataTable>
        </div>

        <PrimeMessage v-if="errorMessage" severity="error" :closable="false" class="mt-2">
            {{ errorMessage }}
        </PrimeMessage>

        <div class="folder-picker-selected">
            <span class="folder-picker-selected-label">{{ mode === 'file' ? 'Selected file:' : 'Selected folder:' }}</span>
            <InputText v-model="selectedPath" class="folder-picker-selected-input"
                       :aria-label="mode === 'file' ? 'Selected file' : 'Selected folder'"
                       :placeholder="selectedPathPlaceholder" @keyup.enter="onConfirm" />
        </div>

        <div class="folder-picker-new-folder">
            <span class="folder-picker-new-folder-label">New folder:</span>
            <InputText ref="newFolderInput" v-model="newFolderName" aria-label="New folder name"
                       class="folder-picker-new-folder-input" :disabled="creatingFolder"
                       placeholder="Folder name" @keyup.enter="createFolder" />
            <Button :disabled="!newFolderName || creatingFolder" :loading="creatingFolder"
                    severity="secondary" label="Create" size="small" @click="createFolder" />
        </div>

        <template #footer>
            <Button severity="secondary" label="Cancel" @click="close('cancel')" />
            <Button :disabled="!canConfirm || checkingPath" :loading="checkingPath"
                    severity="primary" label="Confirm" @click="onConfirm" />
        </template>

        <ConfirmDialog v-if="confirmCreateOpen"
                       title="Folder does not exist"
                       :message="createFolderMessage"
                       confirm-text="Create" cancel-text="Cancel" confirm-button-class="primary"
                       @close="handleCreateConfirmClose" />
    </Window>
</template>

<script>
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import Window from '@/components/HubWindow.vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import PathBreadcrumb from '@/components/PathBreadcrumb.vue';
import SortHeader from '@/components/SortHeader.vue';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import PrimeMessage from 'primevue/message';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import ddb from 'ddb';
import icons from '@/libs/icons';
import { getTypeDisplayName } from '@/libs/entryTypes';
import { sortFileRows, nextSort } from '@/libs/dataset/fileSort';
import { getFileSizeDisplay, formatModifiedDate } from '@/libs/propertiesUtils';

const { pathutils, entry } = ddb;

/**
 * FolderPicker - Modal dialog for browsing and selecting a folder or file from a dataset.
 *
 * Displays a table view of entries with breadcrumb navigation, inline folder creation,
 * and configurable selection mode (folder only, file only, or both).
 *
 * Props:
 *   dataset     - Dataset object with list() and createFolder() methods (required).
 *   mode        - Selection mode: 'folder', 'file', or 'any' (default: 'folder').
 *   initialPath - Starting folder path within the dataset (default: '').
 *   title       - Dialog title (default: 'Select folder').
 *
 * Emits:
 *   close - Emitted on confirm with { path, entry } or on cancel with null.
 *
 * Usage example:
 *   <FolderPicker v-if="pickerOpen" :dataset="dataset" mode="folder"
 *     :initialPath="currentPath" @close="handlePickerClose" />
 */
export default {
    components: {
        LoadingSpinner,
        Window, Button, InputText, PathBreadcrumb, SortHeader, DataTable, Column, PrimeMessage, ConfirmDialog
    },

    props: {
        dataset: {
            type: Object,
            required: true
        },
        mode: {
            type: String,
            default: 'folder',
            validator: (val) => ['folder', 'file', 'any'].includes(val)
        },
        initialPath: {
            type: String,
            default: ''
        },
        title: {
            type: String,
            default: 'Select folder'
        }
    },

    emits: ['close'],

    data: function () {
        return {
            currentPath: this.normalizePath(this.initialPath),
            selectedPath: this.normalizePath(this.initialPath),
            files: [],
            selectedFile: null,
            loading: false,
            creatingFolder: false,
            checkingPath: false,
            newFolderName: '',
            errorMessage: null,
            confirmCreateOpen: false,
            pendingCreatePath: '',
            sortColumn: 'name',
            sortDirection: 'asc'
        };
    },

    computed: {
        canConfirm: function () {
            // File mode needs an explicit path; folder/any allow the dataset root (empty).
            if (this.mode === 'file') {
                return !!this.selectedPath && this.selectedPath.trim().length > 0;
            }
            return true;
        },
        selectedPathPlaceholder: function () {
            return this.mode === 'file'
                ? 'Select or type a file path'
                : 'Select or type a folder path (empty = dataset root)';
        },
        createFolderMessage: function () {
            return `The folder <strong>${this.pendingCreatePath}</strong> does not exist. Do you want to create it?`;
        },
        sortedFiles: function () {
            return sortFileRows(this.files, this.sortColumn, this.sortDirection);
        }
    },

    mounted: function () {
        this.loadEntries();
    },

    methods: {
        loadEntries: async function () {
            this.loading = true;
            this.errorMessage = null;
            this.selectedFile = null;

            try {
                const entries = await this.dataset.list(this.currentPath || null);
                this.files = entries.map((e) => ({
                    label: pathutils.basename(e.path),
                    icon: icons.getForType(e.type, e.path),
                    entry: e,
                    selected: false
                }));
            } catch (e) {
                this.errorMessage = e.message || 'Failed to load folder contents';
            }

            this.loading = false;
        },

        navigateTo: function (path) {
            this.currentPath = this.normalizePath(path);
            // For folder selection, browsing into a folder makes it the default
            // selection so the user can simply confirm the folder they're viewing.
            if (this.mode !== 'file') {
                this.selectedPath = this.currentPath;
            }
            this.loadEntries();
        },

        normalizePath: function (path) {
            if (!path || path === '/' || path === '\\') return '';
            // Strip leading and trailing slashes
            return path.replace(/^\/+|\/+$/g, '');
        },

        onRowClick: function (event) {
            const file = event.data;
            if (!this.canSelect(file)) return;

            // Deselect previous
            if (this.selectedFile) {
                this.selectedFile.selected = false;
            }

            this.selectedFile = file;
            file.selected = true;
            this.selectedPath = this.normalizePath(file.entry.path);
        },

        onRowDblClick: function (event) {
            const file = event.data;

            if (entry.isDirectory(file.entry)) {
                this.navigateTo(file.entry.path);
            } else if (this.mode === 'file' || this.mode === 'any') {
                this.selectedFile = file;
                file.selected = true;
                this.selectedPath = this.normalizePath(file.entry.path);
                this.emitConfirm(this.selectedPath);
            }
        },

        // Verifies whether the given dataset-relative path exists (as the right
        // kind of entry for the current mode). The dataset root always exists.
        checkPathExists: async function (rawPath) {
            const normalized = this.normalizePath(rawPath);
            if (!normalized) return true;

            const parent = pathutils.getParentFolder(normalized) || '';
            const base = pathutils.basename(normalized);

            const entries = await this.dataset.list(parent || null);
            return entries.some((e) => {
                if (pathutils.basename(e.path) !== base) return false;
                const isDir = entry.isDirectory(e);
                if (this.mode === 'file') return !isDir;
                if (this.mode === 'folder') return isDir;
                return true;
            });
        },

        // Confirm handler: validates the typed/selected path exists; for folder
        // modes it offers to create the folder when it is missing.
        onConfirm: async function () {
            const normalized = this.normalizePath(this.selectedPath);
            this.selectedPath = normalized;
            this.errorMessage = null;

            if (!normalized && this.mode === 'file') {
                this.errorMessage = 'Please select a file.';
                return;
            }

            this.checkingPath = true;
            try {
                const exists = await this.checkPathExists(normalized);
                if (exists) {
                    this.emitConfirm(normalized);
                    return;
                }
                if (this.mode === 'folder' || this.mode === 'any') {
                    this.pendingCreatePath = normalized;
                    this.confirmCreateOpen = true;
                } else {
                    this.errorMessage = `The file "${normalized}" does not exist.`;
                }
            } catch (e) {
                this.errorMessage = e.message || 'Failed to verify the path.';
            } finally {
                this.checkingPath = false;
            }
        },

        handleCreateConfirmClose: async function (buttonId) {
            this.confirmCreateOpen = false;
            const path = this.pendingCreatePath;
            this.pendingCreatePath = '';
            if (buttonId !== 'confirm' || !path) return;

            this.creatingFolder = true;
            this.errorMessage = null;
            try {
                await this.dataset.createFolder(path);
                this.emitConfirm(path);
            } catch (e) {
                this.errorMessage = e.message || 'Failed to create the folder.';
            } finally {
                this.creatingFolder = false;
            }
        },

        emitConfirm: function (path) {
            this.$emit('close', { path: this.normalizePath(path), entry: null });
        },

        canSelect: function (file) {
            if (!file) return false;
            if (this.mode === 'any') return true;
            if (this.mode === 'folder') return entry.isDirectory(file.entry);
            if (this.mode === 'file') return !entry.isDirectory(file.entry);
            return false;
        },

        rowClass: function (data) {
            const classes = [];
            if (data.selected) classes.push('row-selected');
            if (!this.canSelect(data)) classes.push('row-disabled');
            return classes.join(' ');
        },

        sortBy: function (column) {
            const next = nextSort(this.sortColumn, this.sortDirection, column);
            this.sortColumn = next.column;
            this.sortDirection = next.direction;
        },

        getFileType: function (file) {
            return getTypeDisplayName(file.entry.type);
        },

        getFileSize: function (file) {
            return getFileSizeDisplay(file.entry);
        },

        getModifiedDate: function (file) {
            return formatModifiedDate(file.entry.mtime);
        },

        createFolder: async function () {
            if (!this.newFolderName || this.creatingFolder) return;

            this.creatingFolder = true;
            this.errorMessage = null;

            try {
                const folderPath = this.currentPath
                    ? this.currentPath + '/' + this.newFolderName
                    : this.newFolderName;

                await this.dataset.createFolder(folderPath);
                this.newFolderName = '';
                await this.loadEntries();
            } catch (e) {
                this.errorMessage = e.message || 'Failed to create folder';
            }

            this.creatingFolder = false;
        },

        close: function (action) {
            if (action === 'confirm' && this.selectedFile && this.canSelect(this.selectedFile)) {
                this.$emit('close', {
                    path: this.selectedFile.entry.path,
                    entry: this.selectedFile.entry
                });
            } else {
                this.$emit('close', null);
            }
        },

        handleClose: function (action) {
            this.close(action || 'cancel');
        }
    }
};
</script>

<style scoped>
.folder-picker-breadcrumb {
    padding: 0.5rem 0;
}

.folder-picker-body {
    height: 300px;
    min-height: 200px;
}

.folder-picker-new-folder {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.75rem;
}

.folder-picker-new-folder-label {
    font-size: 0.875rem;
    font-weight: 600;
    white-space: nowrap;
}

.folder-picker-new-folder-input {
    flex: 1;
}

.folder-picker-selected {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.75rem;
}

.folder-picker-selected-label {
    font-size: 0.875rem;
    font-weight: 600;
    white-space: nowrap;
}

.folder-picker-selected-input {
    flex: 1;
}

.row-disabled {
    opacity: 0.4;
    cursor: not-allowed !important;
}

/* Highlight the currently selected folder/file row. */
.folder-picker-body :deep(tr.row-selected),
.folder-picker-body :deep(tr.row-selected > td) {
    background-color: var(--ddb-selected-bg) !important;
}

.folder-picker-body :deep(tr.row-selected:hover),
.folder-picker-body :deep(tr.row-selected:hover > td) {
    background-color: var(--ddb-selected-active-bg) !important;
}
</style>
