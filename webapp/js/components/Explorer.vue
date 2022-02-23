<template>
<div id="explorer-container" >
    <ContextMenu :items="contextMenu" />
    <Toolbar :tools="tools" v-if="tools" />
    <div v-if="currentPath">
        <div class="ui large breadcrumb" style="margin-top: 1rem; margin-left: 1rem">      
            <span v-for="(b, idx) in breadcrumbs" :key="'B,' + b.name">
                <a v-if="idx != breadcrumbs.length - 1" class="section" :class="{home: idx === 0}" v-on:click="goTo(b)">{{b.name}}</a>
                <div v-if="idx == breadcrumbs.length - 1" class="section active">{{b.name}}</div>
                <span v-if="idx != breadcrumbs.length - 1" class="divider">/</span>
            </span>            
        </div>
        <div class="ui divider"></div>
    </div>
    <div ref="explorer" id="explorer" @click="onClick" :class="{loading, dropping}" @scroll="onScroll" @drop="explorerDropHandler($event)" @dragleave="explorerDragLeave($event)" @dragenter="explorerDragEnter($event)" @dragover.prevent>
        <div v-for="(f, idx) in files" :key="'E,' + f.path" draggable
                    @dragstart="startDrag($event, f)"
                    @drop="onDrop($event, f)"
                    @dragenter.prevent
                    @dragover.prevent
                    >
            <Thumbnail 
            :file="f"         
            :data-idx="idx" 
            ref="thumbs" 
            @clicked="handleSelection" 
            @open="handleOpen"
            :lazyLoad="true"                
                />    
        </div>    
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

import ddb from 'ddb';
const { pathutils } = ddb;

import { entry } from 'ddb';
import shell from '../dynamic/shell';
import env from '../dynamic/env';
import ContextMenu from './ContextMenu';

