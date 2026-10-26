// @ts-check
/**
 * Dataset downloads: the one flow behind the header's Download button and the
 * dataset page's "Download" actions, which had diverged copies.
 *
 * Signed-in downloads of the whole dataset, or of a selection over the configured size,
 * run as a background "bulk-download" task (a ZIP the browser fetches when ready);
 * everything else streams directly after a download-slot check. A single file always
 * streams, whatever its size: the server sends it as-is, while the task would wrap it
 * in a ZIP (a .tar.gz would come back as a .zip holding it).
 */
import ddb from 'ddb';
import { notify } from '@/libs/notify';
import { DOWNLOAD_LIMIT_MESSAGE } from '@/libs/constants';

/**
 * Whether a selection goes through the background archive task. No selection (whole
 * dataset) always does and one file never does; files of unknown size (folders) do, to be safe.
 * @param {Array<{ entry?: { size?: number, type?: number } }>} files
 * @param {number|null|undefined} thresholdBytes  BULK_DOWNLOAD_ASYNC_THRESHOLD_BYTES
 */
export function shouldDownloadAsync(files, thresholdBytes) {
    if (!files || files.length === 0) return true;
    if (files.length === 1 && isSingleFile(files[0])) return false;
    if (!thresholdBytes || thresholdBytes <= 0) return false;
    let total = 0;
    for (const f of files) {
        const size = f.entry && typeof f.entry.size === 'number' ? f.entry.size : null;
        if (size == null) return true;
        total += size;
    }
    return total > thresholdBytes;
}

/** A known entry that is not a folder (or a nested dataset). @param {{ entry?: { type?: number } }} file */
function isSingleFile(file) {
    return !!file.entry && typeof file.entry.type === 'number' && !ddb.entry.isDirectory(file.entry);
}

/**
 * @param {object} options
 * @param {import('./ddb/dataset').default} options.dataset
 * @param {string[]|undefined} options.paths  dataset paths; undefined for the whole dataset
 * @param {Array<object>} options.files  the selected items (for their sizes)
 * @param {boolean} options.signedIn
 * @param {number|null|undefined} options.thresholdBytes
 * @param {(dataset: object, toolId: string, options: object) => Promise<{ taskId: string }>} options.runTask  useHeavyTask's runHeavyTask
 */
export async function downloadFromDataset({ dataset, paths, files, signedIn, thresholdBytes, runTask }) {
    if (signedIn && shouldDownloadAsync(files, thresholdBytes)) {
        notify.info('Archive creation started. Open the Tasks tab to download it when ready.', { summary: 'Preparing archive', life: 'long' });
        const params = paths && paths.length ? { paths } : {};
        const result = await runTask(dataset, 'bulk-download', { params, notify: false });
        window.location.href = dataset.taskResultUrl(result.taskId);
        return;
    }
    await dataset.downloadWithCheck(paths);
}

/**
 * A built file's artifact (e.g. a COG), opened in a new tab after a download-slot check.
 * @param {import('./ddb/dataset').default} dataset
 * @param {string} path
 */
export async function downloadBuildArtifact(dataset, path) {
    const url = dataset.buildArtifactUrl(path);
    await dataset.checkDownloadSlot(url);
    window.open(url, '_blank');
}

/** Shows a failed download: the download limit (429) has its own message. @param {any} error */
export function notifyDownloadError(error) {
    if (error && error.status === 429) notify.error(DOWNLOAD_LIMIT_MESSAGE, { summary: 'Download Limit' });
    else notify.error(error, { summary: 'Download Error' });
}
