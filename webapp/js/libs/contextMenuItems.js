import ddb from 'ddb';
const { pathutils } = ddb;

import { isCadDrawing } from '@/libs/cadCrs';
import { isDroneDB, isGeoraster, isPlantHealthCapable, isArchiveFile } from '@/libs/entryTypes';
import { hasThumbnail, isBuildableType } from '@/libs/entryTypeCapabilities';
import { canOpenAsText, shouldOpenAsText } from '@/libs/textFileUtils';
import { isBuildableFile, hasActiveBuild, buildFile, isFileBuilt, isBuildComplete } from '@/libs/build/buildHelpers';
import BuildManager, { BUILD_STATES } from '@/libs/build/buildManager';
import reg from '@/libs/api/sharedRegistry';
import { Features } from '@/libs/features';
import { SPLAT_DOWNLOADS, splatDownloadsOf, splatExportOffered } from '@/features/viewers/splat/splatDownloads';
import { BUILD_DOWNLOADS, offersBuildDownload } from '@/libs/build/buildDownloads';
import { TRAINING_EXPORT_TOOL, isTrainingExportFolder } from '@/features/viewers/splat/trainingExport';
import { taskToolOffered } from '@/libs/tasks/taskTools';
import { fileViewUrl, openInNewTab } from '@/libs/views/viewLinks';
import { MAX_LAYERS } from '@/libs/views/viewState';
import { transferModeFor } from '@/libs/dataset/transferMode';
import { VIEWERS } from '@/libs/openItemDefaults';
import { actionMenuItem } from '@/libs/dataset/explorerActions';

/**
 * The context menu of the file explorer (grid, table and tree). The actions that other surfaces
 * offer too (Open and the viewers, Rename, Share/Embed, Copy, Cut, Paste, the folder's actions,
 * Delete) come from the action registry (libs/dataset/explorerActions.js) with their accelerator;
 * the items here are the menu's own. Each item has a `group`: ContextMenu.vue draws a separator
 * between two groups. With nothing selected the menu is the folder's (the background menu).
 *
 * Context object interface:
 * {
 *   getSelectedEntries: () => [{ entry, path, ... }]  - returns array of selected file objects
 *   canWrite: boolean
 *   dataset: object | null
 *   emit: (event, ...args) => void
 * }
 */

function openUnifiedItem(ctx) {
    const T = ddb.entry.type;
    // 3D Tiles open in this viewer by default: their Open 3D Tiles item is the viewer table's
    const supported = [T.POINTCLOUD, T.GEORASTER, T.VECTOR, T.MODEL];
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

function plantHealthItem(ctx) {
    return {
        label: 'Plant Health',
        icon: 'fa-solid fa-leaf',
        group: 'open',
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
        group: 'edit',
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

function propertiesItem(ctx) {
    return {
        label: 'Properties',
        icon: 'fa-solid fa-circle-info',
        group: 'tools',
        isVisible: () => ctx.getSelectedEntries().length > 0,
        click: () => ctx.emit('openProperties')
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

// A move to another dataset for a writer, a copy for a user who can only read this one
function transferItem(ctx) {
    return {
        get label() { return transferModeFor(ctx.canWrite).menuLabel; },
        get icon() { return transferModeFor(ctx.canWrite).confirmIcon; },
        isVisible: () => {
            const sel = ctx.getSelectedEntries();
            return reg.isLoggedIn() && sel.length > 0 && !sel.find(f => isDroneDB(f.entry.type));
        },
        isEnabled: () => {
            const sel = ctx.getSelectedEntries();
            return !sel.some(f => hasActiveBuild(ctx.dataset, f));
        },
        click: () => ctx.emit('transferSelectedItems')
    };
}

function setThumbnailItem(ctx) {
    return {
        label: 'Set as Dataset Thumbnail',
        icon: 'fa-solid fa-image',
        group: 'edit',
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

/**
 * Build the Experimental submenu containing experimental viewer features.
 */
function experimentalMenuItems(ctx) {
    return {
        label: 'Experimental',
        icon: 'fa-solid fa-flask',
        group: 'open',
        items: [
            openUnifiedItem(ctx)
        ]
    };
}

// One georaster: the map opens on it with the file picker, for the other rasters
function compareToItem(ctx) {
    return {
        label: 'Compare to...',
        icon: 'fa-solid fa-table-columns',
        group: 'open',
        isVisible: () => {
            const sel = ctx.getSelectedEntries();
            return !!ctx.dataset && sel.length === 1 && isGeoraster(sel[0].entry);
        },
        click: () => openInNewTab(fileViewUrl(ctx.dataset, ctx.getSelectedEntries()[0].entry.path, { pick: true }))
    };
}

// Several georasters: the map opens on the first with the others added, in the order they are listed
function compareInMapItem(ctx) {
    return {
        label: 'Compare in Map',
        icon: 'fa-solid fa-table-columns',
        group: 'open',
        isVisible: () => {
            const sel = ctx.getSelectedEntries();
            return !!ctx.dataset && sel.length >= 2 && sel.length <= MAX_LAYERS && sel.every(f => isGeoraster(f.entry));
        },
        click: () => {
            const [first, ...rest] = ctx.getSelectedEntries().map(f => f.entry.path);
            openInNewTab(fileViewUrl(ctx.dataset, first, { add: rest }));
        }
    };
}

/**
 * The Open group: Open (where no viewer opens the file by default), one item per row of the viewer
 * table that accepts the file (libs/openItemDefaults.js VIEWERS), then the map comparisons.
 */
function buildViewerMenuItems(ctx) {
    return [
        actionMenuItem('open', ctx),
        ...VIEWERS.map(row => actionMenuItem(row.id, ctx)),
        plantHealthItem(ctx),
        compareToItem(ctx),
        compareInMapItem(ctx),
        experimentalMenuItems(ctx)
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
        group: 'tools',
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

/**
 * The groups after Open, in order: Edit, Share & download, Organize, the folder's actions (the
 * background menu), Tools.
 */
function buildActionMenuItems(ctx) {
    return [
        editItem(ctx),
        actionMenuItem('rename', ctx),
        setThumbnailItem(ctx),
        actionMenuItem('share-embed', ctx),
        actionMenuItem('download', ctx),
        actionMenuItem('copy', ctx),
        actionMenuItem('cut', ctx),
        actionMenuItem('paste', ctx),
        actionMenuItem('new-folder', ctx),
        actionMenuItem('upload', ctx),
        actionMenuItem('select-all', ctx),
        actionMenuItem('refresh', ctx),
        toolsItem(ctx),
        propertiesItem(ctx)
    ];
}

/**
 * The full context menu of the grid, the table and the tree: Open, Edit, Share & download,
 * Organize, the folder's actions, Tools, and Delete at the end.
 * @param {object} ctx - Context object
 * @returns {Array} context menu items
 */
function buildStandardContextMenu(ctx) {
    return [
        ...buildViewerMenuItems(ctx),
        ...buildActionMenuItems(ctx),
        actionMenuItem('delete', ctx)
    ];
}

export {
    setCoordinateSystemItem,
    splatDownloadItems,
    splatTrainingExportItem,
    buildActionMenuItems,
    buildStandardContextMenu
};
