<template>
    <div id="table-view-container">
        <ContextMenu :items="contextMenu" />
        <Toolbar :tools="tools" v-if="tools" />
        <div v-if="currentPath">
            <div class="ui large breadcrumb" style="margin-top: 1rem; margin-bottom: 1rem; margin-left: 1rem">
                <span v-for="(b, idx) in breadcrumbs" :key="'B,' + b.name">
                    <a v-if="idx != breadcrumbs.length - 1" class="section" :class="{ home: idx === 0 }"
                        v-on:click="goTo(b)">{{ b.name }}</a>
                    <div v-if="idx == breadcrumbs.length - 1" class="section active">{{ b.name }}</div>
                    <span v-if="idx != breadcrumbs.length - 1" class="divider">/</span>
                </span>
            </div>
            <!--<div class="ui divider"></div>-->
        </div>
        <div ref="tableview" id="table-view" :class="{ loading, dropping }"
            @drop="explorerDropHandler($event)"
            @dragleave="explorerDragLeave($event)"
            @dragenter="explorerDragEnter($event)"
            @dragover.prevent
            @click="onClick">
            <table class="ui selectable celled table">
                <thead>
                    <tr>
                        <th class="icon-column"></th>
                        <th @click="sortBy('name')">
                            Name
                            <i v-if="sortColumn === 'name'" class="icon" :class="sortDirection === 'asc' ? 'angle up' : 'angle down'"></i>
                        </th>
                        <th @click="sortBy('type')" class="type-column">
                            Type
                            <i v-if="sortColumn === 'type'" class="icon" :class="sortDirection === 'asc' ? 'angle up' : 'angle down'"></i>
                        </th>
                        <th @click="sortBy('size')" class="size-column">
                            Size
                            <i v-if="sortColumn === 'size'" class="icon" :class="sortDirection === 'asc' ? 'angle up' : 'angle down'"></i>
                        </th>
                        <th @click="sortBy('modified')" class="date-column">
                            Modified
                            <i v-if="sortColumn === 'modified'" class="icon" :class="sortDirection === 'asc' ? 'angle up' : 'angle down'"></i>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="(f, idx) in sortedFiles"
                        :key="'T,' + f.path"
                        :class="{ selected: f.selected, active: f.selected }"
                        :data-idx="idx"
                        draggable
                        @dragstart="startDrag($event, f)"
                        @drop.stop="onDrop($event, f)"
                        @dragenter.prevent
                        @dragover.prevent
                        @click.stop="handleSelection($event, f)"
                        @contextmenu="handleRightClick($event, f)"
                        @dblclick="handleOpen(f)">
                        <td class="icon-column">
                            <i v-if="!isBuildLoading(f)" class="icon" :class="f.icon"></i>
                            <i v-else class="icon circle notch spin loading"></i>
                            <i v-if="getBuildBadge(f)" class="icon badge" :class="getBuildBadge(f)"></i>
                        </td>
                        <td class="name-column">
                            <span class="file-name">{{ f.label }}</span>
                        </td>
                        <td class="type-column">
                            <span class="file-type">{{ getFileType(f) }}</span>
                        </td>
                        <td class="size-column">
                            <span class="file-size">{{ getFileSize(f) }}</span>
                        </td>
                        <td class="date-column">
                            <span class="file-date">{{ getModifiedDate(f) }}</span>
                        </td>
                    </tr>
                </tbody>
            </table>
            <div v-if="isLoadingFiles && files.length === 0" class="ui placeholder segment">
                <div class="ui active centered inline loader"></div>
            </div>
            <div v-else-if="files.length === 0" class="ui placeholder segment">
                <div class="ui icon header">
                    <i class="folder open outline icon"></i>
                    This folder is empty
                </div>
            </div>
        </div>
    </div>
</template>

<script>
import Toolbar from './Toolbar.vue';
import Keyboard from '../libs/keyboard';
import Mouse from '../libs/mouse';
import { clone } from '../libs/utils';
import BuildManager from '../libs/buildManager';
import { isInternalDrag, dragDropMixin } from '../libs/dragDropUtils';

import ddb from 'ddb';
const { pathutils, entry } = ddb;

import ContextMenu from './ContextMenu';
import reg from '../libs/sharedRegistry';

