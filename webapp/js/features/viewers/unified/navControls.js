/**
 * navControls - the navigation of every scene of the unified viewer: the one of the bm3d viewer
 * (modelStage), three.js ArcballControls with their defaults and hidden gizmos.
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
 * the view), and whatever moves the camera from outside goes through aimCamera, which keeps
 * camera.up the up of the screen too. The scene's own up axis is never camera.up: the scene keeps it.
 */

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

/**
 * Builds the navigation control of a scene.
 *
 * @param libs - { ArcballControls } of the viewer's three.js build.
 * @param camera - the camera to control (its up is kept).
 * @param domElement - the element to listen to.
 * @param scene - the three.js scene the hidden gizmos join (their matrix follows the renders).
 * @returns the ArcballControls.
 */
export function createNavControls(libs, camera, domElement, scene) {
    const up = camera.up.clone();
    camera.up.set(0, 1, 0);
    const controls = new libs.ArcballControls(camera, domElement, scene);
    camera.up.copy(up);
    controls.setGizmosVisible(false);
    // The double-click focus is the viewer's (createDoubleClickRecenter): the controls' own one
    // ray-casts meshes only, so it would miss point clouds
    controls.enableFocus = false;
    return controls;
}

/** The up of the screen of a camera with orientation `quaternion` (its own Y axis in the world). */
export function screenUp(quaternion, out) {
    return out.set(0, 1, 0).applyQuaternion(quaternion);
}

/**
 * Points a camera placed from outside at the target of its controls, with `worldUp` up on the
 * screen, and gives that pose to the controls (the pivot moves to the target; the camera state
 * their next clamp of the distance starts from is this one). `worldUp` must not be along the
 * view direction (a view straight down gives the direction of the top of the screen).
 */
export function aimCamera(camera, controls, worldUp) {
    camera.up.copy(worldUp);
    camera.lookAt(controls.target);
    screenUp(camera.quaternion, camera.up);
    camera.updateMatrix();
    controls.updateMatrixState();
    controls.update();
    // The controls read the pivot's matrix, which only a render refreshes
    controls._gizmos?.updateMatrix();
    controls.updateMatrixState();
}

/** Where the controls rotate around: their target only until a pan moves the pivot. */
export function navPivot(controls) {
    return controls._gizmos?.position ?? controls.target;
}

/** Stops the inertia of the controls (before a flight of the viewer's own). */
export function stopNavAnimation(controls) {
    if (controls._animationId === undefined || controls._animationId === -1) return;
    cancelAnimationFrame(controls._animationId);
    controls._animationId = -1;
    controls._timeStart = -1;
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
// relative to (the splat viewer's earth controls use it for the point under the pointer too).
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
// the splat viewer's field of view).
export function createCameraTweener() {
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
            controls.update();
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
