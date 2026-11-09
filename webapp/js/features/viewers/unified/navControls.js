/**
 * navControls - the navigation of the scenes of the unified viewer. Two strategies (D-019),
 * picked once per scene by the loader that builds it (D-001): geo scenes (a georeferenced
 * orthophoto, DEM, vector, point cloud or 3D Tiles set) get the constrained orbit
 * (constrainedOrbit.js: the heading about the scene's up axis, the tilt between 5° and 89°, the
 * ground always below); the others, 3D models included, get the free trackball of the bm3d viewer
 * (modelStage), three.js ArcballControls with their defaults and hidden gizmos:
 *
 *  - left-drag rotates freely around the pivot (a trackball, with inertia);
 *  - right-drag or Ctrl+left-drag pans in the screen plane, the pivot with it;
 *  - the wheel and middle-drag zoom to the pivot (x1.1 a notch); Shift+wheel changes the field
 *    of view;
 *  - a double-click focuses on the clicked point: it becomes the pivot, in the middle of the
 *    view, x1.1 closer (the focus of ArcballControls, picked with Giro3D so that it lands on
 *    point clouds and map tiles too; see createDoubleClickRecenter).
 *
 * Registering the control with `instance.view.setControls()` is mandatory, not cosmetic: Giro3D's
 * View.update() calls its update() every frame and forwards its 'change' events as
 * notifyChange(camera), which is what keeps 3D Tiles and point clouds streaming.
 *
 * camera.up: ArcballControls keep it as the up of the screen once they rotated (their initial
 * camera.up turned by the camera's rotation), and their every update() is a lookAt with it. So
 * that initial up is the camera's own Y (a Z-up one would end along the view direction and spin
 * the view), and whatever moves the camera from outside goes through setPose, which keeps
 * camera.up the up of the screen too. The scene's own up axis is never camera.up: the scene keeps it.
 *
 * One navigation interface, whatever the strategy (FR-XC-18, D-019): orbit, pan, zoomAt, setFov,
 * setPose, saveState, dispose. Home, the double-click focus, the tweens and the keys move the
 * camera only through it. The strategy is also what Giro3D's view.setControls() registers: it
 * has a target, enabled, update(), minDistance / maxDistance, scaleFactor, pivot(),
 * stopAnimation() and the event listener methods. 'start' and 'end' come only from the pointer,
 * the wheel and touch; the interface methods fire 'change' only.
 */
import { ConstrainedOrbit } from './constrainedOrbit';

const NAV = {
    // Fractions of the framed scene size (see applySceneMetrics).
    minDistanceFactor: 0.02,
    maxDistanceFactor: 20,
    // Globe scenes must stay zoomable out to continent scale to be readable, so they get a far
    // looser ceiling than a bounded flat scene.
    globeMaxDistanceFactor: 2000,
    // A double-click focus and the flight Home
    dblClickDurationMs: 600
};

// Chrome reports deltaMode 0 (pixels) with ~100 units/notch; Firefox reports deltaMode 1 (lines)
// with ~3 units/notch. Normalizing both to +/-1 per notch (the splat viewer's earth controls).
function wheelNotches(event) {
    if (event.deltaMode === 1) return Math.sign(event.deltaY) * Math.min(Math.abs(event.deltaY), 1);
    if (event.deltaMode === 2) return Math.sign(event.deltaY);
    return Math.sign(event.deltaY) * Math.min(Math.abs(event.deltaY) / 100, 1);
}

/** The up of the screen of a camera with orientation `quaternion` (its own Y axis in the world). */
export function screenUp(quaternion, out) {
    return out.set(0, 1, 0).applyQuaternion(quaternion);
}

// Cancels the inertia (or the focus animation) an ArcballControls runs on animation frames
function stopArcballAnimation(arcball) {
    if (arcball._animationId === undefined || arcball._animationId === -1) return;
    cancelAnimationFrame(arcball._animationId);
    arcball._animationId = -1;
    arcball._timeStart = -1;
}

const CHANGE_EVENT = { type: 'change' };
const START_EVENT = { type: 'start' };
const END_EVENT = { type: 'end' };