export default {
    components: {
        Thumbnail, Toolbar, ContextMenu, Window
    },
    props: ['files', 'currentPath', 'tools'],
    data: function () {
        let contextMenu = [];

        if (env.isElectron()){
            contextMenu = contextMenu.concat([{
                        label: "Open Item Location",
                        icon: 'open folder outline', 
                        isVisible: () => { return this.selectedFiles.length > 0; },
                        click: () => {
                            if (this.selectedFiles.length > 0) shell.showItemInFolder(this.selectedFiles[0].path);
                        },
                        accelerator: "Alt+CmdOrCtrl+R",
                    },{
                        type: 'separator'
                    },{
                        label: "Share",
                        icon: 'share alternate',
                        accelerator: "CmdOrCtrl+S",
                        isVisible: () => { return this.selectedFiles.length > 0; },
                        click: () => {
                            if (this.selectedFiles.length > 0) dispatchEvent(new Event("btnShare_Click"));
                        }
                    },{
                        type: 'separator'
                    }]);
        }

        contextMenu = contextMenu.concat([{
                    label: 'Open Item',
                    icon: 'folder open outline',
                    isVisible: () => { return this.selectedFiles.length > 0; },
                    click: () => {
                        this.selectedFiles.forEach(f => {
                            this.$emit('openItem', f);
                        });
                    }
                },{
                    label: "Create Folder",
                    icon: 'folder',
                    accelerator: "CmdOrCtrl+N",
                    click: () => {
                        this.$emit("createFolder");
                    }
                },{
                    label: "Select All/None",
                    icon: 'list',
                    accelerator: "CmdOrCtrl+A",
                    click: () => {
                        if (!this.$refs.thumbs) return;
                        if (this.selectedFiles.length === this.$refs.thumbs.length) {
                            this.deselectAll();
                        } else {
                            this.selectAll();
                        }
                    }
                },
                {
                    label: "Properties",
                    isVisible: () => { return this.selectedFiles.length > 0; },
                    icon: 'info circle',
                    accelerator: "CmdOrCtrl+P",
                    click: () => {
                        this.$emit("openProperties");
                    }
                },
                {
                    label: "Get Link",
                    isVisible: () => { return this.selectedFiles.length === 1; },
                    icon: 'linkify',
                    accelerator: "CmdOrCtrl+L",
                    click: () => {
                        console.log("TODO!")
                    }
                },
                {
                    label: "Rename",
                    icon: 'pencil alternate',
                    isVisible: () => { return this.selectedFiles.length == 1; },
                    accelerator: "CmdOrCtrl+M",
                    click: () => {
                        this.$emit("moveSelectedItems");
                    }
                },
                {
                    isVisible: () => { return this.selectedFiles.length > 0  && !this.selectedFiles.find(f => f.entry.type === ddb.entry.type.DRONEDB); },
                    type: 'separator'
                },
                {
                    label: "Delete",
                    icon: 'trash alternate outline',
                    isVisible: () => { return this.selectedFiles.length > 0 && !this.selectedFiles.find(f => f.entry.type === ddb.entry.type.DRONEDB); },
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
        breadcrumbs: function() {
            if (this.currentPath == null || this.currentPath.length == 0) return null;

            var folders = this.currentPath.split('/');
            var cur = "";
            var bc = [];

            for(var el of folders) {
                cur += '/' + el;

                bc.push({
                    path: cur.substring(1),
                    name: el
                });
            }

            if (bc.length > 0){
                bc.unshift({
                    path: "/",
                    name: "~"
                })
            }

            return bc;
        }
    },
    mounted: function () {
        this.rangeStartThumb = null;
    },
    updated: function(){
        this.lazyLoadThumbs();
    },
    methods: {

        explorerDragEnter: function(evt) {
            //evt.preventDefault();
            console.log("Enter", evt);
            this.dropping = true;
        },

        explorerDragLeave: function(evt) {
            //evt.preventDefault();
            console.log("Leave");
            this.dropping = false;

        },

        getFiles: function(ev) {
            var files = [];

            if (ev.dataTransfer.items) {
                // Use DataTransferItemList interface to access the file(s)
                for (var i = 0; i < ev.dataTransfer.items.length; i++) {
                    // If dropped items aren't files, reject them
                    if (ev.dataTransfer.items[i].kind === 'file') {
                        var file = ev.dataTransfer.items[i].getAsFile();
                        files.push(file);
                    }
                }
            } else {
                files = ev.dataTransfer.files;
            }

            return files;
        },

        explorerDropHandler: function(ev) {
            ev.preventDefault();

            this.dropping = false;

            var files = this.getFiles(ev);
            if (files.length == 0) return;

            this.$root.$emit('uploadItems', { files: files, path: this.currentPath});
            
        },

        goTo: function(itm) {
            this.$root.$emit("folderOpened", pathutils.getTree(itm.path));
        },

        startDrag: (evt, item) => {
            evt.dataTransfer.dropEffect = 'move';
            evt.dataTransfer.effectAllowed = 'move';
            
            evt.dataTransfer.setData('item', JSON.stringify(clone(item)));
        },

        onDrop (evt, item) {
                            
            this.dropping = false;

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

        drop (sourceItem, destFolder) {
            
            if (entry.isDirectory(sourceItem.entry) && (destFolder + '/').startsWith(sourceItem.entry.path + '/')) {
                this.$log.info("Cannot copy a folder on itself or one of its descendants");
                return;
            }
            
            const destPath = pathutils.join(destFolder, pathutils.basename(sourceItem.entry.path));

            this.$emit('moveItem', sourceItem, destPath);
        },

        onTabActivated: function(){
            this.$nextTick(() => {
                this.lazyLoadThumbs();
            });
        },

        onPanelResized: function(){
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
        lazyLoadThumbs: function(){
            if (!this.$refs.thumbs) return;

            const parentBcr = this.$el.getBoundingClientRect();
            this.$refs.thumbs.forEach(t => {
                const thumbBcr = t.getBoundingRect();
                if (thumbBcr.bottom - parentBcr.top  > 0 &&
                    parentBcr.bottom - thumbBcr.top > 0 &&
                    thumbBcr.right - parentBcr.left > 0 &&
                    parentBcr.right - thumbBcr.left > 0){
                    t.loadThumbnail();
                }
            });
        },
        onScroll: function(){
            if (this.scrollTimeout){
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
        clearSelection: function() {
            this.files.forEach(f => f.selected = false);
        },
        handleOpen: async function (thumb) {
            const file = thumb.file;

            if (entry.isDirectory(file.entry)) {
                this.$root.$emit("folderOpened", pathutils.getTree(file.entry.path));
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
                this.selectRange(this.rangeStartThumb, thumb, this.$refs.thumbs);
            } else {

                // Single selection
                if (mouseBtn === Mouse.RIGHT) {
                    if (!file.selected) this.selectedFiles.forEach(f => f.selected = false);
                    file.selected = false;
                }
                file.selected = !file.selected;
                this.rangeStartThumb = thumb;
            }
        },

        selectRange: function (low, high, thumbs) {
            if (!thumbs) return;

            let idxLow = parseInt(low.$el.getAttribute('data-idx')),
                idxHigh = parseInt(high.$el.getAttribute('data-idx'));

            if (idxLow > idxHigh) {
                [low, high] = [high, low];
                [idxLow, idxHigh] = [idxHigh, idxLow];
            }

            let $n = low.$el;
            while ($n != high.$el && $n !== null) {
                const f = thumbs[parseInt($n.getAttribute('data-idx'))].file;
                f.selected = true;
                $n = $n.parentElement.nextSibling.children[0];
            }

            if ($n !== null) {
                // Select last
                const f = thumbs[parseInt($n.getAttribute('data-idx'))].file;
                f.selected = true;
            }
        },

        scrollTo: function(file){
            const thumb = this.$refs.thumbs.find(t => t.file === file);
            if (thumb){
                this.$refs.explorer.scrollTo(0, thumb.$el.offsetTop - this.$el.offsetTop - 12);
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
    padding: 8px;
    overflow-y: auto;
    user-select: none;
    transition: all 0.25s ease;

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
    .breadcrumb{
        word-break: break-all;
        overflow: hidden;
        .section.home{
            font-family: monospace;
        }
    }
}
</style>
