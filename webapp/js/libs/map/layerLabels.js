/**
 * Labels for a set of layers that come from dataset paths: the file name when it is unique in the
 * set, otherwise the shortest run of trailing path segments that tells the colliding paths apart.
 */

const segmentsOf = path => String(path).split('/').filter(Boolean);

const suffix = (segments, depth) => segments.slice(-depth).join('/');

/**
 * @param {string[]} paths dataset-relative paths (repeated paths are one layer)
 * @returns {Map<string, string>} label by path
 */
export function layerLabels(paths) {
    const unique = [...new Set(paths)];
    const segments = new Map(unique.map(p => [p, segmentsOf(p)]));
    const labels = new Map();
    let pending = unique;

    // Grow the suffix one segment at a time for the paths that still share a label with another
    for (let depth = 1; pending.length > 0; depth++) {
        const counts = new Map();
        for (const p of pending) {
            const label = suffix(segments.get(p), depth);
            counts.set(label, (counts.get(label) ?? 0) + 1);
        }
        const next = [];
        for (const p of pending) {
            const segs = segments.get(p);
            const label = suffix(segs, depth);
            // A path with no more segments to add cannot become more specific
            if (counts.get(label) === 1 || depth >= segs.length) labels.set(p, label);
            else next.push(p);
        }
        pending = next;
    }

    return labels;
}
