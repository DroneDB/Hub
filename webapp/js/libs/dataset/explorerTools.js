// @ts-check
/**
 * The toolbar of the dataset explorer (HQ-09: a 195-line imperative builder in
 * ViewDataset, re-run from watchers; now a function of the state, used by a computed).
 */
import ddb from 'ddb';

const T = ddb.entry.type;

// Viewers a single selected file can be opened in from the toolbar
const OPEN_IN = [
    { types: [T.GEORASTER, T.POINTCLOUD], id: 'open-map', title: 'Open Map', icon: 'fa-solid fa-map', view: 'map' },
    { types: [T.POINTCLOUD], id: 'open-pointcloud', title: 'Open Point Cloud', icon: 'fa-solid fa-cube', view: 'pointcloud' },
    { types: [T.MODEL], id: 'open-3dmodel', title: 'Open 3D Model', icon: 'fa-solid fa-cube', view: 'model' },
    { types: [T.PANORAMA, T.GEOPANORAMA], id: 'open-panorama', title: 'Open Panorama', icon: 'fa-solid fa-globe', view: 'panorama' }
];

/**
 * @typedef {object} ToolbarState
 * @property {boolean} canWrite
 * @property {any[]} files      the explorer items on show
 * @property {any[]} selected   the selected ones
 * @property {'grid'|'table'} viewMode
 * @property {boolean} expandedGrid
 *
 * @typedef {object} ToolbarActions
 * @property {() => void} upload
 * @property {() => void} newFolder
 * @property {(select: boolean) => void} selectAll
 * @property {(file: any) => void} rename
 * @property {() => void} remove
 * @property {(file: any) => void} share
 * @property {(file: any, view?: string) => void} open
 * @property {() => void} refresh
 * @property {() => void} toggleExpandedGrid
 * @property {() => void} toggleViewMode
 */

/**
 * @param {ToolbarState} state
 * @param {ToolbarActions} act
 * @returns {Array<{ id: string, title?: string, icon?: string, selected?: boolean, onClick?: () => void }>}
 */
export function explorerTools({ canWrite, files, selected, viewMode, expandedGrid }, act) {
    const tools = [];
    if (canWrite) {
        tools.push({ id: 'upload', title: 'Upload', icon: 'fa-solid fa-plus', onClick: act.upload },
            { id: 'newfolder', title: 'Create folder', icon: 'fa-solid fa-folder', onClick: act.newFolder });
    }
    if (files.length && selected.length < files.length) {
        tools.push({ id: 'select-all', title: 'Select All', icon: 'fa-regular fa-square-check', onClick: () => act.selectAll(true) });
    }
    if (selected.length) {
        tools.push({ id: 'deselect-all', title: 'Deselect All', icon: 'fa-regular fa-square', onClick: () => act.selectAll(false) });
    }
    if (canWrite && selected.length === 1) {
        tools.push({ id: 'rename', title: 'Rename', icon: 'fa-solid fa-pen-to-square', onClick: () => act.rename(selected[0]) });
    }
    if (canWrite && selected.length) {
        tools.push({ id: 'remove', title: 'Remove', icon: 'fa-solid fa-trash', onClick: act.remove }, { id: 'separator' });
        const single = selected.length === 1 ? selected[0] : null;
        const viewers = single ? OPEN_IN.filter(o => o.types.includes(single.entry.type)) : [];
        if (single) tools.push({ id: 'share-embed', title: 'Share/Embed', icon: 'fa-solid fa-share-nodes', onClick: () => act.share(single) });
        viewers.forEach(o => tools.push({ id: o.id, title: o.title, icon: o.icon, onClick: () => act.open(single, o.view) }));
        if (!viewers.length) tools.push({ id: 'open', title: 'Open', icon: 'fa-solid fa-folder-open', onClick: () => act.open(selected[0]) });
    }
    tools.push({ id: 'spacer' }, { id: 'refresh', title: 'Refresh', icon: 'fa-solid fa-rotate-right', onClick: act.refresh });
    if (viewMode === 'table') {
        tools.push({ id: 'expanded-grid', title: 'Expanded Table View', icon: 'fa-solid fa-table-cells-large', selected: expandedGrid, onClick: act.toggleExpandedGrid });
    }
    tools.push(viewMode === 'grid'
        ? { id: 'view-toggle', title: 'Table View', icon: 'fa-solid fa-list', onClick: act.toggleViewMode }
        : { id: 'view-toggle', title: 'Grid View', icon: 'fa-solid fa-table-cells', onClick: act.toggleViewMode });
    return tools;
}
