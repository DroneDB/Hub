// @ts-check
/**
 * useCutMarks - which entries of the dataset an explorer shows are cut (Ctrl+X) and wait for a paste, so that it dims
 * them as a file manager does (FR-EXP-16). It reads the clipboard store when the app has one: a view mounted without it
 * (a test, an embedded page) dims nothing.
 *
 *   const { isCut } = useCutMarks(() => props.dataset);
 *   isCut(file)   // file: { entry: { path } }
 */
import { getActivePinia } from 'pinia';
import { useClipboardStore } from '@/stores/clipboard';

/** @param {() => ({ org?: string, ds?: string } | null | undefined)} getDataset */
export function useCutMarks(getDataset) {
    const store = getActivePinia() ? useClipboardStore() : null;
    /** @param {{ entry?: { path?: string } } | null | undefined} file */
    const isCut = file => {
        const dataset = getDataset();
        const path = file?.entry?.path;
        return !!store && !!dataset && !!path && store.isCutAt(dataset.org ?? '', dataset.ds ?? '', path);
    };
    return { isCut };
}
