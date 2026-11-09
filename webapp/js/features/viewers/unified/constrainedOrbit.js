/**
 * ConstrainedOrbit - the navigation of geo scenes (D-001, D-019): the splat viewer's earth
 * controls, generalised. The heading turns around the scene's up axis, the tilt stays within a
 * range, the ground is grabbed by a pan, the wheel and a pinch zoom toward the point under the
 * pointer, and a marker shows the pivot of a gesture.
 *
 * The up axis is the scene's, read at every use through `getUp()`: the globe's is set by its
 * first framing, after the controls exist, and the splat viewer's moves with its tilt calibration.
 * camera.up is that up axis (no roll): setPose and update() reassert it.
 *
 * Two options shape it (FR-XC-18):
 *  - `tilt`: `{ min, max }` in degrees, the camera's elevation above the ground through the pivot
 *    it turns around (the unified viewer's geo scenes: 5° to 89°, GEO_TILT); or `{ pole }`, the
 *    splat viewer's limit of |view direction · up| (its view may also look up from below);
 *  - `buttons`: what the mouse buttons, one finger, two fingers and the wheel do (GEO_BUTTONS).
 *
 * The pose is the camera's, never a stored one: the heading and the tilt are read from it, so a
 * tween that moves the camera through setPose, and Giro3D's update() of every render, never meet
 * a stale state. It has the members Giro3D's view.setControls() and the viewer use (target,
 * enabled, update(), minDistance / maxDistance, scaleFactor, pivot(), stopAnimation(), the event
 * listener methods). 'start' and 'end' come only from the pointer, touch and the wheel; the
 * interface methods (orbit, pan, zoomAt, setFov, setPose) fire 'change' only.
 */
import { PRIMARY } from '@/libs/palette';
import { groundPlaneHit, wheelNotches } from './navControls';

const DEG = Math.PI / 180;
// Radians of turn a pixel of drag
const ROTATE_SPEED = 0.005;
// Fraction of the distance to the point under the pointer a wheel notch moves the camera ('dolly')
const WHEEL_DOLLY = 0.15;
// The zoom of a wheel notch ('zoom') and of the double-click focus, as the free trackball's
const SCALE_FACTOR = 1.1;
// A point near the horizon is very far away: a zoom toward it is bounded at this many times the
// distance to the target
const FAR_ANCHOR = 3;

const CHANGE_EVENT = { type: 'change' };
const START_EVENT = { type: 'start' };
const END_EVENT = { type: 'end' };

/** The tilt range of the unified viewer's geo scenes (D-001): degrees above the ground. */
export const GEO_TILT = Object.freeze({ min: 5, max: 89 });

/**
 * The button map of the unified viewer's geo scenes: left-drag (and one finger) orbits, right-
 * and Ctrl+left-drag pan, two fingers pan, pinch and twist, the wheel zooms at the pointer and
 * Shift+wheel changes the field of view. An action is 'orbit' or 'pan'; `twoFinger` is what the
 * middle of two fingers does ('pan', or 'orbit' as the splat viewer); `wheel` is 'zoom' (zoomAt)
 * or 'dolly' (the splat viewer's step toward the pointer); `shiftWheel` is 'fov' or a wheel action.
 */
export const GEO_BUTTONS = Object.freeze({
    left: 'orbit', ctrlLeft: 'pan', middle: 'pan', right: 'pan', touch: 'orbit',
    twoFinger: 'pan', twist: true, wheel: 'zoom', shiftWheel: 'fov'
});

const clamp = (x, lo, hi) => Math.min(Math.max(x, lo), hi);

// What a tilt option limits: the elevation above the ground (radians) or the view's pole
function tiltLimits(tilt) {
    if (tilt && typeof tilt.pole === 'number') {
        const limit = Math.asin(clamp(tilt.pole, -1, 1));
        return { pole: tilt.pole, min: -limit, max: limit };
    }
    const { min, max } = { ...GEO_TILT, ...tilt };
    return { pole: null, min: min * DEG, max: max * DEG };
}

