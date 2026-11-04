/**
 * navControls - unit tests for the unified viewer navigation module.
 *
 * Covers the pure logic (wheel normalization, scene distance metrics), the one control of every
 * scene (the real ArcballControls of the bm3d viewer: rotation, pan, the upright aim, the orbit
 * Home flight, the focus of a double-click), the double-click pick (surface pick and the
 * up-vector-aware ground-plane fallback) and the camera tweener (easing endpoint, retarget,
 * stop). three.js is the real thing; Giro3D is stubbed.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { ArcballControls } from 'three/examples/jsm/controls/ArcballControls.js';
import {
    NAV,
    createNavControls,
    aimCamera,
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
    groundPlaneHit
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
        aimCamera(camera, controls, Z_UP);
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
        expect(controls).toBeInstanceOf(ArcballControls);
        expect(controls._gizmos.visible).toBe(false);
        // The bm3d viewer's defaults: inertia, wheel zoom to the pivot by 1.1 a notch
        expect(controls.enableAnimations).toBe(true);
        expect(controls.cursorZoom).toBe(false);
        expect(controls.scaleFactor).toBe(1.1);
        // The double-click focus is the viewer's (Giro3D picks points and map tiles too)
        expect(controls.enableFocus).toBe(false);
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
        aimCamera(camera, controls, north);
        expect(forward(camera).distanceTo(new THREE.Vector3(0, 0, -1))).toBeLessThan(1e-9);
        expect(camera.up.distanceTo(north)).toBeLessThan(1e-9);
        expect(right(camera).distanceTo(new THREE.Vector3(1, 0, 0))).toBeLessThan(1e-9);
        // The controls' update of every frame keeps that view
        const q = camera.quaternion.clone();
        for (let i = 0; i < 5; i++) controls.update();
        expect(camera.quaternion.angleTo(q)).toBeLessThan(1e-9);
        controls.dispose();
    });
});
