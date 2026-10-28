/**
 * The dataset map's file layers: georasters, the footprint of a
 * clicked photo, the georeferenced Gaussian splats, invisible raster extents (so rasters can be
 * clicked), the flight path, the shot / panorama markers and the start and finish flags. Vector files are separate
 * layers (createVectorFileLayer) because they load asynchronously.
 *
 *   const fl = new FileLayers();
 *   new Map({ layers: [basemap, ...fl.layers, measureLayer] });
 *   const vectorFiles = fl.build(files, { standalone, shotStyle: 'shot' });
 */
import { Vector as VectorLayer, Group as LayerGroup } from 'ol/layer';
import { Vector as VectorSource, Cluster } from 'ol/source';
import { createEmpty as createEmptyExtent, extend as extendExtent } from 'ol/extent';
import { transformExtent } from 'ol/proj';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import LineString from 'ol/geom/LineString';
import Polygon, { fromExtent } from 'ol/geom/Polygon';
import { coordAll } from '@turf/meta';
import bbox from '@turf/bbox';
import ddb from 'ddb';
import { EPSG } from '@/libs/constants';
import { createFileLayerStyles } from '@/libs/map/fileLayerStyles';
import { orderFlightPath } from '@/libs/map/flightPath';
import { createRasterTileLayer } from '@/libs/map/rasterLayers';
import { SplatFootprints } from '@/libs/map/splatFootprints';
import { isMeasurementFile } from '@/libs/map/measurementStorage';
import { createMvtVectorStyles, createMvtStyleFunction, createMvtVectorLayer, fetchMvtMetadata } from '@/composables/useMvtLayer';

const T = ddb.entry.type;

/** A WGS84 GeoJSON geometry's bounding box in Web Mercator. */
export const mercatorExtent = geom => transformExtent(bbox(geom), EPSG.WGS84, EPSG.WEB_MERCATOR);

export class FileLayers {
    constructor() {
        this.styles = createFileLayerStyles();
        this.rasters = new LayerGroup();
        // Raster layers by file and content, reused by the next build so their tiles stay loaded
        this.rasterCache = new Map();
        // The raster files in file order: { file, olLayer }, olLayer null for a placeholder file
        // (a layer the comparison view keeps but cannot draw: missing, or not built)
        this.rasterSlots = [];
        this.footprints = new LayerGroup();
        // Georeferenced splats: a point, the footprint of the build once the map has read it
        this.splats = new SplatFootprints();
        this.extentFeatures = new VectorSource();
        this.extentLayer = new VectorLayer({ source: this.extentFeatures, style: this.styles.invisible });
        this.shotFeatures = new VectorSource();
        this.shotLayer = new VectorLayer({
            source: new Cluster({ distance: 0.0001, source: this.shotFeatures }),
            style: this.styles.forCluster
        });
        this.pathFeatures = new VectorSource();
        this.pathLayer = new VectorLayer({ source: this.pathFeatures });
        this.flagFeatures = new VectorSource();
        this.flagLayer = new VectorLayer({ source: this.flagFeatures });
    }

    /** The layers in map order, bottom first. */
    get layers() {
        return [this.rasters, this.footprints, this.splats.layer, this.extentLayer,
            new LayerGroup({ layers: [this.pathLayer, this.shotLayer, this.flagLayer] })];
    }

    /**
     * Rebuilds the layers for the explorer items on show. Photos with a footprint are drawn
     * as rasters on the single-file map (`standalone`), as camera markers elsewhere. A raster
     * that was on show already keeps its layer: adding, removing or reordering files loads the
     * tiles of the new files only.
     * @param {any[]} files  items with `path` and `entry`; one with a `placeholder` and no entry
     *                       holds a raster slot that draws nothing
     * @param {{ standalone?: boolean, shotStyle: string }} options
     * @returns {any[]} the vector files to load (measurement files excluded)
     */
    build(files, { standalone = false, shotStyle }) {
        [this.shotFeatures, this.extentFeatures, this.pathFeatures, this.flagFeatures].forEach(s => s.clear());

        const shots = [];
        const stops = [];
        const vectorFiles = [];
        const slots = [];
        const rasterCache = new Map();
        for (const f of files) {
            if (f.placeholder && !f.entry) {
                slots.push({ file: f, olLayer: null });
                continue;
            }
            if (!f.entry) continue;
            const type = f.entry.type;
            const imageAsRaster = standalone && type === T.GEOIMAGE && f.entry.polygon_geom;
            if ((type === T.GEOIMAGE && !imageAsRaster) || type === T.GEOVIDEO || type === T.GEOPANORAMA) {
                const lonLat = coordAll(f.entry.point_geom)[0];
                const feat = new Feature(new Point(lonLat));
                feat.getGeometry().transform(EPSG.WGS84, EPSG.WEB_MERCATOR);
                feat.style = type === T.GEOPANORAMA ? 'pano' : shotStyle;
                feat.file = f;
                shots.push(feat);
                const props = f.entry.properties || {};
                if (type !== T.GEOPANORAMA && props.captureTime) {
                    stops.push({ coords: lonLat, captureTime: props.captureTime, flightSpeed: props.flightSpeed, feature: feat });
                }
            } else if (f.entry.polygon_geom && (type === T.GEORASTER || type === T.GEOIMAGE || type === T.POINTCLOUD)) {
                const extent = mercatorExtent(f.entry.polygon_geom);
                const key = `${f.path}\n${f.entry.hash || ''}`;
                // A file listed twice would put one layer twice in the group
                if (rasterCache.has(key)) continue;
                const olLayer = this.rasterCache.get(key) || createRasterTileLayer(f, extent);
                // The same file listed again (the explorer re-lists): the layer follows its item
                olLayer.file = f;
                rasterCache.set(key, olLayer);
                slots.push({ file: f, olLayer });
                const extentFeat = new Feature(fromExtent(extent));
                extentFeat.file = f;
                this.extentFeatures.addFeature(extentFeat);
            } else if (type === T.VECTOR && !isMeasurementFile(f.entry.path)) {
                vectorFiles.push(f);
            }
        }
        this.setRasters(slots, rasterCache);
        if (shots.length) this.shotFeatures.addFeatures(shots);
        this.splats.setFiles(files);
        this.drawFlightPath(stops);
        return vectorFiles;
    }

