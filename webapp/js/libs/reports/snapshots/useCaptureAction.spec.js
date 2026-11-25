/** The state of the "Capture for report" button: busy while it runs, the message when it ends, and a failure said. */
import { describe, it, expect, vi } from 'vitest';
import { useCaptureAction, useDialogCapture, CAPTURED_TEXT } from './useCaptureAction';

describe('useCaptureAction', () => {
    it('is busy while the capture runs and says to save when it is done', async () => {
        let finish;
        const run = vi.fn(() => new Promise(resolve => { finish = resolve; }));
        const action = useCaptureAction(() => ({ run }));
        const running = action.run();
        expect(action.capturing.value).toBe(true);
        // A second press while it runs does nothing
        action.run();
        expect(run).toHaveBeenCalledTimes(1);
        finish();
        await running;
        expect(action.capturing.value).toBe(false);
        expect(action.message.value).toBe(CAPTURED_TEXT);
        expect(action.failed.value).toBe(false);
    });

    it('says why a capture failed', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const action = useCaptureAction(() => ({ run: async () => { throw new Error('Forbidden'); } }));
        await action.run();
        expect(action.failed.value).toBe(true);
        expect(action.message.value).toBe('The capture failed: Forbidden');
        expect(action.capturing.value).toBe(false);
    });

    it('does nothing without a capture', async () => {
        const action = useCaptureAction(() => null);
        await action.run();
        expect(action.message.value).toBe('');
    });

    it('has the capture the item came with, then the one it made, and tells of it', async () => {
        const made = { path: 'annotations/a-3d.webp', camera: { position: [0, 0, 1], target: [0, 0, 0] }, capturedAt: '2026-11-25T00:00:00Z' };
        const onCaptured = vi.fn();
        const action = useCaptureAction(() => ({ run: async () => made }), { snapshot: { path: 'old' }, onCaptured });
        expect(action.snapshot.value).toEqual({ path: 'old' });
        await action.run();
        expect(action.snapshot.value).toEqual(made);
        expect(onCaptured).toHaveBeenCalledWith(made);
    });

    it('keeps the capture it has when a run fails or answers with no capture', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const failing = useCaptureAction(() => ({ run: async () => { throw new Error('no'); } }), { snapshot: { path: 'old' } });
        await failing.run();
        expect(failing.snapshot.value).toEqual({ path: 'old' });
        const empty = useCaptureAction(() => ({ run: async () => ({}) }));
        await empty.run();
        expect(empty.snapshot.value).toBeNull();
    });
});

describe('useDialogCapture', () => {
    it('starts on Details with the capture of the photo context, and turns to Photos when a capture is made', async () => {
        const made = { path: 'annotations/a-3d.webp', camera: { position: [0, 0, 1], target: [0, 0, 0] }, capturedAt: '2026-11-25T00:00:00Z' };
        const { tab, captureAction } = useDialogCapture({ capture: { run: async () => made }, photoContext: { snapshot: null } });
        expect(tab.value).toBe('details');
        await captureAction.run();
        expect(tab.value).toBe('photos');
        expect(captureAction.snapshot.value).toEqual(made);
    });

    it('stays on Details in a dialog with no Photos tab', async () => {
        const { tab, captureAction } = useDialogCapture({ capture: { run: async () => ({ path: 'p' }) }, photoContext: null });
        await captureAction.run();
        expect(tab.value).toBe('details');
    });
});
