/**
 * The splat viewer's presentation: a tour through the saved
 * cameras and the pins that have a view (move, pause, next), a slow auto-orbit when there are none,
 * and the eased flight to one camera or view. Any user navigation stops it. Every flight is the unified viewer's camera
 * tweener (one easing, one way to retarget or cancel a flight); only the pauses between the
 * cameras of a tour are counted per frame.
 */
import { poseOf } from './cameraPresets';
import { tourStops } from './sceneData';
import { createCameraTweener } from '@/features/viewers/unified/navControls';

const TOUR_MOVE_MS = 2500;
const TRANSITION_MS = 1200;

export class Presentation {
    /**
     * @param {import('./cameraRig').CameraRig} rig
     * @param {object} hooks
     * @param {() => any[]} hooks.cameras
     * @param {() => { view: any, cameraIndex: number | null, annotationIndex: number | null }[]} [hooks.stops]
     *   the stops of the tour, in order (the cameras, then the pins with a view: sceneData.tourStops); the cameras alone by default
     * @param {(mode: null|'tour'|'orbit'|'transition') => void} hooks.onMode
     * @param {(index: number|null) => void} hooks.onCamera   the camera on show (null between cameras)
     * @param {(index: number|null) => void} [hooks.onPin]    the pin on show (null between stops)
     */
    constructor(rig, { cameras, stops = () => tourStops(cameras(), []), onMode, onCamera, onPin = () => {} }) {
        this.rig = rig;
        this.cameras = cameras;
        this.stops = stops;
        this.onMode = onMode;
        this.onCamera = onCamera;
        this.onPin = onPin;
        this.state = null;
        this.tweener = createCameraTweener();
    }

    get mode() {
        return this.state ? this.state.mode : null;
    }

    set(state, autoRotateSpeed = 0) {
        // Whatever was in flight is over
        this.tweener.stop();
        const controls = this.rig.controls;
        controls.autoRotate = autoRotateSpeed > 0;
        if (autoRotateSpeed) controls.autoRotateSpeed = autoRotateSpeed;
        this.state = state;
        this.onMode(state ? state.mode : null);
    }

    /** Whether there is anything to tour: a camera or a pin with a view. */
    get hasTour() {
        return this.stops().length > 0;
    }

    /** A tour through the stops, or a slow orbit when there are none. */
    start() {
        this.leave();
        const stops = this.stops();
        if (stops.length) {
            this.set({ mode: 'tour', target: 0, phase: 'move', elapsed: 0, dwellDur: 2.0 });
            this.moveTo(poseOf(this.rig, stops[0].view), TOUR_MOVE_MS, () => this.arrive());
        } else {
            this.set({ mode: 'orbit' }, 0.2);
        }
    }

    orbit() {
        this.leave();
        this.set({ mode: 'orbit' }, 0.5);
    }

    /** Nothing is on show: no camera, no pin. */
    leave() {
        this.onCamera(null);
        this.onPin(null);
    }

    /** Eased flight to a camera (accelerate, cruise, decelerate). */
    flyTo(index) {
        const c = this.cameras()[index];
        if (!c) return;
        this.flyToView(c, () => this.onCamera(index));
    }

    /**
     * The same flight to a view (a camera, or the view saved with a pin); `onArrive` runs when it is there.
     * @param {any} view @param {() => void} onArrive
     */
    flyToView(view, onArrive) {
        this.leave();
        this.set({ mode: 'transition' });
        this.moveTo(poseOf(this.rig, view), TRANSITION_MS, () => {
            this.stop();
            onArrive();
        });
    }

    /** The eased flight from where the camera is to `pose` (position, target and field of view). */
    moveTo(pose, durationMs, onDone) {
        const { rig } = this;
        const fromFov = rig.camera.fov;
        this.tweener.tweenTo(rig.camera, rig.controls, pose.position, pose.target, durationMs, onDone,
            e => rig.setFov(fromFov + (pose.fov - fromFov) * e));
    }

    /** A tour reached its stop: it stays for the dwell time, with the camera or the pin on show. */
    arrive() {
        const st = this.state;
        st.phase = 'dwell';
        st.elapsed = 0;
        const stop = this.stops()[st.target];
        this.onCamera(stop ? stop.cameraIndex : null);
        this.onPin(stop ? stop.annotationIndex : null);
    }

    /** Stops; returns whether something was running. */
    stop() {
        if (!this.state) return false;
        this.set(null);
        this.rig.syncYawPitch();
        return true;
    }

    /** Advances by dt seconds: the pause at a camera of a tour (the flights and the orbit move by themselves). */
    update(dt) {
        const st = this.state;
        if (!st || st.mode !== 'tour' || st.phase !== 'dwell') return;
        st.elapsed += dt;
        if (st.elapsed < st.dwellDur) return;
        const stops = this.stops();
        // The stops were all deleted during the tour
        if (!stops.length) {
            this.stop();
            return;
        }
        st.target = (st.target + 1) % stops.length;
        st.phase = 'move';
        st.elapsed = 0;
        this.leave();
        this.moveTo(poseOf(this.rig, stops[st.target].view), TOUR_MOVE_MS, () => this.arrive());
    }

    /** Ends a flight that is still running (the viewer is going away). */
    dispose() {
        this.tweener.stop();
    }
}
