import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFrameRetry, FRAME_ATTEMPTS, FRAME_RETRY_MS } from './framing';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('frame retry', () => {
    it('frames at once, and stops when a real box was framed', () => {
        const frame = vi.fn(() => true);
        createFrameRetry({ frame, userInteracted: () => false }).start();
        vi.advanceTimersByTime(10 * FRAME_RETRY_MS);
        expect(frame).toHaveBeenCalledTimes(1);
    });

    it('tries again while there is no box yet, then stops at the box', () => {
        let ready = false;
        const frame = vi.fn(() => ready);
        createFrameRetry({ frame, userInteracted: () => false }).start();
        vi.advanceTimersByTime(3 * FRAME_RETRY_MS);
        expect(frame).toHaveBeenCalledTimes(4);
        ready = true;
        vi.advanceTimersByTime(FRAME_RETRY_MS);
        expect(frame).toHaveBeenCalledTimes(5);
        vi.advanceTimersByTime(10 * FRAME_RETRY_MS);
        expect(frame).toHaveBeenCalledTimes(5);
    });

    it('does not take the camera back once the user moved it', () => {
        let moved = false;
        const frame = vi.fn(() => false);
        createFrameRetry({ frame, userInteracted: () => moved }).start();
        vi.advanceTimersByTime(2 * FRAME_RETRY_MS);
        expect(frame).toHaveBeenCalledTimes(3);
        moved = true;
        vi.advanceTimersByTime(10 * FRAME_RETRY_MS);
        expect(frame).toHaveBeenCalledTimes(3);
    });

    it('frames the first time even when the user dragged while the splat loaded', () => {
        const frame = vi.fn(() => false);
        createFrameRetry({ frame, userInteracted: () => true }).start();
        expect(frame).toHaveBeenCalledTimes(1);
        vi.advanceTimersByTime(10 * FRAME_RETRY_MS);
        expect(frame).toHaveBeenCalledTimes(1);
    });

    it('gives up after its attempts (about ten seconds)', () => {
        const frame = vi.fn(() => false);
        createFrameRetry({ frame, userInteracted: () => false }).start();
        vi.advanceTimersByTime(FRAME_ATTEMPTS * 2 * FRAME_RETRY_MS);
        expect(frame).toHaveBeenCalledTimes(FRAME_ATTEMPTS);
        expect(FRAME_ATTEMPTS * FRAME_RETRY_MS).toBe(10000);
    });

    it('cancels, and starting again begins anew', () => {
        const frame = vi.fn(() => false);
        const retry = createFrameRetry({ frame, userInteracted: () => false });
        retry.start();
        retry.cancel();
        vi.advanceTimersByTime(10 * FRAME_RETRY_MS);
        expect(frame).toHaveBeenCalledTimes(1);
        retry.start();
        retry.start();
        vi.advanceTimersByTime(FRAME_RETRY_MS);
        expect(frame).toHaveBeenCalledTimes(4);
    });
});
