import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { presentationModeHook, createFrameRetry, FRAME_ATTEMPTS, FRAME_RETRY_MS, coreBox, residentSplatCenters, CORE_QUANTILES, MIN_CORE_SAMPLES, MIN_ROOM_SAMPLES, framingHint, chooseFraming, crowdingOf } from './framing';
import { FRAMING } from './cameraRig';
import { MIN_UP_CONFIDENCE } from './upAxis';
import { Presentation } from './presentation';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('frame retry with the presentation, as the viewer wires them', () => {
    // The viewer takes the start of an orbit, a tour or a flight as the user taking the camera: its onMode hook
    function wired(start) {
        let userInteracted = false;
        const shown = [];
        const rig = {
            camera: { fov: 60, position: { x: 0, y: 0, z: 0 } },
            controls: { target: {}, update() {}, autoRotate: false, autoRotateSpeed: 0 }, syncYawPitch() {}, setFov() {}
        };
        const presentation = new Presentation(rig, {
            cameras: () => [], onMode: presentationModeHook(mode => shown.push(mode), () => { userInteracted = true; }), onCamera() {}
        });
        const frame = vi.fn(() => false);
        createFrameRetry({ frame, userInteracted: () => userInteracted }).start();
        vi.advanceTimersByTime(2 * FRAME_RETRY_MS);
        expect(frame).toHaveBeenCalledTimes(3);
        start(presentation);
        vi.advanceTimersByTime(10 * FRAME_RETRY_MS);
        return { frame, presentation, shown };
    }

    it('does not pull the view back to the opening one once an orbit was started', () => {
        const { frame } = wired(presentation => presentation.orbit());
        expect(frame).toHaveBeenCalledTimes(3);
    });

    it('nor once a tour was started (an orbit when there are no cameras), even when it has ended since', () => {
        const { frame, presentation, shown } = wired(p => { p.start(); p.stop(); });
        expect(presentation.mode).toBeNull();
        // The mode is shown as it goes, the end of it too
        expect(shown.at(-1)).toBeNull();
        expect(frame).toHaveBeenCalledTimes(3);
    });
});

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

describe('framingHint', () => {
    const bounds = framing => ({ min: [-100, -100, -100], max: [100, 100, 100], framing });

    it('reads the kind of capture and its core from bounds.json', () => {
        for (const kind of ['object', 'scene', 'site']) {
            expect(framingHint(bounds({ kind, core: [-4, -1, -3, 3.5, 1, 2.5] }))).toEqual({ kind, core: { min: [-4, -1, -3], max: [3.5, 1, 2.5] } });
        }
    });

    it('is no hint for a build made before builds wrote one, or for one this version cannot read', () => {
        expect(framingHint(null)).toBeNull();
        expect(framingHint({ min: [0, 0, 0], max: [1, 1, 1] })).toBeNull();
        expect(framingHint(bounds({ kind: 'cave', core: [0, 0, 0, 1, 1, 1] }))).toBeNull();
        expect(framingHint(bounds({ kind: 'object' }))).toBeNull();
        expect(framingHint(bounds({ kind: 'object', core: [0, 0, 0, 1, 1] }))).toBeNull();
        expect(framingHint(bounds({ kind: 'object', core: [0, 0, 0, 1, '1', 1] }))).toBeNull();
        expect(framingHint(bounds({ kind: 'object', core: [0, 0, 0, 1, NaN, 1] }))).toBeNull();
        // Its minimum above its maximum
        expect(framingHint(bounds({ kind: 'object', core: [0, 2, 0, 1, 1, 1] }))).toBeNull();
        expect(framingHint(bounds('object'))).toBeNull();
    });
});

