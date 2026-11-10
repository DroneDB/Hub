// @ts-check
/**
 * The unbundled SOG level-of-detail layout of a Gaussian splat (FR-UPL-09): a folder with a `lod-meta.json` and, in it
 * and below it, the `.webp` textures of every level. DroneDB does not read it as a splat (its textures would show as
 * photos), so the Hub says so when such a folder is in an upload, and says what to do: bundle it into one `.sog` file.
 */

/** The file that marks the folder of a level-of-detail splat. */
export const SPLAT_LOD_FILE = 'lod-meta.json';

/**
 * The folders of a selection that hold a `lod-meta.json` ('' is the top of the selection).
 * @param {Iterable<{ path?: string, name?: string }>} files  the files as the queue gets them: their dataset path
 * @returns {string[]}  the folders, in the order they are found, each once
 */
export function splatLodFolders(files) {
    /** @type {Set<string>} */
    const folders = new Set();
    for (const file of files) {
        const path = (file.path || file.name || '').replace(/\\/g, '/');
        const slash = path.lastIndexOf('/');
        const name = path.slice(slash + 1);
        if (name.toLowerCase() === SPLAT_LOD_FILE) folders.add(slash < 0 ? '' : path.slice(0, slash));
    }
    return [...folders];
}

/**
 * What to tell the user about a selection, or null when it holds no level-of-detail splat folder.
 * @param {Iterable<{ path?: string, name?: string }>} files
 * @returns {string|null}
 */
export function splatLodWarning(files) {
    const folders = splatLodFolders(files);
    if (folders.length === 0) return null;

    const where = folders.length === 1
        ? (folders[0] ? `the folder ${folders[0]}` : 'the selection')
        : `${folders.length} folders (${folders.join(', ')})`;
    return `${SPLAT_LOD_FILE} is in ${where}: a SOG level-of-detail folder is not supported as a splat, and its textures are stored as ordinary files. `
        + 'Bundle it into one .sog file first, then upload that file.';
}