export default {
    mixins: [dragDropMixin],
    components: {
        Toolbar, ContextMenu
    },
    props: ['files', 'currentPath', 'tools', 'dataset', 'viewMode', 'canWrite', 'isLoadingFiles'],
    data: function () {
        let contextMenu = this.buildContextMenu();

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
        }
    },
    methods: {
        buildContextMenu() {
            const typesWithDedicatedViewer = [ddb.entry.type.MODEL, ddb.entry.type.GEORASTER, ddb.entry.type.POINTCLOUD, ddb.entry.type.PANORAMA, ddb.entry.type.GEOPANORAMA, ddb.entry.type.MARKDOWN];

            return [{
                label: 'Open',
                icon: 'folder open outline',
                isVisible: () => { return this.selectedFiles.length > 0 && (this.selectedFiles.length > 1 || typesWithDedicatedViewer.indexOf(this.selectedFiles[0].entry.type) === -1); },
                click: () => {
                    this.selectedFiles.forEach(f => {
                        this.$emit('openItem', f);
                    });
                }
            }, {
                label: 'Open Map',
                icon: 'map',
                isVisible: () => { return this.selectedFiles.length === 1 && [ddb.entry.type.GEORASTER, ddb.entry.type.POINTCLOUD].indexOf(this.selectedFiles[0].entry.type) !== -1; },
                click: () => {
                    this.selectedFiles.forEach(f => {
                        this.$emit('openItem', f, 'map');
                    });
                }
            }, {
                label: 'Open Point Cloud',
                icon: 'cube',
                isVisible: () => { return this.selectedFiles.length === 1 && this.selectedFiles[0].entry.type === ddb.entry.type.POINTCLOUD; },
                click: () => {
                    this.selectedFiles.forEach(f => {
                        this.$emit('openItem', f, 'pointcloud');
                    });
                }
            }, {
                label: 'Open 3D Model',
                icon: 'cube',
                isVisible: () => { return this.selectedFiles.length === 1 && this.selectedFiles[0].entry.type === ddb.entry.type.MODEL; },
                click: () => {
                    this.selectedFiles.forEach(f => {
                        this.$emit('openItem', f, 'model');
                    });
                }
            }, {
                label: 'Open Panorama',
                icon: 'globe',
                isVisible: () => { return this.selectedFiles.length === 1 && [ddb.entry.type.PANORAMA, ddb.entry.type.GEOPANORAMA].indexOf(this.selectedFiles[0].entry.type) !== -1; },
                click: () => {
                    this.selectedFiles.forEach(f => {
                        this.$emit('openItem', f, 'panorama');
                    });
                }
            }, {
                label: 'Open Markdown',
                icon: 'book',
                isVisible: () => { return this.selectedFiles.length === 1 && this.selectedFiles[0].entry.type === ddb.entry.type.MARKDOWN; },
                click: () => {
                    this.selectedFiles.forEach(f => {
                        this.$emit('openItem', f, 'markdown');
                    });
                }
            }, {
                label: "Rename",
                icon: 'pencil alternate',
                isVisible: () => { return this.canWrite && this.selectedFiles.length == 1; },
                accelerator: "CmdOrCtrl+M",
                click: () => {
                    this.$emit("moveSelectedItems");
                }
            }, {
                label: "Properties",
                isVisible: () => { return this.selectedFiles.length > 0; },
                icon: 'info circle',
                accelerator: "CmdOrCtrl+P",
                click: () => {
                    this.$emit("openProperties");
                }
            }, {
                label: 'Share/Embed',
                icon: 'share alternate',
                isVisible: () => { return this.selectedFiles.length === 1 },
                click: () => {
                    this.selectedFiles.forEach(f => {
                        this.$emit('shareEmbed', f);
                    });
                }
            }, {
                label: 'Download',
                icon: 'download',
                isVisible: () => { return this.selectedFiles.length > 0; },
                click: () => {
                    this.$emit('downloadItems', this.selectedFiles);
                }
            }, {
                label: 'Build',
                icon: 'cog',
                isVisible: () => {
                    return this.canWrite &&
                           this.selectedFiles.length === 1 &&
                           this.isBuildableFile(this.selectedFiles[0]) &&
                           !this.hasActiveBuild(this.selectedFiles[0]);
                },
                click: () => {
                    this.buildSelectedFile();
                }
            }, {
                label: "Transfer to Dataset...",
                icon: 'exchange',
                isVisible: () => { return reg.isLoggedIn() && this.selectedFiles.length > 0 && !this.selectedFiles.find(f => f.entry.type === ddb.entry.type.DRONEDB); },
                accelerator: "CmdOrCtrl+T",
                click: () => {
                    this.$emit("transferSelectedItems");
                }
            }, {
                isVisible: () => { return this.selectedFiles.length > 0; },
                type: 'separator'
            }, {
                label: "Select All/None",
                icon: 'list',
                accelerator: "CmdOrCtrl+A",
                click: () => {
                    if (this.selectedFiles.length === this.files.length) {
                        this.deselectAll();
                    } else {
                        this.selectAll();
                    }
                }
            }, {
                label: "Create Folder",
                icon: 'folder',
                isVisible: () => { return this.canWrite; },
                accelerator: "CmdOrCtrl+N",
                click: () => {
                    this.$emit("createFolder");
                }
            }, {
                isVisible: () => { return this.canWrite && this.selectedFiles.length > 0 && !this.selectedFiles.find(f => f.entry.type === ddb.entry.type.DRONEDB); },
                type: 'separator'
            }, {
                label: "Delete",
                icon: 'trash alternate outline',
                isVisible: () => { return this.canWrite && this.selectedFiles.length > 0 && !this.selectedFiles.find(f => f.entry.type === ddb.entry.type.DRONEDB); },
                accelerator: "CmdOrCtrl+D",
                click: () => {
                    this.$emit("deleteSelecteditems");
                }
            }];
        },



        goTo: function (itm) {
            this.$root.$emit("folderOpened", pathutils.getTree(itm.path));
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
                this.$log.info("Cannot copy a folder on itself or one of its descendants");
                return;
            }

            const destPath = pathutils.join(destFolder, pathutils.basename(sourceItem.entry.path));
            this.$emit('moveItem', sourceItem, destPath);
        },

        onClick: function (e) {
            // Clicked an empty area
            if (e.target.id === 'table-view' || e.target.tagName === 'TABLE' || e.target.tagName === 'TBODY') {
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
                this.$root.$emit("folderOpened", pathutils.getTree(file.entry.path));
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
            const typeMap = {
                [ddb.entry.type.DIRECTORY]: 'Folder',
                [ddb.entry.type.GENERIC]: 'File',
                [ddb.entry.type.GEOIMAGE]: 'GeoImage',
                [ddb.entry.type.GEORASTER]: 'GeoRaster',
                [ddb.entry.type.POINTCLOUD]: 'Point Cloud',
                [ddb.entry.type.IMAGE]: 'Image',
                [ddb.entry.type.DRONEDB]: 'DroneDB',
                [ddb.entry.type.MARKDOWN]: 'Markdown',
                [ddb.entry.type.VIDEO]: 'Video',
                [ddb.entry.type.MODEL]: '3D Model',
                [ddb.entry.type.PANORAMA]: 'Panorama',
                [ddb.entry.type.GEOPANORAMA]: 'GeoPanorama'
            };
            return typeMap[file.entry.type] || 'Unknown';
        },

        getFileSize: function(file) {
            if (entry.isDirectory(file.entry)) return '--';
            if (!file.entry.size) return '--';

            const bytes = file.entry.size;
            if (bytes === 0) return '0 B';

            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));

            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        },

        getModifiedDate: function(file) {
            if (!file.entry.mtime) return '--';

            const date = new Date(file.entry.mtime * 1000);
            return date.toLocaleString();
        },

        // Build management methods
        isBuildableFile: function(file) {
            if (!this.dataset) return false;
            return BuildManager.isBuildableType(file.entry.type);
        },

        hasActiveBuild: function(file) {
            if (!this.dataset) return false;
            return BuildManager.hasActiveBuild(this.dataset, file.entry.path);
        },

        isBuildLoading: function(file) {
            if (!this.dataset) return false;
            const buildState = BuildManager.getBuildState(this.dataset, file.entry.path);
            if (!buildState) return false;

            const activeStates = ['Processing', 'Enqueued', 'Scheduled', 'Awaiting', 'Created'];
            return activeStates.includes(buildState.currentState);
        },

        getBuildBadge: function(file) {
            if (!this.dataset) return null;
            const buildState = BuildManager.getBuildState(this.dataset, file.entry.path);
            if (!buildState) return null;

            switch (buildState.currentState) {
                case 'Failed':
                    return 'times circle red';
                case 'Succeeded':
                    return null; // Don't show badge for success
                default:
                    return null;
            }
        },

        buildSelectedFile: async function() {
            if (this.selectedFiles.length !== 1) return;

            const file = this.selectedFiles[0];

            try {
                await BuildManager.startBuild(this.dataset, file.entry.path, true);
                this.$emit('buildStarted', file);
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
}

#table-view-container .breadcrumb {
    word-break: break-all;
    overflow: hidden;
}

