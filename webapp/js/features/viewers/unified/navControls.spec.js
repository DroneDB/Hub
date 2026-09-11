/**
 * navControls - unit tests for the unified viewer navigation module.
 *
 * Covers the pure logic (wheel normalization, scene distance metrics), the single control
 * factory configuration (button mapping, damping, zoom-to-cursor, ground-plane panning, wheel
 * re-dispatch), the double-click re-centre (surface pick and the up-vector-aware ground-plane
 * fallback) and the camera tweener (easing endpoint, retarget, stop). three.js math classes are
 * the real thing; OrbitControls/Giro3D are stubbed.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
    NAV,
    wheelNotches,
    createNavControls,
    applySceneMetrics,
    createDoubleClickRecenter,
    createCameraTweener
} from './navControls';

afterEach(() => {
    vi.useRealTimers();
});

// ---- wheelNotches ----

describe('wheelNotches', () => {
    it('normalizes Chrome pixel deltas (100 units per notch) to +/-1', () => {
        expect(wheelNotches({ deltaMode: 0, deltaY: 100 })).toBe(1);
        expect(wheelNotches({ deltaMode: 0, deltaY: -100 })).toBe(-1);
        expect(wheelNotches({ deltaMode: 0, deltaY: 50 })).toBeCloseTo(0.5);
    });

    it('clamps large trackpad / fast-scroll pixel deltas to 1 notch', () => {
        expect(wheelNotches({ deltaMode: 0, deltaY: 1200 })).toBe(1);
        expect(wheelNotches({ deltaMode: 0, deltaY: -1200 })).toBe(-1);
    });

    it('normalizes Firefox line deltas to +/-1 per notch', () => {
        expect(wheelNotches({ deltaMode: 1, deltaY: 3 })).toBe(1);
        expect(wheelNotches({ deltaMode: 1, deltaY: -3 })).toBe(-1);
        expect(wheelNotches({ deltaMode: 1, deltaY: 1 })).toBe(1);
    });

    it('maps page-mode deltas to a sign', () => {
        expect(wheelNotches({ deltaMode: 2, deltaY: 1 })).toBe(1);
        expect(wheelNotches({ deltaMode: 2, deltaY: -2 })).toBe(-1);
    });

    it('returns 0 for no movement', () => {
        expect(wheelNotches({ deltaMode: 0, deltaY: 0 })).toBe(0);
    });
});

// ---- createNavControls ----

/** Stub OrbitControls with the surface navControls touches. */
function makeFakeOrbitControls() {
    return class FakeOrbitControls {
        constructor(camera, domElement) {
            this.object = camera;
            this.domElement = domElement;
            this.target = new THREE.Vector3();
            this.stopListenToKeyEvents = vi.fn();
            this.listenToKeyEvents = vi.fn();
            this.update = vi.fn();
            this._disposed = false;
        }
        dispose() {
            this._disposed = true;
        }
    };
}

