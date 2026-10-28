// @ts-check
/**
 * What a user can download of a splat, in the file browser's context menu and in the viewer: one
 * list (`SPLAT_DOWNLOADS`) that both build their items from, and the one function that runs a
 * download.
 *
 *  - the original: the file the user uploaded, always there;
 *  - the level-of-detail .rad: the artifact of a build with the current layout;
 *  - the .spz: the artifact of a build made before it, which libddb lists only while the .rad is
 *    missing (so the two never come together).
 *
 * An artifact is offered only for a build that is complete and not running; a splat that was never
 * built offers the original alone. A download that is made on request (a converted .spz) is one
 * more row of the list with its own `kind`.
 */
import ddb from 'ddb';
import { ArtifactRole, artifactHref, findArtifactIn } from '@/libs/ddb/buildArtifacts';
import { isBuilt } from '@/libs/build/entryBuild';

/**
 * @typedef {object} SplatDownload
 * @property {string} id
 * @property {string} label
 * @property {string} icon
 * @property {'original' | 'artifact'} kind
 * @property {string} [role]       the build artifact an 'artifact' download is
 * @property {string} [extension]  the extension its file is saved with
 */

/** @type {readonly Readonly<SplatDownload>[]} */
export const SPLAT_DOWNLOADS = Object.freeze([
    { id: 'original', label: 'Download original', icon: 'fa-solid fa-file-arrow-down', kind: 'original' },
    { id: 'lod', label: 'Download level-of-detail (.rad)', icon: 'fa-solid fa-layer-group', kind: 'artifact', role: ArtifactRole.GSPLAT_LOD, extension: '.rad' },
    { id: 'spz', label: 'Download .spz', icon: 'fa-solid fa-file-zipper', kind: 'artifact', role: ArtifactRole.GSPLAT_SPZ, extension: '.spz' }
]);

/**
 * The downloads available for an entry: each is the row of SPLAT_DOWNLOADS with the `url` and the
 * `filename` of an artifact download.
 * @param {{ path: string, artifacts?: any[], buildStatus?: string } | null | undefined} entry
 * @param {{ building?: boolean }} [state]  a build of the entry is running (the Hub knows it before the entry says so)
 * @returns {Array<SplatDownload & { url?: string, filename?: string }>}
 */
export function splatDownloadsOf(entry, { building = false } = {}) {
    if (!entry) return [];
    const complete = !building && isBuilt(entry);
    /** @type {Array<SplatDownload & { url?: string, filename?: string }>} */
    const offered = [];
    for (const download of SPLAT_DOWNLOADS) {
        if (download.kind === 'original') {
            offered.push(download);
            continue;
        }
        const artifact = complete && download.role ? findArtifactIn(entry, download.role) : null;
        if (artifact) offered.push({ ...download, url: artifactHref(artifact), filename: `${ddb.pathutils.stem(entry.path)}${download.extension}` });
    }
    return offered;
}

/**
 * Saves a file the server sends, through a link the browser follows (it streams to disk and
 * shows its own progress; the session cookie rides along).
 * @param {string} url
 * @param {string} filename
 */
export function startFileDownload(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    try {
        a.click();
    } finally {
        a.remove();
    }
}

/**
 * Runs a download of `splatDownloadsOf`. The original goes through `downloadOriginal` because the
 * caller owns that flow (the browser's guard against two archives at once, the download limit);
 * an artifact is saved as it is.
 * @param {SplatDownload & { url?: string, filename?: string }} download
 * @param {() => unknown} downloadOriginal
 */
export function runSplatDownload(download, downloadOriginal) {
    if (download.kind === 'original') return downloadOriginal();
    if (download.url && download.filename) startFileDownload(download.url, download.filename);
    return undefined;
}