/**
 * The free trackball (D-019): the ArcballControls of the bm3d viewer (modelStage) with their
 * defaults and hidden gizmos, behind the navigation interface. The pointer and touch are the
 * ArcballControls' own; its events reach the listeners of the strategy. The wheel is the
 * strategy's (FR-XC-18): a notch (100 px in Chrome, where ArcballControls count 125) zooms to the
 * pivot through zoomAt, Shift+wheel changes the field of view through setFov.
 *
 * ArcballControls move the camera from a matrix state they take at the start of a gesture
 * (camera.matrix and the gizmos' matrix, which only a render refreshes): every move from outside
 * ends with saveState(), so that the next gesture starts from the camera's real pose.
 */
export class FreeTrackball {
    /**
     * @param libs - { ArcballControls } of the viewer's three.js build.
     * @param camera - the camera to control (its up is kept).
     * @param domElement - the element to listen to.
     * @param scene - the three.js scene the hidden gizmos join.
     */
    constructor(libs, camera, domElement, scene) {
        this.kind = 'free';
        this.camera = camera;
        const up = camera.up.clone();
        camera.up.set(0, 1, 0);
        const arcball = new libs.ArcballControls(camera, domElement, scene);
        camera.up.copy(up);
        arcball.setGizmosVisible(false);
        // The double-click focus is the viewer's (createDoubleClickRecenter): the controls' own one
        // ray-casts meshes only, so it would miss point clouds
        arcball.enableFocus = false;
        // The wheel is onWheel's: ArcballControls keep middle-drag zoom and Shift+middle-drag
        arcball.unsetMouseAction('WHEEL');
        arcball.unsetMouseAction('WHEEL', 'SHIFT');
        this.arcball = arcball;
        this.domElement = domElement;
        // The state of ArcballControls between gestures (they start idle)
        this._idleState = arcball._state;
        this._onWheel = e => this.onWheel(e);
        domElement.addEventListener('wheel', this._onWheel, { passive: false });
        // Scratch values (no three.js import here: the camera's own types are cloned)
        this._position = camera.position.clone();
        this._target = camera.position.clone();
        this._offset = camera.position.clone();
        this._axis = camera.position.clone();
        this._up = camera.position.clone();
        this._quaternion = camera.quaternion.clone();
        this._turn = camera.quaternion.clone();
    }

    /** What the camera looks at; the pivot follows it at the next update. */
    get target() { return this.arcball.target; }

    get enabled() { return this.arcball.enabled; }
    set enabled(value) { this.arcball.enabled = value; }

    get minDistance() { return this.arcball.minDistance; }
    set minDistance(value) { this.arcball.minDistance = value; }

    get maxDistance() { return this.arcball.maxDistance; }
    set maxDistance(value) { this.arcball.maxDistance = value; }

    /** The zoom of a wheel notch (and of the double-click focus). */
    get scaleFactor() { return this.arcball.scaleFactor; }

    /** Where the camera turns around: the target only until a pan moves the pivot. */
    pivot() {
        return this.arcball._gizmos.position;
    }

    /** Stops the inertia (before a flight of the viewer's own). */
    stopAnimation() {
        stopArcballAnimation(this.arcball);
    }

    /**
     * Giro3D's View.update() calls it before every render: the distance clamp and the look at
     * the pivot of the ArcballControls. 'change' (a new render) only when that moved the camera,
     * or the scene would render forever.
     */
    update() {
        const { camera } = this;
        this._position.copy(camera.position);
        this._quaternion.copy(camera.quaternion);
        this.arcball.update();
        const moved = camera.position.distanceToSquared(this._position) > 1e-18 * Math.max(1, camera.position.lengthSq())
            || 1 - Math.abs(camera.quaternion.dot(this._quaternion)) > 1e-12;
        if (moved) this.dispatchEvent(CHANGE_EVENT);
    }

    /**
     * Places the camera: at `position` (kept when absent), looking at `target` (the pivot when
     * absent), with `up` up on the screen (the current screen up when absent; it must not be
     * along the view direction) and the field of view `fov` (degrees). The pivot moves to the
     * target. `save` gives the pose to the ArcballControls (saveState): the end of every move,
     * so that the next gesture starts from it; the steps of a tween leave it for the last one.
     */
    setPose({ position, target, fov, up } = {}, { save = false } = {}) {
        const { camera, arcball } = this;
        this._target.copy(target ?? this.pivot());
        arcball.target.copy(this._target);
        // update() moves the pivot to the target when the target changes: after a pan the pivot
        // left a target that stayed, so it must follow even when the target is that one again
        if (!arcball._gizmos.position.equals(arcball.target)) arcball._currentTarget.copy(arcball._gizmos.position);
        if (position) camera.position.copy(position);
        if (up) camera.up.copy(up);
        if (typeof fov === 'number' && fov !== camera.fov) {
            camera.fov = fov;
            camera.updateProjectionMatrix();
        }
        camera.lookAt(arcball.target);
        screenUp(camera.quaternion, camera.up);
        if (save) {
            // The distance clamp of the update starts from this pose
            this.saveState();
        }
        arcball.update();
        if (save) this.saveState();
        this.dispatchEvent(CHANGE_EVENT);
    }