describe('createNavControls', () => {
    it('configures Potree-parity defaults instead of three map defaults', () => {
        const el = document.createElement('div');
        const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2000);
        const OrbitControls = makeFakeOrbitControls();

        const controls = createNavControls({ THREE, OrbitControls }, camera, el);

        expect(controls.enableDamping).toBe(true);
        expect(controls.dampingFactor).toBe(NAV.dampingFactor);
        // The old bug: MapControls-style LEFT=PAN. Orbiting must be on the left button.
        expect(controls.mouseButtons).toEqual({
            LEFT: THREE.MOUSE.ROTATE,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.PAN
        });
        expect(controls.zoomToCursor).toBe(false);
        expect(controls.touches).toEqual({
            ONE: THREE.TOUCH.ROTATE,
            TWO: THREE.TOUCH.DOLLY_PAN
        });
        expect(controls.listenToKeyEvents).toHaveBeenCalledWith(el);
    });

    it('spans the full sphere around the pivot and pans along the ground plane', () => {
        const el = document.createElement('div');
        const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2000);
        const OrbitControls = makeFakeOrbitControls();

        const controls = createNavControls({ THREE, OrbitControls }, camera, el);

        // Unconstrained pitch (Potree Orbit parity): inspecting an underside needs no mode switch.
        expect(controls.minPolarAngle).toBe(0);
        expect(controls.maxPolarAngle).toBe(Math.PI);
        // Panning must stay in the plane through the pivot perpendicular to camera.up - the ground
        // plane when up is Z, the local horizontal plane in an ECEF globe scene.
        expect(controls.screenSpacePanning).toBe(false);
    });

    it('re-dispatches Firefox line-delta wheel events as normalized pixel deltas', () => {
        const el = document.createElement('div');
        const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2000);
        const OrbitControls = makeFakeOrbitControls();
        createNavControls({ THREE, OrbitControls }, camera, el);

        const received = [];
        el.addEventListener('wheel', e => received.push(e));

        // Firefox: deltaMode 1 (lines), 3 lines per notch
        const ff = new WheelEvent('wheel', { deltaY: 3, deltaMode: 1, bubbles: true, cancelable: true });
        el.dispatchEvent(ff);

        expect(ff.defaultPrevented).toBe(true);
        expect(received).toHaveLength(1);
        expect(received[0].deltaMode).toBe(0);
        expect(received[0].deltaY).toBe(100);
    });

    it('does not re-normalize its own synthetic wheel events (no recursion)', () => {
        const el = document.createElement('div');
        const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2000);
        const OrbitControls = makeFakeOrbitControls();
        createNavControls({ THREE, OrbitControls }, camera, el);

        const received = [];
        el.addEventListener('wheel', e => received.push(e));

        el.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, deltaMode: 0, bubbles: true, cancelable: true }));
        // Exactly one event: the synthetic one passes through untouched.
        expect(received).toHaveLength(1);
    });

    it('removes the wheel normalizer on dispose', () => {
        const el = document.createElement('div');
        const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2000);
        const OrbitControls = makeFakeOrbitControls();
        const controls = createNavControls({ THREE, OrbitControls }, camera, el);

        controls.dispose();

        expect(controls._disposed).toBe(true);
        expect(controls.stopListenToKeyEvents).toHaveBeenCalled();

        const received = [];
        el.addEventListener('wheel', e => received.push(e));
        el.dispatchEvent(new WheelEvent('wheel', { deltaY: 3, deltaMode: 1, bubbles: true, cancelable: true }));
        // Normalizer gone: the raw Firefox event is no longer intercepted/rewritten.
        expect(received).toHaveLength(1);
        expect(received[0].deltaMode).toBe(1);
    });
});

// ---- turntable rotation, against the real OrbitControls ----
//
// The invariant the whole navigation model rests on: a left-drag must rotate the camera about the
// vertical axis through the pivot - the model's own vertical centre axis right after framing - and
// must not move the pivot. Tested with the real three.js control (everything above stubs it) so a
// library or configuration change that breaks turntable rotation fails here instead of in the UI.