describe('chooseFraming', () => {
    const train = { min: [-62, -67, -109], max: [172, 21, 26], framing: { kind: 'object', core: [-3.95, -0.94, -3.02, 3.65, 0.98, 2.72] } };

    it('frames the core the build found, as its kind says, facing its sides; an object or a site without reading the resident splats', () => {
        const residentCenters = vi.fn(() => capture());
        expect(chooseFraming({ bounds: train, georeferenced: false, residentCenters })).toEqual({
            framing: FRAMING.OBJECT, core: { min: [-3.95, -0.94, -3.02], max: [3.65, 0.98, 2.72] }, faceBox: true, roomShot: false, crowding: null, settled: true
        });
        const site = { ...train, framing: { kind: 'site', core: [-50, -50, 0, 50, 50, 10] } };
        expect(chooseFraming({ bounds: site, residentCenters })).toMatchObject({ framing: FRAMING.OVERVIEW, settled: true });
        expect(residentCenters).not.toHaveBeenCalled();
    });

    it('frames a room whose up the build is not sure of along its longest side, without reading the resident splats', () => {
        const residentCenters = vi.fn(() => capture({ subject: MIN_ROOM_SAMPLES }));
        const unsure = { min: [-100, -100, -100], max: [100, 100, 100], up: [0.84, -0.01, -0.54], upConfidence: MIN_UP_CONFIDENCE - 0.01, framing: { kind: 'scene', core: [8, -1, -7, 12, 1, -3] } };
        expect(chooseFraming({ bounds: unsure, residentCenters })).toMatchObject({ framing: FRAMING.IMMERSIVE, faceBox: true, roomShot: false, crowding: null, settled: true });
        const none = { ...unsure, up: undefined, upConfidence: undefined };
        expect(chooseFraming({ bounds: none, residentCenters }).roomShot).toBe(false);
        expect(residentCenters).not.toHaveBeenCalled();
        const sure = { ...unsure, up: [0, -1, 0], upConfidence: MIN_UP_CONFIDENCE };
        expect(chooseFraming({ bounds: sure, residentCenters })).toMatchObject({ roomShot: true, settled: true });
    });

    it('keeps a room clear of its resident splats, and frames it again until enough of them arrived', () => {
        const room = { min: [-100, -100, -100], max: [100, 100, 100], up: [0, -1, 0], upConfidence: 0.9, framing: { kind: 'scene', core: [8, -1, -7, 12, 1, -3] } };
        const early = chooseFraming({ bounds: room, residentCenters: () => new Float32Array(0) });
        expect(early).toMatchObject({ framing: FRAMING.IMMERSIVE, faceBox: true, roomShot: true, crowding: null, settled: false });
        expect(early.core).toEqual({ min: [8, -1, -7], max: [12, 1, -3] });
        // The first coarse pages of a paged scene are too few; once enough have arrived the framing is settled
        expect(chooseFraming({ bounds: room, residentCenters: () => capture() }).settled).toBe(false);
        const loaded = chooseFraming({ bounds: room, residentCenters: () => capture({ subject: MIN_ROOM_SAMPLES }) });
        expect(loaded.settled).toBe(true);
        expect(typeof loaded.crowding).toBe('function');
    });

    it('frames the core of the resident splats without a hint, from inside or, for a georeferenced scene, from above', () => {
        const before = { min: [-500, -500, -500], max: [800, 800, 800] };
        const scene = chooseFraming({ bounds: before, georeferenced: false, residentCenters: () => capture() });
        expect(scene.framing).toBe(FRAMING.IMMERSIVE);
        expect(scene.faceBox).toBe(false);
        expect(scene.core).toEqual(coreBox(capture(), CORE_QUANTILES.immersive));
        const site = chooseFraming({ bounds: null, georeferenced: true, residentCenters: () => capture() });
        expect(site.framing).toBe(FRAMING.OVERVIEW);
        expect(site.core).toEqual(coreBox(capture(), CORE_QUANTILES.overview));
        // Nothing resident yet: no core, the retry goes on
        expect(chooseFraming({ bounds: before, residentCenters: () => new Float32Array(0) }).core).toBeNull();
    });
});

describe('crowdingOf', () => {
    // The subject of the capture fills a 4 x 2 x 4 box about (10, 0, -5) evenly
    const box = { min: [8, -1, -7], max: [12, 1, -3] };

    it('is about 1 among splats spread as evenly as in the core, 0 in the air, more in a wall', () => {
        const crowding = crowdingOf(capture({ subject: 20000, floaters: 0 }), box);
        expect(crowding([10, 0, -5], 0.5)).toBeGreaterThan(0.7);
        expect(crowding([10, 0, -5], 0.5)).toBeLessThan(1.3);
        expect(crowding([10, 5, -5], 0.5)).toBe(0);
        // A wall: as many splats again in a slab 0.1 thick at x = 20, 2 high and 4 wide
        const wall = Array.from(capture({ subject: 20000, floaters: 0 }));
        for (let i = 0; i < 20000; i++) wall.push(20 + (i % 10) * 0.01, (i % 137) / 68.5 - 1, -7 + (i % 151) / 37.75);
        expect(crowdingOf(new Float32Array(wall), box)([20, 0, -5], 0.5)).toBeGreaterThan(2);
    });

    it('says nothing with too few splats in the core', () => {
        expect(crowdingOf(capture({ subject: MIN_ROOM_SAMPLES - 1, floaters: 100 }), box)).toBeNull();
        expect(crowdingOf(capture({ subject: MIN_ROOM_SAMPLES, floaters: 0 }), box)).not.toBeNull();
    });
});
