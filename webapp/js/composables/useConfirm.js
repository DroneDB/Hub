// @ts-check
/**
 * useConfirm - a yes/no question as a promise (HQ-09), on the dialog registry:
 *
 *   const confirm = useConfirm(dialogs);
 *   if (await confirm({ title: 'Replace cover', message: '...', confirmText: 'Replace', danger: true })) ...
 */
import ConfirmDialog from '@/components/ConfirmDialog.vue';

/**
 * @param {{ open: Function }} dialogs  from useDialogs()
 */
export function useConfirm(dialogs) {
    /**
     * @param {{ title?: string, message: string, confirmText?: string, cancelText?: string, danger?: boolean, warningTitle?: string, warningMessage?: string }} options
     * @returns {Promise<boolean>}
     */
    return function confirm({ danger = false, ...props }) {
        return dialogs.open(ConfirmDialog, { ...props, confirmButtonClass: danger ? 'danger' : 'primary' })
            .then(/** @param {any} result */ result => result === 'confirm');
    };
}
