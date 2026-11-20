// @ts-check
/**
 * The actions on saved views that ask the user first: the name prompt (shared with the map
 * viewer's Save), rename and delete. Errors are shown; `onChanged` runs after a change.
 *
 *   const actions = useViewActions({ dataset, dialogs, onChanged: () => reloadViews() });
 *   await actions.rename(view);
 *
 * Names reach the dialogs and toasts as text: the prompt shows the name in an input, and a
 * confirmation shows it in its title, never in the message (which a ConfirmDialog renders as
 * sanitised HTML).
 */
import reg from '@/libs/api/sharedRegistry';
import { updateView, deleteView } from '@/libs/views/viewStore';
import { MAX_NAME_LENGTH } from '@/libs/views/viewState';
import { useConfirm } from '@/composables/useConfirm';
import { useNotify } from '@/composables/useNotify';
import TextPromptDialog from '@/components/TextPromptDialog.vue';

/**
 * Asks for a view name: the trimmed name, or null when cancelled.
 * @param {{ open: Function }} dialogs
 * @param {{ title: string, initialValue?: string, confirmLabel?: string }} options
 * @returns {Promise<string|null>}
 */
export function askViewName(dialogs, { title, initialValue = '', confirmLabel = 'Save' }) {
    return dialogs.open(TextPromptDialog, { title, label: 'Name', initialValue, confirmLabel, maxLength: MAX_NAME_LENGTH });
}

/**
 * @param {{ dataset: any, dialogs: { open: Function }, onChanged?: () => void }} ctx
 */
export function useViewActions({ dataset, dialogs, onChanged = () => {} }) {
    const confirm = useConfirm(dialogs);
    const notify = useNotify();

    /** @param {string} summary @param {() => Promise<any>} action */
    async function attempt(summary, action) {
        try {
            await action();
            onChanged();
        } catch (/** @type {any} */ e) {
            console.error(`${summary}:`, e);
            notify.error(e.message || String(e), { summary });
        }
    }

    /** @param {{ uid: string, name: string }} view */
    async function rename(view) {
        const name = await askViewName(dialogs, { title: 'Rename view', initialValue: view.name, confirmLabel: 'Rename' });
        if (!name || name === view.name) return;
        await attempt('Cannot rename the view', () => updateView(dataset, view.uid, { name, user: reg.getUsername() || '' }));
    }

    /** @param {{ uid: string, name: string }} view */
    async function remove(view) {
        const ok = await confirm({
            title: `Delete "${view.name}"`,
            message: 'Delete this saved view? Its links will stop working. The files are not deleted.',
            confirmText: 'Delete',
            danger: true
        });
        if (!ok) return;
        await attempt('Cannot delete the view', () => deleteView(dataset, view.uid));
    }

    return { rename, remove };
}
