// @ts-check
/**
 * What a user can download of a splat, in the file browser's context menu and in the viewer: one
 * list (`SPLAT_DOWNLOADS`) that both build their items from, and the one function that runs a
 * download.
 *
 *  - the original: the file the user uploaded, always there;
 *  - the level-of-detail .rad: the artifact of a build with the current layout;
 *  - the .spz: the artifact of a build made before it, which libddb lists only while the .rad is
 *    missing (so the two never come together);
 *  - the .spz for other tools: made on request by a background task from a built splat, kept in the
 *    build folder (so a second request is immediate) and downloaded when the task is done.
 *
 * An artifact is offered only for a build that is complete and not running; a splat that was never
 * built offers the original alone. Artifacts are downloaded from the build-artifact endpoint by
 * role, which names the file; the Hub holds no URL of the build folder.
 */
import ddb from 'ddb';
import { ArtifactRole, findArtifactIn } from '@/libs/ddb/buildArtifacts';
import { isBuilt } from '@/libs/build/entryBuild';
import { notify } from '@/libs/notify';
import { taskToolOffered } from '@/libs/tasks/taskTools';

/** The background task that makes the .spz for other tools. */
export const SPZ_EXPORT_TOOL = 'splat-spz-export';

/** Whether this server offers the task that makes the .spz for other tools. */
export const splatExportOffered = () => taskToolOffered(SPZ_EXPORT_TOOL);

/**
 * Source formats the .spz export does not convert (libddb refuses them): the one rule of which
 * splats can be exported, kept here for the menu and the viewer alike.
 */
const NOT_EXPORTED_EXTENSIONS = Object.freeze(['.ksplat', '.sog', '.rad']);

/**
 * Whether the splat at `path` can be exported as a .spz, by the format of its file.
 * @param {string | undefined} path
 * @returns {boolean}
 */
export function canExportSpz(path) {
    return !!path && !NOT_EXPORTED_EXTENSIONS.includes(ddb.pathutils.extname(path));
}

/**
 * @typedef {object} SplatDownload
 * @property {string} id
 * @property {string} label
 * @property {string} icon
 * @property {'original' | 'artifact' | 'export'} kind  'export' is made on request by the task `toolId`, then downloaded like an artifact
 * @property {string} [role]       the build artifact an 'artifact' or 'export' download is
 * @property {string} [toolId]     the task that makes an 'export'
 * @property {string} [extension]  the extension its file is saved with
 */

/** @type {readonly Readonly<SplatDownload>[]} */
export const SPLAT_DOWNLOADS = Object.freeze([
    { id: 'original', label: 'Download original', icon: 'fa-solid fa-file-arrow-down', kind: 'original' },
    { id: 'lod', label: 'Download level-of-detail (.rad)', icon: 'fa-solid fa-layer-group', kind: 'artifact', role: ArtifactRole.GSPLAT_LOD, extension: '.rad' },
    { id: 'spz', label: 'Download .spz', icon: 'fa-solid fa-file-zipper', kind: 'artifact', role: ArtifactRole.GSPLAT_SPZ, extension: '.spz' },
    { id: 'spzExport', label: 'Download .spz (for other tools)', icon: 'fa-solid fa-file-export', kind: 'export', role: ArtifactRole.GSPLAT_EXPORT, toolId: SPZ_EXPORT_TOOL, extension: '.spz' }
]);

/**
 * The downloads available for an entry: the rows of SPLAT_DOWNLOADS it has, each with the
 * `filename` it is saved with.
 * @param {{ path: string, artifacts?: any[], buildStatus?: string } | null | undefined} entry
 * @param {object} [state]
 * @param {boolean} [state.building]   a build of the entry is running (the Hub knows it before the entry says so)
 * @param {boolean} [state.canExport]  the server offers the task that makes the .spz for other tools
 * @returns {Array<SplatDownload & { filename?: string }>}
 */
export function splatDownloadsOf(entry, { building = false, canExport = false } = {}) {
    if (!entry) return [];
    const complete = !building && isBuilt(entry);
    /** @type {Array<SplatDownload & { filename?: string }>} */
    const offered = [];
    for (const download of SPLAT_DOWNLOADS) {
        if (download.kind === 'original') {
            offered.push(download);
            continue;
        }
        if (!complete || !download.role) continue;
        // The export converts the streamed model a finished build leaves, from a format libddb converts
        const available = download.kind === 'export'
            ? canExport && canExportSpz(entry.path) && !!findArtifactIn(entry, ArtifactRole.GSPLAT_LOD)
            : !!findArtifactIn(entry, download.role);
        if (available) offered.push({ ...download, filename: `${ddb.pathutils.stem(entry.path)}${download.extension}` });
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
 * Downloads the artifact of a role, which the server names, after the check of the download limit.
 * @param {{ dataset: any, entry: { path: string }, download: SplatDownload & { filename?: string } }} options
 */
async function downloadArtifact({ dataset, entry, download }) {
    const url = dataset.buildArtifactUrl(entry.path, download.role);
    await dataset.checkDownloadSlot(url);
    startFileDownload(url, download.filename || `${ddb.pathutils.stem(entry.path)}${download.extension}`);
}

/**
 * Runs a download of `splatDownloadsOf`. The original goes through `downloadOriginal` because the
 * caller owns that flow (the browser's guard against two archives at once, the download limit); an
 * artifact is saved as the server sends it; an export is made first by its task (submitted with
 * `force`, so a repeated request is not answered with the task that ran before), then downloaded.
 * @param {SplatDownload & { filename?: string }} download
 * @param {object} context
 * @param {() => unknown} context.downloadOriginal
 * @param {any} context.dataset
 * @param {{ path: string }} context.entry
 * @param {(dataset: object, toolId: string, options: object) => Promise<unknown>} context.runTask  useHeavyTask's runHeavyTask
 */
export async function runSplatDownload(download, { downloadOriginal, dataset, entry, runTask }) {
    if (download.kind === 'original') return downloadOriginal();
    if (download.kind === 'export') {
        notify.info('Converting the splat to .spz. It downloads when it is ready.', { summary: 'Preparing .spz', life: 'long' });
        await runTask(dataset, /** @type {string} */ (download.toolId), { path: entry.path, params: {}, force: true, notify: false });
    }
    return downloadArtifact({ dataset, entry, download });
}