describe('turntable rotation (real OrbitControls)', () => {
    const VIEWPORT_H = 800;
    const VIEWPORT_W = 600;

    function makeCanvas() {
        const el = document.createElement('canvas');
        Object.defineProperty(el, 'clientWidth', { value: VIEWPORT_W });
        Object.defineProperty(el, 'clientHeight', { value: VIEWPORT_H });
        el.getBoundingClientRect = () => ({ left: 0, top: 0, width: VIEWPORT_W, height: VIEWPORT_H, right: VIEWPORT_W, bottom: VIEWPORT_H });
        el.setPointerCapture = () => {};
        el.releasePointerCapture = () => {};
        return el;
    }

    function pointer(type, x, y) {
        return new PointerEvent(type, {
            clientX: x, clientY: y, button: 0, pointerId: 1,
            pointerType: 'mouse', isPrimary: true, bubbles: true, cancelable: true
        });
    }

    function fixture() {
        const el = makeCanvas();
        // A 20 m cube on z = 0, so the Z axis through the origin is its vertical centre axis.
        const center = new THREE.Vector3(0, 0, 10);
        const camera = new THREE.PerspectiveCamera(50, VIEWPORT_W / VIEWPORT_H, 0.02, 20000);
        camera.up.set(0, 0, 1);
        const controls = createNavControls({ THREE, OrbitControls }, camera, el);
        camera.position.set(24, -24, 28);
        controls.target.copy(center);
        applySceneMetrics(controls, 20);
        controls.update();
        // Azimuth in the horizontal plane, measured the way a viewer sees it.
        const azimuth = () => {
            const off = camera.position.clone().sub(center);
            return THREE.MathUtils.radToDeg(Math.atan2(off.y, off.x));
        };
        const drag = dx => {
            el.dispatchEvent(pointer('pointerdown', VIEWPORT_W / 2, VIEWPORT_H / 2));
            for (let i = 1; i <= 5; i++) {
                el.dispatchEvent(pointer('pointermove', VIEWPORT_W / 2 + (dx * i) / 5, VIEWPORT_H / 2));
            }
            el.dispatchEvent(pointer('pointerup', VIEWPORT_W / 2 + dx, VIEWPORT_H / 2));
            for (let i = 0; i < 40; i++) controls.update(); // let damping settle
        };
        return { el, camera, controls, center, azimuth, drag };
    }

    it('rotates about the pivot on an axis-parallel drag without moving the pivot', () => {
        const { camera, controls, center, azimuth, drag } = fixture();
        const startAz = azimuth();
        const startDist = camera.position.distanceTo(center);
        const startHeight = camera.position.z;

        drag(160);

        // The pivot is the rotation axis: it must not budge.
        expect(controls.target.distanceTo(center)).toBeLessThan(1e-9);
        // A pure turntable: same radius and same height above the ground plane.
        expect(camera.position.distanceTo(center)).toBeCloseTo(startDist, 6);
        expect(camera.position.z).toBeCloseTo(startHeight, 6);
        // And it must turn by exactly the pointer travel over the viewport height.
        expect(azimuth() - startAz).toBeCloseTo(-360 * 160 / VIEWPORT_H, 1);
    });

    it('keeps the pivot on the model axis across wheel zooms (no zoom-to-cursor drift)', () => {
        const { el, camera, controls, center, azimuth } = fixture();

        for (let i = 0; i < 3; i++) {
            el.dispatchEvent(new WheelEvent('wheel', {
                clientX: VIEWPORT_W * 0.3, clientY: VIEWPORT_H * 0.6,
                deltaY: -100, deltaMode: 0, bubbles: true, cancelable: true
            }));
            controls.update();
        }

        expect(controls.target.distanceTo(center)).toBeLessThan(1e-9);
        expect(camera.position.distanceTo(center)).toBeLessThan(38.42);
        // Zooming must not rotate the view either, and every component of the camera must stay
        // finite (the zoom-to-cursor path could produce NaN positions for a near-horizontal ray).
        expect(azimuth()).toBeCloseTo(-45, 6);
        expect(camera.position.toArray().every(Number.isFinite)).toBe(true);
    });
});

// ---- scene distance limits ----

describe('applySceneMetrics', () => {
    it('derives min/max distance from the framed scene size', () => {
        const c = {};
        applySceneMetrics(c, 200);
        expect(c.minDistance).toBeCloseTo(200 * NAV.minDistanceFactor);
        expect(c.maxDistance).toBeCloseTo(200 * NAV.maxDistanceFactor);
    });

    it('falls back to unit size when the scene size is unknown', () => {
        const c = {};
        applySceneMetrics(c, 0);
        expect(c.minDistance).toBeCloseTo(NAV.minDistanceFactor);
    });

    it('lets globe scenes keep a far looser distance ceiling', () => {
        const c = {};
        applySceneMetrics(c, 300, NAV.globeMaxDistanceFactor);
        expect(c.minDistance).toBeCloseTo(300 * NAV.minDistanceFactor);
        // Zooming out to continent scale must stay possible, so the ceiling is orders of
        // magnitude above the flat-scene one.
        expect(c.maxDistance).toBeCloseTo(300 * NAV.globeMaxDistanceFactor);
        expect(c.maxDistance).toBeGreaterThan(300 * NAV.maxDistanceFactor * 10);
    });
});

