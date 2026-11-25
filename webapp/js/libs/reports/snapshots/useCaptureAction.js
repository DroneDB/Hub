// @ts-check
/**
 * The state of the "Capture for report" button of the properties dialog of a 3D item: whether a capture runs, what it
 * said when it ended, and the capture the item has now (the one it came with, then the one just made, which the
 * dialog's Photos tab shows). The dialogs (a 3D measure and a 3D annotation) share it.
 */
import { ref } from 'vue';

/**
 * What the dialog says after a capture: the image is written to the dataset and is the item's at once (Cancel does not
 * take it back), and the measurement file has it once the measurements are saved.
 */
export const CAPTURED_TEXT = 'Captured: the picture is in the Photos tab. Save the measurements (Save in the viewer toolbar) to keep it in the file.';

/**
 * @param {() => { run: () => Promise<unknown> } | null | undefined} capture  the capture the dialog was given (none: the
 *   button is not shown); `run` answers with the item's new capture ({ path, camera, capturedAt })
 * @param {{ snapshot?: object | null, onCaptured?: (snapshot: object) => void }} [options]  the capture the item has
 *   when the dialog opens, and what is told of each capture that is made
 */
export function useCaptureAction(capture, { snapshot: initial = null, onCaptured } = {}) {
    const capturing = ref(false);
    const message = ref('');
    const failed = ref(false);
    const snapshot = ref(/** @type {object | null} */ (initial));

    async function run() {
        const action = capture();
        if (!action || capturing.value) return;
        capturing.value = true;
        message.value = '';
        failed.value = false;
        try {
            const made = await action.run();
            if (made && typeof made === 'object' && typeof (/** @type {any} */ (made)).path === 'string') {
                snapshot.value = made;
                onCaptured?.(made);
            }
            message.value = CAPTURED_TEXT;
        } catch (e) {
            console.error('The 3D capture failed:', e);
            failed.value = true;
            message.value = `The capture failed: ${e instanceof Error && e.message ? e.message : 'unknown error'}`;
        } finally {
            capturing.value = false;
        }
    }

    return { capturing, message, failed, snapshot, run };
}

/**
 * The capture of the properties dialog of a 3D item: its useCaptureAction (from the dialog's `capture`, with the capture
 * the item has in its `photoContext`), and the tab the dialog shows, which turns to Photos when a capture is made so
 * that the picture is seen.
 * @param {{ capture?: { run: () => Promise<unknown> } | null, photoContext?: { snapshot?: object | null } | null }} props
 */
export function useDialogCapture(props) {
    const tab = ref('details');
    const captureAction = useCaptureAction(() => props.capture, {
        snapshot: props.photoContext?.snapshot ?? null,
        onCaptured: () => { if (props.photoContext) tab.value = 'photos'; }
    });
    return { tab, captureAction };
}
