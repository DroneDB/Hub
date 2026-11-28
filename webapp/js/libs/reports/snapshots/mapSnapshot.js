// @ts-check
/**
 * The image of a map snapshot block of the report model: the cover view's visible layers (in their order, with their
 * opacity and parameters) on the basemap, the items with their callouts, the attribution of the basemap and, when the
 * block has one, the legend.
 *
 * A basemap whose provider does not allow its tiles to be exported (a tile that does not load with CORS, or a canvas the
 * browser calls tainted) does not fail the snapshot: it is drawn again without the basemap and says so in its note.
 */
import { resolveCoverLayers } from '@/libs/reports/snapshots/coverLayers';
import { olEngine } from '@/libs/reports/snapshots/olEngine';
import { drawAttribution, drawLegend } from '@/libs/reports/snapshots/snapshotOverlays';
import { canvasToBlob, isTaintedCanvasError } from '@/libs/reports/snapshots/canvasImage';
import { throwIfAborted } from '@/libs/reports/snapshots/renderQueue';

/** What the note says when the basemap is left out. */
export const BASEMAP_NOT_SHOWN = 'Basemap not shown: provider does not allow export';

/** The size of a snapshot (1600 x 1000 is the size the render time is measured at). */
export const SNAPSHOT_SIZE = Object.freeze({ width: 1600, height: 1000 });

/** The basemap could not be exported: draw again without it. */
class BasemapNotExportable extends Error {}

/**
 * @param {any} block
 * @param {{ width: number, height: number }} size
 * @param {any[]} rasters
 * @param {boolean} withBasemap
 * @returns {import('./olEngine').SnapshotPlan}
 */
function planOf(block, { width, height }, rasters, withBasemap) {
    return {
        width, height,
        frame: Array.isArray(block.frame) ? block.frame : null,
        view: block.view ?? null,
        rasters,
        basemap: withBasemap ? { name: block.basemap ?? null } : null,
        // A non-georeferenced item has no geometry and is never drawn
        items: (block.items || []).filter((/** @type {any} */ i) => i && i.geometry),
        itemId: block.kind === 'item' ? block.itemId ?? null : null
    };
}

/**
 * One drawing of the plan, to an image.
 * @param {import('./olEngine').SnapshotPlan} plan
 * @param {any} block
 * @param {{ engine: { draw: Function }, signal?: AbortSignal }} options
 * @returns {Promise<Blob>}
 */
async function drawOnce(plan, block, { engine, signal }) {
    const drawn = await engine.draw(plan, { signal });
    try {
        if (plan.basemap && drawn.basemapFailed) throw new BasemapNotExportable('A tile of the basemap did not load');
        const ctx = drawn.canvas.getContext('2d');
        if (ctx) {
            if (plan.basemap) drawAttribution(ctx, drawn.attribution, plan.width, plan.height);
            drawLegend(ctx, block.legend || [], plan.width);
        }
        try {
            return await canvasToBlob(drawn.canvas);
        } catch (e) {
            // A tile that was fetched without CORS taints the canvas: the browser refuses to read it back
            if (plan.basemap && isTaintedCanvasError(e)) throw new BasemapNotExportable('The canvas is tainted');
            throw e;
        }
    } finally {
        drawn.dispose();
    }
}

/**
 * Renders a map snapshot block.
 * @param {any} block  a `mapSnapshot` block of the report model
 * @param {{ dataset: any, width?: number, height?: number, signal?: AbortSignal, engine?: { draw: Function } }} options
 *   `engine`: what draws a plan (OpenLayers; a test gives a fake one)
 * @returns {Promise<{ image: Blob, width: number, height: number, note: string | null }>}
 */
export async function renderMapSnapshot(block, { dataset, width = SNAPSHOT_SIZE.width, height = SNAPSHOT_SIZE.height, signal, engine = olEngine } = /** @type {any} */ ({})) {
    throwIfAborted(signal);
    const size = { width, height };
    // A deleted cover view has no layers (the model gives none): the items are on the basemap only
    const rasters = await resolveCoverLayers(dataset, block.coverDeleted ? [] : block.layers || []);
    throwIfAborted(signal);
    try {
        const image = await drawOnce(planOf(block, size, rasters, true), block, { engine, signal });
        return { image, ...size, note: null };
    } catch (e) {
        if (!(e instanceof BasemapNotExportable)) throw e;
    }
    throwIfAborted(signal);
    const image = await drawOnce(planOf(block, size, rasters, false), block, { engine, signal });
    return { image, ...size, note: BASEMAP_NOT_SHOWN };
}
