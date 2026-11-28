// @ts-check
/**
 * useVisibilityChange - the one way the Hub changes the visibility of a dataset (the visibility menu of the header,
 * the Settings window, the Share window):
 *
 *   const changeVisibility = useVisibilityChange(confirm);
 *   if (await changeVisibility(dataset, { name: 'Brighton', from: 0, to: 2 })) ...
 *
 * It always asks first (libs/visibility.js visibilityChangeConfirmation): the change decides who can open every file
 * of the dataset, so a stray click must not make it public, nor take it away from the people it is shared with. Once
 * the server has the new visibility, the dataset's root entry in the session takes it (the header shows it at once)
 * and a toast says so. A failure is a toast too. It resolves to whether the visibility changed.
 */
import { visibilityChangeConfirmation, visibilityLabel } from '@/libs/visibility';
import { useDatasetSessionStore } from '@/stores/datasetSession';
import { useNotify } from '@/composables/useNotify';

/**
 * @param {(options: ReturnType<typeof visibilityChangeConfirmation>) => Promise<boolean>} confirm  asks the question
 *   (useConfirm(dialogs))
 */
export function useVisibilityChange(confirm) {
    const session = useDatasetSessionStore();
    const notify = useNotify();

    /**
     * @param {{ setVisibility: (visibility: number) => Promise<any> }} dataset  the ddb dataset
     * @param {{ name: string, from: unknown, to: number, note?: string }} change  the dataset as the user sees it, the
     *   visibility it has and the one it gets; `note` is one more sentence for the question
     * @returns {Promise<boolean>}
     */
    return async function changeVisibility(dataset, { name, from, to, note }) {
        if (Number(from) === Number(to)) return false;
        if (!await confirm(visibilityChangeConfirmation({ name, from, to, note }))) return false;
        try {
            const meta = await dataset.setVisibility(to);
            session.setRootMeta('visibility', meta ?? { data: to });
            notify.success(`${name} is now ${visibilityLabel(to)}`, { summary: 'Visibility Updated' });
            return true;
        } catch (e) {
            notify.error(`Failed to update visibility: ${e instanceof Error ? e.message : String(e)}`);
            return false;
        }
    };
}
