/**
 * Saved camera views of a splat (HQ-08, out of Splat.vue): the `<name>_cameras.json`
 * sidecar next to the splat, with the cameras and the scene orientation (flip and
 * ground-plane calibration).
 */

/** Sidecar path of a splat entry. */
export const camerasPathFor = entryPath => `${entryPath.replace(/\.[^./\\]+$/, '')}_cameras.json`;

const nums = (a, n) => (Array.isArray(a) && a.length >= n ? a.slice(0, n).map(Number) : null);

/**
 * A camera in the canonical (three.js) shape, or null when it has no position.
 * @param {any} c @param {number} i
 */
export function normalizeCamera(c, i) {
    const position = c && nums(c.position, 3);
    if (!position) return null;
    const quaternion = Array.isArray(c.quaternion) && c.quaternion.length === 4 ? c.quaternion.map(Number) : [0, 0, 0, 1];
    return {
        id: c.id !== undefined ? c.id : i,
        name: c.name || `Camera ${i + 1}`,
        position,
        quaternion,
        fov: typeof c.fov === 'number' ? c.fov : 60,
        target: Array.isArray(c.target) && c.target.length === 3 ? c.target.map(Number) : null
    };
}

/**
 * Reads a sidecar (a bare array of cameras, or { cameras, orientation }).
 * @param {string} text
 * @returns {{ cameras: any[], orientation: { flipped?: boolean, tiltRoll?: number, tiltPitch?: number } }}
 */
export function parseCamerasFile(text) {
    const data = JSON.parse(text);
    const list = Array.isArray(data) ? data : (data && Array.isArray(data.cameras) ? data.cameras : []);
    const o = (data && data.orientation) || {};
    const orientation = {};
    if (typeof o.flipped === 'boolean') orientation.flipped = o.flipped;
    if (typeof o.tiltRoll === 'number') orientation.tiltRoll = o.tiltRoll;
    if (typeof o.tiltPitch === 'number') orientation.tiltPitch = o.tiltPitch;
    return { cameras: list.map(normalizeCamera).filter(Boolean), orientation };
}

/** The sidecar's JSON. */
export function serializeCamerasFile(cameras, orientation) {
    return JSON.stringify({
        version: 1,
        orientation: { flipped: orientation.flipped, tiltRoll: orientation.tiltRoll, tiltPitch: orientation.tiltPitch },
        cameras: cameras.map(({ id, name, position, quaternion, fov, target }) => ({ id, name, position, quaternion, fov, target }))
    }, null, 2);
}

/** The rig's current view as a camera. */
export function cameraFromRig(rig, name) {
    const { position: p, quaternion: q, fov } = rig.camera;
    const t = rig.controls.target;
    return {
        id: Date.now() + Math.floor(Math.random() * 1000),
        name,
        position: [p.x, p.y, p.z],
        quaternion: [q.x, q.y, q.z, q.w],
        fov,
        target: [t.x, t.y, t.z]
    };
}

/** World pose of a camera; without a target it looks half the scene ahead. */
export function poseOf(rig, c) {
    const { THREE } = rig;
    const position = new THREE.Vector3(...c.position);
    const target = c.target
        ? new THREE.Vector3(...c.target)
        : position.clone().addScaledVector(new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion(...c.quaternion)),
            rig.boundsDiagonal * 0.5 || 1);
    return { position, target, fov: typeof c.fov === 'number' ? c.fov : 60 };
}

/**
 * Index of the active camera after the list changed: `removed` was deleted, or `from`
 * moved to `to`.
 */
export function activeAfterDelete(active, removed) {
    if (active === null || active === removed) return null;
    return active > removed ? active - 1 : active;
}
export function activeAfterMove(active, from, to) {
    if (active === from) return to;
    if (active === to) return from;
    return active;
}
