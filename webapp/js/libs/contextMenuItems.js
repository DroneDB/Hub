import ddb from 'ddb';
const { pathutils } = ddb;

import { isLocalVector } from '@/libs/openItemDefaults';
import { isCadDrawing } from '@/libs/cadCrs';
import { hasDedicatedViewer, isMapViewable, isPanoramaType, isDroneDB, isPlantHealthCapable, isArchiveFile } from '@/libs/entryTypes';
import { hasThumbnail, isBuildableType } from '@/libs/entryTypeCapabilities';
import { isPdfFile, canOpenAsText, shouldOpenAsText } from '@/libs/textFileUtils';
import { isBuildableFile, hasActiveBuild, buildFile, isFileBuilt, isBuildComplete } from '@/libs/build/buildHelpers';
import BuildManager, { BUILD_STATES } from '@/libs/build/buildManager';
import reg from '@/libs/api/sharedRegistry';
import { Features } from '@/libs/features';
import { useClipboardStore } from '@/stores/clipboard';
import { SPLAT_DOWNLOADS, splatDownloadsOf, splatExportOffered } from '@/features/viewers/splat/splatDownloads';
import { BUILD_DOWNLOADS, offersBuildDownload } from '@/libs/build/buildDownloads';
import { TRAINING_EXPORT_TOOL, isTrainingExportFolder } from '@/features/viewers/splat/trainingExport';
import { taskToolOffered } from '@/libs/tasks/taskTools';
import { openCompare } from '@/libs/compare/compareLinks';
import { MAX_LAYERS } from '@/libs/compare/compareState';

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
            // A drawing without geolocation has nothing to place on a map.
            return sel.length === 1 && isMapViewable(sel[0].entry.type) && !isLocalVector(sel[0].entry);
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
    const supported = [T.POINTCLOUD, T.GEORASTER, T.VECTOR, T.MODEL, T.TILES3D];
    return {
        label: 'Unified Viewer',
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
        reg.features.get(Features.DISABLE_ANONYMOUS_BULK_DOWNLOADS) &&
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
        label: 'Transfer',
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
        isVisible: () => ctx.canWrite && !useClipboardStore().isEmpty,
        click: () => ctx.emit('pasteFromClipboard')
    };
}

