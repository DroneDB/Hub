// @ts-check
/**
 * Copy text to the clipboard and show "copied" for a moment.
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
 * Copy a link and say so: "Link copied to the clipboard", or "The link could not be copied" (FR-RAS-05). The wording
 * of every Copy Link of the Hub.
 * @param {string} text  the link
 * @param {{ success: Function, error: Function }} notify  the app notifier (libs/notify; this.$notify in a component)
 * @param {string} [summary]  what the toast is about (the name of a view)
 * @returns {Promise<boolean>} true when copied
 */
export async function copyLinkWithNotice(text, notify, summary) {
    const options = summary ? { summary } : undefined;
    try {
        await copyText(text);
    } catch {
        notify.error('The link could not be copied', options);
        return false;
    }
    notify.success('Link copied to the clipboard', options);
    return true;
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