export class ConstrainedOrbit {
    /**
     * @param libs - { THREE } of the viewer's three.js build.
     * @param camera - the camera to control.
     * @param domElement - the element to listen to.
     * @param scene - the three.js scene the pivot marker joins.
     * @param options - { getUp, tilt, buttons } and the wiring: `target` (a vector to share as the
     *   target: the splat viewer's OrbitControls one), `canNavigate` (read at every input on top
     *   of `enabled`), `listen: false` (the owner calls attach() with its own listener registry).
     */
    constructor(libs, camera, domElement, scene, options = {}) {
        const { THREE } = libs;
        this.kind = 'constrained';
        this.THREE = THREE;
        this.camera = camera;
        this.domElement = domElement;
        this.scene = scene;
        const fixedUp = camera.up.clone();
        this.getUp = options.getUp || (() => fixedUp);
        this.tiltRange = tiltLimits(options.tilt);
        this.buttons = { ...GEO_BUTTONS, ...options.buttons };
        this.canNavigate = options.canNavigate || (() => true);
        /** What the camera looks at, in the middle of the view; on the ground in a geo scene. */
        this.target = options.target || new THREE.Vector3();
        this.minDistance = 0;
        this.maxDistance = Infinity;
        this.minFov = 5;
        this.maxFov = 90;
        this.scaleFactor = SCALE_FACTOR;
        this._enabled = true;
        this._listeners = new Map();
        this._removers = [];

        // The gesture: its pointers, kind (null | 'orbit' | 'pan' | 'twofinger'), pivot and start
        this.pointers = new Map();
        this.gesture = null;
        this.gesturePivot = null;
        this.camStart = null;
        this.targetStart = null;
        this.lastX = 0;
        this.lastY = 0;
        this.lastDist = 0;
        this.lastAngle = 0;
        this.plane = new THREE.Plane();
        this._raycaster = new THREE.Raycaster();
        this._ray = new THREE.Ray();
        // What groundPlaneHit needs of a viewer: the element its events are relative to
        this._surface = { domElement };
        this._upV = new THREE.Vector3(0, 0, 1);
        this._v = [1, 2, 3, 4, 5, 6].map(() => new THREE.Vector3());
        this._q = [1, 2, 3].map(() => new THREE.Quaternion());
        this._prevPosition = new THREE.Vector3();
        this._prevQuaternion = new THREE.Quaternion();

        // Pivot marker, drawn on top
        this.marker = new THREE.Mesh(
            new THREE.SphereGeometry(1, 16, 16),
            new THREE.MeshBasicMaterial({ color: PRIMARY[300], transparent: true, opacity: 0.9, depthTest: false, depthWrite: false })
        );
        this.marker.renderOrder = 999;
        this.marker.visible = false;
        scene.add(this.marker);

        this._handlers = {
            pointerdown: e => this.onPointerDown(e),
            pointermove: e => this.onPointerMove(e),
            pointerup: e => this.onPointerUp(e),
            pointercancel: e => this.onPointerUp(e),
            contextmenu: e => this.onContextMenu(e)
        };
        this._onWheel = e => this.onWheel(e);
        if (options.listen !== false) this.attach();
    }

    // ---- The members Giro3D and the viewer use -----------------------------------------

    /** Input is ignored while false (a measurement being drawn). */
    get enabled() { return this._enabled; }
    set enabled(value) { this._enabled = !!value; }

    /** Where the camera turns around between gestures (orbit, the keys): the target. */
    pivot() {
        return this.target;
    }

    /** No inertia: nothing runs after a gesture. */
    stopAnimation() {}

    /**
     * Giro3D's View.update() calls it before every render: the camera looks at the target,
     * upright on the scene's up. 'change' (a new render) only when that moved the camera, or the
     * scene would render forever.
     */
    update() {
        const { camera } = this;
        this._prevPosition.copy(camera.position);
        this._prevQuaternion.copy(camera.quaternion);
        this._orient();
        this.updateMarker();
        const moved = camera.position.distanceToSquared(this._prevPosition) > 1e-18 * Math.max(1, camera.position.lengthSq())
            || 1 - Math.abs(camera.quaternion.dot(this._prevQuaternion)) > 1e-12;
        if (moved) this.dispatchEvent(CHANGE_EVENT);
    }

