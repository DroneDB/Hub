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
// from inside, how far behind the centre the camera stands, as a share of half the longest side. A
// scene seen from inside whose up is known is framed as a room is photographed instead (ROOM_SHOT).
const FRAMINGS = Object.freeze({
    // Well under 1: the sphere is larger than the view, so the camera starts inside the model. Facing
    // the box, it stands on its longest side behind the centre, looking along it, level
    [FRAMING.IMMERSIVE]: { margin: 0.4, elevationDeg: 0, azimuthDeg: 90, insideShare: 0.6 },
    // The whole sphere in view, seen from halfway between the horizon and straight down, the long side
    // of the site across the view
    [FRAMING.OVERVIEW]: { margin: 1.1, elevationDeg: 45, azimuthDeg: 0 },
    // The whole object in view, from a little above it, in three-quarter view: its long side and one end
    [FRAMING.OBJECT]: { margin: 1.15, elevationDeg: 35, azimuthDeg: 35 }
});

/**
 * The establishing shot of a room (a scene seen from inside, facing the core the build found): the
 * camera stands high in a corner of the core and looks across it at its centre, a little down, so the
 * floor, the furniture and the far walls are all in view. `corner` is how far out towards the corner
 * it stands (a share of the half sides of the core on the horizon), `height` how high (a share of the
 * height of the core from its bottom), `lookBelow` how far below the centre it looks (a share of that
 * height). The corner is the least crowded of the four (fewest resident splats within `clearance` of
 * the diagonal of the core, against the mean density of the core, there and at the `sight` shares of
 * the way to what it looks at: a shelf right in front of the camera hides the room); while it is more crowded than
 * `crowded` (the camera would stand in a wall, a shelf or a lamp), the camera steps `step` of the way
 * towards the middle of the core at its height, `steps` times at most.
 */
export const ROOM_SHOT = Object.freeze({ corner: 0.8, height: 0.75, lookBelow: 0.1, clearance: 0.08, crowded: 0.25, step: 0.15, steps: 8, sight: [0.15, 0.3, 0.45] });

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
     * A room (FRAMING.IMMERSIVE facing its box) with `roomShot` gets its establishing shot
     * (ROOM_SHOT), which stands high in a corner and so needs the scene up to be right; `crowding`
     * (crowdingOf, over the resident splats, in the frame of the splat file) keeps the camera out of
     * its walls and furniture, and without it the first corner is taken as it is. Without `roomShot`
     * the camera stands on the longest side of the room, behind its centre, level.
     * @param {{ faceBox?: boolean, roomShot?: boolean, crowding?: ((point: number[], radius: number) => number) | null }} [options]
     */
    frame(box, q, framing = FRAMING.IMMERSIVE, extent = box, { faceBox = false, roomShot = false, crowding = null } = {}) {
        const { THREE, camera, controls } = this;
        const { margin, elevationDeg, azimuthDeg, insideShare } = FRAMINGS[framing] ?? FRAMINGS[FRAMING.IMMERSIVE];
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3()).applyQuaternion(q);
        this.boundsDiagonal = Math.max(size.length(), 1e-3);
        let position, target = center;
        if (faceBox && roomShot && framing === FRAMING.IMMERSIVE) {
            ({ position, target } = this.roomShot(box, q, crowding));
        } else {
            const sides = faceBox ? this.horizontalSides(box, q) : null;
            const radius = 0.5 * Math.max(size.x, size.y, size.z) || 1;
            // Inside a room, behind its centre on its longest side; else at the distance that fits the
            // scene sphere: the vertical field of view limits a landscape view, the horizontal one a portrait view
            const inside = sides && insideShare ? insideShare * sides.length / 2 : 0;
            const dist = inside > 0 ? inside : fitDistance(radius, camera.fov, camera.aspect, margin);
            const facing = sides ? { azimuthDeg, sides } : {};
            position = center.clone().addScaledVector(this.framingDirection(elevationDeg, facing), dist);
        }
        const dist = position.distanceTo(target);
        // A small near plane lets splats render when the camera flies in among them
        camera.near = Math.max(this.boundsDiagonal / 5000, 0.001);
        const extentDiagonal = extent && !extent.isEmpty() ? extent.getSize(new THREE.Vector3()).length() : 0;
        camera.far = dist + Math.max(this.boundsDiagonal * 10, extentDiagonal * 2);
        camera.updateProjectionMatrix();
        camera.position.copy(position);
        camera.up.copy(this.sceneUp);
        camera.lookAt(target);
        controls.target.copy(target);
        this.updateControls();
        this.lookDist = Math.max(dist, 0.01);
        this.syncYawPitch();
    }

    /**
     * Where the camera stands and what it looks at for the establishing shot of a room (ROOM_SHOT).
     * @param {any} box  the core, in the frame of the splat file
     * @param {any} q  the mesh orientation
     * @param {((point: number[], radius: number) => number) | null} crowding
     * @returns {{ position: any, target: any }}
     */
    roomShot(box, q, crowding) {
        const { THREE, sceneUp } = this;
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3()).applyQuaternion(q);
        const { narrowest, longest } = this.horizontalSides(box, q);
        // The extent of the turned box along a direction
        const edges = [new THREE.Vector3(size.x, 0, 0), new THREE.Vector3(0, size.y, 0), new THREE.Vector3(0, 0, size.z)].map(e => e.applyQuaternion(q));
        const along = dir => edges.reduce((sum, e) => sum + Math.abs(e.dot(dir)), 0);
        const height = along(sceneUp);
        const eye = center.clone().addScaledVector(sceneUp, (ROOM_SHOT.height - 0.5) * height);
        const target = center.clone().addScaledVector(sceneUp, -ROOM_SHOT.lookBelow * height);

        const inverse = q.clone().invert();
        const radius = ROOM_SHOT.clearance * Math.max(size.length(), 1e-3);
        const crowdingAt = p => (crowding ? crowding(p.clone().applyQuaternion(inverse).toArray(), radius) : 0);
        // A corner is as crowded as the camera there, plus the mean of the points of its line of sight
        const sightCrowding = corner => ROOM_SHOT.sight.reduce((sum, t) => sum + crowdingAt(corner.clone().lerp(target, t)), 0) / ROOM_SHOT.sight.length;
        let position = null, least = Infinity;
        for (const [l, n] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
            const corner = eye.clone()
                .addScaledVector(longest, l * ROOM_SHOT.corner * along(longest) / 2)
                .addScaledVector(narrowest, n * ROOM_SHOT.corner * along(narrowest) / 2);
            const score = crowdingAt(corner) + sightCrowding(corner);
            if (score < least) {
                position = corner;
                least = score;
            }
        }
        let crowded = crowdingAt(position);
        for (let i = 0; i < ROOM_SHOT.steps && crowded > ROOM_SHOT.crowded; i++) {
            position.lerp(eye, ROOM_SHOT.step);
            crowded = crowdingAt(position);
        }
        return { position, target };
    }

    /** Field of view in degrees (the projection follows). */
    setFov(fov) {
        if (Math.abs(this.camera.fov - fov) <= 1e-3) return;
        this.camera.fov = fov;
        this.camera.updateProjectionMatrix();
    }
}
