// @ts-check
/**
 * The up axis of a splat scene: which of the six axes of the stored coordinates points up in the
 * world. Most INRIA/3DGS scenes are stored with y down (-y), photogrammetry and robotics exports
 * often with z up (+z). Choosing one turns the splat mesh by the quarter or half turn that lays
 * that axis along world +Y; the tilt calibration (cameraRig) is the fine adjustment on top.
 *
 * A build can also estimate the up of the scene as an arbitrary unit vector (bounds.json `up`),
 * which is not one of the six axes. That is the "auto" choice: the mesh is turned by the shortest
 * turn that takes the estimated up to +Y, exactly as for an axis, so the tilt and the camera
 * poses saved with the views work the same on it.
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

/** The choice that follows the up the build estimated; stored as this value in the views file and on the device. */
export const AUTO_UP = 'auto';

/** The lowest `upConfidence` of bounds.json at which its `up` is trusted. */
export const MIN_UP_CONFIDENCE = 0.6;

/** @typedef {typeof UP_AXES[number]['id']} UpAxis */
/** @typedef {UpAxis | 'auto'} UpChoice */

/** @param {unknown} id @returns {id is UpAxis} */
export const isUpAxis = id => UP_AXES.some(axis => axis.id === id);

/** One of the six axes or "auto". @param {unknown} id @returns {id is UpChoice} */
export const isUpChoice = id => id === AUTO_UP || isUpAxis(id);

/** @param {string} id */
const axisOf = id => UP_AXES.find(axis => axis.id === id) ?? UP_AXES[0];

/** The axis as a unit vector of the stored coordinates. @param {any} THREE @param {string} id */
export const upAxisVector = (THREE, id) => new THREE.Vector3(...axisOf(id).up);

/** The turn of the mesh that lays the axis along +Y, as [x, y, z, w]. @param {string} id @returns {number[]} */
export const upAxisQuaternion = id => [...axisOf(id).quaternion];

/**
 * The up choice a saved orientation holds: its `upAxis` (an axis or "auto"), else (views saved
 * before the axis could be chosen) its `flipped` flag, else nothing. A value this version does not
 * know is not a choice, so it falls back to the flag, then to nothing.
 * @param {{ upAxis?: unknown, flipped?: unknown } | null | undefined} orientation
 * @returns {UpChoice | undefined}
 */
export function upAxisOfOrientation(orientation) {
    if (!orientation) return undefined;
    if (isUpChoice(orientation.upAxis)) return orientation.upAxis;
    if (typeof orientation.flipped === 'boolean') return orientation.flipped ? '-y' : '+y';
    return undefined;
}

/**
 * The `flipped` flag older Hub versions read next to the axis: true for the half turn. Written
 * with every sidecar so they still show the scene the way it was saved when the axis is +y or -y.
 * It is not written for "auto": a reader that does not know that choice then falls back to its
 * default instead of showing the scene unflipped.
 * @param {string} id
 */
export const isFlippedAxis = id => id === '-y';

// ---- The up the build estimated -----------------------------------------------------------

/** How the sources of bounds.json `up` are named in the choice. */
const ESTIMATE_LABELS = Object.freeze({ georef: 'georeferenced', 'ground-plane': 'ground plane', pca: 'principal axes' });

/**
 * The up estimated at build time (bounds.json), when it can be trusted: a unit vector of three
 * finite numbers (normalised here, a zero vector has no direction) and an `upConfidence` of at
 * least MIN_UP_CONFIDENCE. Anything else is no estimate.
 * @param {any} bounds  the parsed bounds.json, or null
 * @returns {{ up: number[], source: string, label: string } | null}
 */
export function estimatedUp(bounds) {
    if (!bounds || typeof bounds !== 'object') return null;
    const { up, upConfidence } = bounds;
    if (typeof upConfidence !== 'number' || !(upConfidence >= MIN_UP_CONFIDENCE)) return null;
    if (!Array.isArray(up) || up.length !== 3 || !up.every(v => typeof v === 'number' && Number.isFinite(v))) return null;
    const length = Math.hypot(up[0], up[1], up[2]);
    if (!(length > 1e-9)) return null;
    const known = Object.hasOwn(ESTIMATE_LABELS, bounds.upSource);
    return {
        up: up.map(v => v / length),
        source: known ? bounds.upSource : 'estimated',
        label: `Auto (${known ? ESTIMATE_LABELS[bounds.upSource] : 'estimated'})`
    };
}

