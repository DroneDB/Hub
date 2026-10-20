/**
 * The splat viewer's presentation (HQ-08, out of Splat.vue): a tour through the saved
 * cameras (move, pause, next), a slow auto-orbit when there are none, and the eased
 * flight to one camera. Any user navigation stops it.
 */
import { poseOf } from './cameraPresets';

const easeInOutCubic = u => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const smoothstep = u => u * u * (3 - 2 * u);

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
    }

    get mode() {
        return this.state ? this.state.mode : null;
    }

    set(state, autoRotateSpeed = 0) {
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
            this.set({ mode: 'tour', target: 0, phase: 'move', elapsed: 0, moveDur: 2.5, dwellDur: 2.0,
                from: this.rig.capturePose(), to: poseOf(this.rig, cameras[0]) });
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
        this.set({ mode: 'transition', elapsed: 0, moveDur: 1.2, from: this.rig.capturePose(), to: poseOf(this.rig, c), targetIndex: index });
    }

    /** Stops; returns whether something was running. */
    stop() {
        if (!this.state) return false;
        this.set(null);
        this.rig.syncYawPitch();
        return true;
    }

    /** Advances by dt seconds (the orbit itself is OrbitControls' auto-rotate). */
    update(dt) {
        const st = this.state;
        if (!st) return;
        st.elapsed = (st.elapsed || 0) + dt;
        if (st.mode === 'transition') {
            const u = Math.min(st.elapsed / st.moveDur, 1);
            this.rig.applyPose(st.from, st.to, easeInOutCubic(u));
            if (u >= 1) {
                this.stop();
                this.onCamera(st.targetIndex);
            }
        } else if (st.mode === 'tour' && st.phase === 'move') {
            const u = Math.min(st.elapsed / st.moveDur, 1);
            this.rig.applyPose(st.from, st.to, smoothstep(u));
            if (u >= 1) {
                st.phase = 'dwell';
                st.elapsed = 0;
                this.onCamera(st.target);
            }
        } else if (st.mode === 'tour' && st.elapsed >= st.dwellDur) {
            const cameras = this.cameras();
            // The cameras were all deleted during the tour
            if (!cameras.length) {
                this.stop();
                return;
            }
            st.target = (st.target + 1) % cameras.length;
            st.from = this.rig.capturePose();
            st.to = poseOf(this.rig, cameras[st.target]);
            st.phase = 'move';
            st.elapsed = 0;
            this.onCamera(null);
        }
    }
}