    /** The scene's up axis, normalised (a copy). */
    up() {
        const up = this._upV.copy(this.getUp());
        return up.lengthSq() > 1e-24 ? up.normalize() : up.set(0, 0, 1);
    }

    /** The camera's elevation above the ground through the target, seen from it (radians). */
    get tilt() {
        const offset = this._v[5].subVectors(this.camera.position, this.target);
        const d = offset.length();
        return d > 1e-12 ? Math.asin(clamp(offset.dot(this.up()) / d, -1, 1)) : 0;
    }

    /** The direction the camera looks along the ground, clockwise from north (radians). */
    get heading() {
        const { THREE } = this;
        const up = this.up();
        const ahead = this._v[5].subVectors(this.target, this.camera.position).projectOnPlane(up);
        if (ahead.lengthSq() < 1e-18 * Math.max(1, this.camera.position.lengthSq())) {
            // Straight down: the top of the screen
            ahead.set(0, 1, 0).applyQuaternion(this.camera.quaternion).projectOnPlane(up);
        }
        const north = northOf(THREE, up);
        const east = new THREE.Vector3().crossVectors(north, up);
        return Math.atan2(ahead.dot(east), ahead.dot(north));
    }

    // ---- The navigation interface (FR-XC-18) -----------------------------------------

    /**
     * Places the camera: at `position` (kept when absent), looking at `target` (kept when
     * absent), with the field of view `fov` (degrees). The tilt is clamped to the range and the
     * distance to minDistance / maxDistance, the heading kept; a view straight down (no heading)
     * takes it from `up`, the direction at the top of the screen (north up on the globe), else
     * from the camera's own screen up. `save` is the free trackball's: here the pose is always
     * the camera's.
     */
    setPose({ position, target, fov, up } = {}, { save = false } = {}) {
        const { camera } = this;
        const sceneUp = this.up();
        if (target) this.target.copy(target);
        const offset = this._v[0].copy(position ?? camera.position).sub(this.target);
        const distance = offset.length();
        if (distance > 1e-12) {
            const wanted = clamp(distance, this.minDistance || 0, this.maxDistance || Infinity);
            const elevation = Math.asin(clamp(offset.dot(sceneUp) / distance, -1, 1));
            const tilt = clamp(elevation, this.tiltRange.min, this.tiltRange.max);
            const across = this._v[1].copy(offset).projectOnPlane(sceneUp);
            const vertical = across.length() < distance * 1e-9;
            if (vertical || tilt !== elevation || wanted !== distance) {
                if (vertical) {
                    // The camera stands on the other side of the target from the top of the screen
                    const top = this._v[2];
                    if (up) top.copy(up);
                    else top.set(0, 1, 0).applyQuaternion(camera.quaternion);
                    top.projectOnPlane(sceneUp);
                    if (top.lengthSq() < 1e-18) top.copy(northOf(this.THREE, sceneUp));
                    across.copy(top).normalize().negate();
                } else {
                    across.normalize();
                }
                offset.copy(across).multiplyScalar(Math.cos(tilt)).addScaledVector(sceneUp, Math.sin(tilt)).multiplyScalar(wanted);
            }
        }
        camera.position.copy(this.target).add(offset);
        if (typeof fov === 'number' && fov !== camera.fov) {
            camera.fov = fov;
            camera.updateProjectionMatrix();
        }
        this._changed();
        if (save) this.saveState();
    }

    /** The matrices a ray from the camera needs (a render refreshes them too). */
    saveState() {
        this.camera.updateMatrixWorld();
    }

    /**
     * Turns the camera around the pivot: `dx` radians of heading (the camera toward the right of
     * the screen), `dy` radians of tilt (the camera up), within the tilt range.
     */
    orbit(dx, dy) {
        this.rotateAbout(this.target.clone(), dx, dy);
        this._changed();
    }

