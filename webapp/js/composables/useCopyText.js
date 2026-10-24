// @ts-check
/**
 * Copy text to the clipboard and show "copied" for a moment (HQ-02).
 * The reset timer is cleared when the owning component or scope goes away.
 */
import { ref, getCurrentScope, onScopeDispose } from 'vue';
import clipboardCopy from 'clipboard-copy';

/**
 * Copy outside components (map controls, popups).
 * @param {string} text
 * @returns {Promise<void>}
 */
export function copyText(text) {
    return clipboardCopy(text);
}

/**
 * @param {{ resetMs?: number }} [options]
 */
export function useCopyText({ resetMs = 2000 } = {}) {
    const copied = ref(false);
    /** @type {ReturnType<typeof setTimeout>|null} */
    let timer = null;
    const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };

    /** @param {string} text @returns {Promise<boolean>} true when copied */
    async function copy(text) {
        try {
            await copyText(text);
        } catch {
            return false;
        }
        clear();
        copied.value = true;
        timer = setTimeout(() => { copied.value = false; timer = null; }, resetMs);
        return true;
    }

    if (getCurrentScope()) onScopeDispose(clear);
    return { copy, copied };
}
