// @ts-check
/**
 * useConfirm - a yes/no question as a promise, on the dialog registry:
 *
 *   const confirm = useConfirm(dialogs);
 *   if (await confirm({ title: 'Replace cover', message: '...', confirmText: 'Replace', danger: true })) ...
 *
 * `danger` makes it a destructive confirmation: the focus starts on Cancel and Enter does not
 * confirm. `requireText` adds a typed confirmation: Confirm stays disabled until the input
 * holds that text (the input has the focus, and Enter there confirms once it matches).
 * A delete takes its options from libs/deleteConfirmation.js.
 */
import ConfirmDialog from '@/components/ConfirmDialog.vue';

/**
 * @param {{ open: Function }} dialogs  from useDialogs()
 */
export function useConfirm(dialogs) {
    const choose = useChoice(dialogs);
    /**
     * @param {{ title?: string, message: string, confirmText?: string, cancelText?: string, danger?: boolean, requireText?: string, warningTitle?: string, warningMessage?: string }} options
     * @returns {Promise<boolean>}
     */
    return function confirm(options) {
        return choose(options).then(result => result === 'confirm');
    };
}

/**
 * useChoice - a question with a third answer: the dialog's secondary button. It resolves to the
 * answer itself: 'confirm', 'secondary', or 'cancel' (the Cancel button, Escape, the close button),
 * so a caller can tell "do the other thing" from "do nothing".
 *
 *   const choose = useChoice(dialogs);
 *   const answer = await choose({ message: '...', confirmText: 'Save', secondaryText: 'Discard', secondaryDanger: true });
 *
 * @param {{ open: Function }} dialogs  from useDialogs()
 */
export function useChoice(dialogs) {
    /**
     * @param {{ title?: string, message: string, confirmText?: string, cancelText?: string, secondaryText?: string, danger?: boolean, secondaryDanger?: boolean, requireText?: string, warningTitle?: string, warningMessage?: string }} options
     * @returns {Promise<'confirm'|'secondary'|'cancel'>}
     */
    return function choose({ danger = false, secondaryDanger = false, ...props }) {
        const classes = { confirmButtonClass: danger ? 'danger' : 'primary' };
        if (props.secondaryText) Object.assign(classes, { secondaryButtonClass: secondaryDanger ? 'danger' : 'secondary' });
        return dialogs.open(ConfirmDialog, { ...props, ...classes })
            .then(/** @param {any} result */ result => (result === 'confirm' || result === 'secondary' ? result : 'cancel'));
    };
}