    /**
     * Pans along the ground, the target with the camera: `dx` view heights (at the target) to
     * the right of the screen, `dy` ahead.
     */
    pan(dx, dy) {
        const { camera } = this;
        const up = this.up();
        const height = 2 * camera.position.distanceTo(this.target) * Math.tan(camera.fov * Math.PI / 360);
        const right = this._v[0].set(1, 0, 0).applyQuaternion(camera.quaternion).projectOnPlane(up);
        if (right.lengthSq() < 1e-18) return;
        right.normalize();
        const ahead = this._v[1].crossVectors(up, right);
        const offset = right.multiplyScalar(dx * height).addScaledVector(ahead, dy * height);
        camera.position.add(offset);
        this.target.add(offset);
        this._changed();
    }

    /**
     * Zooms toward `point` (the target by default): the camera and the target come closer to it,
     * the distance to the target divided by `factor` (above 1: closer), within minDistance and
     * maxDistance. The point stays where it is on the screen; the target stays on the ground.
     */
    zoomAt(point, factor) {
        const { camera } = this;
        const distance = camera.position.distanceTo(this.target);
        if (!(distance > 1e-12) || !(factor > 0)) return;
        const anchor = this._v[0].copy(point ?? this.target);
        const toAnchor = this._v[1].subVectors(anchor, camera.position);
        const far = FAR_ANCHOR * distance;
        if (toAnchor.length() > far) anchor.copy(camera.position).addScaledVector(toAnchor.normalize(), far);
        const ground = this._v[2].copy(this.target);
        const s = clamp(distance / factor, this.minDistance || 0, this.maxDistance || Infinity) / distance;
        camera.position.sub(anchor).multiplyScalar(s).add(anchor);
        this.target.sub(anchor).multiplyScalar(s).add(anchor);
        // The target back on the ground can be farther: _changed() clamps the distance again
        if (this.tiltRange.pole === null) this._groundTarget(ground);
        this._changed();
    }

    /** The field of view (degrees), within minFov and maxFov. */
    setFov(fov) {
        const { camera } = this;
        const value = clamp(fov, this.minFov, this.maxFov);
        if (value !== camera.fov) {
            camera.fov = value;
            camera.updateProjectionMatrix();
        }
        this._changed();
    }

    addEventListener(type, listener) {
        if (!this._listeners.has(type)) this._listeners.set(type, new Set());
        this._listeners.get(type).add(listener);
    }

    removeEventListener(type, listener) {
        const set = this._listeners.get(type);
        if (set) set.delete(listener);
    }

    hasEventListener(type, listener) {
        const set = this._listeners.get(type);
        return !!set && set.has(listener);
    }

    dispatchEvent(event) {
        const set = this._listeners.get(event.type);
        if (!set) return;
        [...set].forEach(listener => listener.call(this, { ...event, target: this }));
    }

    dispose() {
        this.reset();
        this._removers.splice(0).forEach(remove => remove());
        this.scene.remove(this.marker);
        this.marker.geometry.dispose();
        this.marker.material.dispose();
    }

    // ---- Input ---------------------------------------------------------------------------

    /**
     * Registers the element's listeners through `listen(target, type, fn, options)`: its own by
     * default (removed by dispose), or the owner's registry.
     */
    attach(listen = (target, type, fn, options) => {
        target.addEventListener(type, fn, options);
        this._removers.push(() => target.removeEventListener(type, fn, options));
    }) {
        Object.entries(this._handlers).forEach(([type, fn]) => listen(this.domElement, type, fn));
        listen(this.domElement, 'wheel', this._onWheel, { passive: false });
    }

    /** Ends any gesture: no pointer, no marker. */
    reset() {
        this.pointers.clear();
        this.gesture = null;
        this._hideMarker();
    }

    _active() {
        return this._enabled && !!this.canNavigate();
    }

