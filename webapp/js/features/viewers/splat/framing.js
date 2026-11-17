import { FRAMING, framingOf } from './cameraRig';

/**
 * Framing of a splat that is not ready to be framed yet. A paged .rad has no resident splats until
 * its first chunks arrive, so the framing is tried again until it can frame the core of the scene
 * (coreBox), the build-time bounds standing in meanwhile. The first framing always
 * happens (the splat has not been seen before it), but the retries stop once the user took the camera:
 * a late framing would pull the view away from where they went, the same rule the unified viewer
 * keeps with its `userInteracted` flag.
 */

export const FRAME_RETRY_MS = 250;
// About ten seconds
export const FRAME_ATTEMPTS = 40;

/**
 * @param {object} options
 * @param {() => boolean} options.frame            frames the camera; returns whether a real box was framed
 * @param {() => boolean} options.userInteracted   whether the user moved the camera
 * @param {number} [options.attempts]
 * @param {number} [options.intervalMs]
 */
export function createFrameRetry({ frame, userInteracted, attempts = FRAME_ATTEMPTS, intervalMs = FRAME_RETRY_MS }) {
    /** @type {ReturnType<typeof setTimeout> | null} */
    let timer = null;

    function cancel() {
        if (timer !== null) clearTimeout(timer);
        timer = null;
    }

    function attempt(n) {
        timer = null;
        if ((n > 0 && userInteracted()) || frame() || n + 1 >= attempts) return;
        // lifetime: paired (cancel() on unmount)
        timer = setTimeout(() => attempt(n + 1), intervalMs);
    }

    return {
        /** Frames now, and again until it worked, the attempts ran out or the user took the camera. */
        start() {
            cancel();
            attempt(0);
        },
        cancel
    };
}

/**
 * The share of the splats a framing looks at, per axis: the splats between these quantiles of the
 * splat centres. A capture is full of floaters and far background splats (a sky dome hundreds of
 * metres out around a 10 m subject): the bounds of every splat put the subject in a corner, a few
 * pixels wide. A scene framed from inside looks at the central 80 % of it (where the subject of a
 * capture is), a georeferenced site seen whole at all but the outer 1 % on each side.
 */
export const CORE_QUANTILES = Object.freeze({ immersive: [0.1, 0.9], overview: [0.01, 0.99] });

// Fewer resident splats than this say nothing reliable about where the scene is
export const MIN_CORE_SAMPLES = 64;
// The splat centres read for the quantiles: a stride over the resident splats above this
export const MAX_CORE_SAMPLES = 200000;

/**
 * The value at quantile `q` (0..1) of `values`, sorted in place, by linear interpolation.
 * @param {Float64Array} values
 * @param {number} q
 */
function quantileOfSorted(values, q) {
    const position = (values.length - 1) * q;
    const below = Math.floor(position);
    const above = Math.min(values.length - 1, below + 1);
    return values[below] + (values[above] - values[below]) * (position - below);
}

/**
 * The box of the core of a splat: per axis, from the `low` to the `high` quantile of the centres.
 *
 * @param {ArrayLike<number>} centers - x, y, z of each splat centre.
 * @param {number[]} quantiles - [low, high], 0..1.
 * @returns {{ min: number[], max: number[] } | null} null with fewer than MIN_CORE_SAMPLES centres.
 */
export function coreBox(centers, [low, high]) {
    const count = Math.floor(centers.length / 3);
    if (count < MIN_CORE_SAMPLES) return null;
    const min = [], max = [];
    const axis = new Float64Array(count);
    for (let a = 0; a < 3; a++) {
        let finite = 0;
        for (let i = 0; i < count; i++) {
            const v = centers[i * 3 + a];
            if (Number.isFinite(v)) axis[finite++] = v;
        }
        if (finite < MIN_CORE_SAMPLES) return null;
        const values = axis.subarray(0, finite).sort();
        min.push(quantileOfSorted(values, low));
        max.push(quantileOfSorted(values, high));
    }
    return { min, max };
}

/**
 * The centres of the splats a mesh holds now (all of a whole file, the loaded pages of a paged
 * one), every n-th one past MAX_CORE_SAMPLES.
 *
 * @param {any} mesh - a Spark SplatMesh (forEachSplat, splats.numSplats).
 * @param {number} [maxSamples]
 * @returns {Float32Array} x, y, z per sampled centre.
 */
export function residentSplatCenters(mesh, maxSamples = MAX_CORE_SAMPLES) {
    const resident = Number(mesh?.splats?.numSplats) || 0;
    if (!resident || typeof mesh.forEachSplat !== 'function') return new Float32Array(0);
    const stride = Math.max(1, Math.ceil(resident / maxSamples));
    const centers = new Float32Array(Math.ceil(resident / stride) * 3);
    let n = 0;
    mesh.forEachSplat((index, center) => {
        if (index % stride !== 0 || n + 3 > centers.length) return;
        centers[n++] = center.x;
        centers[n++] = center.y;
        centers[n++] = center.z;
    });
    return centers.subarray(0, n);
}

