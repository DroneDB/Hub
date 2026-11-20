/**
 * Helpers for the dataset tree selection, shared by TreeView, FileBrowser
 * and the clipboard operations.
 */
import ddb from 'ddb';
const { pathutils } = ddb;

/**
 * True when `path` is one of the `deleted` paths or lies inside one of them.
 */
export function isPathRemoved(path, deleted) {
    if (path == null || !Array.isArray(deleted)) return false;
    return deleted.some(d => path === d || path.startsWith(d + '/'));
}

/**
 * Node data of the selected TreeNode components. Skips components that were
 * unmounted (deleted, moved or refreshed) since they were selected.
 */
export function liveSelectionEntries(selectedNodes) {
    if (!Array.isArray(selectedNodes)) return [];
    return selectedNodes
        .filter(n => !(n.$ && n.$.isUnmounted))
        .map(n => n.node);
}

/**
 * The chain of a 'folderOpened' event (pathutils.getTree: the folders from the outermost to the one to open) that
 * a tree can follow: cut after the innermost folder that the tree has (`has(path)`), or the chain of the root
 * when it has none of them. A tree that has the folder to open gets the chain as it is.
 */
export function nearestKnownChain(chain, has) {
    let end = chain.length;
    while (end > 0 && !has(chain[end - 1])) end--;
    return end > 0 ? chain.slice(0, end) : pathutils.getTree('/');
}

/**
 * Folder that contains the given entries, relative to the dataset root
 * ('' = root). The clipboard has a single source folder, so the first
 * entry decides.
 */
export function selectionBasePath(entries) {
    if (!Array.isArray(entries) || entries.length === 0) return '';
    return pathutils.getParentFolder(entries[0].entry.path) || '';
}
