/**
 * navControls - the single navigation control used by every scene of the unified viewer.
 *
 * One three.js OrbitControls serves flat (local/projected CRS) and globe (EPSG:4978 ECEF) scenes
 * alike: left-drag rotates around a stable pivot, so the model spins in place instead of sliding
 * sideways - the Potree Orbit / Giro3D 3D Tiles viewer behaviour. The pivot only moves when the
 * user asks for it (pan, zoom-to-cursor, double-click re-centre), never implicitly at the start of
 * a rotation, which is what made successive drags disagree about where the model was.
 *
 * Every OrbitControls default that fights a 3D viewer is overridden here: the mouse button mapping
 * (three's "map" preset is LEFT=pan / RIGHT=rotate, backwards for orbiting an object), the damping
 * factor (three's 0.05 default takes ~1s to settle) and the wheel delta normalization (Firefox
 * sends a ~48x smaller raw delta than Chrome for the same physical notch).
 *
 * Registering the returned control with `instance.view.setControls()` is mandatory, not cosmetic:
 * Giro3D's View.update() calls its update() every frame - which is what makes damping work - and
 * forwards its 'change' events as notifyChange(camera), which is what keeps a 3D Tiles set
 * streaming. No external requestAnimationFrame pump is needed.
 *
 * Tuning: dampingFactor applies a fraction `d` of the pending rotation/pan per update() and decays
 * the remainder by `(1-d)`; updates to settle to 95% = ln(0.05)/ln(1-d). d=0.05 (three's default)
 * needs ~58 updates (~1s @60Hz) - sluggish. d=0.45 needs ~5 updates (~80ms), close to Potree's
 * feel (Potree applies its full per-frame delta and coasts down over ~50ms instead).
 */

const NAV = {
    dampingFactor: 0.45,
    zoomSpeed: 2.0,
    rotateSpeed: 1.0,
    panSpeed: 1.0,
    keyPanSpeed: 14,
    // Fractions of the framed scene size (see applySceneMetrics).
    minDistanceFactor: 0.02,
    maxDistanceFactor: 20,
    // Globe scenes must stay zoomable out to continent scale to be readable, so they get a far
    // looser ceiling than a bounded flat scene.
    globeMaxDistanceFactor: 2000,
    dblClickDurationMs: 600
};

// Chrome reports deltaMode 0 (pixels) with ~100 units/notch; Firefox reports deltaMode 1 (lines)
// with ~3 units/notch. Normalizing both to +/-1 per notch keeps zoomSpeed meaningful everywhere.
function wheelNotches(event) {
    if (event.deltaMode === 1) return Math.sign(event.deltaY) * Math.min(Math.abs(event.deltaY), 1);
    if (event.deltaMode === 2) return Math.sign(event.deltaY);
    return Math.sign(event.deltaY) * Math.min(Math.abs(event.deltaY) / 100, 1);
}

// Marks a wheel event as already-normalized so re-dispatching it below does not recurse.
const NORMALIZED = Symbol('nav-controls-normalized-wheel');

// Intercepts the raw wheel event in the capture phase (which always runs before OrbitControls'
// own bubble-phase listener added in connect()) and replaces it with a synthetic one carrying a
// browser-independent deltaY/deltaMode, so controls.zoomSpeed means the same thing everywhere.
function normalizeWheel(domElement) {
    const onWheel = event => {
        if (event[NORMALIZED]) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const notches = wheelNotches(event);
        if (notches === 0) return;
        const synthetic = new WheelEvent('wheel', {
            clientX: event.clientX, clientY: event.clientY,
            deltaY: notches * 100, deltaMode: 0,
            bubbles: true, cancelable: true
        });
        synthetic[NORMALIZED] = true;
        domElement.dispatchEvent(synthetic);
    };
    domElement.addEventListener('wheel', onWheel, { capture: true, passive: false });
    return () => domElement.removeEventListener('wheel', onWheel, { capture: true });
}

/**
 * Builds the single navigation control, used unchanged by flat and globe scenes.
 *
 * IMPORTANT: three.js OrbitControls bakes the camera's up axis into a compensation quaternion ONCE
 * in its constructor and never recomputes it, so `camera.up` must already hold its final value
 * when this runs. Flat scenes satisfy that in setupInstance (up is the constant (0,0,1)); globe
 * scenes must call this from frameGlobe instead, where the local ellipsoid normal first becomes
 * known from the dataset extent.
 *
 * @param libs - the viewer's loaded library bundle ({ THREE, OrbitControls }).
 * @param camera - the camera to control; camera.up must already be final.
 * @param domElement - the element to listen to.
 * @returns the configured OrbitControls, with dispose() extended to undo the wheel normalizer
 * and the key-event listener.
 */
