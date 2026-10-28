/**
 * Raster tile layers of the dataset map: one factory for the
 * file rasters and the clicked-photo footprints, and the View max-zoom cap that follows
 * the deepest native zoom of what is loaded.
 */
import { Tile as TileLayer } from 'ol/layer';
import { unByKey } from 'ol/Observable';
import HybridXYZ from '@/libs/map/olHybridXYZ';
import { computeNativeZoom, sourceMaxZoom, viewMaxZoom, useRetinaTiles, SOURCE_MIN_ZOOM } from '@/libs/map/rasterZoom';

/** Visualisation parameters (plant health, raster analysis) that draw anything: null for the plain tiles. */
const effectiveViz = vizParams => (vizParams && Object.keys(vizParams).length ? vizParams : null);

/** Whether two sets of visualisation parameters draw the same tiles. */
export function sameVizParams(a, b) {
    const x = effectiveViz(a);
    const y = effectiveViz(b);
    if (!x || !y) return x === y;
    const keys = Object.keys(x);
    return keys.length === Object.keys(y).length && keys.every(k => x[k] === y[k]);
}

/**
 * The tile source of a raster file: its tiles from `native` zoom down to the source minimum,
 * styled by `vizParams` when given.
 * @param {{ url: string, hash?: string, native: number, retina: boolean, vizParams?: object|null }} options
 */
export function createRasterSource({ url, hash, native, retina, vizParams = null }) {
    return new HybridXYZ({
        url,
        hash,
        tileSize: 256,
        transition: 200,
        minZoom: SOURCE_MIN_ZOOM,
        retina,
        maxZoom: sourceMaxZoom(native, retina),
        vizParams: effectiveViz(vizParams) || undefined
    });
}

/**
 * A tile layer for a file's tiles, clipped to `extent` (EPSG:3857), stamped with the
 * file and its native zoom (`rasterNativeZoom`, read by ViewZoomCap).
 * @param {{ path: string, entry: object }} file
 * @param {number[]} extent
 */
export function createRasterTileLayer(file, extent) {
    const native = computeNativeZoom(file.entry);
    const layer = new TileLayer({
        extent,
        source: createRasterSource({ url: file.path, hash: file.entry.hash, native, retina: useRetinaTiles() })
    });
    layer.set('rasterNativeZoom', native);
    layer.file = file;
    return layer;
}

/**
 * Keeps the View maxZoom capped to the deepest native raster zoom in the watched layer
 * groups (plus a small magnification allowance). Updates are coalesced into one microtask
 * (a clear + reload burst pops then re-pushes every layer) and deferred while the View is
 * animating or being dragged, so the cap never fights the user.
 */
export class ViewZoomCap {
    /**
     * @param {import('ol').Map} map
     * @param {import('ol/layer/Group').default[]} groups
     */
    constructor(map, groups) {
        this.map = map;
        this.groups = groups;
        this.applied = null;
        this.pending = false;
        this.deferredKey = null;
        const schedule = () => this.schedule();
        // lifetime: paired (removed by dispose)
        this.keys = groups.flatMap(g => [g.getLayers().on('add', schedule), g.getLayers().on('remove', schedule)]);
    }

    schedule() {
        if (this.pending) return;
        this.pending = true;
        queueMicrotask(() => {
            this.pending = false;
            this.apply();
        });
    }

    apply() {
        if (!this.map) return;
        const natives = this.groups.flatMap(g => g.getLayers().getArray().map(l => l.get('rasterNativeZoom')));
        let cap = viewMaxZoom(natives);
        if (natives.some(n => Number.isFinite(n)) && cap < SOURCE_MIN_ZOOM) cap = SOURCE_MIN_ZOOM;
        if (cap === this.applied) return;
        const view = this.map.getView();
        if (view.getAnimating() || view.getInteracting()) {
            // lifetime: paired (once; removed by dispose if still pending)
            if (!this.deferredKey) this.deferredKey = view.once('moveend', () => {
                this.deferredKey = null;
                this.apply();
            });
            return;
        }
        view.setMaxZoom(cap);
        this.applied = cap;
    }

    dispose() {
        unByKey(this.keys);
        if (this.deferredKey) unByKey(this.deferredKey);
        this.deferredKey = null;
        this.map = null;
    }
}
