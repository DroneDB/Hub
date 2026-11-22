// @ts-check
/**
 * The OpenLayers side of a map snapshot: an offscreen map (a div outside the window, sized to the snapshot) with the
 * basemap, the cover view's raster layers and the items, drawn until OpenLayers says `rendercomplete`, then its canvases
 * put on one canvas of the snapshot's size. The map is gone before the function returns; what is left is the canvas.
 *
 * The orchestration (what to draw, the basemap fallback, the overlays, the encoding) is mapSnapshot, which takes this as
 * its `engine`, so that it is tested with a fake one.
 */
import OlMap from 'ol/Map';
import View from 'ol/View';
import bbox from '@turf/bbox';
import { createEmpty, extend } from 'ol/extent';
import { bboxExtent } from '@/libs/map/mapUtils';
import { createRasterTileLayer } from '@/libs/map/rasterLayers';
import { createSnapshotBasemap } from '@/composables/useMapBasemap';
import { itemLayers } from '@/libs/reports/snapshots/snapshotItems';
import { attributionText } from '@/libs/reports/snapshots/snapshotOverlays';
import { abortError, throwIfAborted } from '@/libs/reports/snapshots/renderQueue';
import { releaseCanvas } from '@/libs/reports/snapshots/canvasImage';

/** How long a map may take to draw (its tiles included) before the snapshot is given up. */
export const RENDER_TIMEOUT_MS = 30000;

/** The extent the whole world takes when a snapshot has nothing to frame (WGS84). */
const WORLD = [-180, -85, 180, 85];

/**
 * @typedef {object} SnapshotPlan
 * @property {number} width
 * @property {number} height
 * @property {number[] | null} frame  [west, south, east, north] in degrees: what the image shows
 * @property {{ center: number[], zoom: number, rotation?: number } | null} view  the position of the cover view, for a snapshot with no frame
 * @property {{ file: { path: string, entry: any }, opacity: number, vizParams: Record<string, any> | null }[]} rasters  the layers, bottom first
 * @property {{ name: string | null } | null} basemap  null: no basemap
 * @property {any[]} items  the drawn items
 * @property {string | null} itemId  the item of an item snapshot (the others are drawn at 40 %)
 */

/**
 * @typedef {object} DrawnMap
 * @property {HTMLCanvasElement} canvas  the snapshot's canvas, with the basemap, the layers and the items
 * @property {boolean} basemapFailed  a tile of the basemap did not load
 * @property {string} attribution  the plain attribution text of the basemap ('' with none)
 * @property {() => void} dispose  gives the canvas back
 */

/**
 * The layers of a plan, bottom first: the basemap, the rasters, the items.
 * @param {SnapshotPlan} plan
 */
export function buildLayers(plan) {
    const basemap = plan.basemap ? createSnapshotBasemap(plan.basemap.name) : null;
    const rasters = plan.rasters.map(({ file, opacity, vizParams }) => {
        const footprint = bboxExtent(bbox(file.entry.polygon_geom));
        const layer = createRasterTileLayer(file, footprint, { retina: false, vizParams });
        layer.setOpacity(Number.isFinite(opacity) ? opacity : 1);
        return layer;
    });
    const items = itemLayers(plan.items, plan.itemId);
    return { basemap, rasters, items, all: [...(basemap ? [basemap] : []), ...rasters, ...items] };
}

/**
 * Where the view looks: the frame, else the position of the cover view, else the layers' footprints, else the world.
 * @param {SnapshotPlan} plan
 * @returns {{ extent: number[] } | { center: number[], zoom: number, rotation: number }}
 */
export function viewTarget(plan) {
    if (plan.frame) return { extent: bboxExtent(plan.frame) };
    if (plan.view && Array.isArray(plan.view.center) && Number.isFinite(plan.view.zoom)) {
        return { center: plan.view.center, zoom: plan.view.zoom, rotation: plan.view.rotation ?? 0 };
    }
    const all = createEmpty();
    plan.rasters.forEach(({ file }) => extend(all, bboxExtent(bbox(file.entry.polygon_geom))));
    return { extent: all[0] <= all[2] ? all : bboxExtent(WORLD) };
}

/**
 * The matrix a layer canvas is drawn with (OpenLayers sizes and places its canvases with a CSS transform, or with
 * their style size when it has none).
 * @param {HTMLCanvasElement} canvas
 * @returns {number[]}
 */
