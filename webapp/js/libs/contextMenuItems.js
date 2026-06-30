import ddb from 'ddb';
const { pathutils } = ddb;

import { hasDedicatedViewer, isMapViewable, isPanoramaType, isThumbnailCandidate, isDroneDB, isPlantHealthCapable, isArchiveFile } from '@/libs/entryTypes';
import { isPdfFile, canOpenAsText, shouldOpenAsText } from '@/libs/textFileUtils';
import { isBuildableFile, hasActiveBuild, buildFile, isFileBuilt, isBuildSucceeded } from '@/libs/build/buildHelpers';
import BuildManager, { BUILD_STATES } from '@/libs/build/buildManager';
import reg from '@/libs/api/sharedRegistry';
import { Features } from '@/libs/features';
import clipboard from '@/composables/useClipboard';

/**
 * Context object interface:
 * {
 *   getSelectedEntries: () => [{ entry, path, ... }]  - returns array of selected file objects
 *   canWrite: boolean
 *   dataset: object | null
 *   emit: (event, ...args) => void
 * }
 */

function openItem(ctx) {
    return {
        label: 'Open',
        icon: 'fa-regular fa-folder-open',
        isVisible: () => {
            const sel = ctx.getSelectedEntries();
            return sel.length > 0 && (sel.length > 1 || !hasDedicatedViewer(sel[0].entry.type));
        },
        click: () => {
            ctx.getSelectedEntries().forEach(f => ctx.emit('openItem', f));
        }
    };
}

function openMapItem(ctx) {
    return {
        label: 'Open Map',
        icon: 'fa-solid fa-map',
        isVisible: () => {
            const sel = ctx.getSelectedEntries();
            return sel.length === 1 && isMapViewable(sel[0].entry.type);
        },
        click: () => {
            ctx.getSelectedEntries().forEach(f => ctx.emit('openItem', f, 'map'));
        }
    };
}

function openPointCloudItem(ctx) {
    return {
        label: 'Open Point Cloud',
        icon: 'fa-solid fa-cube',
        isVisible: () => {
            const sel = ctx.getSelectedEntries();
            return sel.length === 1 && sel[0].entry.type === ddb.entry.type.POINTCLOUD;
        },
        click: () => {
            ctx.getSelectedEntries().forEach(f => ctx.emit('openItem', f, 'pointcloud'));
        }
    };
}

function openModelItem(ctx) {
    return {
        label: 'Open 3D Model',
        icon: 'fa-solid fa-cube',
        isVisible: () => {
            const sel = ctx.getSelectedEntries();
            return sel.length === 1 && sel[0].entry.type === ddb.entry.type.MODEL;
        },
        click: () => {
            ctx.getSelectedEntries().forEach(f => ctx.emit('openItem', f, 'model'));
        }
    };
}

function openUnifiedItem(ctx) {
    const T = ddb.entry.type;
    const supported = [T.POINTCLOUD, T.GEORASTER, T.VECTOR, T.MODEL];
    return {
        label: 'Open in 3D Viewer',
        icon: 'fa-solid fa-earth-europe',
        isVisible: () => {
            const sel = ctx.getSelectedEntries();
            return sel.length === 1 && supported.includes(sel[0].entry.type);
        },
        click: () => {
            ctx.getSelectedEntries().forEach(f => ctx.emit('openItem', f, 'unified'));
        }
    };
}

function openPanoramaItem(ctx) {
    return {
        label: 'Open Panorama',
        icon: 'fa-solid fa-globe',
        isVisible: () => {
            const sel = ctx.getSelectedEntries();
            return sel.length === 1 && isPanoramaType(sel[0].entry.type);
        },
        click: () => {
            ctx.getSelectedEntries().forEach(f => ctx.emit('openItem', f, 'panorama'));
        }
    };
}

function openSplatItem(ctx) {
    return {
        label: 'Open Gaussian Splat',
        icon: 'fa-solid fa-spray-can-sparkles',
        isVisible: () => {
            const sel = ctx.getSelectedEntries();
            return sel.length === 1 && sel[0].entry.type === ddb.entry.type.GAUSSIAN_SPLAT;
        },
        click: () => {
            ctx.getSelectedEntries().forEach(f => ctx.emit('openItem', f, 'splat'));
        }
    };
}

