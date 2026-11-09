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
import reg from '@/libs/api/sharedRegistry';
import { Features } from '@/libs/features';
import { notify } from '@/libs/notify';
import { escapeHtml } from '@/libs/sanitize';
import { countOf, formatBytes } from '@/libs/format';
import { DOWNLOAD_LIMIT_MESSAGE } from '@/libs/constants';
import { CALCULATING } from '@/libs/dataset/selection';

/**
 * Whether a download is an archive (a ZIP): several items, a folder or the whole dataset (nothing
 * selected). One file is not, and an item without its entry counts as an archive. The header and the
 * menus share this rule (FR-EXP-27).
 * @param {Array<{ entry?: any }>} files
 */
export function isArchiveDownload(files) {
    if (!files || files.length !== 1) return true;
    const entry = files[0]?.entry;
    return entry ? ddb.entry.isDirectory(entry) : true;
}

/**
 * Whether the download asks first: a single file downloads at once, from every surface; several
 * items, a folder or the whole dataset (an archive) ask.
 * @param {Array<{ entry?: any }>} files
 */
export const needsConfirm = files => isArchiveDownload(files);

/**
 * Whether the Hub refuses the download: an anonymous visitor may not download an archive when the
 * Registry disables anonymous bulk downloads.
 * @param {Array<{ entry?: any }>} files
 * @param {{ signedIn?: boolean }} [options]  the user is signed in (reg.isLoggedIn() by default)
 */
export function isBulkBlocked(files, { signedIn = reg.isLoggedIn() } = {}) {
    return !signedIn && !!reg.features.get(Features.DISABLE_ANONYMOUS_BULK_DOWNLOADS) && isArchiveDownload(files);
}

/**
 * The question before an archive download (HTML, for ConfirmDialog): how many items, how big,
 * as a ZIP. The count and the size are those of the selection summary (libs/dataset/selection.js);
 * with nothing selected the download is the whole dataset, whose count and size are its root entry's
 * (its count is of every entry, folders included, so it says "items").
 * A folder goes with everything inside it: a selection with a folder has its size read from the
 * server (selectionSize), and says "Calculating size…" until then.
 * @param {import('./dataset/selection').SelectionSummary} selection  describeSelection(files)
 * @param {{ count?: number|null, size?: number|null }} [dataset]  the dataset's entry count and size
 * @param {{ size?: number|null, failed?: boolean }} [contents]  the size of a selection with a folder,
 *   contents included (null: not read yet); `failed` when it could not be read
 */
export function confirmMessage(selection, dataset = {}, { size = null, failed = false } = {}) {
    if (!selection.count) {
        const count = typeof dataset.count === 'number' ? dataset.count : null;
        const total = typeof dataset.size === 'number' ? ` (${formatBytes(dataset.size)})` : '';
        return count !== null ? `Download all ${countOf(count, 'item')}${total} as a ZIP?` : `Download the entire dataset${total} as a ZIP?`;
    }
    if (selection.hasFolder) {
        const known = !failed && typeof size === 'number';
        const total = known ? ` (${formatBytes(size)})` : '';
        const note = failed ? ' The size could not be calculated.' : known ? '' : ` ${CALCULATING}`;
        if (selection.count === 1) {
            return `Download the folder <strong>${escapeHtml(selection.names[0])}</strong> and everything inside it${total} as a ZIP?${note}`;
        }
        return `Download ${selection.countText}${total} as a ZIP? A folder goes with everything inside it.${note}`;
    }
    return `Download ${countOf(selection.count, 'file')} (${selection.sizeText}) as a ZIP?`;
}

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
 * A built file's artifact (a COG, the 3D Tiles of a model as a ZIP...), named by the server after
 * the file, opened in a new tab after a download-slot check.
 * @param {import('./ddb/dataset').default} dataset
 * @param {string} path
 * @param {string} [role]  the artifact (BUILD_DOWNLOADS); the entry's first download without it
 */
export async function downloadBuildArtifact(dataset, path, role) {
    const url = dataset.buildArtifactUrl(path, role);
    await dataset.checkDownloadSlot(url);
    window.open(url, '_blank');
}

/** Shows a failed download: the download limit (429) has its own message. @param {any} error */
export function notifyDownloadError(error) {
    if (error && error.status === 429) notify.error(DOWNLOAD_LIMIT_MESSAGE, { summary: 'Download Limit' });
    else notify.error(error, { summary: 'Download Error' });
}
