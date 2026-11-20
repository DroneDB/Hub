/**
 * constrainedOrbit - the navigation of geo scenes (D-001, D-019), driven like a user drives it:
 * pointer drags, two fingers and the wheel on a stub canvas, with the real class and three.js.
 * The ground stays below, the horizon level, the tilt within 5° to 89° and the heading turns
 * around the scene's up axis, on a flat scene and on the globe.
 */
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { ArcballControls } from 'three/examples/jsm/controls/ArcballControls.js';
import { createNavControls, applySceneMetrics } from './navControls';
import { ConstrainedOrbit, GEO_TILT, northOf } from './constrainedOrbit';

const W = 800;
const H = 600;
const DEG = Math.PI / 180;
const Z_UP = new THREE.Vector3(0, 0, 1);
const EPS = 1e-6;

function makeCanvas() {
    const el = document.createElement('canvas');
    Object.defineProperty(el, 'clientWidth', { value: W });
    Object.defineProperty(el, 'clientHeight', { value: H });
    el.getBoundingClientRect = () => ({ left: 0, top: 0, width: W, height: H, right: W, bottom: H, x: 0, y: 0 });
    el.setPointerCapture = vi.fn();
    el.releasePointerCapture = vi.fn();
    return el;
}

/**
 * A geo scene: the camera 45° above the ground (z = 0 through the target), looking north at the
 * origin, 100 · √2 away; the distance limits of a 100 m scene (2 to 2000).
 */
function fixture({ up = Z_UP, target = new THREE.Vector3(), position } = {}) {
    const el = makeCanvas();
    const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 1e7);
    const scene = new THREE.Scene();
    const sceneUp = { value: up.clone().normalize() };
    const controls = createNavControls({ THREE, ArcballControls }, camera, el, scene,
        { strategy: 'constrained', getUp: () => sceneUp.value });
    applySceneMetrics(controls, 100);
    const north = northOf(THREE, sceneUp.value);
    const start = position || target.clone().addScaledVector(north, -100).addScaledVector(sceneUp.value, 100);
    controls.setPose({ position: start, target }, { save: true });
    return { el, camera, scene, controls, sceneUp };
}

function pointer(type, x, y, { button = 0, id = 1, pointerType = 'mouse', ctrlKey = false } = {}) {
    return new PointerEvent(type, {
        clientX: x, clientY: y, button, buttons: 1 << button, pointerId: id, ctrlKey,
        pointerType, isPrimary: id === 1, bubbles: true, cancelable: true
    });
}

// A drag from `from` by (dx, dy) px in 20 moves; `check` runs after every move
function drag(el, from, dx, dy, options = {}, check = () => {}) {
    const [x, y] = from;
    el.dispatchEvent(pointer('pointerdown', x, y, options));
    for (let i = 1; i <= 20; i++) {
        el.dispatchEvent(pointer('pointermove', x + (dx * i) / 20, y + (dy * i) / 20, options));
        check();
    }
    el.dispatchEvent(pointer('pointerup', x + dx, y + dy, options));
}

// A plain event with the wheel's fields: happy-dom's WheelEvent drops clientX and shiftKey
function wheel(el, deltaY, fields = {}) {
    const e = Object.assign(new Event('wheel', { bubbles: true, cancelable: true }),
        { deltaY, deltaX: 0, deltaMode: 0, clientX: W / 2, clientY: H / 2, shiftKey: false, ...fields });
    el.dispatchEvent(e);
    return e;
}

const CENTRE = [W / 2, H / 2];
const right = camera => new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
const screenTop = camera => new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
const forward = camera => new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
// Elevation (radians) of `point` above the ground through `from` perpendicular to `up`
const elevation = (point, from, up) => {
    const offset = point.clone().sub(from);
    return Math.asin(offset.dot(up) / offset.length());
};
// The shorter angle from a to b
const turn = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

// Upright: the screen's horizontal level, its top up, camera.up the scene's
function expectUpright(camera, up) {
    expect(Math.abs(right(camera).dot(up))).toBeLessThan(EPS);
    expect(screenTop(camera).dot(up)).toBeGreaterThan(0);
    expect(camera.up.distanceTo(up)).toBeLessThan(1e-12);
}

