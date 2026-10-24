/**
 * The splat viewer's camera rig: the three.js camera, the
 * OrbitControls target it looks at, the scene "up" (tilted by the ground-plane
 * calibration) and the first-person yaw/pitch about that up. The fly and earth controls
 * and the presentation all move the camera through it.
 */
export class CameraRig {
    /**
     * @param {any} THREE  the three.js module (loaded lazily by the viewer)
     * @param {any} camera  PerspectiveCamera
     * @param {any} controls  OrbitControls (pan / zoom / auto-rotate; rotation is ours)
     */
    constructor(THREE, camera, controls) {
        this.THREE = THREE;
        this.camera = camera;
        this.controls = controls;
        this.sceneUp = new THREE.Vector3(0, 1, 0);
        this.yaw = 0;
        this.pitch = 0;
        // Where the mouse look is heading; yaw/pitch ease toward it every frame
        this.targetYaw = 0;
        this.targetPitch = 0;
        // Distance kept between the camera and its look target
        this.lookDist = 1;
        // Scene size: fly speed, fallback target distance of presets
        this.boundsDiagonal = 1;
        // Reused temporaries (no per-frame allocations)
        this._yAxis = new THREE.Vector3(0, 1, 0);
        this._alignQ = new THREE.Quaternion();
        this._localQ = new THREE.Quaternion();
        this._euler = new THREE.Euler();
        this._fwd = new THREE.Vector3();
    }

    /** Scene up from the calibration angles (degrees): pitch about world X, roll about world Z. */
    setTilt(rollDeg, pitchDeg) {
        const { THREE } = this;
        const up = new THREE.Vector3(0, 1, 0);
        up.applyAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(pitchDeg));
        up.applyAxisAngle(new THREE.Vector3(0, 0, 1), THREE.MathUtils.degToRad(rollDeg));
        this.sceneUp.copy(up.normalize());
        this.camera.up.copy(this.sceneUp);
    }

    /** yaw/pitch (and the look target) from the camera orientation, about the scene up. */
    syncYawPitch() {
        this._alignQ.setFromUnitVectors(this._yAxis, this.sceneUp);
        this._localQ.copy(this._alignQ).invert().multiply(this.camera.quaternion);
        this._euler.setFromQuaternion(this._localQ, 'YXZ');
        this.yaw = this.targetYaw = this._euler.y;
        this.pitch = this.targetPitch = this._euler.x;
    }

    /** Camera orientation from yaw/pitch (no roll: a level horizon), target lookDist ahead. */
    applyYawPitch() {
        this._alignQ.setFromUnitVectors(this._yAxis, this.sceneUp);
        this._localQ.setFromEuler(this._euler.set(this.pitch, this.yaw, 0, 'YXZ'));
        this.camera.quaternion.copy(this._alignQ).multiply(this._localQ);
        this._fwd.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
        this.controls.target.copy(this.camera.position).addScaledVector(this._fwd, this.lookDist);
    }

    /**
     * Frames a box (the splat's local bounds, turned by the mesh orientation `q`) so it
     * fills the view closely (inside the model reads as immersive, not a distant dot).
     * Sets the scene size, near/far planes, camera, target and look angles.
     */
    frame(box, q) {
        const { THREE, camera, controls } = this;
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3()).applyQuaternion(q);
        this.boundsDiagonal = Math.max(size.length(), 1e-3);
        const radius = 0.5 * Math.max(size.x, size.y, size.z) || 1;
        const dist = (radius / Math.sin((camera.fov * Math.PI) / 360)) * 0.4;
        // A small near plane lets splats render when the camera flies in among them
        camera.near = Math.max(this.boundsDiagonal / 5000, 0.001);
        camera.far = dist + this.boundsDiagonal * 10;
        camera.updateProjectionMatrix();
        camera.position.set(center.x, center.y, center.z + dist);
        camera.up.copy(this.sceneUp);
        camera.lookAt(center);
        controls.target.copy(center);
        controls.update();
        this.lookDist = Math.max(dist, 0.01);
        this.syncYawPitch();
    }

    /** Position, target and field of view. */
    capturePose() {
        return { position: this.camera.position.clone(), target: this.controls.target.clone(), fov: this.camera.fov };
    }

    /** Moves to `from` lerped toward `to` by e (0..1). */
    applyPose(from, to = from, e = 1) {
        this.camera.position.copy(from.position).lerp(to.position, e);
        const fov = from.fov + (to.fov - from.fov) * e;
        if (Math.abs(this.camera.fov - fov) > 1e-3) {
            this.camera.fov = fov;
            this.camera.updateProjectionMatrix();
        }
        this.controls.target.copy(from.target).lerp(to.target, e);
    }
}
