// @ts-check
/**
 * The raster layers of a snapshot: the layers of the cover view that the map could draw now, bottom first, each with
 * the opacity and the visualisation parameters the view keeps. Whether a layer can be drawn is the map's own rule
 * (resolveLayer: the file is there, is a georaster, and is built), so a report never draws a file the map would not.
 * A layer that cannot be drawn is left out and the rest are drawn.
 *
 * A report page asks for a snapshot of each item, all with the same layers: what a file is now is asked once per path
 * for a minute, not once per snapshot.
 */
import { resolveLayer } from '@/libs/map/georasterLayers';

/** How long what a file is stays known. */
export const RESOLVED_TTL_MS = 60000;

/** @type {WeakMap<object, Map<string, { at: number, resolved: Promise<any> }>>} */
const known = new WeakMap();

/**
 * @param {any} dataset
 * @param {string} path
 * @param {() => number} now
 */
function resolved(dataset, path, now) {
    let byPath = known.get(dataset);
    if (!byPath) known.set(dataset, byPath = new Map());
    const hit = byPath.get(path);
    if (hit && now() - hit.at < RESOLVED_TTL_MS) return hit.resolved;
    const entry = { at: now(), resolved: resolveLayer(dataset, path) };
    byPath.set(path, entry);
    return entry.resolved;
}

/**
 * @param {any} dataset
 * @param {{ path: string, opacity?: number, vizParams?: Record<string, any> | null }[]} layers  the visible layers of the cover view, top first
 * @param {{ now?: () => number }} [options]
 * @returns {Promise<{ file: { path: string, entry: any }, opacity: number, vizParams: Record<string, any> | null }[]>}  bottom first
 */
export async function resolveCoverLayers(dataset, layers, { now = Date.now } = {}) {
    const list = layers || [];
    const results = await Promise.all(list.map(layer => resolved(dataset, layer.path, now)));
    return list
        .map((layer, i) => ({ layer, result: results[i] }))
        .filter(({ result }) => result.status === 'ok' && result.entry && result.entry.polygon_geom)
        .map(({ layer, result }) => ({
            file: { path: dataset.remoteUri(layer.path), entry: result.entry },
            opacity: layer.opacity ?? 1,
            vizParams: layer.vizParams ?? null
        }))
        .reverse();
}
