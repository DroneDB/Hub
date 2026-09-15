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
 * @param opts - { onDragStart } forwarded to the turntable, fired when a rotation drag begins.
 * @returns the configured OrbitControls, with dispose() extended to undo the wheel normalizer,
 * the turntable listeners and the key-event listener.
 */
export function createNavControls(libs, camera, domElement, opts = {}) {
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
    // Rotation deliberately does NOT go through OrbitControls: its spherical frame is built from
    // camera.up in the constructor and breaks down near that frame's poles. Left-drag (and
    // single-finger touch) are handled by createTurntableRotate below instead - same gain, absolute
    // axes, epsilon-clamped so the camera can never stick at (or invert through) a pole.
    controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    controls.touches = { ONE: null, TWO: THREE.TOUCH.DOLLY_PAN };
    controls.listenToKeyEvents(domElement);

    const removeWheelNormalizer = normalizeWheel(domElement);
    // camera.up is exactly the scene's up axis in every scene the viewer builds (flat: the
    // constant (0,0,1) from setupInstance; globe: the frozen ellipsoid normal assigned by
    // frameGlobe before it attaches the controls), so it is the up axis for both paths.
    const removeTurntable = createTurntableRotate(libs, camera, controls, domElement, () => camera.up, opts);

    const disposeControls = controls.dispose.bind(controls);
    controls.dispose = () => {
        removeWheelNormalizer();
        removeTurntable();
        controls.stopListenToKeyEvents();
        disposeControls();
    };

    return controls;
}

// Unit up axis for the turntable. getUpAxis may hand back camera.up itself, so normalize into
// a dedicated vector instead of scaling the caller's object in place.
function normalizeUp(THREE, camera, getUpAxis) {
    const up = (typeof getUpAxis === 'function' ? getUpAxis() : camera.up).clone();
    if (up.lengthSq() < 1e-12) up.set(0, 0, 1);
    return up.normalize();
}

/**
 * Absolute turntable rotation: the camera orbits a fixed pivot around the scene's up axis
 * (drag horizontally) and around the screen-horizontal axis through the pivot (drag vertically),
 * exactly like Potree's Orbit mode. camera.up is never touched, so the view can never roll.
 *
 * This replaces OrbitControls' own rotation because that one measures the polar angle from
 * camera.up and only clamps at the END of an update: a single fast drag can therefore drive the
 * accumulated delta straight through a pole - the camera lands at the antipode and the scene
 * appears flipped - and once stuck at the pole its azimuth rotation leaves the position invariant
 * (horizontal drags go dead until a later drag re-exits on a mirrored side). Here the clamp runs
 * per pointer-move, so the camera only ever eases up to (never through) straight-up/down, and
 * every drag stays responsive.
 *
 * Gain matches OrbitControls' rotateLeft/rotateUp exactly (full viewport height = 360 deg),
 * including its sign convention (drag down = camera rises over the top), so the feel is a
 * drop-in for the rotation that was disabled in createNavControls.
 *
 * @param libs - { THREE } bundle of the viewer.
 * @param camera - camera to orbit; camera.up must equal the scene up axis (see createNavControls).
 * @param controls - the OrbitControls whose target is the fixed pivot (pan/wheel keep working).
 * @param domElement - element to listen for pointer events on.
 * @param getUpAxis - () => Vector3-like absolute up axis (defaults to camera.up).
 * @param opts - { onDragStart } fired once per drag, on the first pointer-move.
 * @returns a disposer removing every listener this installed.
 */
