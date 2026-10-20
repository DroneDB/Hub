<template>
    <div id="explorer-container">
        <ContextMenu :items="contextMenu" />
        <Toolbar v-if="tools" :tools="tools" />
        <div v-if="currentPath">
            <Breadcrumb :home="breadcrumbHome" :model="breadcrumbItems" class="mt-3 ms-3">
                <template #item="{ item }">
                    <a v-if="item.command" class="bc-link" @click="item.command()">
                        <i v-if="item.icon" :class="item.icon" />
                        <template v-else>{{ item.label }}</template>
                    </a>
                    <span v-else class="bc-active">{{ item.label }}</span>
                </template>
                <template #separator> / </template>
            </Breadcrumb>
            <!--<div class="ui divider"></div>-->
        </div>
        <div id="explorer" ref="explorer" :class="{ loading, dropping, virtual: virtualGrid }" @click="onClick"
             @drop="explorerDropHandler($event)" @dragleave="explorerDragLeave($event)"
             @dragenter="explorerDragEnter($event)" @dragover.prevent>
            <div v-if="isLoadingFiles && files.length === 0" class="ui placeholder segment m-3 w-100">
                <div class="ui active centered inline loader" />
            </div>
            <div v-else-if="files.length === 0" class="ui placeholder segment m-3 w-100">
                <div class="ui icon header">
                    <i class="fa-regular fa-folder-open icon" />
                    This folder is empty
                </div>
            </div>
            <!-- Large folders: only the rows on screen are rendered (HUB-03) -->
            <VirtualScroller v-else-if="virtualGrid" ref="grid" v-slot="{ item: row }" class="thumbnail-grid"
                             :items="gridRows" :item-size="gridRowHeight" :min-height="0">
                <div class="thumbnail-row">
                    <div v-for="{ file: f, idx } in row.cells" :key="'E,' + f.path" :draggable="canWrite" :class="{ 'drop-target': dropTargetPath !== null && dropTargetPath === f.entry.path }"
                         @dragstart="startDrag($event, f)" @drop="onDrop($event, f)"
                         @dragenter="itemDragEnter($event, f)" @dragover="itemDragOver($event, f)"
                         @dragleave="itemDragLeave($event, f)">
                        <Thumbnail ref="thumbs" :file="f" :data-idx="idx" :lazy-load="true" :dataset="dataset"
                                   @clicked="handleSelection" @open="handleOpen" />
                    </div>
                </div>
            </VirtualScroller>
            <template v-else>
                <div v-for="(f, idx) in files" :key="'E,' + f.path" :draggable="canWrite" :class="{ 'drop-target': dropTargetPath !== null && dropTargetPath === f.entry.path }"
                     @dragstart="startDrag($event, f)" @drop="onDrop($event, f)"
                     @dragenter="itemDragEnter($event, f)" @dragover="itemDragOver($event, f)"
                     @dragleave="itemDragLeave($event, f)">
                    <Thumbnail ref="thumbs" :file="f" :data-idx="idx" :lazy-load="true" :dataset="dataset"
                               @clicked="handleSelection" @open="handleOpen" />
                </div>
            </template>
        </div>
    </div>
</template>

<script>
import Thumbnail from './Thumbnail.vue';
import VirtualScroller from '@/components/VirtualScroller.vue';
import { createThumbnailQueue, createVisibilityTracker } from '@/libs/thumbnailQueue';

// Folders at least this large render as a virtual grid (HUB-03)
const VIRTUAL_GRID_MIN_FILES = 200;
// One grid cell: the 128 px tile plus its margins and label
const GRID_CELL_WIDTH = 140;
const GRID_ROW_HEIGHT = 180;
import Toolbar from '@/components/Toolbar.vue';
import Keyboard from '@/libs/keyboard';
import Mouse from '@/libs/mouse';
import emitter from '@/libs/eventBus';
import { buildStandardContextMenu } from '@/libs/contextMenuItems';
import { isBuildableFile, hasActiveBuild } from '@/libs/build/buildHelpers';

import ddb from 'ddb';
const { pathutils } = ddb;

import { entry } from 'ddb';
import ContextMenu from '@/components/ContextMenu';
import Breadcrumb from 'primevue/breadcrumb';
import { getCurrentInstance } from 'vue';
import { useDragDrop } from '@/composables/useDragDrop';
import { useFileSelection } from '@/composables/useFileSelection';