    // 'orbit' or 'pan', from the button map
    _actionFor(e) {
        const { buttons } = this;
        if (e.pointerType !== 'mouse') return buttons.touch;
        if (e.button === 2) return buttons.right;
        if (e.button === 1) return buttons.middle;
        if ((e.ctrlKey || e.metaKey) && buttons.ctrlLeft) return buttons.ctrlLeft;
        return buttons.left;
    }

    /**
     * The ground point under a screen point: where its ray meets the plane through the target
     * perpendicular to the scene up (a new vector, or null).
     */
    groundPoint(clientX, clientY) {
        return groundPlaneHit(this.THREE, this._surface, this.camera, this, { clientX, clientY }, this.up());
    }

    /**
     * Where the ray through a screen point meets `plane`, the ray starting at the gesture's start
     * camera so a pan stays stable while the camera moves (a new vector, or null).
     */
    screenToPlaneFromStart(clientX, clientY, plane) {
        const rect = this.domElement.getBoundingClientRect();
        const ndc = { x: ((clientX - rect.left) / (rect.width || 1)) * 2 - 1, y: -((clientY - rect.top) / (rect.height || 1)) * 2 + 1 };
        this._raycaster.setFromCamera(ndc, this.camera);
        this._ray.direction.copy(this._raycaster.ray.direction);
        this._ray.origin.copy(this.camStart || this._raycaster.ray.origin);
        const hit = this._ray.intersectPlane(plane, this._v[0]);
        return hit ? hit.clone() : null;
    }

    /** A gesture starts at a screen point: the ground plane through the target, the pivot under the point. */
    beginGesture(clientX, clientY) {
        const { camera } = this;
        this.plane.setFromNormalAndCoplanarPoint(this.up(), this.target);
        this.camStart = camera.position.clone();
        this.targetStart = this.target.clone();
        this.gesturePivot = this.groundPoint(clientX, clientY) || this.target.clone();
        this.lastX = clientX;
        this.lastY = clientY;
    }

    midpoint() {
        let x = 0, y = 0;
        this.pointers.forEach(p => { x += p.x; y += p.y; });
        const n = this.pointers.size || 1;
        return { x: x / n, y: y / n };
    }

    spread() {
        const [a, b] = [...this.pointers.values()];
        return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    }

    // The screen angle of the first two pointers (radians, clockwise: the screen's y is down)
    twistAngle() {
        const [a, b] = [...this.pointers.values()];
        return a && b ? Math.atan2(b.y - a.y, b.x - a.x) : 0;
    }

