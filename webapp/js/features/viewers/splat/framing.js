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