function openMarkdownItem(ctx) {
    return {
        label: 'Open Markdown',
        icon: 'fa-solid fa-book',
        isVisible: () => {
            const sel = ctx.getSelectedEntries();
            return sel.length === 1 && sel[0].entry.type === ddb.entry.type.MARKDOWN;
        },
        click: () => {
            ctx.getSelectedEntries().forEach(f => ctx.emit('openItem', f, 'markdown'));
        }
    };
}

function openPdfItem(ctx) {
    return {
        label: 'Open PDF',
        icon: 'file pdf outline',
        isVisible: () => {
            const sel = ctx.getSelectedEntries();
            return sel.length === 1 && isPdfFile(sel[0].entry);
        },
        click: () => {
            ctx.getSelectedEntries().forEach(f => ctx.emit('openItem', f));
        }
    };
}

function plantHealthItem(ctx) {
    return {
        label: 'Plant Health',
        icon: 'fa-solid fa-leaf',
        isVisible: () => {
            const sel = ctx.getSelectedEntries();
            return sel.length === 1 && isPlantHealthCapable(sel[0].entry);
        },
        click: () => {
            const sel = ctx.getSelectedEntries();
            if (sel.length === 1) ctx.emit('openItem', sel[0], 'planthealth');
        }
    };
}

function editItem(ctx) {
    return {
        label: 'Edit',
        icon: 'fa-regular fa-pen-to-square',
        isVisible: () => {
            const sel = ctx.getSelectedEntries();
            if (sel.length !== 1) return false;
            const entry = sel[0].entry;
            return !ddb.entry.isDirectory(entry) &&
                canOpenAsText(entry) &&
                !shouldOpenAsText(entry);
        },
        click: () => {
            const sel = ctx.getSelectedEntries();
            if (sel.length === 1) ctx.emit('openAsText', sel[0]);
        }
    };
}

function renameItem(ctx) {
    return {
        label: 'Rename',
        icon: 'fa-solid fa-pencil',
        isVisible: () => ctx.canWrite && ctx.getSelectedEntries().length === 1,
        accelerator: 'CmdOrCtrl+M',
        click: () => ctx.emit('moveSelectedItems')
    };
}

function propertiesItem(ctx) {
    return {
        label: 'Properties',
        icon: 'fa-solid fa-circle-info',
        isVisible: () => ctx.getSelectedEntries().length > 0,
        accelerator: 'CmdOrCtrl+P',
        click: () => ctx.emit('openProperties')
    };
}

function shareEmbedItem(ctx) {
    return {
        label: 'Share/Embed',
        icon: 'fa-solid fa-share-nodes',
        isVisible: () => ctx.getSelectedEntries().length === 1,
        click: () => {
            ctx.getSelectedEntries().forEach(f => ctx.emit('shareEmbed', f));
        }
    };
}

function downloadItem(ctx) {
    const isBulkSelection = () => {
        const sel = ctx.getSelectedEntries();
        if (sel.length === 0) return false;
        if (sel.length > 1) return true;
        // single selection: bulk if it's a directory
        return ddb.entry.isDirectory(sel[0].entry);
    };
    const isBulkBlocked = () =>
        !reg.isLoggedIn() &&
        reg.getFeature(Features.DISABLE_ANONYMOUS_BULK_DOWNLOADS) &&
        isBulkSelection();

    return {
        label: 'Download',
        icon: 'fa-solid fa-download',
        isVisible: () => ctx.getSelectedEntries().length > 0,
        isEnabled: () => !isBulkBlocked(),
        click: () => {
            if (isBulkBlocked()) return;
            ctx.emit('downloadItems', ctx.getSelectedEntries());
        }
    };
}