// ---- double-click recenter ----

describe('createDoubleClickRecenter', () => {
    function makeInstance(pickResults) {
        const el = document.createElement('div');
        const listeners = {};
        return {
            domElement: el,
            pickObjectsAt: vi.fn(() => pickResults),
            addEventListener: (n, f) => { (listeners[n] = listeners[n] || []).push(f); },
            removeEventListener: (n, f) => { listeners[n] = (listeners[n] || []).filter(x => x !== f); },
            __fire(n, ev) { (listeners[n] || []).forEach(f => f(ev)); },
            __count(n) { return (listeners[n] || []).length; }
        };
    }

    // A pick miss falls back to intersecting the view ray with the plane through the pivot
    // perpendicular to camera.up. fov 90 / aspect 1 makes the corner ray exactly (1,-1,-1)/sqrt3,
    // and the element rect must be stubbed because a detached div has a zero-sized bounding rect.
    function makeGroundFixture(up) {
        const instance = makeInstance([]);
        const el = instance.domElement;
        el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 });
        const camera = new THREE.PerspectiveCamera(90, 1, 0.1, 2000);
        camera.up.copy(up);
        camera.position.set(-5, 0, 10);
        camera.updateMatrixWorld();
        const controls = { target: new THREE.Vector3(0, 0, 4) };
        const onFly = vi.fn();
        createDoubleClickRecenter({ THREE }, instance, camera, controls, () => true, onFly);
        // Bottom-right pixel -> NDC (1, -1).
        instance.domElement.dispatchEvent(
            new MouseEvent('dblclick', { clientX: 800, clientY: 600, bubbles: true }));
        expect(onFly).toHaveBeenCalledTimes(1);
        return onFly.mock.calls[0][0];
    }

    it('flights to the surface point picked by Giro3D', () => {
        const picked = new THREE.Vector3(1.5, -2.5, 30);
        const instance = makeInstance([{ point: picked }]);
        const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2000);
        const controls = { target: new THREE.Vector3() };
        const onFly = vi.fn();

        const dispose = createDoubleClickRecenter(
            { THREE }, instance, camera, controls, () => true, onFly);

        instance.domElement.dispatchEvent(
            new MouseEvent('dblclick', { clientX: 100, clientY: 100, bubbles: true }));

        expect(instance.pickObjectsAt).toHaveBeenCalledTimes(1);
        const usedOpts = instance.pickObjectsAt.mock.calls[0][1];
        expect(usedOpts.sortByDistance).toBe(true);
        expect(usedOpts.limit).toBe(1);
        expect(onFly).toHaveBeenCalledTimes(1);
        expect(onFly.mock.calls[0][0].distanceTo(picked)).toBe(0);
        // The flown-to point is a clone, not the pick result itself
        expect(onFly.mock.calls[0][0]).not.toBe(picked);

        dispose();
        expect(instance.__count('dblclick')).toBe(0);
    });

    it('falls back to the ground plane at the pivot height when Z is up', () => {
        const point = makeGroundFixture(new THREE.Vector3(0, 0, 1));
        expect(point.distanceTo(new THREE.Vector3(1, -6, 4))).toBeLessThan(1e-9);
    });

    it('follows camera.up in a globe (ECEF) scene instead of assuming world Z', () => {
        // Same camera and pixel, only up changes to +X: the fallback must land on the
        // x = target.x plane, i.e. (0,-5,5). A hardcoded world-Z plane would have returned
        // the same (1,-6,4) as the Z-up case above, making the two results identical.
        const point = makeGroundFixture(new THREE.Vector3(1, 0, 0));
        expect(point.distanceTo(new THREE.Vector3(0, -5, 5))).toBeLessThan(1e-9);
        expect(point.clone().sub(new THREE.Vector3(0, 0, 4)).dot(new THREE.Vector3(1, 0, 0))).toBeCloseTo(0);
    });

    it('is suppressed while shouldHandle returns false (measure tool armed)', () => {
        const instance = makeInstance([{ point: new THREE.Vector3() }]);
        const onFly = vi.fn();
        createDoubleClickRecenter({ THREE }, instance, new THREE.PerspectiveCamera(), { target: new THREE.Vector3() }, () => false, onFly);

        instance.domElement.dispatchEvent(
            new MouseEvent('dblclick', { clientX: 5, clientY: 5, bubbles: true }));

        expect(instance.pickObjectsAt).not.toHaveBeenCalled();
        expect(onFly).not.toHaveBeenCalled();
    });
});

