// @ts-check
/**
 * Whether a keyboard event comes from a place where the user types: a text field, a select, or an editable element
 * (one marked contenteditable, or inside one). A shortcut of a page or a viewer leaves its keys (Ctrl+Z, Escape, the
 * arrows, a letter) to it.
 * @param {EventTarget | null | undefined} target  the `target` of the event
 * @returns {boolean}
 */
export function isTypingTarget(target) {
    return target instanceof Element
        && (!!target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]') || /** @type {HTMLElement} */ (target).isContentEditable === true);
}
