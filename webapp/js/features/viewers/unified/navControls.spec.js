/**
 * navControls - unit tests for the unified viewer navigation module.
 *
 * Covers the pure logic (wheel normalization, scene distance metrics), the one control of every
 * scene (the real ArcballControls of the bm3d viewer: rotation, pan, the upright aim, the orbit
 * Home flight, the focus of a double-click), the double-click pick (surface pick and the
 * up-vector-aware ground-plane fallback) and the camera tweener (easing endpoint, retarget,
 * stop), the flights of the scene with both strategies (D-019) and the strategy each loader picks
 * (D-001; the constrained orbit itself: constrainedOrbit.spec). three.js is the real thing; Giro3D
 * is stubbed.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { ArcballControls } from 'three/examples/jsm/controls/ArcballControls.js';
import {
    NAV,
    createNavControls,
    navPivot,
    orbitTweenStep,
    stopNavAnimation,
    focusPosition,
    screenUp,
    wheelNotches,
    applySceneMetrics,
    createDoubleClickRecenter,
    createCameraTweener,
    easeInOutCubic,
    groundPlaneHit,
    FreeTrackball
} from './navControls';
import { ConstrainedOrbit } from './constrainedOrbit';
import { UnifiedScene } from './unifiedScene';
import { LOADERS } from './loaders';
import ddb from 'ddb';

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

    it('tells onStep the eased progress, so a caller can move more than the position and target', () => {
        const { frames, camera, controls } = makeTweenerHarness();
        const tweener = createCameraTweener();
        const onStep = vi.fn();

        const start = 1000;
        vi.spyOn(performance, 'now').mockReturnValue(start);
        tweener.tweenTo(camera, controls, new THREE.Vector3(0, 0, 100), new THREE.Vector3(), 400, undefined, onStep);
        frames[0](start + 100);
        expect(onStep).toHaveBeenLastCalledWith(easeInOutCubic(0.25));
        frames[1](start + 500);
        expect(onStep).toHaveBeenLastCalledWith(1);
        vi.restoreAllMocks();
    });

    it('runs the optional onFrame hook after every step (a Giro3D scene renders on demand)', () => {
        const { frames, camera, controls } = makeTweenerHarness();
        const onFrame = vi.fn(() => {
            // After the step: the camera has moved already
            expect(controls.update).toHaveBeenCalledTimes(onFrame.mock.calls.length);
        });
        const tweener = createCameraTweener({ onFrame });

        const start = 1000;
        vi.spyOn(performance, 'now').mockReturnValue(start);
        tweener.tweenTo(camera, controls, new THREE.Vector3(0, 0, 100), new THREE.Vector3(), 400);
        frames[0](start + 100);
        expect(onFrame).toHaveBeenCalledTimes(1);
        expect(onFrame).toHaveBeenLastCalledWith(easeInOutCubic(0.25));
        frames[1](start + 200);
        frames[2](start + 500);
        expect(onFrame).toHaveBeenCalledTimes(3);
        expect(onFrame).toHaveBeenLastCalledWith(1);
        vi.restoreAllMocks();
    });

    it('moves a navigation strategy through setPose, only the last step saved', () => {
        const { frames, camera } = makeTweenerHarness();
        const controls = {
            target: new THREE.Vector3(),
            update: vi.fn(),
            setPose: vi.fn(({ position, target }, { save }) => ({ position: position.clone(), target: target.clone(), save }))
        };
        const tweener = createCameraTweener();

        const start = 1000;
        vi.spyOn(performance, 'now').mockReturnValue(start);
        tweener.tweenTo(camera, controls, new THREE.Vector3(0, 0, 100), new THREE.Vector3(5, 0, 0), 400);
        frames[0](start + 100);
        frames[1](start + 500);
        expect(controls.update).not.toHaveBeenCalled();
        const poses = controls.setPose.mock.results.map(r => r.value);
        expect(poses.map(p => p.save)).toEqual([false, true]);
        expect(poses[1].position.distanceTo(new THREE.Vector3(0, 0, 100))).toBeLessThan(1e-9);
        expect(poses[1].target.distanceTo(new THREE.Vector3(5, 0, 0))).toBeLessThan(1e-9);
        vi.restoreAllMocks();
    });
});

// ---- easing ----

describe('easeInOutCubic', () => {
    it('starts at 0, ends at 1 and passes the middle at one half', () => {
        expect(easeInOutCubic(0)).toBe(0);
        expect(easeInOutCubic(1)).toBe(1);
        expect(easeInOutCubic(0.5)).toBe(0.5);
    });

    it('eases in slowly and out slowly, never going backwards', () => {
        expect(easeInOutCubic(0.25)).toBeCloseTo(0.0625);
        expect(easeInOutCubic(0.75)).toBeCloseTo(0.9375);
        let last = 0;
        for (let t = 0; t <= 1; t += 0.05) {
            const e = easeInOutCubic(t);
            expect(e).toBeGreaterThanOrEqual(last);
            last = e;
        }
    });
});

// ---- ground plane under a pointer ----

describe('groundPlaneHit', () => {
    function fixture(up) {
        const domElement = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) };
        const camera = new THREE.PerspectiveCamera(90, 1, 0.1, 2000);
        camera.up.copy(up);
        camera.position.set(-5, 0, 10);
        camera.updateMatrixWorld();
        return { domElement, camera, controls: { target: new THREE.Vector3(0, 0, 4) } };
    }

    it('meets the plane through the pivot perpendicular to camera.up', () => {
        const { domElement, camera, controls } = fixture(new THREE.Vector3(0, 0, 1));
        const hit = groundPlaneHit(THREE, { domElement }, camera, controls, { clientX: 800, clientY: 600 });
        expect(hit.distanceTo(new THREE.Vector3(1, -6, 4))).toBeLessThan(1e-9);
    });

    it('is null for a pointer whose ray points away from the plane, and for an element with no size', () => {
        const { domElement, camera, controls } = fixture(new THREE.Vector3(0, 0, 1));
        // Looking up from above the plane: the ray through the top of the view never reaches it
        camera.position.set(0, 0, 10);
        camera.lookAt(0, 10, 12);
        camera.updateMatrixWorld();
        expect(groundPlaneHit(THREE, { domElement }, camera, controls, { clientX: 400, clientY: 0 })).toBeNull();
        const hidden = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }) };
        expect(groundPlaneHit(THREE, { domElement: hidden }, camera, controls, { clientX: 1, clientY: 1 })).toBeNull();
    });
});

// ---- the navigation of every scene (the bm3d viewer's ArcballControls) ----

describe('navigation (real ArcballControls)', () => {
    const W = 600;
    const H = 800;
    const Z_UP = new THREE.Vector3(0, 0, 1);

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    function makeCanvas() {
        const el = document.createElement('canvas');
        Object.defineProperty(el, 'clientWidth', { value: W });
        Object.defineProperty(el, 'clientHeight', { value: H });
        el.getBoundingClientRect = () => ({ left: 0, top: 0, width: W, height: H, right: W, bottom: H, x: 0, y: 0 });
        return el;
    }

    // The scene of a flat Giro3D instance: Z up, a model whose centre is (0, 0, 10)
    function fixture() {
        // The inertia after a drag runs on animation frames: none here
        vi.stubGlobal('requestAnimationFrame', () => 1);
        vi.stubGlobal('cancelAnimationFrame', () => {});
        const el = makeCanvas();
        const camera = new THREE.PerspectiveCamera(50, W / H, 0.02, 20000);
        camera.up.copy(Z_UP);
        const scene = new THREE.Scene();
        const controls = createNavControls({ ArcballControls }, camera, el, scene);
        camera.position.set(24, -24, 28);
        controls.target.set(0, 0, 10);
        applySceneMetrics(controls, 20);
        controls.setPose({ position: camera.position, target: controls.target, up: Z_UP }, { save: true });
        // A frame is rendered before the user touches the view (the matrices of the scene)
        scene.updateMatrixWorld();
        return { el, camera, controls };
    }

    const forward = camera => new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const right = camera => new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);

    function pointer(type, x, y, button = 0) {
        return new PointerEvent(type, {
            clientX: x, clientY: y, button, buttons: 1 << button, pointerId: 1,
            pointerType: 'mouse', isPrimary: true, bubbles: true, cancelable: true
        });
    }

    function drag(el, dx, dy, button = 0) {
        el.dispatchEvent(pointer('pointerdown', W / 2, H / 2, button));
        for (let i = 1; i <= 5; i++) window.dispatchEvent(pointer('pointermove', W / 2 + (dx * i) / 5, H / 2 + (dy * i) / 5, button));
        window.dispatchEvent(pointer('pointerup', W / 2 + dx, H / 2 + dy, button));
    }

    it('are the ArcballControls of the bm3d viewer, gizmos hidden, and keep the scene up of the camera', () => {
        const { camera, controls } = fixture();
        expect(controls).toBeInstanceOf(FreeTrackball);
        expect(controls.arcball).toBeInstanceOf(ArcballControls);
        expect(controls.arcball._gizmos.visible).toBe(false);
        // The bm3d viewer's defaults: inertia, wheel zoom to the pivot by 1.1 a notch
        expect(controls.arcball.enableAnimations).toBe(true);
        expect(controls.arcball.cursorZoom).toBe(false);
        expect(controls.scaleFactor).toBe(1.1);
        // The double-click focus is the viewer's (Giro3D picks points and map tiles too)
        expect(controls.arcball.enableFocus).toBe(false);
        expect(camera.up.dot(Z_UP)).toBeGreaterThan(0);
        controls.dispose();
    });

    it('aims an upright camera at the target (no roll) and keeps camera.up the up of the screen', () => {
        const { camera, controls } = fixture();
        const toTarget = controls.target.clone().sub(camera.position).normalize();
        expect(forward(camera).distanceTo(toTarget)).toBeLessThan(1e-9);
        // The screen's horizontal stays level, the screen's up points up
        expect(right(camera).z).toBeCloseTo(0, 9);
        expect(camera.up.z).toBeGreaterThan(0);
        expect(camera.up.distanceTo(screenUp(camera.quaternion, new THREE.Vector3()))).toBeLessThan(1e-9);
        expect(navPivot(controls).distanceTo(controls.target)).toBeLessThan(1e-9);
        controls.dispose();
    });

    it('rotates freely around the pivot on a left drag, and later updates leave that view alone', () => {
        const { el, camera, controls } = fixture();
        const pivot = controls.target.clone();
        const distance = camera.position.distanceTo(pivot);
        const before = camera.quaternion.clone();

        drag(el, 120, 80);

        expect(camera.quaternion.angleTo(before)).toBeGreaterThan(0.1);
        expect(camera.position.distanceTo(pivot)).toBeCloseTo(distance, 6);
        // camera.up is the screen's up after a rotation: Giro3D's update() of every frame (a
        // lookAt) keeps the view instead of spinning it
        expect(camera.up.distanceTo(screenUp(camera.quaternion, new THREE.Vector3()))).toBeLessThan(1e-6);
        const rotated = camera.quaternion.clone();
        for (let i = 0; i < 10; i++) controls.update();
        expect(camera.quaternion.angleTo(rotated)).toBeLessThan(1e-6);
        controls.dispose();
    });

    it('pans in the screen plane on a right drag, the pivot with it', () => {
        const { el, camera, controls } = fixture();
        const pivot = navPivot(controls).clone();
        const before = camera.quaternion.clone();

        drag(el, 100, 0, 2);

        expect(camera.quaternion.angleTo(before)).toBeLessThan(1e-9);
        const moved = navPivot(controls).clone().sub(pivot);
        expect(moved.length()).toBeGreaterThan(0.1);
        // Along the screen's horizontal, not along the ground or the view direction
        expect(Math.abs(moved.clone().normalize().dot(right(camera)))).toBeCloseTo(1, 6);
        controls.dispose();
    });

    it('turns the camera home around the pivot, never through the model, and ends upright', () => {
        const { el, camera, controls } = fixture();
        const home = { quaternion: camera.quaternion.clone(), distance: camera.position.distanceTo(controls.target) };
        // From the other side of the model, rolled and closer
        drag(el, 300, 250);
        camera.position.sub(controls.target).multiplyScalar(0.5).add(controls.target);
        const target = controls.target.clone();
        const from = camera.position.distanceTo(target);

        const step = orbitTweenStep(THREE, camera, controls, home.quaternion, home.distance);
        for (let i = 0; i <= 20; i++) {
            const e = i / 20;
            step(e);
            const d = camera.position.distanceTo(target);
            expect(d).toBeGreaterThanOrEqual(Math.min(from, home.distance) - 1e-9);
            expect(d).toBeLessThanOrEqual(Math.max(from, home.distance) + 1e-9);
            controls.update();
        }
        expect(camera.quaternion.angleTo(home.quaternion)).toBeLessThan(1e-6);
        expect(camera.position.distanceTo(target)).toBeCloseTo(home.distance, 6);
        expect(right(camera).z).toBeCloseTo(0, 6);
        controls.dispose();
    });

    it('stops the inertia of the controls', () => {
        const cancel = vi.fn();
        vi.stubGlobal('cancelAnimationFrame', cancel);
        const controls = { _animationId: 7, _timeStart: 1234 };
        stopNavAnimation(controls);
        expect(cancel).toHaveBeenCalledWith(7);
        expect(controls).toEqual({ _animationId: -1, _timeStart: -1 });
        stopNavAnimation(controls);
        expect(cancel).toHaveBeenCalledTimes(1);
    });

    it('focuses like ArcballControls: the view direction kept, a wheel notch closer, the point in the middle', () => {
        const { camera, controls } = fixture();
        const point = new THREE.Vector3(5, 3, 2);
        const dir = forward(camera);
        const distance = camera.position.distanceTo(navPivot(controls));

        const position = focusPosition(camera, controls, point);

        expect(position.distanceTo(point)).toBeCloseTo(distance / 1.1, 9);
        expect(point.clone().sub(position).normalize().distanceTo(dir)).toBeLessThan(1e-9);
        // Never closer than the minimum distance
        camera.position.copy(navPivot(controls)).addScaledVector(dir, -controls.minDistance * 1.05);
        expect(focusPosition(camera, controls, point).distanceTo(point)).toBeCloseTo(controls.minDistance, 9);
        controls.dispose();
    });

    it('aims a camera straight down with the given direction at the top of the screen (the globe, north up)', () => {
        const { camera, controls } = fixture();
        const north = new THREE.Vector3(0, 1, 0);
        camera.position.copy(controls.target).add(new THREE.Vector3(0, 0, 50));
        controls.setPose({ position: camera.position, target: controls.target, up: north }, { save: true });
        expect(forward(camera).distanceTo(new THREE.Vector3(0, 0, -1))).toBeLessThan(1e-9);
        expect(camera.up.distanceTo(north)).toBeLessThan(1e-9);
        expect(right(camera).distanceTo(new THREE.Vector3(1, 0, 0))).toBeLessThan(1e-9);
        // The controls' update of every frame keeps that view
        const q = camera.quaternion.clone();
        for (let i = 0; i < 5; i++) controls.update();
        expect(camera.quaternion.angleTo(q)).toBeLessThan(1e-9);
        controls.dispose();
    });

    it('is a navigation strategy: the interface and the members Giro3D and the viewer use', () => {
        const { controls } = fixture();
        for (const name of ['orbit', 'pan', 'zoomAt', 'setFov', 'setPose', 'saveState', 'dispose', 'update',
            'pivot', 'stopAnimation', 'addEventListener', 'removeEventListener', 'dispatchEvent']) {
            expect(typeof controls[name], name).toBe('function');
        }
        expect(controls.target).toBeInstanceOf(THREE.Vector3);
        expect(controls.kind).toBe('free');
        controls.enabled = false;
        expect(controls.arcball.enabled).toBe(false);
        expect(controls.enabled).toBe(false);
        controls.enabled = true;
        applySceneMetrics(controls, 50);
        expect(controls.arcball.minDistance).toBeCloseTo(50 * NAV.minDistanceFactor);
        expect(controls.arcball.maxDistance).toBeCloseTo(50 * NAV.maxDistanceFactor);
        // An option picks the strategy (D-019): the free trackball by default
        const make = strategy => createNavControls({ THREE, ArcballControls }, new THREE.PerspectiveCamera(), makeCanvas(), new THREE.Scene(),
            { strategy, getUp: () => Z_UP });
        const strategies = [make('free'), make('constrained'), make(undefined)];
        expect(strategies[0]).toBeInstanceOf(FreeTrackball);
        expect(strategies[1]).toBeInstanceOf(ConstrainedOrbit);
        expect(strategies[2]).toBeInstanceOf(FreeTrackball);
        strategies.forEach(s => s.dispose());
        controls.dispose();
    });

    it('saves the pose setPose gives with save: the state the next gesture starts from', () => {
        const { camera, controls } = fixture();
        const target = new THREE.Vector3(3, -2, 6);
        controls.setPose({ position: new THREE.Vector3(-20, -30, 25), target, up: Z_UP }, { save: true });
        const pose = new THREE.Matrix4().compose(camera.position, camera.quaternion, camera.scale);
        const saved = controls.arcball._cameraMatrixState;
        saved.elements.forEach((v, i) => expect(v).toBeCloseTo(pose.elements[i], 9));
        expect(new THREE.Vector3().setFromMatrixPosition(controls.arcball._gizmoMatrixState).distanceTo(target)).toBeLessThan(1e-9);
        expect(navPivot(controls).distanceTo(target)).toBeLessThan(1e-9);
        expect(forward(camera).distanceTo(target.clone().sub(camera.position).normalize())).toBeLessThan(1e-9);
        expect(right(camera).z).toBeCloseTo(0, 9);
        controls.dispose();
    });

    it('fires only change from the interface, never start or end (they are the input\'s)', () => {
        const { camera, controls } = fixture();
        const events = [];
        const log = e => events.push(e.type);
        // lifetime: paired (removed below)
        ['start', 'change', 'end'].forEach(type => controls.addEventListener(type, log));
        controls.setPose({ position: new THREE.Vector3(30, 0, 20) });
        controls.orbit(0.3, 0.1);
        controls.pan(0.1, 0.05);
        controls.zoomAt(undefined, 1.1);
        controls.setFov(40);
        expect(events.length).toBe(5);
        expect(events.every(type => type === 'change')).toBe(true);
        expect(camera.fov).toBe(40);
        ['start', 'change', 'end'].forEach(type => controls.removeEventListener(type, log));
        controls.dispose();
    });

    it('orbits around the pivot, pans with it in the screen plane, zooms toward a point and clamps the field of view', () => {
        const { camera, controls } = fixture();
        const pivot = navPivot(controls).clone();
        const distance = camera.position.distanceTo(pivot);
        const before = camera.quaternion.clone();

        controls.orbit(0.4, 0.2);
        expect(camera.quaternion.angleTo(before)).toBeGreaterThan(0.1);
        expect(camera.position.distanceTo(pivot)).toBeCloseTo(distance, 9);
        expect(navPivot(controls).distanceTo(pivot)).toBeLessThan(1e-9);
        expect(camera.up.distanceTo(screenUp(camera.quaternion, new THREE.Vector3()))).toBeLessThan(1e-9);

        const turned = camera.quaternion.clone();
        const r = right(camera);
        controls.pan(0.25, 0);
        const moved = navPivot(controls).clone().sub(pivot);
        expect(camera.quaternion.angleTo(turned)).toBeLessThan(1e-9);
        expect(moved.clone().normalize().dot(r)).toBeCloseTo(1, 9);

        const p = navPivot(controls).clone();
        controls.zoomAt(p, 1.1);
        expect(camera.position.distanceTo(p)).toBeCloseTo(distance / 1.1, 9);
        // Toward an off-pivot point: the point stays put on the screen, the pivot comes closer
        const point = p.clone().add(r.clone().multiplyScalar(2));
        const toPoint = point.clone().sub(camera.position).normalize();
        controls.zoomAt(point, 1.1);
        expect(point.clone().sub(camera.position).normalize().distanceTo(toPoint)).toBeLessThan(1e-9);
        // Never nearer than the minimum distance
        controls.zoomAt(undefined, 1e6);
        expect(camera.position.distanceTo(navPivot(controls))).toBeCloseTo(controls.minDistance, 9);

        controls.setFov(1);
        expect(camera.fov).toBe(controls.arcball.minFov);
        controls.dispose();
    });

    // A plain event with the wheel's fields: happy-dom's WheelEvent drops clientX and shiftKey
    function wheel(el, deltaY, fields = {}) {
        const e = Object.assign(new Event('wheel', { bubbles: true, cancelable: true }),
            { deltaY, deltaX: 0, deltaMode: 0, clientX: W / 4, clientY: H / 4, shiftKey: false, ...fields });
        el.dispatchEvent(e);
        return e;
    }

    it('zooms to the pivot on a wheel notch, and the next left-drag turns from the zoomed pose (no snap back)', () => {
        const { el, camera, controls } = fixture();
        const pivot = navPivot(controls).clone();
        const distance = camera.position.distanceTo(pivot);
        const change = vi.fn();
        // lifetime: paired (removed below)
        controls.addEventListener('change', change);
        // Off the middle: the zoom is to the pivot all the same (FR-XC-18; cursor zoom is not this one's)
        const notch = wheel(el, -100);
        expect(notch.defaultPrevented).toBe(true);
        expect(change).toHaveBeenCalled();
        expect(camera.position.distanceTo(pivot)).toBeCloseTo(distance / 1.1, 9);
        expect(navPivot(controls).distanceTo(pivot)).toBeLessThan(1e-9);
        const before = camera.quaternion.clone();

        drag(el, 120, 80);

        expect(camera.quaternion.angleTo(before)).toBeGreaterThan(0.1);
        expect(camera.position.distanceTo(pivot)).toBeCloseTo(distance / 1.1, 6);
        controls.removeEventListener('change', change);
        controls.dispose();
    });

    it('keeps the wheel zoom within minDistance and maxDistance', () => {
        const { el, camera, controls } = fixture();
        for (let i = 0; i < 200; i++) wheel(el, 100);
        expect(camera.position.distanceTo(navPivot(controls))).toBeCloseTo(controls.maxDistance, 6);
        for (let i = 0; i < 400; i++) wheel(el, -100);
        expect(camera.position.distanceTo(navPivot(controls))).toBeCloseTo(controls.minDistance, 6);
        controls.dispose();
    });

    it('changes the field of view on Shift+wheel by the step of ArcballControls, within minFov and maxFov, without moving', () => {
        const { el, camera, controls } = fixture();
        const position = camera.position.clone();
        const fov = camera.fov;
        wheel(el, 100, { shiftKey: true });
        expect(Math.tan(camera.fov * Math.PI / 360)).toBeCloseTo(Math.tan(fov * Math.PI / 360) * 1.1, 9);
        // A browser that turns Shift+wheel into a horizontal scroll
        wheel(el, 0, { shiftKey: true, deltaX: -100 });
        expect(camera.fov).toBeCloseTo(fov, 9);
        expect(camera.position.distanceTo(position)).toBeLessThan(1e-9);
        for (let i = 0; i < 100; i++) wheel(el, 100, { shiftKey: true });
        expect(camera.fov).toBe(controls.arcball.maxFov);
        for (let i = 0; i < 100; i++) wheel(el, -100, { shiftKey: true });
        expect(camera.fov).toBe(controls.arcball.minFov);
        controls.dispose();
    });

    it('fires start and end for a wheel notch, ignores the wheel while disabled and once disposed', () => {
        const { el, camera, controls } = fixture();
        const events = [];
        const log = e => events.push(e.type);
        // lifetime: paired (removed below)
        ['start', 'end'].forEach(type => controls.addEventListener(type, log));
        wheel(el, -100);
        expect(events).toEqual(['start', 'end']);
        controls.enabled = false;
        const position = camera.position.clone();
        const ignored = wheel(el, -100);
        expect(ignored.defaultPrevented).toBe(false);
        expect(camera.position.distanceTo(position)).toBe(0);
        expect(events).toEqual(['start', 'end']);
        ['start', 'end'].forEach(type => controls.removeEventListener(type, log));
        controls.enabled = true;
        controls.dispose();
        const after = wheel(el, -100);
        expect(after.defaultPrevented).toBe(false);
        expect(camera.position.distanceTo(position)).toBe(0);
    });

    it('keeps a wheel notch in the middle of a left-drag: the drag goes on from the zoomed pose (no snap back)', () => {
        const { el, camera, controls } = fixture();
        const pivot = navPivot(controls).clone();
        const distance = camera.position.distanceTo(pivot);
        el.dispatchEvent(pointer('pointerdown', W / 2, H / 2));
        window.dispatchEvent(pointer('pointermove', W / 2 + 30, H / 2 + 20));
        const turned = camera.quaternion.clone();
        wheel(el, -100);
        expect(camera.position.distanceTo(pivot)).toBeCloseTo(distance / 1.1, 9);
        // The drag starts again where the pointer is: the turn it made before the notch is not
        // applied a second time on top of the zoomed pose
        window.dispatchEvent(pointer('pointermove', W / 2 + 60, H / 2 + 40));
        expect(camera.quaternion.angleTo(turned)).toBeLessThan(1e-6);
        window.dispatchEvent(pointer('pointermove', W / 2 + 90, H / 2 + 60));
        window.dispatchEvent(pointer('pointerup', W / 2 + 90, H / 2 + 60));
        expect(camera.quaternion.angleTo(turned)).toBeGreaterThan(0.05);
        expect(camera.position.distanceTo(pivot)).toBeCloseTo(distance / 1.1, 6);
        controls.dispose();
    });

    it('stops the inertia of a drag on a wheel notch: it does not turn the camera back to the pose before the zoom', () => {
        const { el, camera, controls } = fixture();
        const frames = [];
        vi.stubGlobal('requestAnimationFrame', cb => { frames.push(cb); return frames.length; });
        const cancel = vi.fn();
        vi.stubGlobal('cancelAnimationFrame', cancel);
        // A fast drag: the moves 5 ms apart, released while moving
        let now = 1000;
        vi.spyOn(performance, 'now').mockImplementation(() => now);
        const pivot = navPivot(controls).clone();
        const distance = camera.position.distanceTo(pivot);
        el.dispatchEvent(pointer('pointerdown', W / 2, H / 2));
        for (let i = 1; i <= 5; i++) {
            now += 5;
            window.dispatchEvent(pointer('pointermove', W / 2 + 20 * i, H / 2));
        }
        window.dispatchEvent(pointer('pointerup', W / 2 + 100, H / 2));
        expect(frames.length).toBeGreaterThan(0);
        const id = controls.arcball._animationId;
        expect(id).not.toBe(-1);

        wheel(el, -100);

        expect(cancel).toHaveBeenCalledWith(id);
        expect(controls.arcball._animationId).toBe(-1);
        const zoomed = camera.position.clone();
        expect(zoomed.distanceTo(pivot)).toBeCloseTo(distance / 1.1, 9);
        // A frame the browser had already queued runs: the camera stays where the zoom put it
        now += 16;
        frames[frames.length - 1](now);
        expect(camera.position.distanceTo(zoomed)).toBeLessThan(1e-9);
        vi.restoreAllMocks();
        controls.dispose();
    });

    it('dispatches change from update() only when it moved the camera (Giro3D would render forever)', () => {
        const { camera, controls } = fixture();
        const change = vi.fn();
        controls.update();
        // lifetime: paired (removed below)
        controls.addEventListener('change', change);
        for (let i = 0; i < 5; i++) controls.update();
        expect(change).not.toHaveBeenCalled();
        // Something turned the camera away from the pivot: the update looks back at it
        camera.rotateY(0.2);
        controls.update();
        expect(change).toHaveBeenCalledTimes(1);
        controls.update();
        expect(change).toHaveBeenCalledTimes(1);
        controls.removeEventListener('change', change);
        controls.dispose();
    });
});

// ---- the flights of the scene (Home, the double-click focus) ----

// Both strategies (D-019): the free trackball (real ArcballControls) and the constrained orbit
describe.each(['free', 'constrained'])('UnifiedScene flights (%s strategy, Giro3D stubbed)', strategy => {
    const W = 600;
    const H = 800;

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    // A flat scene framed on a 20 x 20 x 20 box and rendered once. Animation frames are collected
    // and run by runFlight; there is no render in between (a render refreshes the matrices).
    function sceneFixture(pick = []) {
        const frames = [];
        vi.stubGlobal('requestAnimationFrame', cb => { frames.push(cb); return frames.length; });
        vi.stubGlobal('cancelAnimationFrame', id => { frames[id - 1] = null; });
        const el = document.createElement('canvas');
        Object.defineProperty(el, 'clientWidth', { value: W });
        Object.defineProperty(el, 'clientHeight', { value: H });
        el.getBoundingClientRect = () => ({ left: 0, top: 0, width: W, height: H, right: W, bottom: H, x: 0, y: 0 });
        const camera = new THREE.PerspectiveCamera(50, W / H, 0.02, 20000);
        camera.up.set(0, 0, 1);
        const scene3 = new THREE.Scene();
        const scene = new UnifiedScene({ THREE, ArcballControls }, el, { settings: {}, view: { activeTool: null }, notify: { info() {} } });
        scene.instance = {
            view: { camera, setControls: vi.fn() }, domElement: el, scene: scene3,
            notifyChange: vi.fn(), pickObjectsAt: vi.fn(() => pick)
        };
        scene.sceneUp = camera.up.clone();
        scene.attachControls(strategy);
        scene.frameBox(new THREE.Box3(new THREE.Vector3(-10, -10, 0), new THREE.Vector3(10, 10, 20)));
        scene3.updateMatrixWorld();
        return { scene, el, camera, frames, scene3 };
    }

    // Runs the flight in flight: a step in the middle, then the last one
    function runFlight(frames) {
        const now = performance.now();
        const pending = frames.length;
        frames[pending - 1](now + 300);
        expect(frames.length).toBe(pending + 1);
        frames[pending](now + 5000);
        expect(frames.length).toBe(pending + 1);
    }

    // A plain event with the wheel's fields: happy-dom's WheelEvent drops clientX
    function wheel(el, deltaY = 100) {
        el.dispatchEvent(Object.assign(new Event('wheel', { bubbles: true, cancelable: true }),
            { deltaY, deltaX: 0, deltaMode: 0, clientX: W / 2, clientY: H / 2, shiftKey: false }));
    }

    function pointer(type, x, y, button) {
        return new PointerEvent(type, {
            clientX: x, clientY: y, button, buttons: 1 << button, pointerId: 1,
            pointerType: 'mouse', isPrimary: true, bubbles: true, cancelable: true
        });
    }

    // A right-drag pan (no inertia): ArcballControls follow the pointer on the window, the
    // constrained orbit on the element (it captures the pointer)
    function rightDrag(el, dx, dy) {
        const moves = strategy === 'free' ? window : el;
        el.dispatchEvent(pointer('pointerdown', W / 2, H / 2, 2));
        for (let i = 1; i <= 5; i++) moves.dispatchEvent(pointer('pointermove', W / 2 + (dx * i) / 5, H / 2 + (dy * i) / 5, 2));
        moves.dispatchEvent(pointer('pointerup', W / 2 + dx, H / 2 + dy, 2));
    }

    const back = camera => new THREE.Vector3(0, 0, 1).applyQuaternion(camera.quaternion);

    it('flies Home on screen, and the next wheel notch zooms from Home around its target (no snap back)', () => {
        const { scene, el, camera, frames, scene3 } = sceneFixture();
        expect(scene.controls.kind).toBe(strategy);
        const home = scene.homePose;
        rightDrag(el, 150, 100);
        scene3.updateMatrixWorld();
        expect(navPivot(scene.controls).distanceTo(home.target)).toBeGreaterThan(1);
        scene.instance.notifyChange.mockClear();

        scene.goHome();
        runFlight(frames);

        // Every step asked Giro3D for its frame
        expect(scene.instance.notifyChange).toHaveBeenCalledTimes(2);
        expect(scene.instance.notifyChange).toHaveBeenCalledWith(camera);
        expect(camera.position.distanceTo(home.position)).toBeLessThan(1e-6);
        expect(camera.quaternion.angleTo(home.quaternion)).toBeLessThan(1e-6);
        expect(scene.userInteracted).toBe(false);

        // No render in between: the matrices are the ones the flight saved
        const distance = camera.position.distanceTo(home.target);
        wheel(el);
        expect(camera.quaternion.angleTo(home.quaternion)).toBeLessThan(1e-6);
        expect(navPivot(scene.controls).distanceTo(home.target)).toBeLessThan(1e-6);
        expect(back(camera).distanceTo(camera.position.clone().sub(home.target).normalize())).toBeLessThan(1e-6);
        expect(camera.position.distanceTo(home.target)).toBeCloseTo(distance * 1.1, 6);
        expect(scene.userInteracted).toBe(true);
        scene.dispose();
    });

    it('flies to a double-clicked point, and the next wheel notch zooms around it', () => {
        const point = new THREE.Vector3(6, -4, 12);
        const { scene, el, camera, frames } = sceneFixture([{ point }]);
        const dir = back(camera);
        scene.instance.notifyChange.mockClear();

        el.dispatchEvent(new MouseEvent('dblclick', { clientX: 400, clientY: 300, bubbles: true }));
        runFlight(frames);

        expect(scene.instance.notifyChange).toHaveBeenCalledTimes(2);
        expect(navPivot(scene.controls).distanceTo(point)).toBeLessThan(1e-9);
        // The point in the middle, the view direction kept
        expect(back(camera).distanceTo(dir)).toBeLessThan(1e-6);
        expect(back(camera).distanceTo(camera.position.clone().sub(point).normalize())).toBeLessThan(1e-6);

        const distance = camera.position.distanceTo(point);
        wheel(el, -100);
        expect(navPivot(scene.controls).distanceTo(point)).toBeLessThan(1e-6);
        expect(back(camera).distanceTo(dir)).toBeLessThan(1e-6);
        expect(back(camera).distanceTo(camera.position.clone().sub(point).normalize())).toBeLessThan(1e-6);
        expect(camera.position.distanceTo(point)).toBeCloseTo(distance / 1.1, 6);
        scene.dispose();
    });

    it('never fires start for a programmatic move: Home leaves userInteracted false', () => {
        const { scene, frames } = sceneFixture();
        const start = vi.fn();
        // lifetime: paired (removed below)
        scene.controls.addEventListener('start', start);
        scene.controls.orbit(0.5, 0.2);
        scene.controls.pan(0.2, 0.1);
        scene.controls.setPose({ fov: 40 }, { save: true });
        scene.goHome();
        runFlight(frames);
        expect(start).not.toHaveBeenCalled();
        expect(scene.userInteracted).toBe(false);
        scene.controls.removeEventListener('start', start);
        scene.dispose();
    });

    // FR-XC-18: the wheel calls zoomAt in both strategies, never the three.js controls' own wheel
    // listener. A Chrome notch is 100 px (ArcballControls count 125 px a notch, so they zoom
    // 1.1^0.8 = x1.079 for it).
    it('zooms x1.1 for a 100 px Chrome wheel notch, through zoomAt (FR-XC-18)', () => {
        const { scene, el, camera } = sceneFixture();
        const zoomAt = vi.spyOn(scene.controls, 'zoomAt');
        const pivot = navPivot(scene.controls).clone();
        const distance = camera.position.distanceTo(pivot);
        wheel(el, 100);
        expect(zoomAt).toHaveBeenCalledTimes(1);
        expect(camera.position.distanceTo(navPivot(scene.controls))).toBeCloseTo(distance * 1.1, 6);
        scene.dispose();
    });

    it('changes the field of view on Shift+wheel through setFov (FR-XC-18)', () => {
        const { scene, el, camera } = sceneFixture();
        const setFov = vi.spyOn(scene.controls, 'setFov');
        const position = camera.position.clone();
        el.dispatchEvent(Object.assign(new Event('wheel', { bubbles: true, cancelable: true }),
            { deltaY: 100, deltaX: 0, deltaMode: 0, clientX: W / 2, clientY: H / 2, shiftKey: true }));
        expect(setFov).toHaveBeenCalledTimes(1);
        expect(camera.position.distanceTo(position)).toBeLessThan(1e-9);
        scene.dispose();
    });

    it('takes a wheel event without a notch (a horizontal swipe) for no input: no start, the flight goes on', () => {
        const { scene, el, camera, frames } = sceneFixture();
        const home = scene.homePose;
        const start = vi.fn();
        // lifetime: paired (removed below)
        scene.controls.addEventListener('start', start);
        scene.controls.orbit(0.5, 0.2);
        scene.goHome();
        const swipe = Object.assign(new Event('wheel', { bubbles: true, cancelable: true }),
            { deltaY: 0, deltaX: 80, deltaMode: 0, clientX: W / 2, clientY: H / 2, shiftKey: false });
        const position = camera.position.clone();
        el.dispatchEvent(swipe);
        expect(swipe.defaultPrevented).toBe(true);
        expect(camera.position.distanceTo(position)).toBe(0);
        runFlight(frames);
        expect(start).not.toHaveBeenCalled();
        expect(scene.userInteracted).toBe(false);
        expect(camera.position.distanceTo(home.position)).toBeLessThan(1e-6);
        scene.controls.removeEventListener('start', start);
        scene.dispose();
    });
});

// ---- the strategy of each scene (FR-XC-18, D-001) ----

describe('the navigation strategy each loader picks for the scene it builds', () => {
    const T = ddb.entry.type;
    const footprint = { type: 'Polygon', coordinates: [[[0, 0], [0.01, 0], [0.01, 0.01], [0, 0]]] };
    const point = { type: 'Point', coordinates: [0, 0] };

    // A scene whose real setupInstance / setupGlobe run on a stubbed Giro3D: what the loader asked
    // for is recorded when the controls are attached, and the load stops there (before any data)
    function stubScene(metadataCrs) {
        const CoordinateSystem = {
            epsg3857: { id: 'EPSG:3857' }, epsg4978: { id: 'EPSG:4978' }, unknown: { id: 'unknown' }, register: vi.fn()
        };
        const crs = metadataCrs ? metadataCrs(CoordinateSystem) : { id: 'EPSG:32633', definition: '+proj=utm +zone=33 +datum=WGS84' };
        class Instance {
            constructor(options) {
                this.crs = options.crs;
                this.view = { camera: new THREE.PerspectiveCamera() };
                this.scene = new THREE.Scene();
                this.domElement = { style: {} };
            }
        }
        class COPCSource {
            addEventListener() {}
            removeEventListener() {}
            async initialize() {}
            async getMetadata() { return { crs }; }
        }
        const libs = {
            THREE, Instance, CoordinateSystem, COPCSource,
            OlGeoJSON: class { readFeatures() { return [{}]; } },
            OlVectorSource: class { getExtent() { return [0, 0, 10, 10]; } }
        };
        const scene = new UnifiedScene(libs, null, { settings: {}, view: { layers: [] }, notify: { info() {} } });
        const built = {};
        const STOP = new Error('scene built');
        scene.computeExtent = () => ({ extent: {}, bbox: [0, 0, 1, 1], centerLat: 0 });
        scene.attachControls = strategy => {
            built.scene = scene.instance.crs === CoordinateSystem.epsg4978 ? 'globe' : 'flat';
            built.strategy = strategy;
            throw STOP;
        };
        return { scene, built, STOP };
    }

    const dataset = {
        Entry: () => ({ get3DTiles: () => '/tiles/tileset.json', getCopc: () => '/cloud.copc.laz' }),
        tileUrl: () => '/tiles/{z}/{x}/{y}.png',
        baseApi: '/api',
        getFeatures: async () => ({ type: 'FeatureCollection', features: [] })
    };

    it.each([
        ['an orthophoto or DEM', 'flat', 'constrained', { type: T.GEORASTER, path: 'odm_orthophoto.tif', polygon_geom: footprint }],
        ['a vector layer', 'flat', 'constrained', { type: T.VECTOR, path: 'roads.geojson', polygon_geom: footprint }],
        ['a local CAD drawing', 'flat', 'free', { type: T.VECTOR, path: 'plan.dxf', properties: { georeferenced: false } }],
        ['a point cloud with a CRS and a footprint', 'flat', 'constrained', { type: T.POINTCLOUD, path: 'cloud.laz', point_geom: point }],
        ['a point cloud without a CRS', 'flat', 'free', { type: T.POINTCLOUD, path: 'cloud.laz', point_geom: point }, CS => CS.unknown],
        ['a point cloud flagged not georeferenced', 'flat', 'free', { type: T.POINTCLOUD, path: 'cloud.laz', point_geom: point, properties: { georeferenced: false } }],
        ['georeferenced 3D Tiles', 'globe', 'constrained', { type: T.TILES3D, path: 'site.3tz' }],
        ['3D Tiles without a georeference', 'flat', 'free', { type: T.TILES3D, path: 'site.3tz', properties: { georeferenced: false } }],
        ['a georeferenced 3D model', 'flat', 'free', { type: T.MODEL, path: 'model.glb', polygon_geom: footprint }],
        ['a 3D model without a georeference', 'flat', 'free', { type: T.MODEL, path: 'model.obj' }]
    ])('%s: a %s scene with the %s strategy', async (_, kind, strategy, entry, metadataCrs) => {
        const { scene, built, STOP } = stubScene(metadataCrs);
        await expect(LOADERS[entry.type](scene, entry, dataset)).rejects.toBe(STOP);
        expect(built).toEqual({ scene: kind, strategy });
    });
});