function buildItem(ctx) {
    return {
        label: 'Build',
        icon: 'fa-solid fa-gear',
        isVisible: () => {
            const sel = ctx.getSelectedEntries();
            return ctx.canWrite &&
                sel.length === 1 &&
                isBuildableFile(ctx.dataset, sel[0]) &&
                !hasActiveBuild(ctx.dataset, sel[0]);
        },
        click: async () => {
            const sel = ctx.getSelectedEntries();
            if (sel.length !== 1) return;
            try {
                const alreadyBuilt = await isFileBuilt(ctx.dataset, sel[0]);
                if (alreadyBuilt && ctx.showBuildConfirm) {
                    ctx.showBuildConfirm(sel[0], async () => {
                        await buildFile(ctx.dataset, sel[0]);
                    });
                } else {
                    await buildFile(ctx.dataset, sel[0]);
                }
            } catch (error) {
                ctx.emit('buildError', { file: sel[0], error: error.message });
            }
        }
    };
}

function transferItem(ctx) {
    return {
        label: 'Transfer to Dataset',
        icon: 'fa-solid fa-right-left',
        isVisible: () => {
            const sel = ctx.getSelectedEntries();
            return reg.isLoggedIn() && sel.length > 0 && !sel.find(f => isDroneDB(f.entry.type));
        },
        isEnabled: () => {
            const sel = ctx.getSelectedEntries();
            return !sel.some(f => hasActiveBuild(ctx.dataset, f));
        },
        accelerator: 'CmdOrCtrl+T',
        click: () => ctx.emit('transferSelectedItems')
    };
}

function copyClipboardItem(ctx) {
    return {
        label: 'Copy',
        icon: 'fa-solid fa-copy',
        accelerator: 'CmdOrCtrl+C',
        isVisible: () => {
            const sel = ctx.getSelectedEntries();
            return sel.length > 0 && !sel.find(f => isDroneDB(f.entry.type));
        },
        click: () => ctx.emit('copySelectedItems')
    };
}

function cutClipboardItem(ctx) {
    return {
        label: 'Cut',
        icon: 'fa-solid fa-scissors',
        accelerator: 'CmdOrCtrl+X',
        isVisible: () => {
            const sel = ctx.getSelectedEntries();
            return ctx.canWrite && sel.length > 0 && !sel.find(f => isDroneDB(f.entry.type));
        },
        click: () => ctx.emit('cutSelectedItems')
    };
}

function pasteClipboardItem(ctx) {
    return {
        label: 'Paste',
        icon: 'fa-solid fa-paste',
        accelerator: 'CmdOrCtrl+V',
        isVisible: () => ctx.canWrite && !clipboard.isEmpty.value,
        click: () => ctx.emit('pasteFromClipboard')
    };
}

function clipboardSeparator(ctx) {
    return {
        type: 'separator',
        isVisible: () => {
            const sel = ctx.getSelectedEntries();
            const hasSel = sel.length > 0 && !sel.find(f => isDroneDB(f.entry.type));
            return hasSel || (ctx.canWrite && !clipboard.isEmpty.value);
        }
    };
}

function setThumbnailItem(ctx) {
    return {
        label: 'Set as Dataset Thumbnail',
        icon: 'fa-solid fa-image',
        isVisible: () => {
            const sel = ctx.getSelectedEntries();
            if (!ctx.canWrite || sel.length !== 1) return false;
            const file = sel[0];
            const type = file.entry.type;
            if (!isThumbnailCandidate(type)) return false;
            const candidates = reg.getFeatureValue(Features.DATASET_THUMBNAIL_CANDIDATES);
            if (candidates && candidates.some(c => c.toLowerCase() === pathutils.basename(file.entry.path).toLowerCase())) return false;
            if (type === ddb.entry.type.GEORASTER) {
                const buildState = BuildManager.getBuildState(ctx.dataset, file.entry.path);
                if (!buildState) return true;
                return buildState.currentState !== BUILD_STATES.FAILED && !hasActiveBuild(ctx.dataset, file);
            }
            return true;
        },
        click: () => {
            const sel = ctx.getSelectedEntries();
            if (sel.length === 1) ctx.emit('setAsCover', sel[0]);
        }
    };
}