function clipboardSeparator(ctx) {
    return {
        type: 'separator',
        isVisible: () => {
            const sel = ctx.getSelectedEntries();
            const hasSel = sel.length > 0 && !sel.find(f => isDroneDB(f.entry.type));
            return hasSel || (ctx.canWrite && !useClipboardStore().isEmpty);
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
            if (!hasThumbnail(type)) return false;
            const candidates = reg.features.value(Features.DATASET_THUMBNAIL_CANDIDATES);
            if (candidates && candidates.some(c => c.toLowerCase() === pathutils.basename(file.entry.path).toLowerCase())) return false;
            // A thumbnail of a built type comes from its build: not while it failed or runs
            if (isBuildableType(type)) {
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
 * Build the Experimental submenu containing experimental viewer features.
 */
function experimentalMenuItems(ctx) {
    return {
        label: 'Experimental',
        icon: 'fa-solid fa-flask',
        items: [
            openUnifiedItem(ctx)
        ]
    };
}

const isGeoraster = f => f.entry && f.entry.type === ddb.entry.type.GEORASTER;

// One georaster: the compare view opens on it with the file picker, for the other rasters
function compareToItem(ctx) {
    return {
        label: 'Compare to...',
        icon: 'fa-solid fa-table-columns',
        isVisible: () => {
            const sel = ctx.getSelectedEntries();
            return !!ctx.dataset && sel.length === 1 && isGeoraster(sel[0]);
        },
        click: () => openCompare(ctx.dataset, { paths: [ctx.getSelectedEntries()[0].entry.path], pick: true })
    };
}

// Several georasters: the compare view opens on them, side by side in the order they are listed
function compareInMapItem(ctx) {
    return {
        label: 'Compare in Map',
        icon: 'fa-solid fa-table-columns',
        isVisible: () => {
            const sel = ctx.getSelectedEntries();
            return !!ctx.dataset && sel.length >= 2 && sel.length <= MAX_LAYERS && sel.every(isGeoraster);
        },
        click: () => openCompare(ctx.dataset, { paths: ctx.getSelectedEntries().map(f => f.entry.path) })
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
        openPanoramaItem(ctx),
        openSplatItem(ctx),
        openMarkdownItem(ctx),
        openPdfItem(ctx),
        plantHealthItem(ctx),
        compareToItem(ctx),
        compareInMapItem(ctx)
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

function setCoordinateSystemItem(ctx) {
    return {
        label: 'Set Coordinate System',
        icon: 'fa-solid fa-earth-europe',
        isVisible: () => {
            const sel = ctx.getSelectedEntries();
            return ctx.canWrite && sel.length === 1 && isCadDrawing(sel[0].entry);
        },
        click: () => ctx.emit('setCrs', ctx.getSelectedEntries()[0])
    };
}

/**
 * The downloads of built files: one item per row of BUILD_DOWNLOADS, shown when the selected file's
 * complete build offers that artifact as a download (the artifacts say it, not the file type).
 * Adding a download is adding a row there.
 * @param {object} ctx - Context menu context object
 */
function buildDownloadItems(ctx) {
    return BUILD_DOWNLOADS.map(row => ({
        label: row.label,
        icon: row.icon,
        isVisible: () => {
            const sel = ctx.getSelectedEntries();
            return sel.length === 1
                && offersBuildDownload(sel[0].entry, row)
                && isBuildComplete(ctx.dataset, sel[0]);
        },
        click: () => {
            const sel = ctx.getSelectedEntries();
            if (sel.length === 1) ctx.emit('downloadBuildArtifact', sel[0], row.role);
        }
    }));
}

/**
 * The downloads of a Gaussian splat: one item per row of SPLAT_DOWNLOADS, shown when the selected
 * splat has it (the original always, an artifact once it is built, the .spz for other tools once it is
 * built from a format that converts and the server offers the task). Adding a download is adding a row there.
 * The original goes through the browser's own download, the others through the page ('downloadSplat').
 * @param {object} ctx - Context menu context object
 */
function splatDownloadItems(ctx) {
    const selected = () => {
        const sel = ctx.getSelectedEntries();
        return sel.length === 1 && sel[0].entry.type === ddb.entry.type.GAUSSIAN_SPLAT ? sel[0] : null;
    };
    const available = (file, row) => splatDownloadsOf(file.entry, { building: hasActiveBuild(ctx.dataset, file), canExport: splatExportOffered() }).find(d => d.id === row.id);
    return SPLAT_DOWNLOADS.map(row => ({
        label: row.label,
        icon: row.icon,
        isVisible: () => {
            const file = selected();
            return !!file && !!available(file, row);
        },
        click: () => {
            const file = selected();
            const download = file && available(file, row);
            if (!download) return;
            if (download.kind === 'original') ctx.emit('downloadItems', [file]);
            else ctx.emit('downloadSplat', file, download.id);
        }
    }));
}

/**
 * Export of the training data of a Gaussian splat from the ODM project in the selected folder (the
 * root of the dataset included), shown when the server offers the task. The file list does not know
 * what a folder holds, so the dialog reads it and says if it does not look like an ODM project.
 * @param {object} ctx - Context menu context object
 */
function splatTrainingExportItem(ctx) {
    return {
        label: 'Export splat training data',
        icon: 'fa-solid fa-camera',
        isVisible: () => {
            const sel = ctx.getSelectedEntries();
            return sel.length === 1 && isTrainingExportFolder(sel[0].entry) && taskToolOffered(TRAINING_EXPORT_TOOL);
        },
        click: () => ctx.emit('exportSplatTrainingData', ctx.getSelectedEntries()[0])
    };
}

function toolsItem(ctx) {
    const buildDownloads = buildDownloadItems(ctx);
    const splatItems = splatDownloadItems(ctx);
    const trainingExport = splatTrainingExportItem(ctx);

    const mergeMultispectral = mergeMultispectralItem(ctx);
    const maskBorders = maskBordersItem(ctx);
    const alignGeoRaster = alignGeoRasterItem(ctx);
    const extract = extractItem(ctx);
    const setCrs = setCoordinateSystemItem(ctx);
    const build = buildItem(ctx);
    const transfer = transferItem(ctx);

    return {
        label: 'Tools',
        icon: 'fa-solid fa-wrench',
        items: [
            mergeMultispectral,
            maskBorders,
            alignGeoRaster,
            extract,
            setCrs,
            {
                type: 'separator',
                isVisible: () => mergeMultispectral.isVisible() || maskBorders.isVisible() || alignGeoRaster.isVisible() ||
                    extract.isVisible() || setCrs.isVisible()
            },
            build,
            transfer,
            {
                type: 'separator',
                isVisible: () => buildDownloads.some(i => i.isVisible()) || splatItems.some(i => i.isVisible()) ||
                    trainingExport.isVisible()
            },
            ...buildDownloads,
            ...splatItems,
            trainingExport
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
        toolsItem(ctx),
        experimentalMenuItems(ctx),
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





















    setCoordinateSystemItem,
    splatDownloadItems,
    splatTrainingExportItem,
    deleteItem,
    deleteSeparator,







    // Grouped builders
    buildViewerMenuItems,
    buildActionMenuItems,

    buildStandardContextMenu,

};