// ---- camera tweener ----

describe('createCameraTweener', () => {
    function makeTweenerHarness() {
        const frames = [];
        vi.stubGlobal('requestAnimationFrame', cb => {
            frames.push(cb);
            return frames.length;
        });
        vi.stubGlobal('cancelAnimationFrame', id => {
            frames[id - 1] = null;
        });
        const camera = { position: new THREE.Vector3(0, 0, 10) };
        const controls = { target: new THREE.Vector3(0, 0, 0), update: vi.fn() };
        return { frames, camera, controls };
    }

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('ends at the requested position and target, calling onDone', () => {
        const { frames, camera, controls } = makeTweenerHarness();
        const tweener = createCameraTweener();
        const onDone = vi.fn();

        const start = performance.now();
        tweener.tweenTo(camera, controls, new THREE.Vector3(0, 0, 100), new THREE.Vector3(5, 5, 0), 500, onDone);

        // drive one mid-frame, then a final frame past the duration (t clamps to 1)
        frames[0](start + 250);
        expect(camera.position.z).toBeGreaterThan(0);
        expect(camera.position.z).toBeLessThan(100);
        frames[1](start + 600);

        expect(camera.position.distanceTo(new THREE.Vector3(0, 0, 100))).toBeLessThan(1e-6);
        expect(controls.target.distanceTo(new THREE.Vector3(5, 5, 0))).toBeLessThan(1e-6);
        expect(onDone).toHaveBeenCalledTimes(1);
        expect(controls.update).toHaveBeenCalled();
        expect(frames.length).toBe(2);
    });

    it('retargets: a second tweenTo cancels the first mid-flight', () => {
        const { frames, camera, controls } = makeTweenerHarness();
        const tweener = createCameraTweener();
        const done1 = vi.fn();
        const done2 = vi.fn();

        const start = performance.now();
        tweener.tweenTo(camera, controls, new THREE.Vector3(100, 0, 0), new THREE.Vector3(), 500, done1);
        frames[0](start + 100); // partial progress
        tweener.tweenTo(camera, controls, new THREE.Vector3(0, 0, 50), new THREE.Vector3(), 500, done2);

        // first tween's remaining frames were cancelled; drive to the end of the second
        for (let i = 1; i < frames.length && Date.now(); i++) {
            if (frames[i]) frames[i](performance.now() + 600);
        }

        expect(done1).not.toHaveBeenCalled();
        expect(done2).toHaveBeenCalledTimes(1);
        expect(camera.position.distanceTo(new THREE.Vector3(0, 0, 50))).toBeLessThan(1e-6);
    });

    it('stop() halts the tween and leaves the camera mid-flight', () => {
        const { frames, camera, controls } = makeTweenerHarness();
        const tweener = createCameraTweener();
        const onDone = vi.fn();

        const start = performance.now();
        tweener.tweenTo(camera, controls, new THREE.Vector3(0, 0, 100), new THREE.Vector3(), 500, onDone);
        frames[0](start + 100);
        const midZ = camera.position.z;
        tweener.stop();
        expect(midZ).toBeGreaterThan(0);
        expect(midZ).toBeLessThan(100);
        expect(onDone).not.toHaveBeenCalled();
        // the cancelled frame no longer runs
        expect(() => { if (frames[1]) frames[1](start + 400); }).not.toThrow();
    });
});
