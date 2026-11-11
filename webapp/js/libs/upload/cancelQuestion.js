// @ts-check
/**
 * The question that asks before an upload is stopped (FR-UPL-16, FR-XC-27): what is lost depends on the page. /upload rolls
 * its batch back (the dataset it made and the files sent are deleted); the dataset page keeps the files already sent
 * (D-045). The answer goes to `useConfirm`, then `useUploadQueue.cancel({ confirm })`.
 */
import { countOf, pluralize } from '@/libs/format';

/**
 * @param {{ sent: number, discardsBatch: boolean }} what  `sent`: the files already sent; `discardsBatch`: Cancel deletes the
 *   dataset of the batch and its files (/upload), else they stay (the dataset page)
 * @returns {{ title: string, message: string, confirmText: string, cancelText: string, danger: boolean }}
 */
export function cancelUploadQuestion({ sent, discardsBatch }) {
    const files = countOf(sent, 'file');
    let message;
    if (discardsBatch)
        message = sent > 0
            ? `Stop the upload? The dataset and the ${files} already sent are deleted.`
            : 'Stop the upload? The dataset is deleted.';
    else
        message = sent > 0
            ? `Stop the upload? The ${files} already sent ${pluralize(sent, 'stays', 'stay')} in the dataset.`
            : 'Stop the upload? No file has been added to the dataset yet.';

    return { title: 'Cancel upload', message, confirmText: 'Stop upload', cancelText: 'Keep uploading', danger: true };
}