    /**
     * Gives the camera's pose to the ArcballControls: the matrices only a render refreshes
     * (the camera's, the pivot's), then the state their next gesture starts from.
     */
    saveState() {
        this.camera.updateMatrix();
        this.arcball._gizmos.updateMatrix();
        this.arcball.updateMatrixState();
    }

    /**
     * Turns the camera around the pivot: `dx` radians toward the right of the screen, `dy`
     * toward its top.
     */
    orbit(dx, dy) {
        const { camera } = this;
        const pivot = this.pivot().clone();
        const up = screenUp(camera.quaternion, this._up);
        const right = this._axis.set(1, 0, 0).applyQuaternion(camera.quaternion);
        // Rotating the camera's back (+Z) about its up moves it right; about its right, down
        this._turn.setFromAxisAngle(right, -dy);
        this._quaternion.setFromAxisAngle(up, dx).multiply(this._turn);
        const offset = this._offset.copy(camera.position).sub(pivot).applyQuaternion(this._quaternion);
        up.applyQuaternion(this._quaternion);
        this.setPose({ position: offset.add(pivot), target: pivot, up }, { save: true });
    }

    /**
     * Pans in the screen plane, the pivot with the camera: `dx` view heights (at the pivot) to
     * the right, `dy` up.
     */
    pan(dx, dy) {
        const { camera } = this;
        const pivot = this.pivot().clone();
        const height = 2 * camera.position.distanceTo(pivot) * Math.tan(camera.fov * Math.PI / 360);
        const offset = this._offset.set(1, 0, 0).applyQuaternion(camera.quaternion).multiplyScalar(dx * height)
            .add(screenUp(camera.quaternion, this._up).multiplyScalar(dy * height));
        this.setPose({ position: camera.position.clone().add(offset), target: pivot.add(offset) }, { save: true });
    }

    /**
     * Zooms toward `point` (the pivot by default): the camera and the pivot come closer to it,
     * the distance to the pivot divided by `factor` (above 1: closer), within minDistance and
     * maxDistance. The point stays where it is on the screen.
     */
    zoomAt(point, factor) {
        const { camera } = this;
        const pivot = this.pivot().clone();
        const anchor = (point ?? pivot).clone();
        const distance = camera.position.distanceTo(pivot);
        if (!(distance > 1e-12) || !(factor > 0)) return;
        const wanted = Math.min(Math.max(distance / factor, this.minDistance || 0), this.maxDistance || Infinity);
        const s = wanted / distance;
        const position = camera.position.clone().sub(anchor).multiplyScalar(s).add(anchor);
        this.setPose({ position, target: pivot.sub(anchor).multiplyScalar(s).add(anchor) }, { save: true });
    }

    /** The field of view (degrees), within the limits of the ArcballControls. */
    setFov(fov) {
        const { minFov = 0, maxFov = 180 } = this.arcball;
        this.setPose({ fov: Math.min(Math.max(fov, minFov), maxFov) }, { save: true });
    }

    addEventListener(type, listener) {
        this.arcball.addEventListener(type, listener);
    }

    removeEventListener(type, listener) {
        this.arcball.removeEventListener(type, listener);
    }

    hasEventListener(type, listener) {
        return this.arcball.hasEventListener(type, listener);
    }

    dispatchEvent(event) {
        this.arcball.dispatchEvent(event);
    }

