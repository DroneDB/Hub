// @ts-check
/**
 * The state of the "Capture for report" button of the properties dialog of a 3D item: whether a capture runs, and what
 * it said when it ended. The dialogs (a 3D measure and a 3D annotation) share it.
 */
import { ref } from 'vue';

/** What the dialog says after a capture: the image is written, the item stores it when it is saved. */
export const CAPTURED_TEXT = 'Captured. Save the measurements to keep the capture with the item.';

/**
 * @param {() => { run: () => Promise<unknown> } | null | undefined} capture  the capture the dialog was given (none: the button is not shown)
 */
export function useCaptureAction(capture) {
    const capturing = ref(false);
    const message = ref('');
    const failed = ref(false);

    async function run() {
        const action = capture();
        if (!action || capturing.value) return;
        capturing.value = true;
        message.value = '';
        failed.value = false;
        try {
            await action.run();
            message.value = CAPTURED_TEXT;
        } catch (e) {
            console.error('The 3D capture failed:', e);
            failed.value = true;
            message.value = `The capture failed: ${e instanceof Error && e.message ? e.message : 'unknown error'}`;
        } finally {
            capturing.value = false;
        }
    }

    return { capturing, message, failed, run };
}