    onPointerDown(e) {
        if (!this._active()) return;
        try { this.domElement.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
        this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, action: this._actionFor(e) });
        if (this.pointers.size === 1) {
            this.dispatchEvent(START_EVENT);
            this.gesture = this.pointers.get(e.pointerId).action;
            this.beginGesture(e.clientX, e.clientY);
        } else if (this.pointers.size === 2) {
            this.gesture = 'twofinger';
            const mid = this.midpoint();
            this.lastDist = this.spread();
            this.lastAngle = this.twistAngle();
            this.beginGesture(mid.x, mid.y);
        }
        e.preventDefault();
    }

    onPointerMove(e) {
        if (!this._active() || !this.pointers.has(e.pointerId)) return;
        Object.assign(this.pointers.get(e.pointerId), { x: e.clientX, y: e.clientY });
        const one = this.pointers.size === 1;
        let moved = true;
        if (this.gesture === 'pan' && one) {
            this.panTo(e.clientX, e.clientY);
        } else if (this.gesture === 'orbit' && one) {
            this.rotateAbout(this.gesturePivot, -(e.clientX - this.lastX) * ROTATE_SPEED, (e.clientY - this.lastY) * ROTATE_SPEED);
            this.lastX = e.clientX;
            this.lastY = e.clientY;
        } else if (this.gesture === 'twofinger' && this.pointers.size >= 2) {
            this.twoFingers();
        } else {
            moved = false;
        }
        if (moved) this._changed();
        e.preventDefault();
    }

    onPointerUp(e) {
        if (!this.pointers.has(e.pointerId)) return;
        try { this.domElement.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
        this.pointers.delete(e.pointerId);
        if (this.pointers.size === 1) {
            // Two fingers down to one: a clean gesture from the remaining finger
            const p = this.pointers.values().next().value;
            this.gesture = p.action;
            this.beginGesture(p.x, p.y);
        } else if (this.pointers.size === 0) {
            this.gesture = null;
            this._hideMarker();
            this.dispatchEvent(END_EVENT);
        }
    }

    // Right-drag pans or orbits: no context menu over the view
    onContextMenu(e) {
        if (this._active()) e.preventDefault();
    }

    onWheel(e) {
        if (!this._active()) return;
        e.preventDefault();
        // Notches, not events: a trackpad sends many small deltas for one gesture, and Firefox
        // reports lines where Chrome reports pixels. Wheel up (negative delta) zooms in.
        const fov = e.shiftKey && this.buttons.shiftWheel === 'fov';
        const action = e.shiftKey && !fov ? this.buttons.shiftWheel : this.buttons.wheel;
        // A browser can turn Shift+wheel into a horizontal scroll
        const notches = wheelNotches(fov ? { deltaMode: e.deltaMode, deltaY: e.deltaY || e.deltaX } : e);
        // No notch (a horizontal swipe): no input, so a flight goes on
        if (!notches) return;
        this.dispatchEvent(START_EVENT);
        if (fov) {
            this.setFov(this.camera.fov * Math.pow(this.scaleFactor, notches));
        } else if (action === 'dolly') {
            this.zoomToward(this.groundPoint(e.clientX, e.clientY) || this.target.clone(), -notches * WHEEL_DOLLY);
            this._changed();
        } else {
            this.zoomAt(this.groundPoint(e.clientX, e.clientY), Math.pow(this.scaleFactor, -notches));
        }
        this.dispatchEvent(END_EVENT);
    }

    // ---- Moves ---------------------------------------------------------------------------

    // Two fingers: their middle orbits (the splat viewer) or pans; their twist turns the heading;
    // their pinch zooms, about the ground point grabbed at the start
    twoFingers() {
        const mid = this.midpoint();
        const dist = this.spread();
        const angle = this.twistAngle();
        const pivot = this.gesturePivot;
        if (this.buttons.twoFinger === 'orbit') {
            this.rotateAbout(pivot, -(mid.x - this.lastX) * ROTATE_SPEED, (mid.y - this.lastY) * ROTATE_SPEED);
            if (this.lastDist > 0 && dist > 0) this.zoomToward(pivot, dist / this.lastDist - 1);
        } else {
            const from = this.groundPoint(this.lastX, this.lastY);
            const to = this.groundPoint(mid.x, mid.y);
            if (from && to) {
                const moved = from.sub(to);
                this.camera.position.add(moved);
                this.target.add(moved);
            }
            if (this.buttons.twist && pivot) {
                // The angle's turn, the shorter way: the fingers turn the ground with them
                const turn = Math.atan2(Math.sin(angle - this.lastAngle), Math.cos(angle - this.lastAngle));
                this.rotateAbout(pivot, turn, 0);
            }
            if (this.lastDist > 0 && dist > 0) this.zoomAt(pivot, dist / this.lastDist);
        }
        this.lastX = mid.x;
        this.lastY = mid.y;
        this.lastDist = dist;
        this.lastAngle = angle;
    }

    // Keeps the ground point grabbed at the start under the pointer
    panTo(clientX, clientY) {
        const hit = this.screenToPlaneFromStart(clientX, clientY, this.plane);
        if (!hit || !this.gesturePivot || !this.camStart) return;
        const moved = this._v[1].subVectors(hit, this.gesturePivot);
        this.camera.position.copy(this.camStart).sub(moved);
        this.target.copy(this.targetStart).sub(moved);
    }

    /**
     * Turns the camera and the target about `pivot`: `yaw` radians about the scene up (the camera
     * toward the right of the screen), `pitch` radians about the view's horizontal (the camera
     * up). With a pole, a pitch past it is dropped (the turn is yaw only); with a range, the pitch
     * stops at its ends, and the target goes back on the ground.
     */
    rotateAbout(pivot, yaw, pitch) {
        if (!pivot) return;
        const { camera, target } = this;
        const up = this.up();
        const [v1, , v3, v4] = this._v;
        const [q1, q2, q3] = this._q;
        const side = this._side(this._v[1]);
        const pole = this.tiltRange.pole;
        const turn = pole === null ? this._clampPitch(pivot, side, pitch) : pitch;
        const q = q3.copy(q1.setFromAxisAngle(up, yaw)).multiply(q2.setFromAxisAngle(side, -turn));
        const offP = v3.subVectors(camera.position, pivot).applyQuaternion(q);
        const offT = v4.subVectors(target, pivot).applyQuaternion(q);
        const newFwd = v1.copy(offT).sub(offP);
        if (pole !== null && newFwd.lengthSq() > 1e-12 && Math.abs(newFwd.normalize().dot(up)) > pole) {
            // Too close to a pole: yaw only
            const qy = q1.setFromAxisAngle(up, yaw);
            offP.subVectors(camera.position, pivot).applyQuaternion(qy);
            offT.subVectors(target, pivot).applyQuaternion(qy);
        }
        camera.position.copy(pivot).add(offP);
        target.copy(pivot).add(offT);
        if (pole === null) this._groundTarget(pivot);
    }

    // Dollies camera and target toward a point; amount > 0 moves closer (the splat viewer's zoom)
    zoomToward(point, amount) {
        if (!point || !amount) return;
        const { camera, target } = this;
        const toPoint = this._v[0].subVectors(point, camera.position);
        const distToPoint = toPoint.length();
        if (distToPoint < 1e-6) return;
        const dir = toPoint.multiplyScalar(1 / distToPoint);
        const distToTarget = camera.position.distanceTo(target) || distToPoint;
        // A cursor near the horizon hits the ground very far away: bound the step by the target distance
        const ref = Math.min(distToPoint, distToTarget * FAR_ANCHOR);
        let step = Math.max(-ref * 0.4, Math.min(ref * 0.4, ref * amount));
        if (step > 0) step = Math.min(step, distToPoint * 0.9);
        camera.position.addScaledVector(dir, step);
        target.addScaledVector(dir, step);
    }

    // The marker follows the pivot at a constant ~8 px radius
    updateMarker() {
        if (this.gesture && this.gesturePivot) {
            this.marker.position.copy(this.gesturePivot);
            this.marker.visible = true;
        }
        if (!this.marker.visible) return;
        const camera = this.camera;
        const h = this.domElement.clientHeight || 1;
        const worldPerPixel = (2 * Math.tan((camera.fov * Math.PI) / 360) * camera.position.distanceTo(this.marker.position)) / h;
        this.marker.scale.setScalar(Math.max(worldPerPixel * 8, 1e-4));
    }

    // ---- Internals -----------------------------------------------------------------------

    // A move ends: in a geo scene the distance within its limits, the camera upright on the
    // target, the marker, a render
    _changed() {
        if (this.tiltRange.pole === null) this._clampDistance();
        this._orient();
        this.updateMarker();
        this.dispatchEvent(CHANGE_EVENT);
    }

    // The camera within minDistance and maxDistance of the target, along the line from the target
    // (the tilt and the heading kept): a turn about the point under the pointer and the target
    // sliding back onto the ground change the distance, whatever the input (FR-VWR-02)
    _clampDistance() {
        const { camera, target } = this;
        const offset = this._v[5].subVectors(camera.position, target);
        const d = offset.length();
        if (!(d > 1e-12)) return;
        const wanted = clamp(d, this.minDistance || 0, this.maxDistance || Infinity);
        if (wanted !== d) camera.position.copy(target).addScaledVector(offset, wanted / d);
    }

    _hideMarker() {
        if (!this.marker.visible) return;
        this.marker.visible = false;
        // A scene that renders on demand must render to hide it
        this.dispatchEvent(CHANGE_EVENT);
    }

    // The camera looks at the target with the scene up up: no roll. Straight down (only a pose
    // from outside), the top of the screen stays where it is.
    _orient() {
        const { camera, target } = this;
        const up = this.up();
        const fwd = this._v[5].subVectors(target, camera.position);
        if (fwd.lengthSq() < 1e-24) {
            camera.up.copy(up);
            return;
        }
        if (Math.abs(fwd.normalize().dot(up)) > 1 - 1e-12) {
            camera.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
            camera.lookAt(target);
        } else {
            camera.up.copy(up);
            camera.lookAt(target);
        }
        camera.up.copy(up);
        camera.updateMatrixWorld();
    }

    // The view's horizontal (unit): the camera's right, level
    _side(out) {
        const up = this.up();
        const fwd = this._v[5].subVectors(this.target, this.camera.position);
        out.crossVectors(fwd, up);
        if (out.lengthSq() < 1e-12 * Math.max(1, fwd.lengthSq())) out.set(1, 0, 0).applyQuaternion(this.camera.quaternion).projectOnPlane(up);
        if (out.lengthSq() < 1e-24) out.set(1, 0, 0);
        return out.normalize();
    }

    // How far out of the tilt range a pitch of the camera and the target about `side` through
    // `pivot` would take them, as `out` = [the view's depression, the camera's elevation above
    // the ground through the pivot, seen from it] (radians; 0 inside). The depression is
    // measured from the view's heading, so a view turned past straight down is out of range too.
    _overshoot(pivot, side, pitch, out) {
        const { camera, target } = this;
        const up = this.up();
        const { min, max } = this.tiltRange;
        const q = this._q[0].setFromAxisAngle(side, -pitch);
        const cam = this._v[2].subVectors(camera.position, pivot).applyQuaternion(q);
        const fwd = this._v[3].subVectors(target, pivot).applyQuaternion(q).sub(cam);
        const ahead = this._v[4].crossVectors(up, side);
        const over = x => Math.max(0, min - x) + Math.max(0, x - max);
        out[0] = fwd.lengthSq() > 1e-24 ? over(Math.atan2(-fwd.dot(up), fwd.dot(ahead))) : 0;
        const d = cam.length();
        out[1] = d > 1e-12 ? over(Math.asin(clamp(cam.dot(up) / d, -1, 1))) : 0;
        return out;
    }

    // The part of `pitch` that keeps the tilt in range (or, out of it, takes it no farther out).
    // Each limit on its own: the distance clamp can leave the camera's elevation above a pivot
    // out of range, and a pitch that brings it back must not take the view out instead.
    _clampPitch(pivot, side, pitch) {
        if (!pitch) return 0;
        const start = this._overshoot(pivot, side, 0, [0, 0]).map(x => x + 1e-12);
        const at = [0, 0];
        const fits = p => {
            this._overshoot(pivot, side, p, at);
            return at[0] <= start[0] && at[1] <= start[1];
        };
        if (fits(pitch)) return pitch;
        let lo = 0, hi = 1;
        for (let i = 0; i < 40; i++) {
            const mid = (lo + hi) / 2;
            if (fits(mid * pitch)) lo = mid;
            else hi = mid;
        }
        return lo * pitch;
    }

    // The target slides along the view's centre ray onto the ground through `ground` (the view
    // is the same): a turn about an off-centre pivot or a zoom at the horizon lifts it off
    _groundTarget(ground) {
        const { camera, target } = this;
        const up = this.up();
        const dir = this._v[4].subVectors(target, camera.position);
        const along = dir.dot(up);
        if (Math.abs(along) < 1e-12) return;
        const t = (ground.clone().sub(camera.position).dot(up)) / along;
        if (t > 0) target.copy(camera.position).addScaledVector(dir, t);
    }
}

/** North on the ground of a point whose vertical is `up`: Z (the globe) or Y (a Z-up flat scene) along it. */
export function northOf(THREE, up) {
    const north = new THREE.Vector3(0, 0, 1).projectOnPlane(up);
    if (north.lengthSq() < 1e-6) north.set(0, 1, 0).projectOnPlane(up);
    return north.normalize();
}
