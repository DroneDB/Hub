<template>
    <div id="explorer-container">
        <ContextMenu :items="contextMenu" />
        <Toolbar v-if="tools" :tools="tools" />
        <div v-if="currentPath">
            <PathBreadcrumb :path="currentPath" root-path="/" class="mt-3 ms-3" @navigate="goToPath" />
        </div>
        <!-- A list of files is a listbox; an empty folder is not (its empty state has buttons of its own), the
             drop area stays -->
        <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -- a listbox (bound role) while it has files; empty, its keys and clicks only clear a selection and it is the drop area -->
        <div id="explorer" ref="explorer" :class="{ loading, dropping, virtual: virtualGrid }"
             :style="{ '--grid-cell-width': gridCellWidth + 'px' }"
             :role="hasFiles ? 'listbox' : undefined" :aria-label="hasFiles ? 'Files' : undefined"
             :aria-multiselectable="hasFiles ? 'true' : undefined" :tabindex="hasFiles ? 0 : undefined" data-file-list
             :aria-activedescendant="hasFiles ? nav.activeId.value : undefined"
             @click="onClick" @contextmenu="onBackgroundContextMenu" @focus="onFocus" @keydown="onKeydown" @keydown.esc="clearSelection"
             @drop="explorerDropHandler($event)" @dragleave="explorerDragLeave($event)"
             @dragenter="explorerDragEnter($event)" @dragover.prevent>
            <div v-if="isLoadingFiles && files.length === 0" class="explorer-notice m-3">
                <LoadingSpinner />
            </div>
            <div v-else-if="files.length === 0" class="explorer-notice text-center m-3">
                <!-- Not while an import runs: its files are coming (the banner of the page says so, FR-UPL-10) -->
                <FolderEmptyState v-if="!importing" :can-write="canWrite" @upload="$emit('upload')" @import-from-url="$emit('importFromUrl')" />
            </div>
            <!-- Large folders: only the rows on screen are rendered -->
            <VirtualScroller v-else-if="virtualGrid" ref="grid" v-slot="{ item: row }" class="thumbnail-grid"
                             :items="gridRows" :item-size="gridRowHeight" :min-height="0">
                <div class="thumbnail-row" :style="{ '--grid-columns': gridColumns }">
                    <div v-for="{ file: f, idx } in row.cells" :key="'E,' + f.path" class="grid-cell" role="presentation" :draggable="canWrite" :class="{ 'drop-target': dropTargetPath !== null && dropTargetPath === f.entry.path }"
                         @dragstart="startDrag($event, f)" @drop="onDrop($event, f)"
                         @dragenter="itemDragEnter($event, f)" @dragover="itemDragOver($event, f)"
                         @dragleave="itemDragLeave($event, f)">
                        <Thumbnail :id="nav.idOf(idx)" ref="thumbs" :file="f" :data-idx="idx" :active="nav.active.value === idx" :lazy-load="true" :dataset="dataset"
                                   :size="thumbnailSize" @clicked="handleSelection" @open="handleOpen" />
                    </div>
                </div>
            </VirtualScroller>
            <template v-else>
                <div v-for="(f, idx) in files" :key="'E,' + f.path" class="grid-cell" role="presentation" :draggable="canWrite" :class="{ 'drop-target': dropTargetPath !== null && dropTargetPath === f.entry.path }"
                     @dragstart="startDrag($event, f)" @drop="onDrop($event, f)"
                     @dragenter="itemDragEnter($event, f)" @dragover="itemDragOver($event, f)"
                     @dragleave="itemDragLeave($event, f)">
                    <Thumbnail :id="nav.idOf(idx)" ref="thumbs" :file="f" :data-idx="idx" :active="nav.active.value === idx" :lazy-load="true" :dataset="dataset"
                               :size="thumbnailSize" @clicked="handleSelection" @open="handleOpen" />
                </div>
            </template>
        </div>
    </div>
</template>

