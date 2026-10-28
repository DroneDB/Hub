import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { Presentation } from './presentation';
import { easeInOutCubic } from '@/features/viewers/unified/navControls';

/** requestAnimationFrame under the spec's control. */
let frames;
let now;
beforeEach(() => {
    frames = [];
    now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.stubGlobal('requestAnimationFrame', cb => { frames.push(cb); return frames.length; });
    vi.stubGlobal('cancelAnimationFrame', id => { frames[id - 1] = null; });
});
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

/** Runs the frame that is waiting, `ms` after the last one. */
function advance(ms) {
    now += ms;
    const cb = frames.pop();
    if (cb) cb(now);
    return !!cb;
}

function makePresentation(cameras = []) {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(0, 0, 10);
    const rig = {
        THREE, camera, controls: { target: new THREE.Vector3(), update: vi.fn(), autoRotate: false, autoRotateSpeed: 0 },
        boundsDiagonal: 10,
        syncYawPitch: vi.fn(),
        setFov: vi.fn(fov => { camera.fov = fov; })
    };
    const events = { mode: [], camera: [] };
    const presentation = new Presentation(rig, {
        cameras: () => cameras,
        onMode: m => events.mode.push(m),
        onCamera: i => events.camera.push(i)
    });
    return { presentation, rig, camera, events };
}

const cam = (x, fov = 60) => ({ id: x, name: `c${x}`, position: [x, 0, 0], target: [x, 0, -5], quaternion: [0, 0, 0, 1], fov });

describe('flyTo', () => {
    it('moves by the shared easing, to the position, target and field of view of the camera', () => {
        const { presentation, rig, camera, events } = makePresentation([cam(0), cam(100, 40)]);
        presentation.flyTo(1);
        expect(presentation.mode).toBe('transition');
        advance(300); // 300 of 1200 ms
        const e = easeInOutCubic(0.25);
        expect(camera.position.x).toBeCloseTo(100 * e, 6);
        expect(rig.controls.target.x).toBeCloseTo(100 * e, 6);
        expect(camera.fov).toBeCloseTo(60 + (40 - 60) * e, 6);
        // Not the smoothstep the presentation used to have of its own
        expect(e).not.toBeCloseTo(0.25 * 0.25 * (3 - 2 * 0.25), 3);

        advance(2000);
        expect(camera.position.x).toBeCloseTo(100, 6);
        expect(camera.fov).toBeCloseTo(40, 6);
        expect(presentation.mode).toBe(null);
        expect(events.camera).toEqual([null, 1]);
    });

    it('ignores a camera that does not exist', () => {
        const { presentation } = makePresentation([]);
        presentation.flyTo(3);
        expect(presentation.mode).toBe(null);
    });

    it('stops where it is when the user takes over', () => {
        const { presentation, camera } = makePresentation([cam(100)]);
        presentation.flyTo(0);
        advance(400);
        const x = camera.position.x;
        expect(presentation.stop()).toBe(true);
        expect(advance(400)).toBe(false);
        expect(camera.position.x).toBe(x);
        expect(presentation.stop()).toBe(false);
    });

    it('is replaced by a second flight, which ends at its own camera', () => {
        const { presentation, camera, events } = makePresentation([cam(100), cam(-50)]);
        presentation.flyTo(0);
        advance(300);
        presentation.flyTo(1);
        advance(5000);
        expect(camera.position.x).toBeCloseTo(-50, 6);
        expect(events.camera.filter(i => i !== null)).toEqual([1]);
    });
});

describe('tour', () => {
    it('flies to each camera by the shared easing, rests there, then goes on to the next, round', () => {
        const { presentation, camera, events } = makePresentation([cam(10), cam(20)]);
        presentation.start();
        expect(presentation.mode).toBe('tour');
        advance(625); // a quarter of the 2.5 s flight
        expect(camera.position.x).toBeCloseTo(10 * easeInOutCubic(0.25), 6);
        advance(5000);
        expect(camera.position.x).toBeCloseTo(10, 6);
        expect(events.camera.at(-1)).toBe(0);

        // The pause counts the frames' time
        presentation.update(1.9);
        expect(presentation.state.phase).toBe('dwell');
        presentation.update(0.2);
        expect(presentation.state.phase).toBe('move');
        expect(presentation.state.target).toBe(1);
        advance(5000);
        expect(camera.position.x).toBeCloseTo(20, 6);
        expect(events.camera.at(-1)).toBe(1);

        presentation.update(2.1);
        expect(presentation.state.target).toBe(0);
    });

    it('does not let the pause run while the camera is flying', () => {
        const { presentation } = makePresentation([cam(10)]);
        presentation.start();
        presentation.update(10);
        expect(presentation.state.phase).toBe('move');
    });

    it('ends when every camera was deleted during the pause', () => {
        const list = [cam(10)];
        const { presentation } = makePresentation(list);
        presentation.start();
        advance(5000);
        list.length = 0;
        presentation.update(3);
        expect(presentation.mode).toBe(null);
    });

    it('orbits slowly when there are no cameras', () => {
        const { presentation, rig } = makePresentation([]);
        presentation.start();
        expect(presentation.mode).toBe('orbit');
        expect(rig.controls.autoRotate).toBe(true);
        presentation.stop();
        expect(rig.controls.autoRotate).toBe(false);
    });
});

describe('dispose', () => {
    it('ends a flight that is running', () => {
        const { presentation, camera } = makePresentation([cam(100)]);
        presentation.flyTo(0);
        advance(300);
        const x = camera.position.x;
        presentation.dispose();
        expect(advance(300)).toBe(false);
        expect(camera.position.x).toBe(x);
    });
});
