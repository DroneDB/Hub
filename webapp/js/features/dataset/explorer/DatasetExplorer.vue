<template>
    <div id="explorer-container">
        <ContextMenu :items="contextMenu" />
        <Toolbar v-if="tools" :tools="tools" />
        <div v-if="currentPath">
            <PathBreadcrumb :path="currentPath" root-path="/" class="mt-3 ms-3" @navigate="goToPath" />
        </div>
        <div id="explorer" ref="explorer" :class="{ loading, dropping, virtual: virtualGrid }"
             :style="{ '--grid-cell-width': gridCellWidth + 'px' }"
             role="listbox" aria-label="Files" aria-multiselectable="true" tabindex="-1"
             @click="onClick" @keydown.esc="clearSelection"
             @drop="explorerDropHandler($event)" @dragleave="explorerDragLeave($event)"
             @dragenter="explorerDragEnter($event)" @dragover.prevent>
            <div v-if="isLoadingFiles && files.length === 0" class="explorer-notice m-3">
                <LoadingSpinner />
            </div>
            <div v-else-if="files.length === 0" class="explorer-notice text-center m-3">
                <i class="fa-regular fa-folder-open" style="font-size: 2rem; opacity: 0.5;" />
                <p class="mt-2">This folder is empty</p>
            </div>
            <!-- Large folders: only the rows on screen are rendered -->
            <VirtualScroller v-else-if="virtualGrid" ref="grid" v-slot="{ item: row }" class="thumbnail-grid"
                             :items="gridRows" :item-size="gridRowHeight" :min-height="0">
                <div class="thumbnail-row" :style="{ '--grid-columns': gridColumns }">
                    <div v-for="{ file: f, idx } in row.cells" :key="'E,' + f.path" class="grid-cell" role="presentation" :draggable="canWrite" :class="{ 'drop-target': dropTargetPath !== null && dropTargetPath === f.entry.path }"
                         @dragstart="startDrag($event, f)" @drop="onDrop($event, f)"
                         @dragenter="itemDragEnter($event, f)" @dragover="itemDragOver($event, f)"
                         @dragleave="itemDragLeave($event, f)">
                        <Thumbnail ref="thumbs" :file="f" :data-idx="idx" :lazy-load="true" :dataset="dataset"
                                   @clicked="handleSelection" @open="handleOpen" />
                    </div>
                </div>
            </VirtualScroller>
            <template v-else>
                <div v-for="(f, idx) in files" :key="'E,' + f.path" class="grid-cell" role="presentation" :draggable="canWrite" :class="{ 'drop-target': dropTargetPath !== null && dropTargetPath === f.entry.path }"
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
import Thumbnail from './EntryThumbnail.vue';
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import VirtualScroller from '@/components/VirtualScroller.vue';
import { createThumbnailQueue, createVisibilityTracker } from '@/libs/thumbnailQueue';
import { GRID_CELL_WIDTH, tileHeight } from './tileGeometry';

// Folders at least this large render as a virtual grid
const VIRTUAL_GRID_MIN_FILES = 200;

// A computed font size in px, or 16 where there is none (no layout)
const fontSizePx = el => {
    const px = el ? parseFloat(getComputedStyle(el).fontSize) : NaN;
    return Number.isFinite(px) && px > 0 ? px : 16;
};
import Toolbar from '@/features/dataset/explorer/HubToolbar.vue';
import Keyboard from '@/libs/keyboard';
import Mouse from '@/libs/mouse';
import emitter from '@/libs/eventBus';
import { buildStandardContextMenu } from '@/libs/contextMenuItems';
import { isBuildableFile, hasActiveBuild } from '@/libs/build/buildHelpers';

import ddb from 'ddb';
const { pathutils } = ddb;

import { entry } from 'ddb';
import ContextMenu from '@/features/dataset/explorer/ContextMenu';
import PathBreadcrumb from '@/components/PathBreadcrumb.vue';
import { getCurrentInstance } from 'vue';
import { useDragDrop } from '@/composables/useDragDrop';
import { useFileSelection } from '@/composables/useFileSelection';