function expectTiltInRange(controls) {
    expect(controls.tilt).toBeGreaterThanOrEqual(GEO_TILT.min * DEG - EPS);
    expect(controls.tilt).toBeLessThanOrEqual(GEO_TILT.max * DEG + EPS);
}

describe('ConstrainedOrbit: drags on a flat geo scene (FR-VWR-03, AC-021)', () => {
    it('turns the heading around the scene up on a half-screen horizontal left-drag, the ground below and the horizon level', () => {
        const { el, camera, controls } = fixture();
        const target = controls.target.clone();
        const distance = camera.position.distanceTo(target);
        expect(controls.heading).toBeCloseTo(0, 9);

        drag(el, CENTRE, W / 2 + 20, 0, {}, () => {
            expect(camera.position.z).toBeGreaterThan(0);
            expect(controls.tilt).toBeCloseTo(45 * DEG, 6);
            expectUpright(camera, Z_UP);
        });

        // 420 px at 0.005 rad a pixel: the camera went left around the target, the view turned right
        expect(turn(controls.heading, 420 * 0.005)).toBeCloseTo(0, 6);
        expect(controls.target.distanceTo(target)).toBeLessThan(EPS);
        expect(camera.position.distanceTo(target)).toBeCloseTo(distance, 6);
        controls.dispose();
    });

    it('starts from a top-down Home without a jump, and a 300 px vertical drag keeps the tilt within 5° to 89°, upright', () => {
        const { el, camera, controls } = fixture();
        // frameGlobe / an orthophoto: straight down, north at the top
        controls.setPose({ position: new THREE.Vector3(0, 0, 150), target: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) }, { save: true });
        expect(controls.tilt).toBeCloseTo(89 * DEG, 9);
        expect(controls.heading).toBeCloseTo(0, 9);

        // A first small drag moves a little, not to another heading
        drag(el, CENTRE, 4, 0);
        expect(Math.abs(turn(controls.heading, 0))).toBeLessThan(0.03);

        const check = () => {
            expectTiltInRange(controls);
            expectUpright(camera, Z_UP);
            expect(camera.position.z).toBeGreaterThan(0);
        };
        // Down: the camera would go over the top; it stops at 89°
        drag(el, CENTRE, 0, 300, {}, check);
        expect(controls.tilt).toBeCloseTo(89 * DEG, 6);
        // Up: 1.5 rad toward the horizon from 89°, it stops at 5°
        drag(el, CENTRE, 0, -300, {}, check);
        expect(controls.tilt).toBeCloseTo(5 * DEG, 6);
        controls.dispose();
    });

    it('keeps the tilt in range and the horizon level on a diagonal drag', () => {
        const { el, camera, controls } = fixture();
        drag(el, CENTRE, 300, 200, {}, () => {
            expectTiltInRange(controls);
            expectUpright(camera, Z_UP);
        });
        drag(el, CENTRE, -350, -260, {}, () => {
            expectTiltInRange(controls);
            expectUpright(camera, Z_UP);
            expect(camera.position.z).toBeGreaterThan(0);
        });
        controls.dispose();
    });

    it('never goes under the ground when it turns around a pivot away from the middle of the view', () => {
        // The earth controls' case: the pivot (0, 10, 0) beyond the target, the camera at (0, -10, 10).
        // Tilting the view from 45° to 5° down about it would take the camera 13.4° under the ground.
        const { el, camera, controls } = fixture({ position: new THREE.Vector3(0, -10, 10) });
        const pivot = new THREE.Vector3(0, 10, 0);
        const p = pivot.clone().project(camera);
        const at = [(p.x + 1) / 2 * W, (1 - p.y) / 2 * H];

        const check = () => {
            expect(controls.gesturePivot.distanceTo(pivot)).toBeLessThan(1e-6);
            expect(camera.position.z).toBeGreaterThan(0);
            expect(elevation(camera.position, pivot, Z_UP)).toBeGreaterThanOrEqual(5 * DEG - EPS);
            expect(-forward(camera).z).toBeGreaterThanOrEqual(Math.sin(5 * DEG) - EPS);
            expectUpright(camera, Z_UP);
        };
        drag(el, at, 0, -400, {}, check);
        // Stopped by the camera's elevation above the pivot's ground, not by the view direction
        expect(elevation(camera.position, pivot, Z_UP)).toBeCloseTo(5 * DEG, 6);
        // The target is back on the ground, in the middle of the view
        expect(controls.target.z).toBeCloseTo(0, 6);
        expect(controls.target.clone().sub(camera.position).normalize().distanceTo(forward(camera))).toBeLessThan(EPS);

        // And the other way: never past straight down, so never upside down
        drag(el, at, 0, 500, {}, () => {
            expect(-forward(camera).z).toBeLessThanOrEqual(Math.sin(89 * DEG) + EPS);
            expect(elevation(camera.position, controls.gesturePivot, Z_UP)).toBeLessThanOrEqual(89 * DEG + EPS);
            expectUpright(camera, Z_UP);
        });
        controls.dispose();
    });

    // A turn about the point under the pointer, then the target back on the ground along the
    // view's centre ray: the distance to the target changes, and must stay within the limits
    // of the scene (2 to 2000 for this 100 m one)
    function expectDistanceInRange(camera, controls) {
        const d = camera.position.distanceTo(controls.target);
        expect(d).toBeGreaterThanOrEqual(controls.minDistance - EPS);
        expect(d).toBeLessThanOrEqual(controls.maxDistance + EPS);
    }

    it('keeps the distance at least minDistance through left-drags about pivots off the middle of the view (FR-VWR-02)', () => {
        const { el, camera, controls } = fixture();
        const check = () => {
            expectDistanceInRange(camera, controls);
            expectTiltInRange(controls);
            expectUpright(camera, Z_UP);
            expect(camera.position.z).toBeGreaterThan(0);
        };
        // Without the clamp: 141 m, then 23, 3.8, 0.62 and 0.10 m
        for (let i = 0; i < 4; i++) {
            drag(el, CENTRE, 0, -300, {}, check);
            drag(el, [W / 2, 590], 0, 300, {}, check);
        }
        expect(camera.position.distanceTo(controls.target)).toBeCloseTo(controls.minDistance, 6);
        controls.dispose();
    });

    it('keeps the distance at most maxDistance through left-drags about pivots off the middle of the view (FR-VWR-02)', () => {
        const { el, camera, controls } = fixture();
        const check = () => {
            expectDistanceInRange(camera, controls);
            expectTiltInRange(controls);
            expectUpright(camera, Z_UP);
        };
        for (let i = 0; i < 4; i++) {
            drag(el, [W / 2, 590], 0, -300, {}, check);
            drag(el, CENTRE, 0, 300, {}, check);
        }
        expect(camera.position.distanceTo(controls.target)).toBeCloseTo(controls.maxDistance, 6);
        controls.dispose();
    });

    it('pans the ground on a right-drag (and a middle or Ctrl+left one): the grabbed point stays under the pointer', () => {
        for (const options of [{ button: 2 }, { button: 1 }, { button: 0, ctrlKey: true }]) {
            const { el, camera, controls } = fixture();
            const q = camera.quaternion.clone();
            const grabbed = controls.groundPoint(300, 200);
            drag(el, [300, 200], 150, 90, options);
            expect(camera.quaternion.angleTo(q)).toBeLessThan(1e-9);
            expect(controls.groundPoint(450, 290).distanceTo(grabbed)).toBeLessThan(1e-6);
            expect(controls.target.z).toBeCloseTo(0, 9);
            controls.dispose();
        }
    });

    it('orbits on one finger, as a left-drag', () => {
        const { el, controls } = fixture();
        drag(el, CENTRE, 200, 0, { pointerType: 'touch' });
        expect(turn(controls.heading, 1)).toBeCloseTo(0, 6);
        controls.dispose();
    });

    it('shows the pivot marker during a gesture and renders once more to hide it', () => {
        const { el, scene, controls } = fixture();
        expect(scene.children).toContain(controls.marker);
        const change = vi.fn();
        el.dispatchEvent(pointer('pointerdown', 400, 300));
        el.dispatchEvent(pointer('pointermove', 410, 300));
        expect(controls.marker.visible).toBe(true);
        expect(controls.marker.position.distanceTo(controls.gesturePivot)).toBeLessThan(1e-9);
        // lifetime: paired (removed below)
        controls.addEventListener('change', change);
        el.dispatchEvent(pointer('pointerup', 410, 300));
        expect(controls.marker.visible).toBe(false);
        expect(change).toHaveBeenCalledTimes(1);
        controls.removeEventListener('change', change);
        controls.dispose();
        expect(scene.children).not.toContain(controls.marker);
    });
});

