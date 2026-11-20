// @ts-check
/**
 * The open chunked uploads of the caller in a dataset (`Dataset.listChunkUploads`, §7.1) and the rule that matches a file
 * the user selects again to one of them (FR-UPL-04): the name of the file on the disk, its size and its last-modified
 * time. The path of the upload is not part of the rule: Keep both renamed it, and the upload resumes at the path it
 * has stored.
 */

/**
 * @typedef {object} OpenUpload
 * @property {string} fileId
 * @property {string} path  where it will be added (stored in the session)
 * @property {number} totalFileSize
 * @property {number} totalChunks
 * @property {string|null} [sourceFileName]
 * @property {number|null} [lastModified]
 * @property {number[]} [received]  the chunks the server stores
 */

/**
 * @param {OpenUpload} open @param {{ name: string, size: number, lastModified?: number }} file
 */
export function matchesOpenUpload(open, file) {
    return open.sourceFileName === file.name && open.totalFileSize === file.size && open.lastModified === file.lastModified;
}

/**
 * Splits the files the user selected into those that resume an open upload and the others. An open upload resumes one
 * file only (the first that matches); a file that matches no upload is "rest".
 * @template {{ name: string, size: number, lastModified?: number }} F
 * @param {OpenUpload[]} openUploads @param {F[]} files
 * @returns {{ resumed: Array<{ file: F, open: OpenUpload }>, rest: F[] }}
 */
export function matchOpenUploads(openUploads, files) {
    const free = new Set(openUploads);
    /** @type {Array<{ file: F, open: OpenUpload }>} */
    const resumed = [];
    /** @type {F[]} */
    const rest = [];
    for (const file of files) {
        const open = [...free].find(o => matchesOpenUpload(o, file));
        if (open) {
            free.delete(open);
            resumed.push({ file, open });
        } else {
            rest.push(file);
        }
    }
    return { resumed, rest };
}

/** The share of an open upload that the server stores, as a whole percentage. @param {OpenUpload} open */
export function storedPercent(open) {
    return open.totalChunks > 0 ? Math.floor(((open.received?.length ?? 0) / open.totalChunks) * 100) : 0;
}