function deleteSeparator(ctx) {
    return {
        type: 'separator',
        isVisible: () => {
            const sel = ctx.getSelectedEntries();
            return ctx.canWrite && sel.length > 0 && !sel.find(f => isDroneDB(f.entry.type));
        }
    };
}

function deleteItem(ctx) {
    return {
        label: 'Delete',
        icon: 'fa-solid fa-trash',
        accelerator: 'CmdOrCtrl+D',
        isVisible: () => {
            const sel = ctx.getSelectedEntries();
            return ctx.canWrite && sel.length > 0 && !sel.find(f => isDroneDB(f.entry.type));
        },
        click: () => ctx.emit('deleteSelecteditems')
    };
}

function selectAllNoneItem(ctx) {
    return {
        label: 'Select All/None',
        icon: 'fa-solid fa-list',
        accelerator: 'CmdOrCtrl+A',
        click: () => {
            if (ctx.onSelectAllNone) ctx.onSelectAllNone();
        }
    };
}

function createFolderItem(ctx) {
    return {
        label: 'Create Folder',
        icon: 'fa-solid fa-folder',
        isVisible: () => ctx.canWrite,
        accelerator: 'CmdOrCtrl+N',
        click: () => ctx.emit('createFolder')
    };
}

function selectionSeparator(ctx) {
    return {
        type: 'separator',
        isVisible: () => ctx.getSelectedEntries().length > 0
    };
}

/**
 * Build the standard viewer context menu items.
 * These are the Open/Open Map/Open Point Cloud/etc items shared across all views.
 */
function buildViewerMenuItems(ctx) {
    return [
        openItem(ctx),
        openMapItem(ctx),
        openPointCloudItem(ctx),
        openModelItem(ctx),
        openUnifiedItem(ctx),
        openPanoramaItem(ctx),
        openSplatItem(ctx),
        openMarkdownItem(ctx),
        openPdfItem(ctx),
        plantHealthItem(ctx)
    ];
}

/**
 * Build the standard action context menu items.
 * These are Edit/Rename/Properties/Share/Download/Build/Transfer/Thumbnail items.
 */
function mergeMultispectralItem(ctx) {
    return {
        label: 'Merge Multispectral Bands',
        icon: 'fa-solid fa-layer-group',
        isVisible: () => {
            const sel = ctx.getSelectedEntries();
            if (!ctx.canWrite || sel.length < 2) return false;
            return sel.every(f =>
                (f.entry.type === ddb.entry.type.GEORASTER || f.entry.type === ddb.entry.type.GEOIMAGE) &&
                f.entry.path.toLowerCase().match(/\.tiff?$/)
            );
        },
        click: () => ctx.emit('mergeMultispectral', ctx.getSelectedEntries())
    };
}

function maskBordersItem(ctx) {
    return {
        label: 'Mask Borders',
        icon: 'fa-solid fa-eraser',
        isVisible: () => {
            const sel = ctx.getSelectedEntries();
            return ctx.canWrite &&
                sel.length === 1 &&
                sel[0].entry.type === ddb.entry.type.GEORASTER;
        },
        click: () => ctx.emit('maskBorders', ctx.getSelectedEntries()[0])
    };
}

function alignGeoRasterItem(ctx) {
    return {
        label: 'Align to Reference...',
        icon: 'fa-solid fa-crosshairs',
        isVisible: () => {
            const sel = ctx.getSelectedEntries();
            return ctx.canWrite &&
                sel.length === 1 &&
                sel[0].entry.type === ddb.entry.type.GEORASTER &&
                /\.tiff?$/i.test(sel[0].entry.path);
        },
        click: () => ctx.emit('alignGeoRaster', ctx.getSelectedEntries()[0])
    };
}

function extractItem(ctx) {
    return {
        label: 'Extract',
        icon: 'fa-solid fa-box',
        isVisible: () => {
            const sel = ctx.getSelectedEntries();
            return ctx.canWrite && sel.length === 1 && isArchiveFile(sel[0].entry);
        },
        click: () => ctx.emit('extractItem', ctx.getSelectedEntries()[0])
    };
}