#table-view-container .breadcrumb .section.home {
    font-family: monospace;
}

#table-view {
    width: 100%;
    height: 100%;
    overflow-y: auto;
    user-select: none;
    transition: all 0.25s ease;
}

#table-view.loading {
    opacity: 0.5;
    pointer-events: none;
}

#table-view.dropping {
    background-color: #EFEFEF;
    box-shadow: inset 0em 0em 5px 2px grey;
    cursor: copy;
}

.ui.table {
    margin: 0;
}

.ui.table thead th {
    cursor: pointer;
    user-select: none;
}

.ui.table thead th:hover {
    background-color: #f5f5f5;
}

.ui.table tbody tr {
    cursor: pointer;
}

.ui.table tbody tr.selected {
    background-color: #e8f4ff !important;
}

.ui.table tbody tr:hover {
    background-color: #f9fafb !important;
}

.ui.table tbody tr.selected:hover {
    background-color: #d8e8f8 !important;
}

.ui.table .icon-column {
    width: 50px;
    text-align: center;
}

.ui.table .icon-column i.icon {
    margin: 0;
}

.ui.table .icon-column i.icon.badge {
    margin-left: 4px;
    font-size: 0.9em;
}

.ui.table .name-column {
    min-width: 200px;
    word-break: break-all;
}

.ui.table .type-column {
    width: 120px;
}

.ui.table .size-column {
    width: 100px;
    text-align: right;
}

.ui.table .date-column {
    width: 180px;
}

.ui.placeholder.segment {
    margin: 2em;
}
</style>
