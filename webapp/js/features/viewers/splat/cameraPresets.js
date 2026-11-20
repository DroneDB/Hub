/**
 * The views file of a splat: the `<name>_cameras.json` sidecar next to the splat. Version 2 holds
 * the scene orientation (up axis, ground-plane calibration and, for "auto", the up it resolved
 * to), the scale, the cameras, the pins and the saved measurements. Version 1 (the orientation
 * and the cameras) and the first layout (a bare array of cameras, or cameras with an orientation
 * and no version) are read as they are: a file is only rewritten as version 2 when the user saves.
 */
import { upAxisOfOrientation, isFlippedAxis, AUTO_UP } from './upAxis';
import { isVec3 } from './measureMath';
import { newId, idOf, normalizeList, normalizeScale, normalizeAnnotation, normalizeMeasurement } from './sceneData';

/** The version this viewer writes. */
export const SIDECAR_VERSION = 2;

/** Sidecar path of a splat entry. */
export const camerasPathFor = entryPath => `${entryPath.replace(/\.[^./\\]+$/, '')}_cameras.json`;

/**
 * The first `n` values of a list as numbers (a number written as text is read), or null when the
 * list is shorter or one of them is not a finite number: a NaN would put the camera nowhere.
 * @param {unknown} a @param {number} n
 */
const nums = (a, n) => {
    if (!Array.isArray(a) || a.length < n) return null;
    const v = a.slice(0, n).map(Number);
    return v.every(Number.isFinite) ? v : null;
};

/**
 * A camera in the canonical (three.js) shape, or null when it has no position. A rotation, a
 * target or a field of view that is not made of finite numbers is replaced by the default.
 * @param {any} c @param {number} i
 */
export function normalizeCamera(c, i) {
    const position = c && nums(c.position, 3);
    if (!position) return null;
    return {
        id: idOf(c, i),
        name: c.name || `Camera ${i + 1}`,
        position,
        quaternion: (c.quaternion?.length === 4 && nums(c.quaternion, 4)) || [0, 0, 0, 1],
        fov: Number.isFinite(c.fov) && c.fov > 0 ? c.fov : 60,
        target: (c.target?.length === 3 && nums(c.target, 3)) || null
    };
}

/**
 * Reads a sidecar of any version. The orientation holds the fields the file has: `upAxis` (from
 * its `upAxis`, else from the `flipped` flag of files saved before the axis could be chosen),
 * `up` (the vector "auto" resolved to when it was saved), `tiltRoll` and `tiltPitch`. A file
 * without scale, pins or measurements (every file before version 2) has none.
 * @param {string} text
 */
export function parseCamerasFile(text) {
    const data = JSON.parse(text);
    const list = Array.isArray(data) ? data : (data && Array.isArray(data.cameras) ? data.cameras : []);
    const o = (data && data.orientation) || {};
    /** @type {{ upAxis?: import('./upAxis').UpChoice, up?: number[], tiltRoll?: number, tiltPitch?: number }} */
    const orientation = {};
    const upAxis = upAxisOfOrientation(o);
    if (upAxis !== undefined) orientation.upAxis = upAxis;
    if (isVec3(o.up) && Math.hypot(...o.up) > 1e-9) orientation.up = o.up.slice();
    if (typeof o.tiltRoll === 'number') orientation.tiltRoll = o.tiltRoll;
    if (typeof o.tiltPitch === 'number') orientation.tiltPitch = o.tiltPitch;
    const fields = Array.isArray(data) || !data ? {} : data;
    return {
        cameras: normalizeList(list, normalizeCamera, 'cameras'),
        orientation,
        scale: normalizeScale(fields.scale),
        annotations: normalizeList(fields.annotations, normalizeAnnotation, 'pins'),
        measurements: normalizeList(fields.measurements, normalizeMeasurement, 'measurements')
    };
}

/**
 * The sidecar's JSON (version 2). The orientation is written with `upAxis` (an axis, or "auto" for
 * the up the build estimated, with the vector it resolved to as `up`, so saved views survive a
 * rebuild that estimates another) and, next to an axis, the `flipped` flag older versions of the
 * viewer read (true for the -y half turn). "auto" has no flag: those versions do not know it and
 * use their default. Older versions read the cameras and the orientation and ignore the rest.
 * @param {any[]} cameras
 * @param {{ upAxis: string, up?: number[] | null, tiltRoll: number, tiltPitch: number }} orientation
 * @param {{ scale?: { metersPerUnit: number } | null, annotations?: any[], measurements?: any[] }} [extras]
 */
export function serializeCamerasFile(cameras, orientation, { scale = null, annotations = [], measurements = [] } = {}) {
    const auto = orientation.upAxis === AUTO_UP;
    return JSON.stringify({
        version: SIDECAR_VERSION,
        orientation: {
            upAxis: orientation.upAxis,
            flipped: auto ? undefined : isFlippedAxis(orientation.upAxis),
            up: auto && orientation.up ? orientation.up : undefined,
            tiltRoll: orientation.tiltRoll,
            tiltPitch: orientation.tiltPitch
        },
        scale: scale ? { metersPerUnit: scale.metersPerUnit } : undefined,
        cameras: cameras.map(({ id, name, position, quaternion, fov, target }) => ({ id, name, position, quaternion, fov, target })),
        annotations: annotations.map(({ id, title, text, link, image, position, view }) => ({ id, title, text, link, image, position, view })),
        measurements: measurements.map(({ id, kind, points }) => ({ id, kind, points }))
    }, null, 2);
}

/** Where the rig looks from and at, with its field of view: the part of a camera that a pin saves too. */
export function viewFromRig(rig) {
    const { position: p, quaternion: q, fov } = rig.camera;
    const t = rig.controls.target;
    return {
        position: [p.x, p.y, p.z],
        quaternion: [q.x, q.y, q.z, q.w],
        fov,
        target: [t.x, t.y, t.z]
    };
}

/** The rig's current view as a camera. */
export function cameraFromRig(rig, name) {
    return { id: newId(), name, ...viewFromRig(rig) };
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