describe('ConstrainedOrbit: the globe', () => {
    // An ellipsoid normal, nothing like Z
    const UP = new THREE.Vector3(0.6, -0.48, 0.64).normalize();

    it('turns the heading around the ellipsoid normal, the camera level on it', () => {
        const target = UP.clone().multiplyScalar(6.4e6);
        const { el, camera, controls } = fixture({ up: UP, target });
        const before = camera.position.clone().sub(target);
        expect(controls.heading).toBeCloseTo(0, 9);
        expectUpright(camera, UP);

        drag(el, CENTRE, 200, 0, {}, () => {
            expectUpright(camera, UP);
            expect(elevation(camera.position, target, UP)).toBeCloseTo(45 * DEG, 6);
        });

        const after = camera.position.clone().sub(target);
        // A turn of -1 rad about the normal (the camera went left): the view turned 1 rad right
        const a = before.clone().projectOnPlane(UP).normalize();
        const b = after.clone().projectOnPlane(UP).normalize();
        expect(Math.atan2(a.clone().cross(b).dot(UP), a.dot(b))).toBeCloseTo(-1, 6);
        expect(after.length()).toBeCloseTo(before.length(), 3);
        expect(turn(controls.heading, 1)).toBeCloseTo(0, 6);
        controls.dispose();
    });

    it('reads the up axis at every use: the globe sets it after the controls exist', () => {
        const { camera, controls, sceneUp } = fixture();
        const target = UP.clone().multiplyScalar(1000);
        sceneUp.value = UP.clone();
        // frameGlobe: straight down, north up
        controls.setPose({ position: target.clone().addScaledVector(UP, 300), target, up: northOf(THREE, UP) }, { save: true });
        expect(controls.tilt).toBeCloseTo(89 * DEG, 9);
        expect(controls.heading).toBeCloseTo(0, 9);
        expectUpright(camera, UP);
        controls.dispose();
    });
});

