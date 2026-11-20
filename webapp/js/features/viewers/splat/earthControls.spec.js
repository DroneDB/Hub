import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { EarthControls } from './earthControls';

/** Z-up scene, the camera 10 up and 10 back looking at the origin, a canvas of 800 x 600. */
function makeEarth({ up = new THREE.Vector3(0, 0, 1), enabled = true } = {}) {
    const camera = new THREE.PerspectiveCamera(60, 800 / 600, 0.1, 1000);
    camera.up.copy(up);
    camera.position.set(0, -10, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const rig = {
        THREE, camera, controls: { target: new THREE.Vector3(0, 0, 0) },
        sceneUp: up.clone()
    };
    const canvas = document.createElement('canvas');
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
    canvas.setPointerCapture = vi.fn();
    canvas.releasePointerCapture = vi.fn();
    const scene = new THREE.Scene();
    const onInteract = vi.fn();
    const earth = new EarthControls(rig, canvas, scene, { enabled: () => enabled, onInteract });
    earth.attach((target, type, fn, options) => target.addEventListener(type, fn, options));
    return { earth, rig, camera, canvas, onInteract };
}

function wheel(canvas, fields) {
    const e = Object.assign(new Event('wheel', { bubbles: true, cancelable: true }), { deltaMode: 0, clientX: 400, clientY: 300, ...fields });
    canvas.dispatchEvent(e);
    return e;
}

describe('ground point under the pointer', () => {
    it('is the look target at the centre of the view, on the plane through it perpendicular to the scene up', () => {
        const { earth } = makeEarth();
        const centre = earth.groundPoint(400, 300);
        expect(centre.distanceTo(new THREE.Vector3(0, 0, 0))).toBeLessThan(1e-6);
        const left = earth.groundPoint(100, 300);
        expect(left.x).toBeLessThan(-1);
        expect(left.z).toBeCloseTo(0, 6);
    });

    it('follows the scene up, not world Z', () => {
        // Up along +X: the plane is x = 0, wherever the pointer is
        const { earth } = makeEarth({ up: new THREE.Vector3(1, 0, 0) });
        const hit = earth.groundPoint(500, 350);
        expect(hit.x).toBeCloseTo(0, 6);
    });

    it('is null when the ray points away from the plane (the sky above the horizon)', () => {
        const { earth, camera } = makeEarth();
        expect(earth.groundPoint(400, 0)).not.toBeNull();
        // Close to the ground, looking up: the top of the view only sees sky
        camera.position.set(0, -10, 1);
        camera.lookAt(0, 0, 4);
        camera.updateMatrixWorld();
        expect(earth.groundPoint(400, 0)).toBeNull();
    });

    it('starts a gesture on that point as its pivot', () => {
        const { earth } = makeEarth();
        earth.begin(400, 300);
        expect(earth.pivot.distanceTo(new THREE.Vector3(0, 0, 0))).toBeLessThan(1e-6);
    });
});

describe('wheel zoom', () => {
    const moved = deltas => {
        const { camera, canvas } = makeEarth();
        const start = camera.position.clone();
        deltas.forEach(fields => wheel(canvas, fields));
        return camera.position.distanceTo(start);
    };

    it('moves toward the point under the pointer for a wheel up and away for a wheel down', () => {
        const { camera, canvas } = makeEarth();
        const before = camera.position.distanceTo(new THREE.Vector3());
        wheel(canvas, { deltaY: -100 });
        expect(camera.position.distanceTo(new THREE.Vector3())).toBeLessThan(before);
        wheel(canvas, { deltaY: 200 });
        wheel(canvas, { deltaY: 100 });
        expect(camera.position.distanceTo(new THREE.Vector3())).toBeGreaterThan(before);
    });

    it('moves by the size of the wheel step, so a trackpad\'s small deltas do not zoom like notches', () => {
        const notch = moved([{ deltaY: -100 }]);
        const small = moved([{ deltaY: -4 }]);
        expect(notch).toBeGreaterThan(0);
        expect(small / notch).toBeCloseTo(0.04, 2);
        // Twenty small events are one notch's worth, not twenty
        const many = moved(Array(25).fill({ deltaY: -4 }));
        expect(many).toBeLessThan(notch * 1.5);
    });

    it('zooms a large delta by one notch at most', () => {
        expect(moved([{ deltaY: -5000 }])).toBeCloseTo(moved([{ deltaY: -100 }]), 9);
    });

    it('reads a browser that reports lines like one that reports pixels', () => {
        expect(moved([{ deltaMode: 1, deltaY: -3 }])).toBeCloseTo(moved([{ deltaMode: 0, deltaY: -100 }]), 9);
    });

    it('does nothing for a zero delta, but still keeps the page from scrolling', () => {
        const { camera, canvas } = makeEarth();
        const start = camera.position.clone();
        const e = wheel(canvas, { deltaY: 0 });
        expect(camera.position.equals(start)).toBe(true);
        expect(e.defaultPrevented).toBe(true);
    });

    it('is left alone when earth mode is off', () => {
        const { camera, canvas } = makeEarth({ enabled: false });
        const start = camera.position.clone();
        const e = wheel(canvas, { deltaY: -100 });
        expect(camera.position.equals(start)).toBe(true);
        expect(e.defaultPrevented).toBe(false);
    });

    it('tells the viewer that the user took over', () => {
        const { canvas, onInteract } = makeEarth();
        wheel(canvas, { deltaY: -100 });
        expect(onInteract).toHaveBeenCalledTimes(1);
    });
});

describe('the shared constrained orbit with the splat viewer\'s options (FR-XC-18)', () => {
    const UP = new THREE.Vector3(0, 0, 1);
    const POLE = 0.996;

    function pointer(type, x, y, { button = 0, pointerType = 'mouse' } = {}) {
        return new PointerEvent(type, {
            clientX: x, clientY: y, button, buttons: 1 << button, pointerId: 1,
            pointerType, isPrimary: true, bubbles: true, cancelable: true
        });
    }

    // From the middle of the view (the pivot is the look target there), in 20 moves
    function drag(canvas, dx, dy, options) {
        canvas.dispatchEvent(pointer('pointerdown', 400, 300, options));
        for (let i = 1; i <= 20; i++) canvas.dispatchEvent(pointer('pointermove', 400 + (dx * i) / 20, 300 + (dy * i) / 20, options));
        canvas.dispatchEvent(pointer('pointerup', 400 + dx, 300 + dy, options));
    }

    // The pitch of the view above the scene's horizon, in degrees
    const pitch = (camera, target) => Math.asin(target.clone().sub(camera.position).normalize().dot(UP)) * 180 / Math.PI;
    // Pixels of drag for a turn of `degrees` (0.005 rad a pixel)
    const px = degrees => (degrees * Math.PI / 180) / 0.005;

    it('orbits on a right-drag, the view down to 80° below the horizon, never past the pole', () => {
        const { earth, camera, rig, canvas } = makeEarth();
        expect(earth.orbit.tiltRange.pole).toBe(POLE);
        expect(pitch(camera, rig.controls.target)).toBeCloseTo(-45, 9);
        // A drag down raises the camera: the view goes 35° farther down
        drag(canvas, 0, px(35), { button: 2 });
        expect(pitch(camera, rig.controls.target)).toBeCloseTo(-80, 6);
        drag(canvas, 0, 200, { button: 2 });
        expect(Math.abs(Math.sin(pitch(camera, rig.controls.target) * Math.PI / 180))).toBeLessThanOrEqual(POLE);
        // OrbitControls' target is the one that moved: the earth controls share it
        expect(earth.orbit.target).toBe(rig.controls.target);
    });

    it('can still look up from below the ground (its pitch limit both ways), unlike the 3D viewer\'s geo scenes', () => {
        const { camera, rig, canvas } = makeEarth();
        drag(canvas, 0, -px(125), { button: 2 });
        expect(pitch(camera, rig.controls.target)).toBeCloseTo(80, 6);
        expect(camera.position.z).toBeLessThan(0);
    });

    it('turns the heading on a horizontal right-drag', () => {
        const { camera, rig, canvas } = makeEarth();
        const before = camera.position.clone().sub(rig.controls.target);
        drag(canvas, px(30), 0, { button: 2 });
        const after = camera.position.clone().sub(rig.controls.target);
        // About the scene up: 30° around it, the height kept
        const flat = v => new THREE.Vector3(v.x, v.y, 0);
        expect(flat(before).angleTo(flat(after)) * 180 / Math.PI).toBeCloseTo(30, 6);
        expect(after.z).toBeCloseTo(before.z, 9);
    });

    it('pans on a left-drag and on one finger: the grabbed ground point stays under the pointer, the view direction kept', () => {
        for (const options of [{ button: 0 }, { pointerType: 'touch' }]) {
            const { earth, camera, rig, canvas } = makeEarth();
            const dir = rig.controls.target.clone().sub(camera.position).normalize();
            const grabbed = earth.groundPoint(400, 300);
            drag(canvas, 120, -80, options);
            expect(earth.groundPoint(520, 220).distanceTo(grabbed)).toBeLessThan(1e-6);
            expect(rig.controls.target.clone().sub(camera.position).normalize().distanceTo(dir)).toBeLessThan(1e-9);
        }
    });

    it('tells the viewer that the user took over on a press', () => {
        const { canvas, onInteract } = makeEarth();
        drag(canvas, 10, 0, { button: 2 });
        expect(onInteract).toHaveBeenCalledTimes(1);
    });

    it('is left alone when earth mode is off', () => {
        const { camera, canvas, onInteract } = makeEarth({ enabled: false });
        const start = camera.position.clone();
        drag(canvas, 100, 50, { button: 2 });
        expect(camera.position.equals(start)).toBe(true);
        expect(onInteract).not.toHaveBeenCalled();
    });
});
