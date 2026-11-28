// @ts-check
/**
 * Whether an event comes from inside a modal dialog (an `aria-modal` dialog or a PrimeVue dialog, which a non-modal Window of the
 * viewers is too): the keys of a viewer (F, Ctrl+Z) then belong to the dialog.
 * @param {EventTarget | null} target
 * @returns {boolean}
 */
export function inModalDialog(target) {
    return target instanceof Element && !!target.closest('[role="dialog"][aria-modal="true"], .p-dialog');
}