describe('ConstrainedOrbit: two fingers', () => {
    function touch(el, type, id, x, y) {
        el.dispatchEvent(pointer(type, x, y, { id, pointerType: 'touch' }));
    }

    it('turns the heading with a two-finger twist, without zooming or moving the target', () => {
        const { el, camera, controls } = fixture();
        const target = controls.target.clone();
        const distance = camera.position.distanceTo(target);
        const r = 100;
        touch(el, 'pointerdown', 1, 400 - r, 300);
        touch(el, 'pointerdown', 2, 400 + r, 300);
        // A 30° turn, clockwise on the screen, one finger after the other
        for (let i = 1; i <= 10; i++) {
            const a = (30 * DEG * i) / 10;
            touch(el, 'pointermove', 1, 400 - r * Math.cos(a), 300 - r * Math.sin(a));
            touch(el, 'pointermove', 2, 400 + r * Math.cos(a), 300 + r * Math.sin(a));
            expectUpright(camera, Z_UP);
        }
        touch(el, 'pointerup', 1, 0, 0);
        touch(el, 'pointerup', 2, 0, 0);

        // The ground turned with the fingers: the view turned the other way
        expect(turn(controls.heading, -30 * DEG)).toBeCloseTo(0, 6);
        expect(camera.position.distanceTo(controls.target)).toBeCloseTo(distance, 6);
        expect(controls.target.distanceTo(target)).toBeLessThan(1e-6);
        expect(controls.tilt).toBeCloseTo(45 * DEG, 6);
        controls.dispose();
    });

    it('zooms with a pinch and pans with the middle of the fingers', () => {
        const { el, camera, controls } = fixture();
        const distance = camera.position.distanceTo(controls.target);
        touch(el, 'pointerdown', 1, 350, 300);
        touch(el, 'pointerdown', 2, 450, 300);
        touch(el, 'pointermove', 1, 300, 300);
        touch(el, 'pointermove', 2, 500, 300);
        // Twice the spread: half the distance
        expect(camera.position.distanceTo(controls.target)).toBeCloseTo(distance / 2, 6);
        const grabbed = controls.groundPoint(400, 300);
        touch(el, 'pointermove', 1, 300, 380);
        touch(el, 'pointermove', 2, 500, 380);
        expect(controls.groundPoint(400, 380).distanceTo(grabbed)).toBeLessThan(1e-6);
        expect(controls.tilt).toBeCloseTo(45 * DEG, 6);
        controls.dispose();
    });
});