/**
 * Factory: create a context menu item for downloading a build artifact.
 * @param {string} label - Menu item label (e.g. "Download COG")
 * @param {string} icon - Font Awesome icon class
 * @param {number} entryType - ddb.entry.type constant (GEORASTER, POINTCLOUD, VECTOR)
 * @param {object} ctx - Context menu context object
 */
function makeDownloadItem(label, icon, entryType, ctx) {
    return {
        label,
        icon,
        isVisible: () => {
            const sel = ctx.getSelectedEntries();
            return sel.length === 1
                && sel[0].entry.type === entryType
                && isBuildSucceeded(ctx.dataset, sel[0]);
        },
        click: () => {
            const sel = ctx.getSelectedEntries();
            if (sel.length === 1) ctx.emit('downloadBuildArtifact', sel[0]);
        }
    };
}

function toolsItem(ctx) {
    const cogItem = makeDownloadItem('Download COG', 'fa-solid fa-file-image', ddb.entry.type.GEORASTER, ctx);
    const copcItem = makeDownloadItem('Download COPC', 'fa-solid fa-cube', ddb.entry.type.POINTCLOUD, ctx);
    const gpkgItem = makeDownloadItem('Download GPKG', 'fa-solid fa-map', ddb.entry.type.VECTOR, ctx);

    return {
        label: 'Tools',
        icon: 'fa-solid fa-wrench',
        items: [
            mergeMultispectralItem(ctx),
            maskBordersItem(ctx),
            alignGeoRasterItem(ctx),
            extractItem(ctx),
            {
                type: 'separator',
                isVisible: () => cogItem.isVisible() || copcItem.isVisible() || gpkgItem.isVisible()
            },
            cogItem,
            copcItem,
            gpkgItem
        ]
    };
}

function buildActionMenuItems(ctx) {
    const shareDownloadVisible = () => ctx.getSelectedEntries().length > 0;
    return [
        editItem(ctx),
        propertiesItem(ctx),
        {
            type: 'separator',
            isVisible: shareDownloadVisible
        },
        shareEmbedItem(ctx),
        downloadItem(ctx),
        {
            type: 'separator',
            isVisible: shareDownloadVisible
        },
        buildItem(ctx),
        toolsItem(ctx),
        transferItem(ctx),
        setThumbnailItem(ctx),
        clipboardSeparator(ctx),
        renameItem(ctx),
        copyClipboardItem(ctx),
        cutClipboardItem(ctx),
        pasteClipboardItem(ctx)
    ];
}

/**
 * Build the standard footer context menu items.
 * Separator, Select All/None, Create Folder, Delete separator, Delete.
 */
function buildFooterMenuItems(ctx) {
    return [
        selectionSeparator(ctx),
        selectAllNoneItem(ctx),
        createFolderItem(ctx),
        deleteSeparator(ctx),
        deleteItem(ctx)
    ];
}

/**
 * Build the full standard context menu for Explorer and TableView.
 * @param {object} ctx - Context object
 * @returns {Array} context menu items
 */
function buildStandardContextMenu(ctx) {
    return [
        ...buildViewerMenuItems(ctx),
        ...buildActionMenuItems(ctx),
        ...buildFooterMenuItems(ctx)
    ];
}

export {
    // Individual items
    openItem,
    openMapItem,
    openPointCloudItem,
    openModelItem,
    openUnifiedItem,
    openPanoramaItem,
    openMarkdownItem,
    openPdfItem,
    plantHealthItem,
    editItem,
    renameItem,
    propertiesItem,
    shareEmbedItem,
    downloadItem,
    buildItem,
    toolsItem,
    transferItem,
    setThumbnailItem,
    mergeMultispectralItem,
    alignGeoRasterItem,
    extractItem,
    deleteItem,
    deleteSeparator,
    selectAllNoneItem,
    createFolderItem,
    selectionSeparator,
    copyClipboardItem,
    cutClipboardItem,
    pasteClipboardItem,
    clipboardSeparator,
    // Grouped builders
    buildViewerMenuItems,
    buildActionMenuItems,
    buildFooterMenuItems,
    buildStandardContextMenu
};
