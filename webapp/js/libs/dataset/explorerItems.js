/**
 * Explorer items of the dataset page. An item is what the file list, the tree, the map and the selection share:
 * { icon, label, path (ddb URI), entry, isExpandable, selected }.
 */
import ddb from 'ddb';
import icons from '@/libs/icons';
import { sortEntriesDirectoriesFirst } from '@/libs/entryTypes';

const { pathutils } = ddb;

/** Folder of a path, null at the root (as pathutils.getParentFolder). */
const folderOf = path => pathutils.getParentFolder(path) || null;
const norm = folder => (folder != null && folder.length > 0 ? folder : null);

/**
 * @param {any} dataset
 * @param {{ path: string, type: number }} entry
 * @param {object} [extra]  more fields (e.g. { empty: true } for a new folder)
 */
export function itemFor(dataset, entry, extra = {}) {
    return {
        icon: icons.getForType(entry.type, entry.path),
        label: pathutils.basename(entry.path),
        path: dataset.remoteUri(entry.path),
        entry,
        isExpandable: ddb.entry.isDirectory(entry),
        selected: false,
        ...extra
    };
}

/** Folders first, then by name (as the tree shows them). */
export function sortItems(items) {
    const itemOf = new Map(items.map(item => [item.entry, item]));
    return sortEntriesDirectoriesFirst(items.map(item => item.entry), e => pathutils.basename(e.path)).map(e => itemOf.get(e));
}

/** Whether an entry path is directly in `folder` (null or '' is the root). */
export function isInFolder(path, folder) {
    return folderOf(path) === norm(folder);
}

/**
 * Entries of the current folder's view for newly added entries (an upload): an entry in
 * the folder as itself, one deeper as its top folder below the current one (synthetic
 * folder entry), others not at all; once each.
 * @param {Array<{ path: string, type: number, mtime?: any }>} entries
 * @param {string|null} currentFolder
 */
export function entriesInView(entries, currentFolder) {
    const folder = norm(currentFolder);
    const prefix = folder ? folder + '/' : '';
    const seen = new Map();
    for (const entry of entries) {
        if (folder && !entry.path.startsWith(prefix)) continue;
        const rest = entry.path.slice(prefix.length);
        const top = rest.split('/')[0];
        const path = prefix + top;
        if (seen.has(path)) continue;
        seen.set(path, top === rest ? entry : { path, type: ddb.entry.type.DIRECTORY, size: 0, mtime: entry.mtime });
    }
    return [...seen.values()];
}