<script>
import Thumbnail from './EntryThumbnail.vue';
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import FolderEmptyState from './FolderEmptyState.vue';
import VirtualScroller from '@/components/VirtualScroller.vue';
import { createThumbnailQueue, createVisibilityTracker } from '@/libs/thumbnailQueue';
import { gridCellWidth as cellWidthOf, tileHeight, tileThumbnailSize } from './tileGeometry';

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
import { getCurrentInstance, nextTick, useId } from 'vue';
import { useDragDrop } from '@/composables/useDragDrop';
import { useFileSelection } from '@/composables/useFileSelection';
import { useListNavigation } from '@/composables/useListNavigation';

export default {
    name: 'DatasetExplorer',
    components: {
        Thumbnail, LoadingSpinner, FolderEmptyState, Toolbar, ContextMenu, PathBreadcrumb, VirtualScroller
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
        // An import into the dataset runs: the empty-folder hint is not shown (FR-UPL-10)
        importing: { type: Boolean, default: false },
        isLoadingFiles: { type: Boolean, default: false },
        // The size of the thumbnails: 's' (128 px), 'm' (192) or 'l' (256), FR-EXP-43
        tileSize: { type: String, default: 's' }
    },
    emits: ['upload', 'importFromUrl', 'refresh', 'openItem', 'openAsText', 'moveSelectedItems', 'openProperties', 'shareEmbed', 'downloadItems', 'transferSelectedItems', 'setAsCover', 'createFolder', 'deleteSelecteditems', 'buildStarted', 'buildError', 'selectionChanged', 'mergeMultispectral', 'maskBorders', 'extractItem', 'setCrs', 'copySelectedItems', 'cutSelectedItems', 'pasteFromClipboard', 'downloadBuildArtifact', 'downloadSplat', 'exportSplatTrainingData'],
    setup(props) {
        const instance = getCurrentInstance();
        // One tab stop: the list holds the focus and names its active tile (aria-activedescendant), FR-EXP-09
        const nav = useListNavigation({
            count: () => props.files.length,
            columns: () => instance.proxy.columnCount(),
            idPrefix: `${useId()}-tile`,
            move: (index, mods) => instance.proxy.moveTo(index, mods),
            open: index => instance.proxy.openAt(index),
            toggle: index => instance.proxy.toggleAt(index)
        });
        return {
            ...useDragDrop(props, { selectedFiles: () => instance.proxy.selectedFiles }),
            selection: useFileSelection(() => props.files, f => f.path),
            nav
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
            // Every file of the folder, rendered or not (the virtual grid renders only some)
            getFiles: () => self.files,
            selectAll: on => (on ? self.selectAll() : self.deselectAll()),
            component: self
        };

        const contextMenu = buildStandardContextMenu(ctx);

        return {
            loading: false,
            contextMenu,
            gridColumns: 6,
            // The width of the explorer, 0 until measured
            gridWidth: 0,
            // The font sizes the tiles are laid out with (the body font grows on phones)
            rootFontPx: 16,
            fontPx: 16
        };
    },
    computed: {
        // A list of files is the one tab stop of the files (FR-EXP-09); an empty folder is no listbox
        hasFiles: function () {
            return this.files.length > 0;
        },
        selectedFiles: function () {
            return this.files.filter(f => f.selected);
        },
        virtualGrid: function () {
            return this.files.length >= VIRTUAL_GRID_MIN_FILES;
        },
        // The side of the thumbnail, in px at a 16 px root font
        thumbnailSize: function () {
            return tileThumbnailSize(this.tileSize);
        },
        // The narrowest grid column: the thumbnail and what is around it
        gridCellWidth: function () {
            return cellWidthOf(this.thumbnailSize);
        },
        // As tall as a tile: the rows are placed absolutely, a taller tile would draw into the next one
        gridRowHeight: function () {
            return tileHeight({ rootFontPx: this.rootFontPx, fontPx: this.fontPx, size: this.thumbnailSize });
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
    watch: {
        // Another thumbnail size: the cells are another width, and the tile the keyboard is on (else the first one on
        // screen in the virtual grid) stays in view once the grid is laid out again
        thumbnailSize: async function (size, before) {
            const active = this.nav.active.value;
            const first = active < 0 && this.virtualGrid ? this.firstShownIndex(before) : -1;
            this.fitColumns();
            if (active < 0 && first < 0) return;
            await nextTick();
            if (active >= 0) this.reveal(active);
            else this.$refs.grid?.scrollToIndex(Math.floor(first / this.gridColumns));
        },
        // Another folder: the keyboard starts again from its first tile
        files() {
            this.nav.active.value = -1;
        }
    },
    mounted: function () {
        this.measureFonts();
        // Columns of the virtual grid follow the explorer's width, its rows the font size (which
        // changes with the viewport width, so a resize reads it again)
        if (typeof ResizeObserver !== 'undefined') {
            this._resizeObserver = new ResizeObserver(entries => {
                const width = entries[0]?.contentRect?.width ?? 0;
                if (width > 0) { this.gridWidth = width; this.fitColumns(); }
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
        // The columns of the virtual grid: as many cells as the width holds
        fitColumns: function () {
            if (this.gridWidth > 0) this.gridColumns = Math.max(1, Math.floor(this.gridWidth / this.gridCellWidth));
        },
        // The first file of the top row on screen in the virtual grid laid out at the thumbnail side `size`
        // (-1 at the top: nothing to keep in view)
        firstShownIndex: function (size) {
            const top = this.$refs.grid?.scrollElement?.scrollTop ?? 0;
            if (top <= 0) return -1;
            const row = Math.floor(top / tileHeight({ rootFontPx: this.rootFontPx, fontPx: this.fontPx, size }));
            return Math.min(this.files.length - 1, row * this.gridColumns);
        },
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
        // A right click on the empty area clears the selection first: the menu that opens is the
        // folder's (New folder, Upload, Paste, Select all, Refresh), as in a file manager
        onBackgroundContextMenu: function (e) {
            if (!(e.target instanceof Element) || !e.target.closest('.thumbnail')) this.clearSelection();
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
        // ---- Keyboard (useListNavigation) ----
        onKeydown: function (e) {
            // Keys of the list itself, not of something inside it
            if (e.target === e.currentTarget) this.nav.onKeydown(e);
        },
        // Focus enters on the first selected tile, else the first
        onFocus: function (e) {
            if (e.target !== e.currentTarget || this.nav.active.value >= 0) return;
            this.nav.setActive(Math.max(0, this.files.findIndex(f => f.selected)));
        },
        // Tiles per row: the columns the grid lays out (the virtual grid counts them itself)
        columnCount: function () {
            if (!this.virtualGrid && this.$refs.explorer) {
                const tracks = getComputedStyle(this.$refs.explorer).gridTemplateColumns.split(' ').filter(t => /^[\d.]+px$/.test(t)).length;
                if (tracks > 0) return tracks;
            }
            return this.gridColumns;
        },
        // The arrows move the selection with the active tile; Ctrl+arrow moves the active tile only
        moveTo: function (index, { extend, keepSelection }) {
            const file = this.files[index];
            if (!file) return;
            if (!keepSelection) {
                this.selection.load(this.selectedFiles);
                this.selection.toggle(index, { shift: extend });
                this.applySelection();
                this.$emit('selectionChanged', file);
            }
            this.reveal(index);
        },
        toggleAt: function (index) {
            const file = this.files[index];
            if (!file) return;
            this.selection.load(this.selectedFiles);
            this.selection.toggle(index, { ctrl: true });
            this.applySelection();
            this.$emit('selectionChanged', file);
        },
        openAt: function (index) {
            const file = this.files[index];
            if (file) this.handleOpen({ file });
        },
        // Scrolls the active tile into view (the virtual grid renders only the rows on screen)
        reveal: async function (index) {
            const el = () => document.getElementById(this.nav.idOf(index));
            if (!el() && this.virtualGrid) {
                this.$refs.grid?.scrollToIndex(Math.floor(index / this.columnCount()));
                await nextTick();
            }
            el()?.scrollIntoView?.({ block: 'nearest' });
        },

        handleSelection: function (thumb, mouseBtn) {
            if (!thumb) return;
            const file = thumb.file;
            // A click makes its tile the active one
            this.nav.setActive(this.files.indexOf(file));
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

/* The list holds the focus; its active tile shows the focus ring, only while the list has it (FR-EXP-09) */
#explorer:focus-visible {
    outline: none;
}

#explorer:focus-visible :deep(.thumbnail.active) {
    outline: var(--ddb-focus-ring-width) solid var(--ddb-focus-ring-color);
    outline-offset: calc(-1 * var(--ddb-focus-ring-width));
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