    /**
     * A wheel notch zooms to the pivot (x scaleFactor), Shift+wheel changes the field of view
     * (the tangent of its half x scaleFactor, the step of ArcballControls; a notch down widens
     * it, as the constrained orbit). Wheel up (a negative delta) zooms in.
     */
    onWheel(e) {
        const { arcball } = this;
        if (!arcball.enabled) return;
        e.preventDefault();
        const fov = !!e.shiftKey;
        // A browser can turn Shift+wheel into a horizontal scroll
        const notches = wheelNotches(fov ? { deltaMode: e.deltaMode, deltaY: e.deltaY || e.deltaX } : e);
        // No notch (a horizontal swipe): no input, so a flight goes on
        if (!notches) return;
        // The inertia would turn the camera back to the pose it started from; a drag in
        // progress starts again from the zoomed pose at its next move, as after the wheel of
        // ArcballControls
        this.stopAnimation();
        arcball._state = this._idleState;
        this.dispatchEvent(START_EVENT);
        if (fov) {
            const tan = Math.tan(this.camera.fov * Math.PI / 360) * Math.pow(this.scaleFactor, notches);
            this.setFov(Math.atan(tan) * 360 / Math.PI);
        } else {
            this.zoomAt(undefined, Math.pow(this.scaleFactor, -notches));
        }
        this.dispatchEvent(END_EVENT);
    }

    dispose() {
        this.domElement.removeEventListener('wheel', this._onWheel);
        this.arcball.dispose();
    }
}

// The strategies of D-019 by name. Read when a scene is built: constrainedOrbit.js imports this
// module's helpers, so its class may not exist yet while this module is first evaluated.
const STRATEGIES = { free: () => FreeTrackball, constrained: () => ConstrainedOrbit };

/**
 * Builds the navigation strategy of a scene, the one object Home, the focus, the tweens and the
 * keys move the camera through (FR-XC-18). Picked once: the scene keeps it until it is rebuilt.
 *
 * @param libs - { THREE, ArcballControls } of the viewer's three.js build.
 * @param camera - the camera to control.
 * @param domElement - the element to listen to.
 * @param scene - the three.js scene the hidden gizmos (or the pivot marker) join.
 * @param options - { strategy: 'free' | 'constrained', getUp: () => the scene's up axis, read at
 *   every use }; the constrained orbit gets the tilt range and the buttons of the unified
 *   viewer's geo scenes (GEO_TILT, GEO_BUTTONS) unless `tilt` / `buttons` say otherwise.
 * @returns the strategy.
 */
export function createNavControls(libs, camera, domElement, scene, options = {}) {
    const Strategy = (STRATEGIES[options.strategy] || STRATEGIES.free)();
    return new Strategy(libs, camera, domElement, scene, options);
}

/** Where the controls rotate around: their target only until a pan moves the pivot. */
export function navPivot(controls) {
    return typeof controls.pivot === 'function' ? controls.pivot() : controls.target;
}

/** Stops the inertia of the controls (before a flight of the viewer's own). */
export function stopNavAnimation(controls) {
    if (typeof controls.stopAnimation === 'function') controls.stopAnimation();
    else stopArcballAnimation(controls);
}

/**
 * The onStep of a camera tween (createCameraTweener) to an orientation and a distance from the
 * pivot: the camera turns around the target the tween moves (its orientation slerped, its
 * distance lerped), so it never passes through the data or below the minimum distance, and ends
 * looking at the target with `quaternion`. Call it once the controls' target is the pivot
 * (navPivot), before the tween starts.
 */
export function orbitTweenStep(THREE, camera, controls, quaternion, distance) {
    const fromQuaternion = camera.quaternion.clone();
    const fromDistance = camera.position.distanceTo(controls.target);
    const q = new THREE.Quaternion();
    const back = new THREE.Vector3();
    return e => {
        q.slerpQuaternions(fromQuaternion, quaternion, e);
        const d = fromDistance + (distance - fromDistance) * e;
        // A camera looks down its -Z: it stands on its +Z from what it looks at
        camera.position.copy(controls.target).add(back.set(0, 0, 1).applyQuaternion(q).multiplyScalar(d));
        screenUp(q, camera.up);
    };
}

/**
 * Where the focus on `point` takes the camera, as ArcballControls focus: the camera moves with
 * the pivot to the point (the view direction kept) and comes closer by the controls' scale
 * factor, never nearer than their minimum distance.
 */
export function focusPosition(camera, controls, point) {
    const offset = camera.position.clone().sub(navPivot(controls));
    const distance = offset.length();
    if (distance < 1e-12) return point.clone();
    const wanted = Math.max(distance / (controls.scaleFactor || 1), controls.minDistance || 0);
    return offset.multiplyScalar(wanted / distance).add(point);
}

