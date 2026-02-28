<template>
    <div id="explorer-container">
        <ContextMenu :items="contextMenu" />
        <Toolbar :tools="tools" v-if="tools" />
        <div v-if="currentPath">
            <Breadcrumb :home="breadcrumbHome" :model="breadcrumbItems" class="mt-3 ms-3">
                <template #item="{ item }">
                    <a v-if="item.command" class="bc-link" @click="item.command()">{{ item.label }}</a>
                    <span v-else class="bc-active">{{ item.label }}</span>
                </template>
                <template #separator> / </template>
            </Breadcrumb>
            <!--<div class="ui divider"></div>-->
        </div>
        <div ref="explorer" id="explorer" @click="onClick" :class="{ loading, dropping }" @scroll="onScroll"
            @drop="explorerDropHandler($event)" @dragleave="explorerDragLeave($event)"
            @dragenter="explorerDragEnter($event)" @dragover.prevent>
            <div v-if="isLoadingFiles && files.length === 0" class="ui placeholder segment m-3 w-100">
                <div class="ui active centered inline loader"></div>
            </div>
            <div v-else-if="files.length === 0" class="ui placeholder segment m-3 w-100">
                <div class="ui icon header">
                    <i class="fa-regular fa-folder-open icon"></i>
                    This folder is empty
                </div>
            </div>
            <template v-else>
                <div v-for="(f, idx) in files" :key="'E,' + f.path" draggable @dragstart="startDrag($event, f)"
                    @drop="onDrop($event, f)" @dragenter.prevent @dragover.prevent>
                    <Thumbnail :file="f" :data-idx="idx" ref="thumbs" @clicked="handleSelection" @open="handleOpen"
                        :lazyLoad="true" :dataset="dataset" />
                </div>
            </template>
        </div>
    </div>
</template>

<script>
import Thumbnail from './Thumbnail.vue';
import Toolbar from './Toolbar.vue';
import Keyboard from '../libs/keyboard';
import Mouse from '../libs/mouse';
import { clone } from '../libs/utils';
import Window from './Window.vue';
import BuildManager, { BUILD_STATES } from '../libs/buildManager';
import { isInternalDrag, dragDropMixin } from '../libs/dragDropUtils';
import emitter from '../libs/eventBus';

import ddb from 'ddb';
const { pathutils, utils } = ddb;

import { entry } from 'ddb';
import shell from '../dynamic/shell';
import env from '../dynamic/env';
import ContextMenu from './ContextMenu';
import reg from '../libs/sharedRegistry';
import { Features } from '../libs/features';
import { isPdfFile } from '../libs/textFileUtils';
import Breadcrumb from 'primevue/breadcrumb';

