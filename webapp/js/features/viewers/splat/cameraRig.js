import { fitDistance } from '@/features/viewers/unified/sceneUtils';

/**
 * How a scene is framed. A scene captured from inside (a room) is framed level and close, from
 * inside it, which reads as immersive. A site (a georeferenced scene, or one the build found to be a
 * piece of the ground) is framed whole from above at an angle: a level view of it stands at the
 * height of the middle of its box, among the splats of a flat site, and the orbit about its centre
 * keeps that height. An object the cameras went round is framed whole from outside, a little above
 * it, and the orbit goes round it.
 */
export const FRAMING = Object.freeze({ IMMERSIVE: 'immersive', OVERVIEW: 'overview', OBJECT: 'object' });

// The framing of each kind of capture the build tells apart (bounds.json framing.kind)
const FRAMING_OF_KIND = Object.freeze({ object: FRAMING.OBJECT, scene: FRAMING.IMMERSIVE, site: FRAMING.OVERVIEW });

/**
 * The framing of a scene: the one of the kind of capture the build found, when it found one; else a
 * georeferenced scene is seen whole from above, any other from inside.
 * @param {{ georeferenced?: boolean, kind?: string }} scene
 */
export const framingOf = ({ georeferenced, kind }) =>
    (kind && Object.hasOwn(FRAMING_OF_KIND, kind) ? FRAMING_OF_KIND[kind] : georeferenced ? FRAMING.OVERVIEW : FRAMING.IMMERSIVE);

