import { fitDistance } from '@/features/viewers/unified/sceneUtils';

// How much of the view the scene fills when framed: well under 1 (the sphere of the scene is
// larger than the view), so the camera starts inside the model, which reads as immersive
const FRAME_MARGIN = 0.4;

/**
 * Scene up from the calibration angles (degrees): pitch about world X, roll about world Z.
 * @param {any} THREE
 */
export function tiltUp(THREE, rollDeg, pitchDeg) {
    const up = new THREE.Vector3(0, 1, 0);
    up.applyAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(pitchDeg));
    up.applyAxisAngle(new THREE.Vector3(0, 0, 1), THREE.MathUtils.degToRad(rollDeg));
    return up.normalize();
}

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

    /**
     * Scene up from any direction in world space (it is normalised). OrbitControls bakes the
     * camera's up into a rotation once, in its constructor (the same pitfall createNavControls
     * documents), so the controls are rebuilt on the new up here; orbit, pan and zoom then follow it.
     * @param {{ x: number, y: number, z: number }} up
     */
    setUp(up) {
        this.sceneUp.set(up.x, up.y, up.z);
        // A zero vector has no direction: fall back to world up rather than NaN everywhere
        if (this.sceneUp.lengthSq() < 1e-12) this.sceneUp.set(0, 1, 0);
        this.sceneUp.normalize();
        this.camera.up.copy(this.sceneUp);
        this.rebuildControlsUp();
    }

    /** Scene up from the calibration angles (degrees): `setUp` on the tilted world up. */
    setTilt(rollDeg, pitchDeg) {
        this.setUp(tiltUp(this.THREE, rollDeg, pitchDeg));
    }

    /** Makes OrbitControls use camera.up as it is now (a no-op for controls that keep no such rotation). */
    rebuildControlsUp() {
        const { controls, camera, _yAxis } = this;
        if (!controls._quat || !controls._quatInverse) return;
        controls._quat.setFromUnitVectors(camera.up, _yAxis);
        controls._quatInverse.copy(controls._quat).invert();
    }

    /** One step of OrbitControls (pan, zoom, auto-rotate) for the frame's duration in seconds, so the orbit speed does not depend on the frame rate. */
    updateControls(dt) {
        this.controls.update(dt);
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
        // The vertical field of view limits a landscape view, the horizontal one a portrait view
        const dist = fitDistance(radius, camera.fov, camera.aspect, FRAME_MARGIN);
        // A small near plane lets splats render when the camera flies in among them
        camera.near = Math.max(this.boundsDiagonal / 5000, 0.001);
        camera.far = dist + this.boundsDiagonal * 10;
        camera.updateProjectionMatrix();
        camera.position.set(center.x, center.y, center.z + dist);
        camera.up.copy(this.sceneUp);
        camera.lookAt(center);
        controls.target.copy(center);
        this.updateControls();
        this.lookDist = Math.max(dist, 0.01);
        this.syncYawPitch();
    }

    /** Field of view in degrees (the projection follows). */
    setFov(fov) {
        if (Math.abs(this.camera.fov - fov) <= 1e-3) return;
        this.camera.fov = fov;
        this.camera.updateProjectionMatrix();
    }
}
