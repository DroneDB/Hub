/**
 * Raster tile layers of the dataset map: one factory for the
 * file rasters and the clicked-photo footprints, and the View max-zoom cap that follows
 * the deepest native zoom of what is loaded.
 */
import { Tile as TileLayer } from 'ol/layer';
import { unByKey } from 'ol/Observable';
import { buffer as bufferExtent, getTopLeft } from 'ol/extent';
import { get as getProjection } from 'ol/proj';
import TileGrid from 'ol/tilegrid/TileGrid';
import { createXYZ } from 'ol/tilegrid';
import ddb from 'ddb';
import { EPSG } from '@/libs/constants';
import HybridXYZ from '@/libs/map/olHybridXYZ';
import { computeNativeZoom, sourceMaxZoom, viewMaxZoom, useRetinaTiles, SOURCE_MIN_ZOOM, INITIAL_RESOLUTION } from '@/libs/map/rasterZoom';

// The layer property that holds the footprint of the file (rasterFootprint)
const FOOTPRINT = 'rasterFootprint';

/** The size (px) of a tile of the grid the tiles are addressed on (a retina tile covers the same area with 512 px) */
const TILE_SIZE = 256;

/**
 * How far past its points (pixels of a 256 px tile) a point cloud tile draws: a point is a disc of radius 2 px around
 * the pixel that holds it, so a point on the edge of the footprint colours pixels up to 3 px beyond the edge.
 */
export const POINT_DISC_REACH_PX = 3;

/**
 * The margin (EPSG:3857 metres) around the footprint of a point cloud in which its tiles still draw: the disc reach at
 * the coarsest tiles the layer asks for (SOURCE_MIN_ZOOM, 256 px, about 29 m), so no zoom clips a disc.
 */
export const POINT_CLOUD_EXTENT_PAD = POINT_DISC_REACH_PX * INITIAL_RESOLUTION / 2 ** SOURCE_MIN_ZOOM;

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
 * The XYZ tile grid (zooms `minZoom` to `maxZoom`) with tiles only over `extent` (EPSG:3857): the tiles are those of the
 * standard grid, and one that does not touch the extent is empty (it is not asked for and is drawn as nothing).
 * @param {number[]} extent
 * @param {{ minZoom: number, maxZoom: number }} zooms
 */
export function tileGridWithin(extent, { minZoom, maxZoom }) {
    const world = getProjection(EPSG.WEB_MERCATOR).getExtent();
    const resolutions = createXYZ({ extent: world, maxZoom, tileSize: TILE_SIZE }).getResolutions();
    return new TileGrid({ extent, origin: getTopLeft(world), resolutions, minZoom, tileSize: TILE_SIZE });
}

/**
 * The tile source of a raster file: its tiles from `native` zoom down to the source minimum,
 * styled by `vizParams` when given; with `tileExtent`, only the tiles that touch it (tileGridWithin).
 * @param {{ url: string, hash?: string, native: number, retina: boolean, vizParams?: object|null, tileExtent?: number[]|null }} options
 */
export function createRasterSource({ url, hash, native, retina, vizParams = null, tileExtent = null }) {
    const maxZoom = sourceMaxZoom(native, retina);
    return new HybridXYZ({
        url,
        hash,
        tileSize: TILE_SIZE,
        transition: 200,
        minZoom: SOURCE_MIN_ZOOM,
        retina,
        maxZoom,
        tileGrid: tileExtent ? tileGridWithin(tileExtent, { minZoom: SOURCE_MIN_ZOOM, maxZoom }) : undefined,
        vizParams: effectiveViz(vizParams) || undefined
    });
}

/**
 * A tile layer for a file's tiles over its `footprint` (EPSG:3857), stamped with the file and its native zoom
 * (`rasterNativeZoom`, read by ViewZoomCap). OpenLayers draws nothing of a layer outside the layer's extent, and asks
 * for no tile outside it.
 * - A raster (or a photo footprint) is clipped to its footprint.
 * - A point cloud draws its points as discs, which reach past the footprint, and the footprint of a cloud of one point
 *   (or of points on a line) has no area: clipped to it, the discs on the edge are cut and such a cloud is not drawn
 *   at all. Its layer extent is the footprint with POINT_CLOUD_EXTENT_PAD around it. The tiles it asks for are still
 *   those that touch the footprint (its tile grid ends there): the server has no tile past it (it answers 404, and
 *   OpenLayers would draw a magnified coarser tile in place of a tile that failed), and a layer extent that is not set
 *   would leave the layer to go through every tile of the window at its coarsest zoom.
 * @param {{ path: string, entry: object }} file
 * @param {number[]} footprint
 * @param {{ retina?: boolean, vizParams?: object|null }} [options]  the tiles' density (the screen's by default) and the
 *   style they are made with (the plain tiles by default): a snapshot asks for the cover view's
 */
export function createRasterTileLayer(file, footprint, { retina = useRetinaTiles(), vizParams = null } = {}) {
    const native = computeNativeZoom(file.entry);
    const pointCloud = file.entry.type === ddb.entry.type.POINTCLOUD;
    const layer = new TileLayer({
        extent: pointCloud ? bufferExtent(footprint, POINT_CLOUD_EXTENT_PAD) : footprint,
        source: createRasterSource({
            url: file.path, hash: file.entry.hash, native, retina, vizParams, tileExtent: pointCloud ? footprint : null
        })
    });
    layer.set('rasterNativeZoom', native);
    layer.set(FOOTPRINT, footprint);
    layer.file = file;
    return layer;
}

/**
 * The footprint (EPSG:3857) of the file a raster tile layer shows, which a map fits to: the layer extent of a point
 * cloud is wider (createRasterTileLayer), and the footprint of a cloud of one point has no size, which the fit of a map
 * stops at a set scale instead of zooming in without end.
 * @param {any} layer
 * @returns {number[]}
 */
export function rasterFootprint(layer) {
    return layer.get(FOOTPRINT) ?? layer.getExtent();
}

/**
 * The dataset path of the file a raster tile layer shows (stamped by createRasterTileLayer);
 * null for another layer.
 * @param {any} layer
 * @returns {string|null}
 */
export function rasterLayerPath(layer) {
    if (layer && layer.file && layer.file.entry) return layer.file.entry.path;
    return null;
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
