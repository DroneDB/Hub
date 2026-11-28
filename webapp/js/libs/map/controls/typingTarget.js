// @ts-check
/**
 * Whether a keyboard event comes from a place where the user types (a text field, a select, an editable
 * element): a shortcut of the map must leave Ctrl+Z, Escape and the like to it.
 * @param {EventTarget | null | undefined} target  the `target` of the event
 * @returns {boolean}
 */
export function isTypingTarget(target) {
    return target instanceof Element && !!target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
}
