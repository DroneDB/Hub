/**
 * Earth navigation of the splat viewer, Potree style: left-drag
 * (or one finger) grabs and pans the ground, right-drag orbits the pivot under the
 * pointer, the wheel and a pinch zoom toward the pointer. A marker shows the pivot.
 *
 * The shared constrained orbit of the 3D viewers (D-019) with the splat viewer's own values: its
 * pitch limit (POLE, which lets the view look up from below as well as down), its buttons and its
 * wheel step. It moves the camera position and the OrbitControls target (shared with it); the
 * orientation stays the rig's, which looks at that target every frame (syncYawPitch).
 */
import { ConstrainedOrbit } from '@/features/viewers/unified/constrainedOrbit';

// Pitch stops ~5° from straight up/down so the view cannot flip over
const POLE = 0.996;

/** The constrained orbit's options of the splat viewer's earth mode (FR-XC-18). */
export const SPLAT_EARTH = Object.freeze({
    tilt: Object.freeze({ pole: POLE }),
    // Left button, middle button and one finger pan; the right button orbits; two fingers orbit
    // and pinch; the wheel (Shift or not) steps toward the pointer
    buttons: Object.freeze({
        left: 'pan', ctrlLeft: null, middle: 'pan', right: 'orbit', touch: 'pan',
        twoFinger: 'orbit', twist: false, wheel: 'dolly', shiftWheel: 'dolly'
    })
});

export class EarthControls {
    /**
     * @param {import('./cameraRig').CameraRig} rig
     * @param {any} canvas  the renderer's canvas
     * @param {any} scene   gets the pivot marker
     * @param {object} hooks
     * @param {() => boolean} hooks.enabled
     * @param {() => void} hooks.onInteract
     */
    constructor(rig, canvas, scene, { enabled, onInteract }) {
        this.rig = rig;
        this.orbit = new ConstrainedOrbit({ THREE: rig.THREE }, rig.camera, canvas, scene, {
            ...SPLAT_EARTH,
            getUp: () => rig.sceneUp,
            target: rig.controls.target,
            canNavigate: enabled,
            // The viewer registers the listeners (attach)
            listen: false
        });
        // lifetime: owner (the orbit goes with these controls). A press or a wheel step takes over
        this.orbit.addEventListener('start', () => onInteract());
    }

    /** The marker of the pivot. */
    get marker() { return this.orbit.marker; }

    /** The ground point the gesture turns around or grabbed (null before a gesture). */
    get pivot() { return this.orbit.gesturePivot; }

    /** Registers the canvas listeners through `listen(target, type, fn, options)`. */
    attach(listen) {
        this.orbit.attach(listen);
    }

    /** Leaves earth mode: no gesture, no marker. */
    reset() {
        this.orbit.reset();
    }

    dispose() {
        this.orbit.dispose();
    }

    /**
     * The ground point under a screen point: where its ray meets the plane through the look
     * target perpendicular to the scene up (a new vector, or null).
     */
    groundPoint(clientX, clientY) {
        return this.orbit.groundPoint(clientX, clientY);
    }

    // Ground plane through the look target; pivot = ground point under the pointer
    begin(clientX, clientY) {
        this.orbit.beginGesture(clientX, clientY);
    }

    // The marker follows the pivot at a constant ~8 px radius
    updateMarker() {
        this.orbit.updateMarker();
    }
}
