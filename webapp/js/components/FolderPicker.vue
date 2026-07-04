<template>
    <Window :title="title" id="folderPicker" modal fixedSize maxWidth="80%" @onClose="handleClose">
        <div v-if="currentPath" class="folder-picker-breadcrumb mt-3 ms-3">
            <Breadcrumb :home="breadcrumbHome" :model="breadcrumbItems">
                <template #item="{ item }">
                    <a v-if="item.command" class="bc-link" @click="item.command()">
                        <i v-if="item.icon" :class="item.icon"></i>
                        <template v-else>{{ item.label }}</template>
                    </a>
                    <span v-else class="bc-active">{{ item.label }}</span>
                </template>
                <template #separator> / </template>
            </Breadcrumb>
        </div>

        <div class="folder-picker-body">
            <div v-if="loading" class="text-center p-4">
                <i class="fa-solid fa-circle-notch fa-spin"></i>
            </div>
            <div v-else-if="sortedFiles.length === 0" class="text-center p-4">
                <i class="fa-regular fa-folder-open" style="font-size: 2rem; opacity: 0.5;"></i>
                <p class="mt-2">This folder is empty</p>
            </div>
            <DataTable v-else :value="sortedFiles" :paginator="false" scrollable scrollHeight="flex"
                size="small" dataKey="path" stripedRows :rowClass="rowClass"
                @row-click="onRowClick" @row-dblclick="onRowDblClick">
                <Column header="" style="width: 3rem; text-align: center;">
                    <template #body="{ data }">
                        <i class="icon" :class="data.icon"
                            :style="!canSelect(data) ? 'opacity: 0.4;' : ''"></i>
                    </template>
                </Column>
                <Column field="label" style="min-width: 12.5rem;">
                    <template #header>
                        <span @click="sortBy('name')" class="sortable-header">
                            Name
                            <i v-if="sortColumn === 'name'" class="fa-solid"
                                :class="sortDirection === 'asc' ? 'fa-angle-up' : 'fa-angle-down'"></i>
                        </span>
                    </template>
                    <template #body="{ data }">
                        <span class="file-name" :style="!canSelect(data) ? 'opacity: 0.4;' : ''">{{ data.label }}</span>
                    </template>
                </Column>
                <Column style="width: 7.5rem;">
                    <template #header>
                        <span @click="sortBy('type')" class="sortable-header">
                            Type
                            <i v-if="sortColumn === 'type'" class="fa-solid"
                                :class="sortDirection === 'asc' ? 'fa-angle-up' : 'fa-angle-down'"></i>
                        </span>
                    </template>
                    <template #body="{ data }">
                        <span class="file-type" :style="!canSelect(data) ? 'opacity: 0.4;' : ''">{{ getFileType(data) }}</span>
                    </template>
                </Column>
                <Column style="width: 6.25rem;">
                    <template #header>
                        <span @click="sortBy('size')" class="sortable-header">
                            Size
                            <i v-if="sortColumn === 'size'" class="fa-solid"
                                :class="sortDirection === 'asc' ? 'fa-angle-up' : 'fa-angle-down'"></i>
                        </span>
                    </template>
                    <template #body="{ data }">
                        <span class="file-size" :style="!canSelect(data) ? 'opacity: 0.4;' : ''">{{ getFileSize(data) }}</span>
                    </template>
                </Column>
                <Column style="width: 12rem">
                    <template #header>
                        <span @click="sortBy('modified')" class="sortable-header">
                            Modified
                            <i v-if="sortColumn === 'modified'" class="fa-solid"
                                :class="sortDirection === 'asc' ? 'fa-angle-up' : 'fa-angle-down'"></i>
                        </span>
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

        <div class="folder-picker-new-folder">
            <span class="folder-picker-new-folder-label">New folder:</span>
            <InputText class="folder-picker-new-folder-input" ref="newFolderInput"
                v-on:keyup.enter="createFolder" v-model="newFolderName"
                :disabled="creatingFolder" placeholder="Folder name" />
            <Button @click="createFolder" :disabled="!newFolderName || creatingFolder"
                :loading="creatingFolder" severity="secondary" label="Create" size="small" />
        </div>

        <div class="d-flex justify-content-end gap-2 mt-3 w-100">
            <Button @click="close('cancel')" severity="secondary" label="Cancel" />
            <Button @click="close('confirm')" :disabled="!selectedFile || !canSelect(selectedFile)"
                severity="primary" label="Confirm" />
        </div>
    </Window>
