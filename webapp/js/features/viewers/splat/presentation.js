/**
 * The splat viewer's presentation: a tour through the saved
 * cameras (move, pause, next), a slow auto-orbit when there are none, and the eased
 * flight to one camera. Any user navigation stops it. Every flight is the unified viewer's camera
 * tweener (one easing, one way to retarget or cancel a flight); only the pauses between the
 * cameras of a tour are counted per frame.
 */
import { poseOf } from './cameraPresets';
import { createCameraTweener } from '@/features/viewers/unified/navControls';

const TOUR_MOVE_MS = 2500;
const TRANSITION_MS = 1200;

export class Presentation {
    /**
     * @param {import('./cameraRig').CameraRig} rig
     * @param {object} hooks
     * @param {() => any[]} hooks.cameras
     * @param {(mode: null|'tour'|'orbit'|'transition') => void} hooks.onMode
     * @param {(index: number|null) => void} hooks.onCamera   the camera on show (null between cameras)
     */
    constructor(rig, { cameras, onMode, onCamera }) {
        this.rig = rig;
        this.cameras = cameras;
        this.onMode = onMode;
        this.onCamera = onCamera;
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

    /** A tour through the cameras, or a slow orbit when there are none. */
    start() {
        this.onCamera(null);
        const cameras = this.cameras();
        if (cameras.length) {
            this.set({ mode: 'tour', target: 0, phase: 'move', elapsed: 0, dwellDur: 2.0 });
            this.moveTo(poseOf(this.rig, cameras[0]), TOUR_MOVE_MS, () => this.arrive());
        } else {
            this.set({ mode: 'orbit' }, 0.2);
        }
    }

    orbit() {
        this.onCamera(null);
        this.set({ mode: 'orbit' }, 0.5);
    }

    /** Eased flight to a camera (accelerate, cruise, decelerate). */
    flyTo(index) {
        const c = this.cameras()[index];
        if (!c) return;
        this.onCamera(null);
        this.set({ mode: 'transition', targetIndex: index });
        this.moveTo(poseOf(this.rig, c), TRANSITION_MS, () => {
            this.stop();
            this.onCamera(index);
        });
    }

    /** The eased flight from where the camera is to `pose` (position, target and field of view). */
    moveTo(pose, durationMs, onDone) {
        const { rig } = this;
        const fromFov = rig.camera.fov;
        this.tweener.tweenTo(rig.camera, rig.controls, pose.position, pose.target, durationMs, onDone,
            e => rig.setFov(fromFov + (pose.fov - fromFov) * e));
    }

    /** A tour reached its camera: it stays for the dwell time. */
    arrive() {
        const st = this.state;
        st.phase = 'dwell';
        st.elapsed = 0;
        this.onCamera(st.target);
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
        const cameras = this.cameras();
        // The cameras were all deleted during the tour
        if (!cameras.length) {
            this.stop();
            return;
        }
        st.target = (st.target + 1) % cameras.length;
        st.phase = 'move';
        st.elapsed = 0;
        this.onCamera(null);
        this.moveTo(poseOf(this.rig, cameras[st.target]), TOUR_MOVE_MS, () => this.arrive());
    }

    /** Ends a flight that is still running (the viewer is going away). */
    dispose() {
        this.tweener.stop();
    }
}