describe('ConstrainedOrbit: the navigation interface', () => {
    it('clamps a pose straight down to 89°, the heading from the given up, and keeps it', () => {
        const { camera, controls } = fixture();
        const change = vi.fn();
        // Exactly 90°, east at the top of the screen
        controls.setPose({ position: new THREE.Vector3(0, 0, 100), target: new THREE.Vector3(), up: new THREE.Vector3(1, 0, 0) }, { save: true });
        expect(controls.tilt).toBeCloseTo(89 * DEG, 12);
        expect(controls.heading).toBeCloseTo(90 * DEG, 9);
        expect(camera.position.length()).toBeCloseTo(100, 9);
        expect(screenTop(camera).x).toBeGreaterThan(0.99);
        expectUpright(camera, Z_UP);
        // lifetime: paired (removed below)
        controls.addEventListener('change', change);
        for (let i = 0; i < 5; i++) controls.update();
        expect(change).not.toHaveBeenCalled();
        controls.removeEventListener('change', change);
        controls.dispose();
    });

    it('is a navigation strategy: the interface and the members Giro3D and the viewer use', () => {
        const { controls } = fixture();
        expect(controls).toBeInstanceOf(ConstrainedOrbit);
        expect(controls.kind).toBe('constrained');
        for (const name of ['orbit', 'pan', 'zoomAt', 'setFov', 'setPose', 'saveState', 'dispose', 'update',
            'pivot', 'stopAnimation', 'addEventListener', 'removeEventListener', 'hasEventListener', 'dispatchEvent']) {
            expect(typeof controls[name], name).toBe('function');
        }
        expect(controls.target).toBeInstanceOf(THREE.Vector3);
        expect(controls.pivot()).toBe(controls.target);
        expect(controls.scaleFactor).toBe(1.1);
        expect(controls.minDistance).toBeCloseTo(2);
        expect(controls.maxDistance).toBeCloseTo(2000);
        expect(controls.enabled).toBe(true);
        controls.enabled = false;
        expect(controls.enabled).toBe(false);
        expect(() => controls.stopAnimation()).not.toThrow();
        controls.dispose();
    });

    it('fires only change from the interface, never start or end, and keeps the tilt in range', () => {
        const { camera, controls } = fixture();
        const events = [];
        const log = e => events.push(e.type);
        // lifetime: paired (removed below)
        ['start', 'change', 'end'].forEach(type => controls.addEventListener(type, log));
        controls.orbit(0.3, 2);
        expect(controls.tilt).toBeCloseTo(89 * DEG, 6);
        controls.orbit(0, -3);
        expect(controls.tilt).toBeCloseTo(5 * DEG, 6);
        const z = controls.target.z;
        controls.pan(0.1, 0.2);
        expect(controls.target.z).toBeCloseTo(z, 9);
        controls.zoomAt(undefined, 1.1);
        controls.setFov(40);
        controls.setPose({ fov: 45 });
        expect(events.length).toBe(6);
        expect(events.every(type => type === 'change')).toBe(true);
        expect(camera.fov).toBe(45);
        controls.setFov(1);
        expect(camera.fov).toBe(controls.minFov);
        ['start', 'change', 'end'].forEach(type => controls.removeEventListener(type, log));
        controls.dispose();
    });

    it('dispatches change from update() only when it moved the camera', () => {
        const { camera, controls } = fixture();
        const change = vi.fn();
        controls.update();
        // lifetime: paired (removed below)
        controls.addEventListener('change', change);
        for (let i = 0; i < 5; i++) controls.update();
        expect(change).not.toHaveBeenCalled();
        // Something turned the camera away from the target: the update looks back at it, upright
        camera.rotateY(0.2);
        camera.rotateZ(0.3);
        controls.update();
        expect(change).toHaveBeenCalledTimes(1);
        expectUpright(camera, Z_UP);
        controls.update();
        expect(change).toHaveBeenCalledTimes(1);
        controls.removeEventListener('change', change);
        controls.dispose();
    });
});