// How the scene sphere fits the view (fitDistance's margin), how high above the horizon of the
// scene up the camera looks at it from and, when the camera faces the box (frame's `faceBox`), how
// far round from the narrowest horizontal side of the box towards its longest one and, for a view
// from inside, how far behind the centre the camera stands, as a share of half the longest side
const FRAMINGS = Object.freeze({
    // Well under 1: the sphere is larger than the view, so the camera starts inside the model. Facing
    // the box, it stands on its longest side behind the centre, looking along it: at the fitted
    // distance it would stand at the end of a room, against what is on its wall
    [FRAMING.IMMERSIVE]: { margin: 0.4, elevationDeg: 0, azimuthDeg: 90, insideShare: 0.6 },
    // The whole sphere in view, seen from halfway between the horizon and straight down, the long side
    // of the site across the view
    [FRAMING.OVERVIEW]: { margin: 1.1, elevationDeg: 45, azimuthDeg: 0 },
    // The whole object in view, from a little above it, in three-quarter view: its long side and one end
    [FRAMING.OBJECT]: { margin: 1.15, elevationDeg: 35, azimuthDeg: 35 }
});

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
        this._zAxis = new THREE.Vector3(0, 0, 1);
        this._xAxis = new THREE.Vector3(1, 0, 0);
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
     * The +Z side of the scene on its horizon (the plane across the scene up); X for a scene up along Z.
     */
    defaultAcross() {
        const { sceneUp } = this;
        const across = this._zAxis.clone().projectOnPlane(sceneUp);
        if (across.lengthSq() < 1e-12) across.copy(this._xAxis).projectOnPlane(sceneUp);
        return across.normalize();
    }

    /**
     * The narrowest and the longest horizontal side of a box (its sides turned by the mesh orientation
     * `q`, on the horizon of the scene up), as unit vectors across the scene up. Each points to the side
     * of the default direction (defaultAcross), so the same box always gives the same view; a box with no
     * horizontal extent gives the default direction and the one at right angles to it. `length` is
     * the length of the longest one on the horizon.
     * @param {any} box
     * @param {any} q
     */
    horizontalSides(box, q) {
        const { THREE, sceneUp } = this;
        const size = box.getSize(new THREE.Vector3());
        const reference = this.defaultAcross();
        let longest = null;
        for (const [axis, length] of [[new THREE.Vector3(1, 0, 0), size.x], [new THREE.Vector3(0, 1, 0), size.y], [new THREE.Vector3(0, 0, 1), size.z]]) {
            const side = axis.applyQuaternion(q).multiplyScalar(length).projectOnPlane(sceneUp);
            if (!longest || side.lengthSq() > longest.lengthSq()) longest = side;
        }
        const length = longest.length();
        if (length < 1e-9) longest = new THREE.Vector3().crossVectors(sceneUp, reference);
        longest.normalize();
        const narrowest = new THREE.Vector3().crossVectors(sceneUp, longest).normalize();
        // A side at right angles to the default direction keeps the sign of the cross product
        if (narrowest.dot(reference) < -1e-9) narrowest.negate();
        if (longest.dot(reference) < -1e-9) longest.negate();
        return { narrowest, longest, length };
    }

    /**
     * The direction from the centre of the scene to a camera that frames it, `elevationDeg` above its
     * horizon, so the scene up is never the direction the camera looks along. Across the horizon it is
     * the +Z side of the scene, or, given the `sides` of the box it frames (horizontalSides), the
     * narrowest side turned `azimuthDeg` towards the longest.
     * @param {number} elevationDeg
     * @param {{ azimuthDeg?: number, sides?: { narrowest: any, longest: any } }} [facing]
     */
    framingDirection(elevationDeg, { azimuthDeg = 0, sides } = {}) {
        const { THREE, sceneUp } = this;
        let across = this.defaultAcross();
        if (sides) {
            const azimuth = THREE.MathUtils.degToRad(azimuthDeg);
            across = sides.narrowest.clone().multiplyScalar(Math.cos(azimuth)).addScaledVector(sides.longest, Math.sin(azimuth)).normalize();
        }
        const elevation = THREE.MathUtils.degToRad(elevationDeg);
        return across.multiplyScalar(Math.cos(elevation)).addScaledVector(sceneUp, Math.sin(elevation));
    }

    /**
     * Frames a box (the splat's local bounds, turned by the mesh orientation `q`) the way
     * `framing` says (FRAMING): close and level, whole and from above, or whole from beside it.
     * Sets the scene size, near/far planes, camera, target and look angles. `extent`, the bounds
     * of every splat when `box` is only the core of the scene, keeps the far plane past them all.
     * With `faceBox` the camera faces the sides of the box (the core the build found: the long side of
     * an object or a site across the view, the length of a room ahead); without, it looks from the +Z
     * side of the scene, whatever the box.
     * @param {any} box
     * @param {any} q
     * @param {string} [framing]
     * @param {any} [extent]
     * @param {{ faceBox?: boolean }} [options]
     */
    frame(box, q, framing = FRAMING.IMMERSIVE, extent = box, { faceBox = false } = {}) {
        const { THREE, camera, controls } = this;
        const { margin, elevationDeg, azimuthDeg, insideShare } = FRAMINGS[framing] ?? FRAMINGS[FRAMING.IMMERSIVE];
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3()).applyQuaternion(q);
        this.boundsDiagonal = Math.max(size.length(), 1e-3);
        const radius = 0.5 * Math.max(size.x, size.y, size.z) || 1;
        // The vertical field of view limits a landscape view, the horizontal one a portrait view
        const sides = faceBox ? this.horizontalSides(box, q) : null;
        const inside = sides && insideShare ? insideShare * sides.length / 2 : 0;
        const dist = inside > 0 ? inside : fitDistance(radius, camera.fov, camera.aspect, margin);
        // A small near plane lets splats render when the camera flies in among them
        camera.near = Math.max(this.boundsDiagonal / 5000, 0.001);
        const extentDiagonal = extent && !extent.isEmpty() ? extent.getSize(new THREE.Vector3()).length() : 0;
        camera.far = dist + Math.max(this.boundsDiagonal * 10, extentDiagonal * 2);
        camera.updateProjectionMatrix();
        const facing = sides ? { azimuthDeg, sides } : {};
        camera.position.copy(center).addScaledVector(this.framingDirection(elevationDeg, facing), dist);
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
