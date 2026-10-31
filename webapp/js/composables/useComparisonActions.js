/**
 * The actions on saved comparisons that ask the user first: the name prompt (shared with the
 * compare view's Save), rename and delete. Errors are shown; `onChanged` runs after a change.
 *
 *   const actions = useComparisonActions({ dataset, dialogs, onChanged: () => reloadInfo() });
 *   await actions.rename(comparison);
 */
import reg from '@/libs/api/sharedRegistry';
import { updateSaved, deleteSaved, MAX_NAME_LENGTH } from '@/libs/compare/comparisonStore';
import { useConfirm } from '@/composables/useConfirm';
import { useNotify } from '@/composables/useNotify';
import TextPromptDialog from '@/components/TextPromptDialog.vue';

/**
 * Asks for a comparison name: the trimmed name, or null when cancelled.
 * @param {{ open: Function }} dialogs
 * @param {{ title: string, initialValue?: string, confirmLabel?: string }} options
 * @returns {Promise<string|null>}
 */
export function askComparisonName(dialogs, { title, initialValue = '', confirmLabel = 'Save' }) {
    return dialogs.open(TextPromptDialog, { title, label: 'Name', initialValue, confirmLabel, maxLength: MAX_NAME_LENGTH });
}

/**
 * @param {{ dataset: any, dialogs: { open: Function }, onChanged?: () => void }} ctx
 */
export function useComparisonActions({ dataset, dialogs, onChanged = () => {} }) {
    const confirm = useConfirm(dialogs);
    const notify = useNotify();

    async function attempt(summary, action) {
        try {
            await action();
            onChanged();
        } catch (e) {
            console.error(`${summary}:`, e);
            notify.error(e.message || String(e), { summary });
        }
    }

    /** @param {{ uid: string, name: string }} comparison */
    async function rename(comparison) {
        const name = await askComparisonName(dialogs, { title: 'Rename comparison', initialValue: comparison.name, confirmLabel: 'Rename' });
        if (!name || name === comparison.name) return;
        await attempt('Cannot rename the comparison', () => updateSaved(dataset, comparison.uid, { name, user: reg.getUsername() || '' }));
    }

    /** @param {{ uid: string, name: string }} comparison */
    async function remove(comparison) {
        const ok = await confirm({
            title: `Delete "${comparison.name}"`,
            message: 'Delete this saved comparison? Its links will stop working. The rasters are not deleted.',
            confirmText: 'Delete',
            danger: true
        });
        if (!ok) return;
        await attempt('Cannot delete the comparison', () => deleteSaved(dataset, comparison.uid));
    }

    return { rename, remove };
}
