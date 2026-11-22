/** The state of the "Capture for report" button: busy while it runs, the message when it ends, and a failure said. */
import { describe, it, expect, vi } from 'vitest';
import { useCaptureAction, CAPTURED_TEXT } from './useCaptureAction';

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
});
