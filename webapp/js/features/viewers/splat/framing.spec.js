import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFrameRetry, FRAME_ATTEMPTS, FRAME_RETRY_MS, coreBox, residentSplatCenters, CORE_QUANTILES, MIN_CORE_SAMPLES } from './framing';

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

/**
 * A capture: `subject` splats spread evenly in a 4 x 2 x 4 box about (10, 0, -5), and `floaters` far out (a sky
 * dome 300 to 800 away on one side, as the background splats of a scan of a room)
 */
function capture({ subject = 2000, floaters = 150 } = {}) {
    const centers = [];
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < subject; i++) centers.push(10 + (random() * 4 - 2), random() * 2 - 1, -5 + (random() * 4 - 2));
    for (let i = 0; i < floaters; i++) centers.push(300 + random() * 500, 200 + random() * 400, -300 - random() * 500);
    return new Float32Array(centers);
}

describe('coreBox', () => {
    it('frames the subject of a capture, not its floaters (the box of every splat is hundreds of times larger)', () => {
        const box = coreBox(capture(), CORE_QUANTILES.immersive);
        const centre = box.min.map((min, a) => (min + box.max[a]) / 2);
        expect(Math.abs(centre[0] - 10)).toBeLessThan(0.5);
        expect(Math.abs(centre[1])).toBeLessThan(0.5);
        expect(Math.abs(centre[2] + 5)).toBeLessThan(0.5);
        box.max.forEach((max, a) => expect(max - box.min[a]).toBeLessThan(5));
    });

    it('keeps all but the outer 1 % of a georeferenced site, seen whole', () => {
        const site = capture({ subject: 5000, floaters: 0 });
        const box = coreBox(site, CORE_QUANTILES.overview);
        expect(box.max[0] - box.min[0]).toBeGreaterThan(3.8);
        expect(box.max[0] - box.min[0]).toBeLessThanOrEqual(4);
    });

    it('says nothing with too few splats, or with non-finite centres only', () => {
        expect(coreBox(new Float32Array((MIN_CORE_SAMPLES - 1) * 3), CORE_QUANTILES.immersive)).toBeNull();
        expect(coreBox(new Float32Array(300).fill(NaN), CORE_QUANTILES.immersive)).toBeNull();
    });
});

describe('residentSplatCenters', () => {
    /** A SplatMesh of `count` resident splats at (i, 2i, 3i) */
    const mesh = count => ({
        splats: { numSplats: count },
        forEachSplat: callback => {
            for (let i = 0; i < count; i++) callback(i, { x: i, y: 2 * i, z: 3 * i });
        }
    });

    it('reads the centre of every resident splat', () => {
        expect(Array.from(residentSplatCenters(mesh(3)))).toEqual([0, 0, 0, 1, 2, 3, 2, 4, 6]);
    });

    it('reads every n-th one past the cap', () => {
        const centers = residentSplatCenters(mesh(1000), 100);
        expect(centers.length).toBe(300);
        expect(Array.from(centers.slice(3, 6))).toEqual([10, 20, 30]);
    });

    it('is empty before any splat is resident (a paged scene at load)', () => {
        expect(residentSplatCenters(mesh(0)).length).toBe(0);
        expect(residentSplatCenters(null).length).toBe(0);
    });
});