/**
 * Sets distance limits proportional to the framed scene so the camera can neither pass through the
 * pivot to an inverted view nor scroll out past the far plane and lose the data.
 *
 * @param controls - the control to tune.
 * @param sceneSize - the greatest dimension of the framed scene, in scene units.
 * @param maxDistanceFactor - override for scenes that must stay zoomable far out (see NAV).
 */
export function applySceneMetrics(controls, sceneSize, maxDistanceFactor = NAV.maxDistanceFactor) {
    const size = sceneSize || 1;
    controls.minDistance = size * NAV.minDistanceFactor;
    controls.maxDistance = size * maxDistanceFactor;
}

// Ground-plane fallback for the double-click focus, used when the click misses all geometry
// (empty sky, gaps in a sparse point cloud). The plane goes through the pivot, perpendicular to
// `up` (camera.up by default): the scene's up axis, which is the world Z in a flat scene and the
// local vertical in an ECEF globe scene. `instance` only needs the `domElement` the event is
// relative to (the constrained orbit uses it for the point under the pointer too).
export function groundPlaneHit(THREE, instance, camera, controls, event, up = camera.up) {
    const domElement = instance.domElement;
    const rect = domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;

    const ndc = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, camera);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(up, navPivot(controls));
    const hit = new THREE.Vector3();
    return raycaster.ray.intersectPlane(plane, hit) ? hit.clone() : null;
}

/**
 * Wires a double-click handler onto instance.domElement that focuses on the clicked surface,
 * picked via Giro3D's own raycaster (instance.pickObjectsAt) so it lands on the actual data
 * (meshes, points, map tiles); falls back to the ground plane perpendicular to `getUp()` on a
 * miss. `shouldHandle` lets the caller suppress it while a measurement tool is armed. Returns a
 * disposer.
 */
export function createDoubleClickRecenter(libs, instance, camera, controls, shouldHandle, onFly, getUp = () => camera.up) {
    const { THREE } = libs;
    const onDoubleClick = event => {
        if (!shouldHandle()) return;
        const results = instance.pickObjectsAt(event, { sortByDistance: true, limit: 1 });
        const point = (results && results.length > 0)
            ? results[0].point.clone()
            : groundPlaneHit(THREE, instance, camera, controls, event, getUp());
        if (point) onFly(point);
    };
    instance.domElement.addEventListener('dblclick', onDoubleClick);
    return () => instance.domElement.removeEventListener('dblclick', onDoubleClick);
}

/** Cubic ease in and out of a progress t (0..1): the one easing of every camera flight. */
export function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// rAF-driven position+target tween (no tween dependency). Camera/controls are passed per call
// (not bound at construction) since the viewer rebuilds its Giro3D scene, and therefore the
// camera, on every entry load. Cancels any tween already in flight so a second dbl-click / Home
// press before the first one finishes retargets smoothly. `onStep(e)` (optional) is told the eased
// progress after each step, for what the tween does not move itself (the orientation of an orbit,
// the splat viewer's field of view). Controls with setPose (a navigation strategy) get every step
// through it, the last one saved (the next gesture starts from the end of the flight); other
// controls (the splat viewer's) are updated. `onFrame(e)` (optional) runs after every step: a
// Giro3D scene renders on demand, so it asks for the render there.
export function createCameraTweener({ onFrame } = {}) {
    let rafId = null;

    function stop() {
        if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    }

    function tweenTo(camera, controls, targetPosition, targetTarget, durationMs, onDone, onStep) {
        stop();
        const startPosition = camera.position.clone();
        const startTarget = controls.target.clone();
        const start = performance.now();

        const step = now => {
            const t = Math.min(1, (now - start) / durationMs);
            const e = easeInOutCubic(t);
            camera.position.lerpVectors(startPosition, targetPosition, e);
            controls.target.lerpVectors(startTarget, targetTarget, e);
            if (onStep) onStep(e);
            if (typeof controls.setPose === 'function') {
                controls.setPose({ position: camera.position, target: controls.target }, { save: t >= 1 });
            } else {
                controls.update();
            }
            if (onFrame) onFrame(e);
            if (t < 1) {
                rafId = requestAnimationFrame(step);
            } else {
                rafId = null;
                if (onDone) onDone();
            }
        };
        rafId = requestAnimationFrame(step);
    }

    return { tweenTo, stop };
}

export { NAV, wheelNotches };