    /** Puts the slots' layers in the raster group, in order, touching it only when they changed. */
    setRasters(slots, rasterCache) {
        this.rasterSlots = slots;
        this.rasterCache = rasterCache;
        const wanted = slots.map(s => s.olLayer).filter(Boolean);
        const layers = this.rasters.getLayers();
        const current = layers.getArray();
        if (current.length === wanted.length && current.every((l, i) => l === wanted[i])) return;
        layers.clear();
        layers.extend(wanted);
    }

    /** The path through the timed shots, start/finish flags, and each shot's `computedSpeed`. */
    drawFlightPath(stops) {
        if (stops.length < 2) return;
        const { ordered, speeds } = orderFlightPath(stops);
        ordered.forEach((stop, i) => { if (speeds[i] !== null) stop.feature.computedSpeed = speeds[i]; });
        const points = ordered.map(stop => stop.feature.getGeometry().getCoordinates());

        const flag = (coords, style) => {
            const feat = new Feature(new Point(coords));
            feat.setStyle(style);
            this.flagFeatures.addFeature(feat);
        };
        flag(points[0], this.styles.startFlag);
        flag(points[points.length - 1], this.styles.finishFlag);

        const path = new Feature(new LineString(points));
        path.setStyle(this.styles.flightPath);
        this.pathFeatures.addFeature(path);
    }

    /** Photo and video markers as dots ('shot') or camera arrows ('direction'). */
    setShotStyle(style) {
        this.shotFeatures.getFeatures().forEach(feat => {
            const type = feat.file?.entry?.type;
            if (type === T.GEOIMAGE || type === T.GEOVIDEO) feat.style = style;
        });
        this.shotLayer.changed();
    }

    setFlightPathVisible(on) {
        this.pathLayer.setVisible(on);
        this.flagLayer.setVisible(on);
    }

    /** Draws a clicked photo's footprint raster (one at a time). */
    showFootprint(file) {
        this.clearFootprints();
        const footprint = new Polygon([coordAll(file.entry.polygon_geom)]);
        footprint.transform(EPSG.WGS84, EPSG.WEB_MERCATOR);
        this.footprints.getLayers().push(createRasterTileLayer(file, footprint.getExtent()));
    }

    clearFootprints() {
        this.footprints.getLayers().clear();
    }

    /** Extent of the shots, rasters and splats (EPSG:3857), empty when there are none. */
    extent() {
        const ext = createEmptyExtent();
        if (this.shotFeatures.getFeatures().length) extendExtent(ext, this.shotFeatures.getExtent());
        if (this.splats.features.size) extendExtent(ext, this.splats.extent());
        this.rasters.getLayers().forEach(layer => extendExtent(ext, layer.getExtent()));
        return ext;
    }
}

/**
 * A vector file's layer from its precomputed MVT tile pyramid (/mvt/{hash}/{z}/{x}/{y}.pbf).
 * The tiles' metadata gives the deepest zoom (no requests for tiles that do not exist) and
 * the bounds, which stand in for the entry geometry when the indexer left it unset.
 * @param {{ dataset: any, file: any, color: string, getZoom: () => number }} options
 */
export async function createVectorFileLayer({ dataset, file, color, getZoom }) {
    if (!dataset) throw new Error('Dataset not found for vector file');
    const entry = dataset.Entry(file.entry);
    const { maxZoom, bounds } = await fetchMvtMetadata(entry);
    if (bounds && !file.entry.polygon_geom && !file.entry.point_geom) {
        const [minX, minY, maxX, maxY] = bounds;
        file.entry.polygon_geom = {
            type: 'Polygon',
            coordinates: [[[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY], [minX, minY]]]
        };
    }
    const { layer, source } = createMvtVectorLayer({
        urlTemplate: entry.getMvtUrlTemplate(),
        styleFunction: createMvtStyleFunction({
            styles: createMvtVectorStyles(color),
            getZoom,
            isSelected: () => file.selected
        }),
        useMarkRaw: true,
        maxZoom
    });
    layer.file = file;
    layer.vectorSource = source;
    return layer;
}
