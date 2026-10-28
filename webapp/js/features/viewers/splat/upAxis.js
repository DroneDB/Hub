// @ts-check
/**
 * The up axis of a splat scene: which of the six axes of the stored coordinates points up in the
 * world. Most INRIA/3DGS scenes are stored with y down (-y), photogrammetry and robotics exports
 * often with z up (+z). Choosing one turns the splat mesh by the quarter or half turn that lays
 * that axis along world +Y; the tilt calibration (cameraRig) is the fine adjustment on top.
 */

const H = Math.SQRT1_2;

/**
 * `up` is the axis in the stored coordinates; `quaternion` ([x, y, z, w]) is the turn of the mesh
 * that takes it to +Y. The -y turn is the half turn about X the viewer always used for "flipped"
 * scenes, so camera views saved with it stay valid.
 */
export const UP_AXES = Object.freeze([
    { id: '+y', label: '+Y (as stored)', up: [0, 1, 0], quaternion: [0, 0, 0, 1] },
    { id: '-y', label: '−Y (upside down)', up: [0, -1, 0], quaternion: [1, 0, 0, 0] },
    { id: '+z', label: '+Z (Z-up scene)', up: [0, 0, 1], quaternion: [-H, 0, 0, H] },
    { id: '-z', label: '−Z', up: [0, 0, -1], quaternion: [H, 0, 0, H] },
    { id: '+x', label: '+X', up: [1, 0, 0], quaternion: [0, 0, H, H] },
    { id: '-x', label: '−X', up: [-1, 0, 0], quaternion: [0, 0, -H, H] }
]);

/** What a scene is until the user or the saved views say otherwise: most splats render upside down without the half turn. */
export const DEFAULT_UP_AXIS = '-y';

/** @typedef {typeof UP_AXES[number]['id']} UpAxis */

/** @param {unknown} id @returns {id is UpAxis} */
export const isUpAxis = id => UP_AXES.some(axis => axis.id === id);

/** @param {string} id */
const axisOf = id => UP_AXES.find(axis => axis.id === id) ?? UP_AXES[0];

/** The axis as a unit vector of the stored coordinates. @param {any} THREE @param {string} id */
export const upAxisVector = (THREE, id) => new THREE.Vector3(...axisOf(id).up);

/** The turn of the mesh that lays the axis along +Y, as [x, y, z, w]. @param {string} id @returns {number[]} */
export const upAxisQuaternion = id => [...axisOf(id).quaternion];

/**
 * The up axis a saved orientation holds: its `upAxis`, else (views saved before the axis could be
 * chosen) its `flipped` flag, else nothing.
 * @param {{ upAxis?: unknown, flipped?: unknown } | null | undefined} orientation
 * @returns {UpAxis | undefined}
 */
export function upAxisOfOrientation(orientation) {
    if (!orientation) return undefined;
    if (isUpAxis(orientation.upAxis)) return orientation.upAxis;
    if (typeof orientation.flipped === 'boolean') return orientation.flipped ? '-y' : '+y';
    return undefined;
}

/**
 * The `flipped` flag older Hub versions read next to the axis: true for the half turn. Written
 * with every sidecar so they still show the scene the way it was saved when the axis is +y or -y.
 * @param {string} id
 */
export const isFlippedAxis = id => id === '-y';
