/**
 * Fly navigation of the splat viewer (HQ-08, out of Splat.vue): left-drag looks around
 * (first person, eased every frame), WASD / arrows / QE and the on-screen pad move with
 * smooth acceleration, Shift goes faster.
 */

export const MOVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
const PITCH_LIMIT = Math.PI * 0.48;

export class FlyControls {
    /**
     * @param {import('./cameraRig').CameraRig} rig
     * @param {object} hooks
     * @param {() => boolean} hooks.enabled   false in earth mode or while a dialog is open
     * @param {() => void} hooks.onInteract   the user took over (stops the presentation)
     */
    constructor(rig, { enabled, onInteract }) {
        this.rig = rig;
        this.enabled = enabled;
        this.onInteract = onInteract;
        this.keys = new Set();
        this.dragging = false;
        this.lastX = 0;
        this.lastY = 0;
        this.velocity = new rig.THREE.Vector3();
        this._targetVel = new rig.THREE.Vector3();
        this._fwd = new rig.THREE.Vector3();
        this._right = new rig.THREE.Vector3();
        this.handlers = {
            mousedown: e => this.onMouseDown(e),
            mousemove: e => this.onMouseMove(e),
            mouseup: () => { this.dragging = false; },
            mouseleave: () => { this.dragging = false; }
        };
    }

    /** Registers the mouse-look listeners on the canvas through `listen(target, type, fn)`. */
    attach(canvas, listen) {
        Object.entries(this.handlers).forEach(([type, fn]) => listen(canvas, type, fn));
    }

    onMouseDown(e) {
        if (e.button !== 0 || !this.enabled()) return;
        this.dragging = true;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
        // The presentation or a pan may have moved the camera since the last drag
        const rig = this.rig;
        rig.syncYawPitch();
        rig.lookDist = Math.max(rig.camera.position.distanceTo(rig.controls.target), 0.01);
        this.onInteract();
    }

    onMouseMove(e) {
        if (!this.dragging) return;
        // Every coalesced sample, so sub-frame movements are not lost
        const samples = (e.getCoalescedEvents && e.getCoalescedEvents()) || [];
        for (const ev of samples.length ? samples : [e]) {
            this.rig.targetYaw -= (ev.clientX - this.lastX) * 0.003;
            this.rig.targetPitch -= (ev.clientY - this.lastY) * 0.003;
            this.lastX = ev.clientX;
            this.lastY = ev.clientY;
        }
        this.rig.targetPitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.rig.targetPitch));
    }

    /** Eases the look toward the drag target (snaps when not dragging); once per frame. */
    look(dt) {
        const rig = this.rig;
        if (this.dragging && dt > 0) {
            const a = 1 - Math.exp(-35 * dt);
            rig.yaw += (rig.targetYaw - rig.yaw) * a;
            rig.pitch += (rig.targetPitch - rig.pitch) * a;
        } else {
            rig.yaw = rig.targetYaw;
            rig.pitch = rig.targetPitch;
        }
        rig.applyYawPitch();
    }

    press(code) {
        this.keys.add(code);
    }

    release(code) {
        this.keys.delete(code);
    }

    /** Drops held keys and the remaining speed. */
    stop() {
        this.keys.clear();
        this.velocity.set(0, 0, 0);
    }

    /**
     * Moves camera and target together. Accelerates to top speed (~95% in 0.37 s), coasts
     * to a stop when released (~5% in 0.21 s). Returns whether the camera moved.
     */
    update(dt) {
        if (dt <= 0) return false;
        const { camera, controls, sceneUp, boundsDiagonal } = this.rig;
        const k = code => this.keys.has(code);
        const dir = {
            forward: k('KeyW') || k('ArrowUp'), back: k('KeyS') || k('ArrowDown'),
            left: k('KeyA') || k('ArrowLeft'), right: k('KeyD') || k('ArrowRight'),
            up: k('KeyE'), down: k('KeyQ')
        };
        if (Object.values(dir).some(Boolean)) {
            const fast = k('ShiftLeft') || k('ShiftRight');
            const maxSpeed = boundsDiagonal * (fast ? 0.35 : 0.10);
            const fwd = camera.getWorldDirection(this._fwd);
            const right = this._right.crossVectors(fwd, sceneUp);
            if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
            right.normalize();
            const v = this._targetVel.set(0, 0, 0);
            if (dir.forward) v.add(fwd);
            if (dir.back) v.addScaledVector(fwd, -1);
            if (dir.right) v.add(right);
            if (dir.left) v.addScaledVector(right, -1);
            if (dir.up) v.add(sceneUp);
            if (dir.down) v.addScaledVector(sceneUp, -1);
            if (v.lengthSq() > 0) v.normalize().multiplyScalar(maxSpeed);
            this.velocity.lerp(v, 1 - Math.exp(-4 * dt));
        } else {
            this.velocity.multiplyScalar(Math.exp(-14 * dt));
        }
        if (this.velocity.length() < boundsDiagonal * 0.0005) {
            this.velocity.set(0, 0, 0);
            return false;
        }
        const delta = this._targetVel.copy(this.velocity).multiplyScalar(dt);
        camera.position.add(delta);
        controls.target.add(delta);
        return true;
    }
}