export default {
    name: 'DatasetExplorer',
    components: {
        Thumbnail, Toolbar, ContextMenu, Breadcrumb, VirtualScroller
    },
    // Thumbnails load as they come into view, a few at a time (HUB-03)
    provide: function () {
        this.thumbnailLoader ??= {
            queue: createThumbnailQueue({ concurrency: 6 }),
            // #explorer clips the virtual grid too: one root for both layouts
            visibility: createVisibilityTracker({ root: () => this.$refs.explorer ?? null, rootMargin: '200px' })
        };
        return { thumbnailLoader: this.thumbnailLoader };
    },
    inject: { showBuildConfirm: { default: null } },
    props: {
        files: { type: Array, required: true },
        currentPath: { type: String, default: null },
        tools: { type: Array, default: null },
        dataset: { type: Object, required: true },
        viewMode: { type: String, default: null },
        canWrite: { type: Boolean, default: false },
        isLoadingFiles: { type: Boolean, default: false }
    },
    emits: ['openItem', 'openAsText', 'moveSelectedItems', 'openProperties', 'shareEmbed', 'downloadItems', 'transferSelectedItems', 'setAsCover', 'createFolder', 'deleteSelecteditems', 'buildStarted', 'buildError', 'selectionChanged', 'mergeMultispectral', 'maskBorders', 'extractItem', 'setCrs', 'copySelectedItems', 'cutSelectedItems', 'pasteFromClipboard', 'downloadBuildArtifact'],
    setup(props) {
        const instance = getCurrentInstance();
        return {
            ...useDragDrop(props, { selectedFiles: () => instance.proxy.selectedFiles }),
            selection: useFileSelection(() => props.files, f => f.path)
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
                if (self.files.length === 0) return;
                // Every file of the folder, rendered or not (the virtual grid renders only some)
                if (self.selectedFiles.length === self.files.length) {
                    self.deselectAll();
                } else {
                    self.selectAll();
                }
            },
            component: self
        };

        const contextMenu = buildStandardContextMenu(ctx);

        return {
            loading: false,
            contextMenu,
            gridColumns: 6
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
        virtualGrid: function () {
            return this.files.length >= VIRTUAL_GRID_MIN_FILES;
        },
        gridRowHeight: function () {
            return GRID_ROW_HEIGHT;
        },
        // The files in rows of `gridColumns`, each with its index in `files` (range selection)
        gridRows: function () {
            const rows = [];
            const cols = this.gridColumns;
            for (let i = 0; i < this.files.length; i += cols) {
                rows.push({
                    key: i,
                    cells: this.files.slice(i, i + cols).map((file, j) => ({ file, idx: i + j }))
                });
            }
            return rows;
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
        // Columns of the virtual grid follow the explorer's width
        if (typeof ResizeObserver !== 'undefined') {
            this._resizeObserver = new ResizeObserver(entries => {
                const width = entries[0]?.contentRect?.width ?? 0;
                if (width > 0) this.gridColumns = Math.max(1, Math.floor(width / GRID_CELL_WIDTH));
            });
            this._resizeObserver.observe(this.$refs.explorer);
        }
    },
    beforeUnmount: function () {
        this._resizeObserver?.disconnect();
        this.thumbnailLoader.visibility.disconnect();
    },
    methods: {



        goTo: function (itm) {
            emitter.emit("folderOpened", pathutils.getTree(itm.path));
        },

        // startDrag, onDrop and explorerDropHandler come from useDragDrop() (setup)


        onClick: function (e) {

            // Clicked an empty area
            if (e.target.id === 'explorer') {
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
            this.$emit('selectionChanged');
        },

        // The explorer items carry the selection (the map and the file list share them)
        applySelection: function () {
            this.files.forEach(f => { f.selected = this.selection.has(f); });
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
            if (!thumb) return;
            const file = thumb.file;
            this.selection.load(this.selectedFiles);
            this.selection.toggle(this.files.indexOf(file),
                { shift: Keyboard.isShiftPressed(), ctrl: Keyboard.isCtrlPressed(), right: mouseBtn === Mouse.RIGHT });
            this.applySelection();
            this.$emit('selectionChanged', file);
        },

        scrollTo: function (file) {
            if (this.virtualGrid) {
                const idx = this.files.indexOf(file);
                if (idx >= 0) this.$refs.grid?.scrollToIndex(Math.floor(idx / this.gridColumns));
                return;
            }
            const thumb = (this.$refs.thumbs || []).find(t => t.file === file);
            if (thumb) {
                this.$refs.explorer.scrollTo(0, thumb.$el.offsetTop - this.$el.offsetTop - 12);
            }
        },

        // Build management methods (delegated to shared helpers)
        isBuildableFile: function(file) {
            return isBuildableFile(this.dataset, file);
        },

        hasActiveBuild: function(file) {
            return hasActiveBuild(this.dataset, file);
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
        background-color: var(--ddb-bg-hover);
        box-shadow: inset 0 0 var(--ddb-spacing-sm) var(--ddb-spacing-xs) var(--ddb-text-muted);
        cursor: copy;
    }

    > div.drop-target {
        outline: 2px dashed var(--ddb-color-primary, #1976d2);
        outline-offset: -2px;
        background-color: var(--ddb-bg-hover);
        border-radius: var(--ddb-radius-sm, 4px);
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
#explorer.virtual {
    display: block;
    overflow: hidden;
}

.thumbnail-grid {
    height: 100%;
}

.thumbnail-row {
    display: flex;
    flex-wrap: nowrap;
    align-items: flex-start;
}
</style>