</template>

<script>
import Window from '@/components/Window.vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Breadcrumb from 'primevue/breadcrumb';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import PrimeMessage from 'primevue/message';
import ddb from 'ddb';
import icons from '@/libs/icons';
import { getTypeDisplayName } from '@/libs/entryTypes';
import { bytesToSize } from '@/libs/utils';

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
 *   onClose - Emitted on confirm with { path, entry } or on cancel with null.
 *
 * Usage example:
 *   <FolderPicker v-if="pickerOpen" :dataset="dataset" mode="folder"
 *     :initialPath="currentPath" @onClose="handlePickerClose" />
 */
export default {
    components: {
        Window, Button, InputText, Breadcrumb, DataTable, Column, PrimeMessage
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

    emits: ['onClose'],

    data: function () {
        return {
            currentPath: this.normalizePath(this.initialPath),
            files: [],
            selectedFile: null,
            loading: false,
            creatingFolder: false,
            newFolderName: '',
            errorMessage: null,
            sortColumn: 'name',
            sortDirection: 'asc'
        };
    },

    computed: {
        breadcrumbs: function () {
            if (!this.currentPath || this.currentPath.length === 0) return null;

            var folders = this.currentPath.split('/');
            var cur = '';
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
                    path: '',
                    name: '~'
                });
            }

            return bc;
        },
        breadcrumbHome: function () {
            if (!this.breadcrumbs || this.breadcrumbs.length === 0) return null;
            const home = this.breadcrumbs[0];
            return {
                icon: 'fa-solid fa-home',
                command: () => this.navigateTo(home.path)
            };
        },
        breadcrumbItems: function () {
            if (!this.breadcrumbs || this.breadcrumbs.length <= 1) return [];
            return this.breadcrumbs.slice(1).map((b, idx, arr) => {
                if (idx < arr.length - 1) {
                    return { label: b.name, command: () => this.navigateTo(b.path) };
                }
                return { label: b.name };
            });
        },
        sortedFiles: function () {
            const sorted = [...this.files];

            sorted.sort((a, b) => {
                let aDir = entry.isDirectory(a.entry);
                let bDir = entry.isDirectory(b.entry);

                if (aDir && !bDir) return -1;
                else if (!aDir && bDir) return 1;

                let result = 0;
                switch (this.sortColumn) {
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
        },

        onRowDblClick: function (event) {
            const file = event.data;

            if (entry.isDirectory(file.entry)) {
                this.navigateTo(file.entry.path);
            } else if (this.mode === 'file' || this.mode === 'any') {
                this.selectedFile = file;
                file.selected = true;
                this.close('confirm');
            }
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
            if (this.sortColumn === column) {
                this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                this.sortColumn = column;
                this.sortDirection = 'asc';
            }
        },

        getFileType: function (file) {
            return getTypeDisplayName(file.entry.type);
        },

        getFileSize: function (file) {
            if (entry.isDirectory(file.entry)) return '';
            if (!file.entry.size) return '';
            return bytesToSize(file.entry.size);
        },

        getModifiedDate: function (file) {
            if (!file.entry.mtime) return '--';
            const date = new Date(file.entry.mtime * 1000);
            return date.toLocaleString();
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
                this.$emit('onClose', {
                    path: this.selectedFile.entry.path,
                    entry: this.selectedFile.entry
                });
            } else {
                this.$emit('onClose', null);
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

.row-disabled {
    opacity: 0.4;
    cursor: not-allowed !important;
}
</style>
