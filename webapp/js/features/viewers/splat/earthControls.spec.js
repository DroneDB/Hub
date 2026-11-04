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
