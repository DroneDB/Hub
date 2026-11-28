// @ts-check
/**
 * Finishing /upload without the files the Registry refused for good (a blocked extension, a name that clashes): the
 * files that went through are kept, the failed ones are left out. The label of the button, and the question that asks
 * before the batch is committed that way. The answer goes to `useConfirm`.
 */
import { countOf, pluralize } from '@/libs/format';

/** @param {number} failed the files that failed */
export function finishWithoutLabel(failed) {
    return `Finish without the ${countOf(failed, 'failed file')}`;
}

/**
 * @param {{ failed: number, uploaded: number }} what  `failed`: the files left out; `uploaded`: the files the dataset gets
 * @returns {{ title: string, message: string, confirmText: string, cancelText: string }}
 */
export function finishWithoutQuestion({ failed, uploaded }) {
    return {
        title: 'Finish upload',
        message: `The ${countOf(uploaded, 'file')} uploaded ${pluralize(uploaded, 'is', 'are')} added to the dataset. ` +
            `The ${countOf(failed, 'failed file')} ${pluralize(failed, 'is', 'are')} left out.`,
        confirmText: 'Finish upload',
        cancelText: 'Keep the upload open'
    };
}