export function createTurntableRotate(libs, camera, controls, domElement, getUpAxis, opts = {}) {
    const { THREE } = libs;
    const EPS = 1e-3; // rad from the exact poles: free full-sphere pitch, dead zones removed.
    const state = { pointerId: null, x: 0, y: 0, active: false, started: false };
    const qYaw = new THREE.Quaternion();

    // A second finger (pinch -> dolly-pan goes to OrbitControls) or the right/middle mouse
    // (pan/dolly) takes over the interaction: disarm the turntable instead of fighting it.
    function abortIfTakenOver(e) {
        if (state.pointerId === null) return;
        if (e.pointerType === 'touch' && e.pointerId !== state.pointerId) { disarm(); return; }
        if (e.buttons && (e.buttons & 0b110)) disarm();
    }

    function disarm() {
        if (state.pointerId !== null && domElement.releasePointerCapture) {
            try { domElement.releasePointerCapture(state.pointerId); } catch (e) { /* already gone */ }
        }
        state.pointerId = null;
        state.active = false;
        state.started = false;
    }

    const onPointerDown = e => {
        abortIfTakenOver(e);
        if (e.pointerType === 'mouse') {
            if (e.button !== 0) return; // middle/right stay with OrbitControls
        } else if (e.pointerType === 'touch') {
            if (e.button !== 0) return;
            if (state.active || state.pointerId !== null) { disarm(); return; } // second finger
        } else {
            return; // pen and anything else keep the previous behaviour (no rotation)
        }
        if (controls.enabled === false) return; // measurement tools suspend navigation
        state.pointerId = e.pointerId;
        state.x = e.clientX;
        state.y = e.clientY;
        state.active = true;
        state.started = false;
        if (domElement.setPointerCapture) {
            try { domElement.setPointerCapture(e.pointerId); } catch (e2) { /* passive */ }
        }
    };

    const onPointerMove = e => {
        if (!state.active || e.pointerId !== state.pointerId) return;
        abortIfTakenOver(e);
        if (!state.active) return;
        const dx = e.clientX - state.x;
        const dy = e.clientY - state.y;
        state.x = e.clientX;
        state.y = e.clientY;
        if (dx === 0 && dy === 0) return;
        if (!state.started) {
            state.started = true;
            if (opts.onDragStart) opts.onDragStart();
        }

        const h = domElement.clientHeight || 1;
        const k = (2 * Math.PI * (controls.rotateSpeed || 1)) / h;
        const target = controls.target;
        const offset = camera.position.clone().sub(target);
        const radius = offset.length();
        if (radius < 1e-10) return; // camera on the pivot: nothing to rotate
        const dir = offset.divideScalar(radius);
        const up = normalizeUp(THREE, camera, getUpAxis);

        // Yaw about the absolute up axis through the pivot. OrbitControls' rotateLeft is
        // -2π*rotateSpeed*dx/clientHeight too, so the gain matches the old rotation.
        dir.applyQuaternion(qYaw.setFromAxisAngle(up, -k * dx));

        // Pitch inside the great circle spanned by up and the view direction, written directly
        // (d -> d*cos delta + toward*sin delta keeps d exactly unit): rotating by delta toward
        // `up` = (up - (up.d) d)/sin(phi) decreases the angle-to-up by exactly delta. The
        // sign follows the native OrbitControls convention measured live: dragging down raises
        // the camera (phi decreases), dragging up lowers it under the model. Clamping phi
        // per pointer-MOVE to [EPS, pi-EPS] is what stops big drags from ever crossing a pole.
        const cosPhi = THREE.MathUtils.clamp(dir.dot(up), -1, 1);
        const phi = Math.acos(cosPhi);
        const wanted = Math.min(Math.max(phi - k * dy, EPS), Math.PI - EPS);
        const delta = phi - wanted; // rotate this much toward `up` (negative = away from it)
        const sinPhi = Math.sqrt(Math.max(0, 1 - cosPhi * cosPhi));
        if (Math.abs(delta) > 1e-12 && sinPhi > 1e-6) {
            const toward = up.clone().addScaledVector(dir, -cosPhi).multiplyScalar(1 / sinPhi);
            dir.multiplyScalar(Math.cos(delta)).addScaledVector(toward, Math.sin(delta));
        }

        // Same contract OrbitControls' rotate honoured: distance kept, pivot never moves, up
        // untouched (so no roll). update() then feeds the change to the view (streaming) and
        // re-aims the camera at the pivot without disturbing camera.up.
        camera.position.copy(target).add(dir.multiplyScalar(radius));
        controls.update();
    };

    const onPointerUp = e => {
        if (e.pointerId === state.pointerId) disarm();
    };

    domElement.addEventListener('pointerdown', onPointerDown);
    domElement.addEventListener('pointermove', onPointerMove);
    domElement.addEventListener('pointerup', onPointerUp);
    domElement.addEventListener('pointercancel', onPointerUp);

    return () => {
        disarm();
        domElement.removeEventListener('pointerdown', onPointerDown);
        domElement.removeEventListener('pointermove', onPointerMove);
        domElement.removeEventListener('pointerup', onPointerUp);
        domElement.removeEventListener('pointercancel', onPointerUp);
    };
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