describe('ConstrainedOrbit: the wheel and the input rules', () => {
    it('zooms toward the point under the pointer, a notch at a time, within the distance limits', () => {
        const { el, camera, controls } = fixture();
        const distance = camera.position.distanceTo(controls.target);
        wheel(el, -100);
        expect(camera.position.distanceTo(controls.target)).toBeCloseTo(distance / 1.1, 6);
        // Off the middle: the ground point under the pointer stays there
        const under = controls.groundPoint(200, 150);
        wheel(el, -100, { clientX: 200, clientY: 150 });
        expect(controls.groundPoint(200, 150).distanceTo(under)).toBeLessThan(1e-6);
        expect(controls.target.z).toBeCloseTo(0, 9);
        for (let i = 0; i < 200; i++) wheel(el, 100);
        expect(camera.position.distanceTo(controls.target)).toBeCloseTo(controls.maxDistance, 6);
        for (let i = 0; i < 400; i++) wheel(el, -100);
        expect(camera.position.distanceTo(controls.target)).toBeCloseTo(controls.minDistance, 6);
        expectUpright(camera, Z_UP);
        controls.dispose();
    });

    it('changes the field of view on Shift+wheel, without moving', () => {
        const { el, camera, controls } = fixture();
        const position = camera.position.clone();
        wheel(el, 100, { shiftKey: true });
        expect(camera.fov).toBeCloseTo(55, 9);
        // A browser that turns Shift+wheel into a horizontal scroll
        wheel(el, 0, { shiftKey: true, deltaX: -100 });
        expect(camera.fov).toBeCloseTo(50, 9);
        expect(camera.position.distanceTo(position)).toBeLessThan(1e-12);
        controls.dispose();
    });

    it('fires start and end for the input, which takes the camera over from a flight', () => {
        const { el, controls } = fixture();
        const events = [];
        const log = e => events.push(e.type);
        // lifetime: paired (removed below)
        ['start', 'end'].forEach(type => controls.addEventListener(type, log));
        drag(el, CENTRE, 10, 0);
        wheel(el, -100);
        expect(events).toEqual(['start', 'end', 'start', 'end']);
        ['start', 'end'].forEach(type => controls.removeEventListener(type, log));
        controls.dispose();
    });

    it('ignores input while disabled (a measurement), and keeps the context menu from a right-drag only while enabled', () => {
        const { el, camera, controls } = fixture();
        const position = camera.position.clone();
        const start = vi.fn();
        // lifetime: paired (removed below)
        controls.addEventListener('start', start);
        controls.enabled = false;
        expect(() => {
            drag(el, CENTRE, 200, 100);
            drag(el, CENTRE, 200, 100, { button: 2 });
        }).not.toThrow();
        const notch = wheel(el, -100);
        expect(notch.defaultPrevented).toBe(false);
        const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
        el.dispatchEvent(menu);
        expect(menu.defaultPrevented).toBe(false);
        expect(camera.position.distanceTo(position)).toBe(0);
        expect(start).not.toHaveBeenCalled();

        controls.enabled = true;
        const prevented = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
        el.dispatchEvent(prevented);
        expect(prevented.defaultPrevented).toBe(true);
        controls.removeEventListener('start', start);
        controls.dispose();
    });

    it('listens to nothing once disposed', () => {
        const { el, camera, controls } = fixture();
        const position = camera.position.clone();
        controls.dispose();
        drag(el, CENTRE, 200, 100);
        wheel(el, -100);
        expect(camera.position.distanceTo(position)).toBe(0);
    });
});
