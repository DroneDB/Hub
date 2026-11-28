// @ts-check
/**
 * useSplatDownloads - runs the downloads of a splat for a page (the file browser, the viewer): the
 * task runner of the page, the one-at-a-time rule of an export and the message of a failure, so
 * both pages do the same.
 *
 *   const { download } = useSplatDownloads(() => dataset);
 *   download(row, entry, () => downloadOriginal(entry));
 */
import { useHeavyTask } from '@/composables/useHeavyTask';
import { notify } from '@/libs/notify';
import { notifyDownloadError } from '@/libs/datasetDownloads';
import { runSplatDownload } from './splatDownloads';

/**
 * @param {() => any} getDataset  the ddb Dataset of the page
 */
export function useSplatDownloads(getDataset) {
    const { runHeavyTask } = useHeavyTask();
    /** The entries being exported: a second request waits for the first instead of repeating the conversion. @type {Set<string>} */
    const exporting = new Set();

    /**
     * @param {import('./splatDownloads').SplatDownload & { filename?: string }} row  a row of splatDownloadsOf
     * @param {{ path: string }} entry
     * @param {() => unknown} downloadOriginal
     */
    async function download(row, entry, downloadOriginal) {
        const key = row.kind === 'export' ? entry.path : null;
        if (key !== null) {
            if (exporting.has(key)) {
                notify.warn('This splat is already being converted. It downloads when it is ready.', { summary: 'Export in progress' });
                return;
            }
            exporting.add(key);
        }
        try {
            await runSplatDownload(row, { downloadOriginal, dataset: getDataset(), entry, runTask: runHeavyTask });
        } catch (e) {
            notifyDownloadError(e);
        } finally {
            if (key !== null) exporting.delete(key);
        }
    }

    return { download };
}