export default {
    name: 'DatasetExplorer',
    components: {
        Thumbnail, LoadingSpinner, Toolbar, ContextMenu, PathBreadcrumb, VirtualScroller
    },
    // Thumbnails load as they come into view, a few at a time
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
        canWrite: { type: Boolean, default: false },
        isLoadingFiles: { type: Boolean, default: false }
    },
    emits: ['openItem', 'openAsText', 'moveSelectedItems', 'openProperties', 'shareEmbed', 'downloadItems', 'transferSelectedItems', 'setAsCover', 'createFolder', 'deleteSelecteditems', 'buildStarted', 'buildError', 'selectionChanged', 'mergeMultispectral', 'maskBorders', 'extractItem', 'setCrs', 'copySelectedItems', 'cutSelectedItems', 'pasteFromClipboard', 'downloadBuildArtifact', 'downloadSplat', 'exportSplatTrainingData'],
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
            gridColumns: 6,
            gridCellWidth: GRID_CELL_WIDTH,
            // The font sizes the tiles are laid out with (the body font grows on phones)
            rootFontPx: 16,
            fontPx: 16
        };
    },
    computed: {
        selectedFiles: function () {
            return this.files.filter(f => f.selected);
        },
        virtualGrid: function () {
            return this.files.length >= VIRTUAL_GRID_MIN_FILES;
        },
        // As tall as a tile: the rows are placed absolutely, a taller tile would draw into the next one
        gridRowHeight: function () {
            return tileHeight({ rootFontPx: this.rootFontPx, fontPx: this.fontPx });
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
    },
    mounted: function () {
        this.measureFonts();
        // Columns of the virtual grid follow the explorer's width, its rows the font size (which
        // changes with the viewport width, so a resize reads it again)
        if (typeof ResizeObserver !== 'undefined') {
            this._resizeObserver = new ResizeObserver(entries => {
                const width = entries[0]?.contentRect?.width ?? 0;
                if (width > 0) this.gridColumns = Math.max(1, Math.floor(width / GRID_CELL_WIDTH));
                this.measureFonts();
            });
            this._resizeObserver.observe(this.$refs.explorer);
        }
    },
    beforeUnmount: function () {
        this._resizeObserver?.disconnect();
        this.thumbnailLoader.visibility.disconnect();
    },
    methods: {
        // The tile names inherit the explorer's font size; the tile spacing is in rem
        measureFonts: function () {
            this.rootFontPx = fontSizePx(document.documentElement);
            this.fontPx = fontSizePx(this.$refs.explorer);
        },

        goToPath: function (path) {
            emitter.emit("folderOpened", pathutils.getTree(path));
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
                { shift: Keyboard.isShiftPressed(), ctrl: Keyboard.isToggleSelectPressed(), right: mouseBtn === Mouse.RIGHT });
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
/* The cells share the width: as many as fit at the cell width (the virtual grid counts the same), stretched to fill it */
#explorer {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(var(--grid-cell-width), 1fr));
    align-items: start;
    align-content: start;
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

    > .explorer-notice {
        grid-column: 1 / -1;
    }

}

#explorer-container {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
}
#explorer.virtual {
    display: block;
    overflow: hidden;
}

.thumbnail-grid {
    height: 100%;
}

.thumbnail-row {
    display: grid;
    grid-template-columns: repeat(var(--grid-columns), minmax(0, 1fr));
    align-items: start;
}

.grid-cell {
    display: flex;
    justify-content: center;
    min-width: 0;
}

/* The cell a drag is over, in both layouts (the virtual grid nests its cells in rows) */
.grid-cell.drop-target {
    outline: 2px dashed var(--ddb-primary);
    outline-offset: -2px;
    background-color: var(--ddb-bg-hover);
    border-radius: var(--ddb-radius-sm);
}
</style>