/**
 * The kinds of capture a build tells apart (bounds.json `framing.kind`): the cameras went round an
 * object, were inside a scene (a room), or looked down on a site (from the air, or georeferenced).
 */
export const CAPTURE_KINDS = Object.freeze(['object', 'scene', 'site']);

/** @param {unknown} v */
const isFiniteNumber = v => typeof v === 'number' && Number.isFinite(v);

/**
 * The framing the build worked out from every splat of the scene (bounds.json `framing`): the kind of
 * capture and the box of its core, in the frame of the splat file. A hint this version cannot read
 * (an unknown kind, a core that is not six finite numbers with its minimum at or below its maximum),
 * and the bounds.json of a build made before builds wrote one, are no hint: the viewer then frames the
 * core of the resident splats (coreBox).
 * @param {any} bounds  the parsed bounds.json, or null
 * @returns {{ kind: 'object' | 'scene' | 'site', core: { min: number[], max: number[] } } | null}
 */
export function framingHint(bounds) {
    const framing = bounds && typeof bounds === 'object' ? bounds.framing : null;
    if (!framing || typeof framing !== 'object' || !CAPTURE_KINDS.includes(framing.kind)) return null;
    const { core } = framing;
    if (!Array.isArray(core) || core.length !== 6 || !core.every(isFiniteNumber)) return null;
    const min = core.slice(0, 3), max = core.slice(3);
    if (min.some((v, a) => v > max[a])) return null;
    return { kind: framing.kind, core: { min, max } };
}

/**
 * What the viewer frames. With the build's hint (framingHint), its core, framed as its kind of capture
 * says and facing the sides of the core; without, the core of the resident splats (coreBox between the
 * quantiles of the framing: a georeferenced scene seen whole from above, any other from inside), null
 * while too few splats are resident. The resident splats are read without a hint, and for a room (to
 * keep its camera out of its walls, crowdingOf). `settled` is false while the framing waits for
 * resident splats: the viewer frames again when more have arrived.
 * @param {object} scene
 * @param {any} scene.bounds  the parsed bounds.json, or null
 * @param {boolean} [scene.georeferenced]
 * @param {() => ArrayLike<number>} scene.residentCenters  x, y, z of the resident splats (residentSplatCenters)
 * @returns {{ framing: string, core: { min: number[], max: number[] } | null, faceBox: boolean, crowding: ((point: number[], radius: number) => number) | null, settled: boolean }}
 */
export function chooseFraming({ bounds, georeferenced, residentCenters }) {
    const hint = framingHint(bounds);
    const framing = framingOf({ georeferenced, kind: hint?.kind });
    if (!hint) {
        const core = coreBox(residentCenters(), CORE_QUANTILES[framing]);
        return { framing, core, faceBox: false, crowding: null, settled: !!core };
    }
    // A room is framed clear of its walls and furniture once enough of its splats are resident
    const crowding = framing === FRAMING.IMMERSIVE ? crowdingOf(residentCenters(), hint.core) : null;
    return { framing, core: hint.core, faceBox: true, crowding, settled: framing !== FRAMING.IMMERSIVE || !!crowding };
}

// The resident splats in the core a room is kept clear of its walls with: the coarse first pages of a
// paged scene are too few and too large to show where its walls are
export const MIN_ROOM_SAMPLES = 5000;

/**
 * How crowded a point is, from the resident splats (`centers`, in the frame of the splat file): the
 * number of their centres within `radius` of it, per volume, against their mean density in the
 * `core`. 0 in the air of a room, about 1 among its contents on average, more in a wall it cuts.
 * Null with fewer than MIN_ROOM_SAMPLES centres in the core: too few to tell.
 * @param {ArrayLike<number>} centers
 * @param {{ min: number[], max: number[] }} core
 * @returns {((point: number[], radius: number) => number) | null}
 */
export function crowdingOf(centers, core) {
    const count = Math.floor(centers.length / 3);
    let inCore = 0;
    for (let i = 0; i < count; i++) {
        let inside = true;
        for (let a = 0; a < 3 && inside; a++) {
            const v = centers[i * 3 + a];
            inside = v >= core.min[a] && v <= core.max[a];
        }
        if (inside) inCore++;
    }
    if (inCore < MIN_ROOM_SAMPLES) return null;
    const sides = core.max.map((max, a) => max - core.min[a]);
    // A flat core has no volume: its thinnest side is taken as a thousandth of its widest
    const widest = Math.max(...sides);
    const volume = sides.reduce((v, side) => v * Math.max(side, widest / 1000), 1);
    const mean = inCore / volume;
    return ([x, y, z], radius) => {
        const r2 = radius * radius;
        let near = 0;
        for (let i = 0; i < count; i++) {
            const dx = centers[i * 3] - x, dy = centers[i * 3 + 1] - y, dz = centers[i * 3 + 2] - z;
            if (dx * dx + dy * dy + dz * dz <= r2) near++;
        }
        return near / ((4 / 3) * Math.PI * radius ** 3) / mean;
    };
}
