/**
 * File Operations Mixin
 * Manages file operations like rename, delete, create folder, etc.
 */
import { clone } from '../libs/utils';
import icons from '../libs/icons';
import BuildManager from '../libs/buildManager';
import ddb from 'ddb';
const { pathutils } = ddb;

export default {
    data() {
        return {
            isBusy: false,
            flash: ""
        };
    },

    methods: {
        sortFiles() {
            this.$log.info("ViewDataset.sortFiles");
            this.fileBrowserFiles = this.fileBrowserFiles.sort((n1, n2) => {
                var a = n1.entry;
                var b = n2.entry;

                // Folders first
                let aDir = ddb.entry.isDirectory(a);
                let bDir = ddb.entry.isDirectory(b);

                if (aDir && !bDir) return -1;
                else if (!aDir && bDir) return 1;
                else {
                    // then filename ascending
                    return pathutils.basename(a.path.toLowerCase()) > pathutils.basename(b.path.toLowerCase()) ? 1 : -1
                }
            });
        },

        async deleteSelectedFiles() {
            this.isBusy = true;

            try {
                var deleted = [];

                for (var file of this.contextMenuFiles) {
                    await this.dataset.deleteObj(file.entry.path);
                    deleted.push(file.entry.path);
                }

                this.fileBrowserFiles = this.fileBrowserFiles.filter(item => !deleted.includes(item.entry.path));

                this.$root.$emit('deleteEntries', deleted);

            } catch (e) {
                this.showError(e, "Delete");
            }

            this.isBusy = false;
        },

        async renameFile(file, newPath) {
            try {
                var oldPath = file.entry.path;
                await this.dataset.moveObj(oldPath, newPath);

                // Remove both the new file path and the old one because it could be a replace
                this.fileBrowserFiles = this.fileBrowserFiles.filter(item => item.entry.path != oldPath && item.entry.path != newPath);

                var newItem = clone(file);
                newItem.path = this.dataset.remoteUri(newPath),
                    newItem.label = pathutils.basename(newPath);
                newItem.entry.path = newPath;

                // Add it to our explorer (we are in the same folder)
                if (pathutils.getParentFolder(newPath) == (this.currentPath || null)) {
                    this.fileBrowserFiles.push(newItem);
                }

                // Tell filebrowser to remove the file in the old location and add to the new location
                this.$root.$emit('deleteEntries', [oldPath]);
                this.$root.$emit('addItems', [newItem]);

                this.sortFiles();

            } catch (e) {
                this.showError(e, "Rename file");
            }
        },

        async renameSelectedFile(newPath) {
            var source;

            if (this.selectedUsingFileBrowserList) {
                if (this.fileBrowserFiles.length == 0) return;
                source = this.fileBrowserFiles[0];
            } else {
                if (this.selectedFiles.length == 0) return;
                source = this.selectedFiles[0];
            }

            this.isBusy = true;

            await this.renameFile(source, newPath);

            this.isBusy = false;
        },

        async createFolder(newPath) {
            this.isBusy = true;

            newPath = this.currentPath ? this.currentPath + "/" + newPath : newPath;

            try {
                var entry = await this.dataset.createFolder(newPath);

                const base = pathutils.basename(entry.path);

                var remoteUri = this.dataset.remoteUri(this.currentPath != null ? pathutils.join(this.currentPath, base) : base);

                this.$log.info("Remote uri", remoteUri);

                var folderItem = {
                    icon: icons.getForType(entry.type),
                    label: base,
                    path: remoteUri,
                    selected: false,
                    entry,
                    empty: true,
                    isExpandable: ddb.entry.isDirectory(entry)
                };

                this.fileBrowserFiles.push(folderItem);

                this.sortFiles();

                // Tell filebrowser to add items
                this.$root.$emit('addItems', [folderItem]);

            } catch (e) {
                this.showError(e, "Create folder");
            }

            this.isBusy = false;
        },

        handleMoveItem: async function (node, path) {
            await this.renameFile(node, path);
        },

        handleAddMarkdown(document, entry) {
            this.handleAddClose([entry]);
            this.handleOpenItem({
                label: document,
                entry,
                path: this.dataset.remoteUri(document)
            });
            this.showSettings = false;
        },

        closeFlash() {
            this.flash = "";
        }
    }
};