/**
 * The up that "auto" follows: the one the views file saved when the choice was made (a unit
 * vector of three finite numbers, normalised here), else the build's estimate. The saved vector wins
 * so that the camera views saved with it stay right when a rebuild estimates another up.
 * @param {any} bounds  the parsed bounds.json, or null
 * @param {unknown} [savedUp]  the vector the views file holds for "auto", if any
 * @returns {{ up: number[], source: string, label: string } | null}
 */
export function resolvedAutoUp(bounds, savedUp) {
    const estimate = estimatedUp(bounds);
    if (!Array.isArray(savedUp) || savedUp.length !== 3 || !savedUp.every(v => typeof v === 'number' && Number.isFinite(v))) return estimate;
    const length = Math.hypot(savedUp[0], savedUp[1], savedUp[2]);
    if (!(length > 1e-9)) return estimate;
    return {
        up: savedUp.map(v => v / length),
        source: 'saved',
        label: estimate ? estimate.label : 'Auto (saved with the views)'
    };
}

/**
 * The choices of the Up axis select: "auto" first when there is an up to follow, then the axes.
 * @param {{ label: string } | null} estimate
 */
export const upChoices = estimate => (estimate ? [{ id: AUTO_UP, label: estimate.label }, ...UP_AXES] : [...UP_AXES]);

/**
 * The choice the viewer opens with. Precedence: the orientation saved with the views, then what
 * the user chose on this device (a choice of the user beats an estimate), then the up the build
 * estimated, then the default. "auto" is only a choice while there is an up to follow (a rebuild
 * may have lost the estimate, unless the views saved the vector), so without one it is skipped
 * and the next source decides.
 * @param {object} sources
 * @param {unknown} [sources.saved]   the up choice of the views file, if it has one
 * @param {unknown} [sources.savedUp] the vector "auto" resolved to in the views file, if it has one
 * @param {unknown} [sources.local]   the up choice remembered on this device, if any
 * @param {any} [sources.bounds]      the parsed bounds.json, or null
 * @returns {UpChoice}
 */
export function openingUpChoice({ saved, savedUp, local, bounds } = {}) {
    const estimate = resolvedAutoUp(bounds, savedUp);
    const usable = /** @type {(c: unknown) => c is UpChoice} */ (c => isUpChoice(c) && (c !== AUTO_UP || !!estimate));
    return [saved, local].find(usable) ?? (estimate ? AUTO_UP : DEFAULT_UP_AXIS);
}

/**
 * The turn that takes the unit vector `from` to +Y by the shortest way, as [x, y, z, w]. Exactly
 * opposite vectors (-Y) turn half a turn about X, the turn of the table's -y axis.
 * @param {number[]} from
 * @returns {number[]}
 */
export function quaternionToWorldUp([x, y, z]) {
    // The axis is from x to +Y: (x, y, z) cross (0, 1, 0) = (-z, 0, x); the angle's cosine is y
    if (y < -1 + 1e-9) {
        // Opposite: any axis perpendicular to +Y will do
        return [1, 0, 0, 0];
    }
    // The half-angle form: q = (axis, 1 + cos) normalised
    // (0 - z rather than -z: a vector with z = 0 must not give a negative zero)
    const qx = 0 - z, qz = x, qw = 1 + y;
    const n = Math.hypot(qx, qz, qw);
    return [qx / n, 0, qz / n, qw / n];
}

/**
 * The turn of the mesh for a choice: the table's for an axis (kept exact, saved views depend on it),
 * the up that "auto" follows for "auto" (no turn without one).
 * @param {string} choice
 * @param {{ up: number[] } | null} autoUp  from resolvedAutoUp
 * @returns {number[]}
 */
export function upChoiceQuaternion(choice, autoUp) {
    return choice === AUTO_UP && autoUp ? quaternionToWorldUp(autoUp.up) : upAxisQuaternion(choice);
}