export function createNavControls(libs, camera, domElement) {
    const { THREE, OrbitControls } = libs;

    const controls = new OrbitControls(camera, domElement);
    controls.enableDamping = true;
    controls.dampingFactor = NAV.dampingFactor;
    controls.rotateSpeed = NAV.rotateSpeed;
    controls.panSpeed = NAV.panSpeed;
    controls.keyPanSpeed = NAV.keyPanSpeed;
    controls.zoomSpeed = NAV.zoomSpeed;
    // Deliberately off, unlike three's default-off-but-we-want-it instinct: zoom-to-cursor rewrites
    // `target` to where the cursor ray meets the ground plane on EVERY wheel notch, so zooming in a
    // few times with the pointer off the model's centre line silently moves the rotation axis away
    // from it - after which a left-drag swings the model around an off-centre axis instead of
    // spinning it in place. Dollies toward the pivot instead, which is what the Giro3D 3D Tiles
    // viewers do (plain MapControls leaves this off); double-click is the explicit way to move the
    // pivot onto the data.
    controls.zoomToCursor = false;
    // Unconstrained pitch, the Potree Orbit parity: inspecting an underside must not require
    // leaving the mode. Giro3D scenes are Z-up and OrbitControls measures the polar angle from
    // camera.up, so this spans the full sphere around the pivot in any scene.
    controls.minPolarAngle = 0;
    controls.maxPolarAngle = Math.PI;
    // Pan slides along the plane through the pivot perpendicular to camera.up: the ground plane in
    // a flat scene, the local horizontal plane in an ECEF one. That single rule is what makes the
    // same control read correctly in both, where screenSpacePanning=true would tilt the pivot off
    // the ground on every drag.
    controls.screenSpacePanning = false;
    controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    controls.listenToKeyEvents(domElement);

    const removeWheelNormalizer = normalizeWheel(domElement);

    const disposeControls = controls.dispose.bind(controls);
    controls.dispose = () => {
        removeWheelNormalizer();
        controls.stopListenToKeyEvents();
        disposeControls();
    };

    return controls;
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

// Ground-plane fallback for double-click recentring, used when the click misses all geometry
// (empty sky, gaps in a sparse point cloud). The plane is the one through the pivot perpendicular
// to the camera's up axis, which is the world XY plane in a flat scene and the local horizontal
// plane in an ECEF globe scene.
function groundPlaneHit(THREE, instance, camera, controls, event) {
    const domElement = instance.domElement;
    const rect = domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;

    const ndc = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, camera);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camera.up, controls.target);
    const hit = new THREE.Vector3();
    return raycaster.ray.intersectPlane(plane, hit) ? hit.clone() : null;
}

/**
 * Wires a double-click handler onto instance.domElement that flies the camera+pivot to the
 * clicked surface, picked via Giro3D's own raycaster (instance.pickObjectsAt) so it lands on the
 * actual model rather than an abstract ground plane; falls back to the ground plane on a miss.
 * This is the only way the rotation pivot is ever re-aimed at the data, so `shouldHandle` lets the
 * caller suppress it while a measurement tool is armed. Returns a disposer.
 */
export function createDoubleClickRecenter(libs, instance, camera, controls, shouldHandle, onFly) {
    const { THREE } = libs;
    const onDoubleClick = event => {
        if (!shouldHandle()) return;
        const results = instance.pickObjectsAt(event, { sortByDistance: true, limit: 1 });
        const point = (results && results.length > 0)
            ? results[0].point.clone()
            : groundPlaneHit(THREE, instance, camera, controls, event);
        if (point) onFly(point);
    };
    instance.domElement.addEventListener('dblclick', onDoubleClick);
    return () => instance.domElement.removeEventListener('dblclick', onDoubleClick);
}

// rAF-driven position+target tween (no tween dependency). Camera/controls are passed per call
// (not bound at construction) since the viewer rebuilds its Giro3D scene, and therefore the
// camera, on every entry load. Cancels any tween already in flight so a second dbl-click / Home
// press before the first one finishes retargets smoothly.
export function createCameraTweener() {
    let rafId = null;

    function easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    function stop() {
        if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    }

    function tweenTo(camera, controls, targetPosition, targetTarget, durationMs, onDone) {
        stop();
        const startPosition = camera.position.clone();
        const startTarget = controls.target.clone();
        const start = performance.now();

        const step = now => {
            const t = Math.min(1, (now - start) / durationMs);
            const e = easeInOutCubic(t);
            camera.position.lerpVectors(startPosition, targetPosition, e);
            controls.target.lerpVectors(startTarget, targetTarget, e);
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