export default {
    mixins: [dragDropMixin],
    components: {
        Thumbnail, Toolbar, ContextMenu, Window, Breadcrumb
    },
    props: ['files', 'currentPath', 'tools', 'dataset', 'viewMode', 'canWrite', 'isLoadingFiles'],
    data: function () {
        let contextMenu = [];

        if (env.isElectron()) {
            contextMenu = contextMenu.concat([{
                label: "Open Item Location",
                icon: 'fa-regular fa-folder-open',
                isVisible: () => { return this.selectedFiles.length > 0; },
                click: () => {
                    if (this.selectedFiles.length > 0) shell.showItemInFolder(this.selectedFiles[0].path);
                },
                accelerator: "Alt+CmdOrCtrl+R",
            }, {
                type: 'separator'
            }, {
                label: "Share",
                icon: 'fa-solid fa-share-nodes',
                accelerator: "CmdOrCtrl+S",
                isVisible: () => { return this.selectedFiles.length > 0; },
                click: () => {
                    if (this.selectedFiles.length > 0) dispatchEvent(new Event("btnShare_Click"));
                }
            }, {
                type: 'separator'
            }]);
        }

        const typesWithDedicatedViewer = [ddb.entry.type.MODEL, ddb.entry.type.GEORASTER, ddb.entry.type.POINTCLOUD, ddb.entry.type.PANORAMA, ddb.entry.type.GEOPANORAMA, ddb.entry.type.MARKDOWN];

        contextMenu = contextMenu.concat([{
            label: 'Open',
            icon: 'fa-regular fa-folder-open',
            isVisible: () => { return this.selectedFiles.length > 0 && (this.selectedFiles.length > 1 || typesWithDedicatedViewer.indexOf(this.selectedFiles[0].entry.type) === -1); },
            click: () => {
                this.selectedFiles.forEach(f => {
                    this.$emit('openItem', f);
                });
            }
        }, {
            label: 'Open Map',
            icon: 'fa-solid fa-map',
            isVisible: () => { return this.selectedFiles.length === 1 && [ddb.entry.type.GEORASTER, ddb.entry.type.POINTCLOUD].indexOf(this.selectedFiles[0].entry.type) !== -1; },
            click: () => {
                this.selectedFiles.forEach(f => {
                    this.$emit('openItem', f, 'map');
                });
            }
        }, {
            label: 'Open Point Cloud',
            icon: 'fa-solid fa-cube',
            isVisible: () => { return this.selectedFiles.length === 1 && this.selectedFiles[0].entry.type === ddb.entry.type.POINTCLOUD; },
            click: () => {
                this.selectedFiles.forEach(f => {
                    this.$emit('openItem', f, 'pointcloud');
                });
            }
        }, {
            label: 'Open 3D Model',
            icon: 'fa-solid fa-cube',
            isVisible: () => { return this.selectedFiles.length === 1 && this.selectedFiles[0].entry.type === ddb.entry.type.MODEL; },
            click: () => {
                this.selectedFiles.forEach(f => {
                    this.$emit('openItem', f, 'model');
                });
            }
        }, {
            label: 'Open Panorama',
            icon: 'fa-solid fa-globe',
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
            label: 'Open PDF',
            icon: 'file pdf outline',
            isVisible: () => { return this.selectedFiles.length === 1 && isPdfFile(this.selectedFiles[0].entry); },
            click: () => {
                this.selectedFiles.forEach(f => {
                    this.$emit('openItem', f);
                });
            }
        }, {
            label: "Rename",
            icon: 'fa-solid fa-pencil',
            isVisible: () => { return this.canWrite && this.selectedFiles.length == 1; },
            accelerator: "CmdOrCtrl+M",
            click: () => {
                this.$emit("moveSelectedItems");
            }
        }, {
            label: "Properties",
            isVisible: () => { return this.selectedFiles.length > 0; },
            icon: 'fa-solid fa-circle-info',
            accelerator: "CmdOrCtrl+P",
            click: () => {
                this.$emit("openProperties");
            }
        }, {
            label: 'Share/Embed',
            icon: 'fa-solid fa-share-nodes',
            isVisible: () => { return this.selectedFiles.length === 1 },
            click: () => {
                this.selectedFiles.forEach(f => {
                    this.$emit('shareEmbed', f);
                });
            }
        }, {
            label: 'Download',
            icon: 'fa-solid fa-download',
            isVisible: () => { return this.selectedFiles.length > 0; },
            click: () => {
                this.$emit('downloadItems', this.selectedFiles);
            }
        }, {
            label: 'Build',
            icon: 'fa-solid fa-gear',
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
            icon: 'fa-solid fa-right-left',
            isVisible: () => { return reg.isLoggedIn() && this.selectedFiles.length > 0 && !this.selectedFiles.find(f => f.entry.type === ddb.entry.type.DRONEDB); },
            accelerator: "CmdOrCtrl+T",
            click: () => {
                this.$emit("transferSelectedItems");
            }
        }, {
            label: "Set as Dataset Thumbnail",
            icon: 'fa-solid fa-image',
            isVisible: () => {
                if (!this.canWrite || this.selectedFiles.length !== 1) return false;
                const file = this.selectedFiles[0];
                const type = file.entry.type;
                const isImageType = [ddb.entry.type.IMAGE, ddb.entry.type.GEOIMAGE, ddb.entry.type.GEORASTER].includes(type);
                if (!isImageType) return false;
                // Hide for files that are themselves thumbnail candidates
                const candidates = reg.getFeatureValue(Features.DATASET_THUMBNAIL_CANDIDATES);
                if (candidates && candidates.some(c => c.toLowerCase() === pathutils.basename(file.entry.path).toLowerCase())) return false;
                if (type === ddb.entry.type.GEORASTER) {
                    const buildState = BuildManager.getBuildState(this.dataset, file.entry.path);
                    if (!buildState) return true;
                    return buildState.currentState !== BUILD_STATES.FAILED && !this.hasActiveBuild(file);
                }
                return true;
            },
            click: () => {
                this.$emit("setAsCover", this.selectedFiles[0]);
            }
        }, {
            isVisible: () => { return this.selectedFiles.length > 0; },
            type: 'separator'
        }, {
            label: "Select All/None",
            icon: 'fa-solid fa-list',
            accelerator: "CmdOrCtrl+A",
            click: () => {
                if (!this.$refs.thumbs) return;
                if (this.selectedFiles.length === this.$refs.thumbs.length) {
                    this.deselectAll();
                } else {
                    this.selectAll();
                }
            }
        }, {
            label: "Create Folder",
            icon: 'fa-solid fa-folder',
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
            icon: 'fa-solid fa-trash',
            isVisible: () => { return this.canWrite && this.selectedFiles.length > 0 && !this.selectedFiles.find(f => f.entry.type === ddb.entry.type.DRONEDB); },
            accelerator: "CmdOrCtrl+D",
            click: () => {
                this.$emit("deleteSelecteditems");
            }
        }
        ]);

        return {
            loading: false,
            dropping: false,
            contextMenu,
        };
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
        }
    },
    mounted: function () {
        this.rangeStartThumb = null;

        // Load thumbnails immediately after mount
        this.$nextTick(() => {
            this.lazyLoadThumbs();
        });
    },
    updated: function () {
        this.lazyLoadThumbs();
    },
    methods: {



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

        onTabActivated: function () {
            this.$nextTick(() => {
                this.lazyLoadThumbs();
            });
        },

        onPanelResized: function () {
            this.$nextTick(() => {
                this.lazyLoadThumbs();
            });
        },

        onClick: function (e) {

            // Clicked an empty area
            if (e.target.id === 'explorer') {
                this.clearSelection();
            }
        },
        lazyLoadThumbs: function () {
            if (!this.$refs.thumbs) return;

            const parentBcr = this.$el.getBoundingClientRect();
            this.$refs.thumbs.forEach(t => {
                const thumbBcr = t.getBoundingRect();
                if (thumbBcr.bottom - parentBcr.top > 0 &&
                    parentBcr.bottom - thumbBcr.top > 0 &&
                    thumbBcr.right - parentBcr.left > 0 &&
                    parentBcr.right - thumbBcr.left > 0) {
                    t.loadThumbnail();
                }
            });
        },
        onScroll: function () {
            if (this.scrollTimeout) {
                clearTimeout(this.scrollTimeout);
                this.scrollTimeout = null;
            }
            this.scrollTimeout = setTimeout(() => {
                this.lazyLoadThumbs();
            }, 250);
        },
        selectAll: function () {
            this.files.forEach(f => f.selected = true);
        },
        deselectAll: function () {
            this.files.forEach(f => f.selected = false);
        },
        clearSelection: function () {
            this.files.forEach(f => f.selected = false);
        },
        handleOpen: async function (thumb) {
            const file = thumb.file;

            if (entry.isDirectory(file.entry)) {
                thumb.loading = true; // Show loading spinner
                emitter.emit("folderOpened", pathutils.getTree(file.entry.path));
            } else {
                this.$emit('openItem', file);
            }
        },
        handleSelection: function (thumb, mouseBtn) {
            if (!thumb) return; // Top
            // if (mouseBtn === Mouse.RIGHT && this.selectedFiles.length > 1) return; // Prevent accidental deselection
            const file = thumb.file;

            if (Keyboard.isShiftPressed() && this.selectedFiles.length > 0 && this.rangeStartThumb) {
                // Range selection
                this.selectedFiles.forEach(f => f.selected = false);
                this.selectRange(this.rangeStartThumb, thumb);
            } else {

                // Single selection
                if (mouseBtn === Mouse.RIGHT) {
                    if (!file.selected) this.selectedFiles.forEach(f => f.selected = false);
                    file.selected = false;
                }
                file.selected = !file.selected;

                // Keep rangeStart from the first selected file
                if (this.selectedFiles.length === 1) this.rangeStartThumb = thumb;
            }
        },

        selectRange: function (low, high) {
            let idxLow = parseInt(low.$el.getAttribute('data-idx')),
                idxHigh = parseInt(high.$el.getAttribute('data-idx'));

            if (idxLow > idxHigh) {
                [low, high] = [high, low];
                [idxLow, idxHigh] = [idxHigh, idxLow];
            }

            let $n = low.$el;
            while ($n != high.$el && $n !== null) {
                const f = $n.__vue__.file;
                f.selected = true;
                $n = $n.parentElement.nextSibling.children[0];
            }

            if ($n !== null) {
                // Select last
                const f = $n.__vue__.file;
                f.selected = true;
            }
        },

        scrollTo: function (file) {
            const thumb = this.$refs.thumbs.find(t => t.file === file);
            if (thumb) {
                this.$refs.explorer.scrollTo(0, thumb.$el.offsetTop - this.$el.offsetTop - 12);
            }
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

        buildSelectedFile: async function() {
            if (this.selectedFiles.length !== 1) return;

            const file = this.selectedFiles[0];

            try {
                await BuildManager.startBuild(this.dataset, file.entry.path, true);
                // Emit event to notify parent
                this.$emit('buildStarted', file);
            } catch (error) {
                // Emit error event
                this.$emit('buildError', { file, error: error.message });
            }
        }
    }
}
</script>

<style scoped>
#explorer {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    align-content: flex-start;
    width: 100%;
    height: 100%;
    padding: 0.5rem;
    overflow-y: auto;
    user-select: none;
    transition: opacity 0.25s ease;

    &.loading {
        opacity: 0.5;
        pointer-events: none;
    }

    &.dropping {
        background-color: #EFEFEF;
        box-shadow: inset 0em 0em 5px 2px grey;
        cursor: copy;
    }
}

#explorer-container {
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
            color: #999;
            margin: 0 0.2em;
        }
    }

    .bc-link {
        color: #4183c4;
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
</style>