export function canvasMatrix(canvas) {
    const transform = canvas.style.transform;
    const match = transform ? /^matrix\(([^(]*)\)$/.exec(transform) : null;
    if (match) return match[1].split(',').map(Number);
    return [parseFloat(canvas.style.width) / canvas.width, 0, 0, parseFloat(canvas.style.height) / canvas.height, 0, 0];
}

/**
 * Puts the canvases of a map on one canvas, in layer order, each with its layer's opacity.
 * @param {HTMLElement} viewport
 * @param {number} width
 * @param {number} height
 * @returns {HTMLCanvasElement}
 */
export function compositeCanvases(viewport, width, height) {
    const out = document.createElement('canvas');
    out.width = width;
    out.height = height;
    const ctx = /** @type {CanvasRenderingContext2D} */ (out.getContext('2d'));
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    viewport.querySelectorAll('.ol-layer canvas, canvas.ol-layer').forEach(node => {
        const canvas = /** @type {HTMLCanvasElement} */ (node);
        if (canvas.width <= 0) return;
        const parent = /** @type {HTMLElement} */ (canvas.parentNode);
        const opacity = (parent && parent.style && parent.style.opacity) || canvas.style.opacity;
        ctx.globalAlpha = opacity === '' || opacity === undefined ? 1 : Number(opacity);
        const [a, b, c, d, e, f] = canvasMatrix(canvas);
        ctx.setTransform(a, b, c, d, e, f);
        ctx.drawImage(canvas, 0, 0);
    });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    return out;
}

/**
 * Resolves on the next `rendercomplete` of the map (every tile of the view loaded and drawn), rejects when the signal
 * aborts or when the map takes more than the timeout.
 * @param {any} map
 * @param {{ signal?: AbortSignal, timeoutMs: number }} options
 * @returns {Promise<void>}
 */
function whenRenderComplete(map, { signal, timeoutMs }) {
    return new Promise((resolve, reject) => {
        /** @type {any} */
        let timer = null;
        const finish = (/** @type {Error | null} */ error) => {
            clearTimeout(timer);
            map.un('rendercomplete', onComplete);
            if (signal) signal.removeEventListener('abort', onAbort);
            if (error) reject(error);
            else resolve();
        };
        const onComplete = () => finish(null);
        const onAbort = () => finish(abortError());
        timer = setTimeout(() => finish(new Error(`The map did not finish drawing in ${Math.round(timeoutMs / 1000)} s`)), timeoutMs);
        map.on('rendercomplete', onComplete);
        if (signal) signal.addEventListener('abort', onAbort, { once: true });
        map.render();
    });
}

/**
 * Draws a plan on an offscreen OpenLayers map.
 * @param {SnapshotPlan} plan
 * @param {{ signal?: AbortSignal, timeoutMs?: number }} [options]
 * @returns {Promise<DrawnMap>}
 */
export async function drawWithOpenLayers(plan, { signal, timeoutMs = RENDER_TIMEOUT_MS } = {}) {
    throwIfAborted(signal);
    const { width, height } = plan;
    const layers = buildLayers(plan);
    let basemapFailed = false;
    const basemapSource = layers.basemap ? layers.basemap.getSource() : null;
    // lifetime: paired (the source is disposed with the map's layers when the map is released)
    if (basemapSource) basemapSource.on('tileloaderror', () => { basemapFailed = true; });

    const target = document.createElement('div');
    target.style.cssText = `position:fixed;left:-100000px;top:0;width:${width}px;height:${height}px;pointer-events:none;`;
    document.body.appendChild(target);
    const view = new View({ projection: 'EPSG:3857', multiWorld: true });
    const map = new OlMap({ target, layers: layers.all, view, controls: [], interactions: [], pixelRatio: 1 });
    const release = () => {
        map.setTarget(undefined);
        layers.all.forEach(layer => {
            const source = layer.getSource();
            layer.dispose();
            if (source && typeof source.dispose === 'function') source.dispose();
        });
        map.dispose();
        target.remove();
    };

    try {
        map.updateSize();
        const where = viewTarget(plan);
        if ('extent' in where) view.fit(where.extent, { size: [width, height], padding: [0, 0, 0, 0] });
        else { view.setCenter(where.center); view.setZoom(where.zoom); view.setRotation(where.rotation); }
        await whenRenderComplete(map, { signal, timeoutMs });
        const canvas = compositeCanvases(map.getViewport(), width, height);
        return {
            canvas,
            basemapFailed,
            attribution: basemapSource ? attributionText(basemapSource) : '',
            dispose: () => releaseCanvas(canvas)
        };
    } finally {
        release();
    }
}

/** The engine of renderMapSnapshot: draws a plan, resolves to a DrawnMap. */
export const olEngine = Object.freeze({ draw: drawWithOpenLayers });
