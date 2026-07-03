<template>
    <div id="unified-viewer">
        <TabViewLoader @loaded="handleLoad" titleSuffix="3D Viewer" />

        <Message bindTo="error" noDismiss />
        <div v-if="loading" class="loading">
            <p>{{ loadingText }}</p>
            <i class="fa-solid fa-circle-notch fa-spin" />
        </div>

        <div class="container-wrapper">
            <div ref="view" class="giro3d-view"></div>

            <!-- Measurement toolbar (top-left) -->
            <div v-if="ready" class="toolbar">
                <button :class="{ active: activeTool === 'point' }" @click="measure('point')" title="Measure point">
                    <i class="fa-solid fa-location-dot" />
                </button>
                <button :class="{ active: activeTool === 'distance' }" @click="measure('distance')" title="Measure distance">
                    <i class="fa-solid fa-ruler" />
                </button>
                <button :class="{ active: activeTool === 'area' }" @click="measure('area')" title="Measure area">
                    <i class="fa-solid fa-draw-polygon" />
                </button>
                <button :disabled="measureCount === 0" @click="clearMeasurements" title="Clear measurements">
                    <i class="fa-solid fa-trash" />
                </button>
            </div>

            <!-- Layer panel (top-right) -->
            <div v-if="ready && layers.length" class="layer-panel">
                <div class="layer-panel-title">Layers</div>
                <label v-for="l in layers" :key="l.id" class="layer-row">
                    <input type="checkbox" :checked="l.visible" @change="toggleLayer(l)" />
                    <i :class="l.icon" /> <span>{{ l.name }}</span>
                </label>
            </div>
        </div>
    </div>
</template>

<script>
import ddb from 'ddb';
import Message from '@/components/Message';
import TabViewLoader from '@/features/viewers/TabViewLoader';

/**
 * UnifiedViewer - a single georeferenced Giro3D scene that can render any of the build
 * artifacts produced by DroneDB - OGC 3D Tiles (models), COPC (point clouds), COG/georaster
 * (as server XYZ tiles) and MVT (vectors) - on top of an OpenStreetMap basemap, with
 * interactive measurement tools (point / distance / area).
 *
 * Loads the single entry opened through the viewer route and dispatches it to the matching
 * loader. The scene, basemap, controls and measurement layer are shared by every type.
 *
 * CRS: a projected Web Mercator (EPSG:3857) instance is used for raster/vector/model because
 * the server already serves those in Web Mercator; point clouds use their own CRS (read from
 * the COPC header) so they render at full precision. Mercator length/area measurements are
 * corrected by cos(latitude) so they report true ground distances.
 *
 * Per the additive strategy (spec sec 4.2), this viewer is opt-in only: the default opening
 * for each entry type is unchanged (map, pointcloud, model, etc.). The user reaches the
 * unified viewer via the "Open in 3D Viewer" context menu action.
 */
export default {
    components: {
        Message, TabViewLoader
    },
    props: ['uri'],
    data: function () {
        return {
            error: "",
            loading: false,
            loadingText: "Loading 3D viewer...",
            ready: false,
            activeTool: null,
            measureCount: 0,
            // Reactive metadata for the layer panel; the heavy Giro3D objects are kept
            // out of the reactive tree (see created()).
            layers: []
        };
    },
    // Giro3D / three.js objects are stored as plain (non-reactive) instance fields. They must
    // NOT live in data(): Vue's reactive proxy around WebGL/three objects breaks internal
    // matrix/identity checks. They are created imperatively while loading.
    created: function () {
        this.libs = null;
        this.instance = null;
        this.map = null;
        this.controls = null;
        this.drawTool = null;
        this.abortController = null;
        this.shapes = [];
        this.layerObjects = {};
        this._layerId = 0;
        // Web Mercator distance correction factor (cos of the scene-centre latitude). 1 for
        // point clouds, which use a metric local CRS.
        this.mercatorScale = 1;

        // Measurement label formatters (read mercatorScale at call time).
        this.lengthFormatter = ({ length }) => {
            const m = length * this.mercatorScale;
            return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${m.toFixed(1)} m`;
        };
        this.areaFormatter = ({ area }) => {
            const m2 = area * this.mercatorScale * this.mercatorScale;
            return m2 >= 1e6 ? `${(m2 / 1e6).toFixed(2)} km\u00B2` : `${m2.toFixed(0)} m\u00B2`;
        };
    },
    beforeUnmount: function () {
        this.disposeViewer();
    },
    methods: {
        handleLoad: async function () {
            this.error = "";
            this.loading = true;
            try {
                if (!ddb.entry.hasGeometry(this.entry) && this.entry.type !== ddb.entry.type.MODEL)
                    throw new Error(`${this.entry.path} cannot be opened in the 3D viewer`);

                this.libs = await this.loadLibs();
                await this.loadPrimary(this.entry);
                this.ready = true;
            } catch (e) {
                this.error = e.message;
            } finally {
                this.loading = false;
            }
        },

        // Dispatches the single entry to the matching loader based on type.
        loadPrimary: async function (entry) {
            const t = ddb.entry.type;
            switch (entry.type) {
                case t.POINTCLOUD: return this.loadPointCloud(entry);
                case t.GEORASTER: return this.loadGeoraster(entry);
                case t.VECTOR: return this.loadVector(entry);
                case t.MODEL: return this.loadModel(entry);
                default:
                    throw new Error(`${entry.path} is not a supported 3D viewer type`);
            }
        },

        // Lazy-loads three.js, Giro3D and the OpenLayers sources only when the viewer opens.
        loadLibs: async function () {
            const [
                THREE, controls, Instance, GMap, Extent, CoordinateSystem, ColorLayer,
                TiledImageSource, VectorTileSource, PointCloud, COPCSource, Tiles3D, DrawTool,
                XYZ, OSM, olStyle, olProj, Globe, GlobeControls, ColorMap, ColorMapMode
            ] = await Promise.all([
                import(/* webpackChunkName: "giro3d" */ 'three'),
                import(/* webpackChunkName: "giro3d" */ 'three/examples/jsm/controls/MapControls.js'),
                import(/* webpackChunkName: "giro3d" */ '@giro3d/giro3d/core/Instance.js'),
                import(/* webpackChunkName: "giro3d" */ '@giro3d/giro3d/entities/Map.js'),
                import(/* webpackChunkName: "giro3d" */ '@giro3d/giro3d/core/geographic/Extent.js'),
                import(/* webpackChunkName: "giro3d" */ '@giro3d/giro3d/core/geographic/CoordinateSystem.js'),
                import(/* webpackChunkName: "giro3d" */ '@giro3d/giro3d/core/layer/ColorLayer.js'),
                import(/* webpackChunkName: "giro3d" */ '@giro3d/giro3d/sources/TiledImageSource.js'),
                import(/* webpackChunkName: "giro3d" */ '@giro3d/giro3d/sources/VectorTileSource.js'),
                import(/* webpackChunkName: "giro3d" */ '@giro3d/giro3d/entities/PointCloud.js'),
                import(/* webpackChunkName: "giro3d" */ '@giro3d/giro3d/sources/COPCSource.js'),
                import(/* webpackChunkName: "giro3d" */ '@giro3d/giro3d/entities/Tiles3D.js'),
                import(/* webpackChunkName: "giro3d" */ '@giro3d/giro3d/interactions/DrawTool.js'),
                import(/* webpackChunkName: "giro3d" */ 'ol/source/XYZ.js'),
                import(/* webpackChunkName: "giro3d" */ 'ol/source/OSM.js'),
                import(/* webpackChunkName: "giro3d" */ 'ol/style.js'),
                import(/* webpackChunkName: "giro3d" */ 'ol/proj.js'),
                import(/* webpackChunkName: "giro3d" */ '@giro3d/giro3d/entities/Globe.js'),
                import(/* webpackChunkName: "giro3d" */ '@giro3d/giro3d/controls/GlobeControls.js'),
                import(/* webpackChunkName: "giro3d" */ '@giro3d/giro3d/core/ColorMap.js'),
                import(/* webpackChunkName: "giro3d" */ '@giro3d/giro3d/core/ColorMapMode.js')
            ]);
            return {
                THREE,
                MapControls: controls.MapControls,
                Instance: Instance.default,
                Map: GMap.default,
                Extent: Extent.default,
                CoordinateSystem: CoordinateSystem.default,
                ColorLayer: ColorLayer.default,
                TiledImageSource: TiledImageSource.default,
                VectorTileSource: VectorTileSource.default,
                PointCloud: PointCloud.default,
                COPCSource: COPCSource.default,
                Tiles3D: Tiles3D.default,
                DrawTool: DrawTool.default,
                XYZ: XYZ.default,
                OSM: OSM.default,
                olStyle,
                olProj,
                Globe: Globe.default,
                GlobeControls: GlobeControls.default,
                ColorMap: ColorMap.default,
                ColorMapMode: ColorMapMode.default
            };
        },

        // --- Scene setup -----------------------------------------------------------------

        // Creates the Giro3D instance, lighting and navigation controls for the given CRS.
        // Pass { globe: true } to navigate an ECEF (EPSG:4978) globe with GlobeControls
        // instead of the flat-map MapControls - used for georeferenced 3D models whose
        // tileset carries an ECEF transform.
        setupInstance: function (crs, opts) {
            const { THREE, Instance, MapControls, GlobeControls } = this.libs;
            const useGlobe = !!(opts && opts.globe);

            const instance = new Instance({
                target: this.$refs.view,
                crs,
                backgroundColor: 0x1a1a2e
            });
            this.instance = instance;

            const camera = instance.view.camera;
            camera.up.set(0, 0, 1); // Giro3D scenes are Z-up (ECEF Z = polar axis)

            // Lighting for 3D entities (models / point clouds). Map layers are unlit.
            const ambient = new THREE.AmbientLight(0xffffff, 1.2);
            instance.scene.add(ambient);
            const sun = new THREE.DirectionalLight(0xffffff, 1.4);
            sun.position.set(1, 1, 2);
            instance.scene.add(sun);
            const fill = new THREE.DirectionalLight(0xffffff, 0.5);
            fill.position.set(-1, -1, 1);
            instance.scene.add(fill);

            let controls;
            if (useGlobe) {
                // GlobeControls navigate around the WGS84 ellipsoid; they must be attached
                // to the DOM explicitly (unlike three's MapControls).
                controls = new GlobeControls({
                    scene: instance.scene,
                    camera,
                    domElement: instance.domElement,
                    enableDamping: true
                });
                controls.attach();
            } else {
                controls = new MapControls(camera, instance.domElement);
                controls.enableDamping = true;
                controls.dampingFactor = 0.2;
            }
            instance.view.setControls(controls);
            this.controls = controls;
        },

        // Lazily creates the DrawTool the first time a measurement is started.
        ensureDrawTool: function () {
            if (!this.drawTool) {
                this.drawTool = new this.libs.DrawTool({ instance: this.instance });
            }
        },

        // Adds an OpenStreetMap basemap covering the given Giro3D extent. Best-effort: a basemap
        // failure must never prevent the actual data from showing.
        addBasemap: function (extent) {
            try {
                const { Map, ColorLayer, TiledImageSource, OSM } = this.libs;
                const map = new Map({ extent: extent.withRelativeMargin(0.1) });
                this.instance.add(map);
                this.map = map;

                const basemap = new ColorLayer({
                    name: 'osm',
                    extent: map.extent,
                    source: new TiledImageSource({ source: new OSM() })
                });
                map.addLayer(basemap);

                this.registerLayer('Basemap (OSM)', 'fa-solid fa-map', () => basemap.visible, v => { basemap.visible = v; });
            } catch (e) {
                // Basemap is optional.
            }
        },

        // Adds a WGS84 globe (ECEF) with an OSM basemap for georeferenced 3D models, whose
        // tileset carries an ECEF transform. Best-effort: a globe failure must not prevent the
        // model from rendering.
        addGlobeBasemap: function () {
            try {
                const { Globe, ColorLayer, TiledImageSource, OSM } = this.libs;
                const globe = new Globe({});
                this.instance.add(globe);
                this.map = globe;

                const basemap = new ColorLayer({
                    name: 'osm',
                    source: new TiledImageSource({ source: new OSM() })
                });
                globe.addLayer(basemap);
                this.registerLayer('Globe (OSM)', 'fa-solid fa-earth-europe', () => basemap.visible, v => { basemap.visible = v; });
            } catch (e) {
                // Globe basemap is optional.
            }
        },

        // A file is treated as georeferenced when it has a WGS84 footprint (populated by the
        // DroneDB indexer for rasters, vectors and point clouds, and - via a sidecar - for 3D
        // models). Only georeferenced entries get a basemap / globe underneath them.
        isGeoreferenced: function (entry) {
            if (entry.type === ddb.entry.type.GEORASTER) return true;
            if (entry.properties && entry.properties.georeferenced === false) return false;
            return ddb.entry.hasGeometry(entry);
        },

        // Builds a Giro3D Extent (in the given CRS) from a 3D entity bounding box, used to size a
        // flat basemap under a point cloud that lives in its own metric CRS.
        extentFromBox: function (box, crs) {
            const { Extent } = this.libs;
            return new Extent(crs, box.min.x, box.max.x, box.min.y, box.max.y);
        },

        // Colorizes a point cloud: prefer the RGB attribute, otherwise fall back to an elevation
        // ramp so featureless clouds (e.g. an untextured PLY) are not a flat black/white blob.
        // Best-effort - the default coloring is kept on any failure.
        colorizePointCloud: function (entity) {
            try {
                const attrs = entity.getSupportedAttributes ? entity.getSupportedAttributes() : [];
                const color = attrs.find(a => a.interpretation === 'color');
                if (color) {
                    entity.setActiveAttribute(color.name);
                    entity.setColoringMode('attribute');
                    return;
                }
                const z = attrs.find(a => a.name === 'Z') || attrs.find(a => a.interpretation === 'unknown');
                if (z) {
                    const { ColorMap, ColorMapMode } = this.libs;
                    const min = (typeof z.min === 'number') ? z.min : 0;
                    const max = (typeof z.max === 'number' && z.max > min) ? z.max : min + 1;
                    entity.setAttributeColorMap(z.name, new ColorMap({
                        colors: this.elevationColorRamp(), min, max, mode: ColorMapMode.Elevation
                    }));
                    entity.setActiveAttribute(z.name);
                    entity.setColoringMode('attribute');
                }
            } catch (e) {
                // Coloring is best-effort; keep the default appearance on failure.
            }
        },

        // A perceptual low->high elevation ramp (blue -> cyan -> green -> yellow -> red).
        elevationColorRamp: function () {
            const { Color } = this.libs.THREE;
            return [
                new Color(0x2c7bb6), new Color(0x00a6ca), new Color(0x00ccbc),
                new Color(0x90eb9d), new Color(0xffff8c), new Color(0xf9d057),
                new Color(0xf29e2e), new Color(0xe76818), new Color(0xd7191c)
            ];
        },

        // --- Per-type loaders ------------------------------------------------------------

        loadGeoraster: async function (entry) {
            this.loadingText = "Loading orthophoto...";
            const data = this.computeExtent(entry);
            if (!data) throw new Error("This georaster has no geographic footprint");

            this.setupInstance(this.libs.CoordinateSystem.epsg3857);
            this.addBasemap(data.extent);

            const { ColorLayer, TiledImageSource, XYZ } = this.libs;
            const url = `${this.dataset.baseApi}/tiles/{z}/{x}/{y}.png?path=${encodeURIComponent(entry.path)}`;
            const layer = new ColorLayer({
                name: entry.path,
                extent: data.extent,
                source: new TiledImageSource({
                    source: new XYZ({ url, projection: 'EPSG:3857', minZoom: 14, maxZoom: 22 })
                })
            });
            this.map.addLayer(layer);
            this.registerLayer(this.basename(entry.path), 'fa-solid fa-image', () => layer.visible, v => { layer.visible = v; });

            this.frameExtent(data);
        },

        loadVector: async function (entry) {
            this.loadingText = "Loading vector data...";
            const data = this.computeExtent(entry);
            if (!data) throw new Error("This vector layer has no geographic footprint");

            this.setupInstance(this.libs.CoordinateSystem.epsg3857);
            this.addBasemap(data.extent);

            const { ColorLayer, VectorTileSource } = this.libs;
            const url = `${this.dataset.baseApi}/mvt/${entry.hash}/{z}/{x}/{y}.pbf`;
            const layer = new ColorLayer({
                name: entry.path,
                extent: data.extent,
                source: new VectorTileSource({ url, style: this.vectorStyle() })
            });
            this.map.addLayer(layer);
            this.registerLayer(this.basename(entry.path), 'fa-solid fa-bezier-curve', () => layer.visible, v => { layer.visible = v; });

            this.frameExtent(data);
        },

        loadModel: async function (entry) {
            this.loadingText = "Loading 3D model...";
            const tilesetUrl = await this.dataset.Entry(entry).get3DTiles();
            if (!tilesetUrl)
                throw new Error(`${entry.path} has no 3D Tiles output (it may still be processing)`);

            const georeferenced = this.isGeoreferenced(entry);
            if (georeferenced) {
                // Georeferenced tileset: it carries an ECEF transform, so render it on a WGS84
                // globe (EPSG:4978) with an OSM basemap - the model sits in the right place.
                this.setupInstance(this.libs.CoordinateSystem.epsg4978, { globe: true });
                this.addGlobeBasemap();
            } else {
                // Local-space tileset (identity transform): a plain scene with no basemap,
                // since a world map would be meaningless for a non-georeferenced model.
                this.setupInstance(this.libs.CoordinateSystem.epsg3857);
            }

            const tileset = new this.libs.Tiles3D({ url: tilesetUrl, errorTarget: 8 });
            await this.instance.add(tileset);
            this.registerLayer(this.basename(entry.path), 'fa-solid fa-cube', () => tileset.visible, v => { tileset.visible = v; });

            const box = tileset.getBoundingBox();
            if (box) this.frameBox(box, { globe: georeferenced });
        },

        loadPointCloud: async function (entry) {
            this.loadingText = "Loading point cloud...";
            const copcUrl = await this.dataset.Entry(entry).getCopc();

            // The COPC header carries the point cloud CRS: initialise the source first so the
            // instance can be created in that CRS, keeping the cloud at full precision.
            const source = new this.libs.COPCSource({ url: copcUrl });
            await source.initialize();
            const metadata = await source.getMetadata();

            const crs = metadata.crs || this.libs.CoordinateSystem.epsg3857;
            this.setupInstance(crs);
            if (this.instance.renderingOptions) {
                this.instance.renderingOptions.enableEDL = true;
            }

            const entity = new this.libs.PointCloud({ source });
            await this.instance.add(entity);
            // Show RGB when present, otherwise colour by elevation so the cloud is never a
            // flat black/white blob (e.g. an untextured PLY).
            this.colorizePointCloud(entity);
            this.registerLayer(this.basename(entry.path), 'fa-solid fa-braille', () => entity.visible, v => { entity.visible = v; });

            const box = entity.getBoundingBox();
            // A georeferenced cloud gets an OSM basemap in its own (metric) CRS; Giro3D
            // reprojects the OSM tiles into that CRS so the ground plane aligns with the cloud.
            if (box && this.isGeoreferenced(entry)) {
                this.addBasemap(this.extentFromBox(box, crs));
            }
            if (box) this.frameBox(box);
        },

        // --- Helpers ---------------------------------------------------------------------

        // Builds the Giro3D extent (EPSG:3857) from an entry's WGS84 footprint and records the
        // centre latitude used for measurement correction.
        computeExtent: function (entry) {
            const geom = entry.polygon_geom || entry.point_geom;
            if (!geom) return null;

            const { Extent, CoordinateSystem, olProj } = this.libs;
            let [minx, miny, maxx, maxy] = this.geojsonBbox(geom);
            if (minx === maxx) { minx -= 0.0005; maxx += 0.0005; }
            if (miny === maxy) { miny -= 0.0005; maxy += 0.0005; }

            const centerLat = (miny + maxy) / 2;
            const min = olProj.fromLonLat([minx, miny]); // -> EPSG:3857
            const max = olProj.fromLonLat([maxx, maxy]);
            const extent = new Extent(CoordinateSystem.epsg3857, min[0], max[0], min[1], max[1]);

            return {
                extent,
                bbox: [min[0], min[1], max[0], max[1]],
                centerLat
            };
        },

        // Returns [minLon, minLat, maxLon, maxLat] from a GeoJSON geometry or Feature.
        geojsonBbox: function (geom) {
            // DroneDB footprints (polygon_geom / point_geom) are GeoJSON Features, so the
            // coordinates live under .geometry; a bare geometry is also accepted for safety.
            const coordinates = geom.geometry ? geom.geometry.coordinates : geom.coordinates;
            let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
            const visit = c => {
                if (typeof c[0] === 'number') {
                    minx = Math.min(minx, c[0]); maxx = Math.max(maxx, c[0]);
                    miny = Math.min(miny, c[1]); maxy = Math.max(maxy, c[1]);
                } else {
                    c.forEach(visit);
                }
            };
            if (coordinates) visit(coordinates);
            return [minx, miny, maxx, maxy];
        },

        // Frames the camera on a map extent (top-down oblique) and sets the Mercator correction.
        frameExtent: function (data) {
            const [xmin, ymin, xmax, ymax] = data.bbox;
            const cx = (xmin + xmax) / 2;
            const cy = (ymin + ymax) / 2;
            const span = Math.max(xmax - xmin, ymax - ymin) || 100;
            const dist = span * 1.2;

            this.mercatorScale = Math.cos(data.centerLat * Math.PI / 180);

            const camera = this.instance.view.camera;
            camera.position.set(cx, cy - dist, dist);
            this.instance.view.minNearPlane = Math.max(dist / 1000, 0.1);
            this.controls.target.set(cx, cy, 0);
            this.controls.update();
            this.instance.notifyChange();
        },

        // Frames the camera on a 3D entity bounding box (point cloud / model). For a globe
        // scene the camera up follows the local ellipsoid normal so the horizon stays level.
        frameBox: function (box, opts) {
            const { THREE } = this.libs;
            const size = box.getSize(new THREE.Vector3());
            const center = box.getCenter(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z) || 1;

            this.mercatorScale = 1; // entities use a metric local CRS

            const camera = this.instance.view.camera;
            this.instance.view.minNearPlane = Math.max(maxDim / 1000, 0.01);

            if (opts && opts.globe) {
                // ECEF: the local up is the normalized position; approach along it.
                const up = center.clone().normalize();
                camera.up.copy(up);
                camera.position.copy(center).add(up.clone().multiplyScalar(maxDim * 2.5));
                camera.lookAt(center);
            } else {
                camera.position.set(center.x + maxDim * 1.2, center.y - maxDim * 1.2, center.z + maxDim * 0.9);
                // MapControls exposes a target; GlobeControls does not.
                if (this.controls.target && this.controls.target.copy) this.controls.target.copy(center);
            }
            if (this.controls.update) this.controls.update();
            this.instance.notifyChange();
        },

        // A simple OpenLayers style for MVT features (points, lines, polygons).
        vectorStyle: function () {
            const { Style, Fill, Stroke, Circle } = this.libs.olStyle;
            const stroke = new Stroke({ color: '#2978b4', width: 2 });
            const fill = new Fill({ color: 'rgba(41, 120, 180, 0.25)' });
            const polygon = new Style({ stroke, fill });
            const line = new Style({ stroke });
            const point = new Style({ image: new Circle({ radius: 4, fill: new Fill({ color: '#2978b4' }), stroke }) });
            return feature => {
                const type = feature.getGeometry().getType();
                if (type.indexOf('Polygon') >= 0) return polygon;
                if (type.indexOf('LineString') >= 0) return line;
                return point;
            };
        },

        basename: function (p) {
            const parts = p.split('/');
            return parts[parts.length - 1] || p;
        },

        // --- Layer panel -----------------------------------------------------------------

        registerLayer: function (name, icon, getVisible, setVisible) {
            const id = ++this._layerId;
            this.layerObjects[id] = { setVisible };
            this.layers.push({ id, name, icon, visible: getVisible() });
        },

        toggleLayer: function (l) {
            l.visible = !l.visible;
            const obj = this.layerObjects[l.id];
            if (obj) obj.setVisible(l.visible);
            if (this.instance) this.instance.notifyChange();
        },

        // --- Measurements ----------------------------------------------------------------

        measure: async function (kind) {
            if (!this.instance) return;
            this.ensureDrawTool();

            // Cancel any measurement already in progress.
            if (this.abortController) {
                try { this.abortController.abort(); } catch (e) { /* ignore */ }
            }
            this.abortController = new AbortController();
            const signal = this.abortController.signal;
            this.activeTool = kind;

            const color = '#f2a51a';
            let shape = null;
            try {
                if (kind === 'point') {
                    shape = await this.drawTool.createPoint({ signal, color });
                } else if (kind === 'distance') {
                    shape = await this.drawTool.createLineString({
                        signal, color, showVertices: true, showSegmentLabels: true,
                        segmentLabelFormatter: this.lengthFormatter
                    });
                } else if (kind === 'area') {
                    shape = await this.drawTool.createPolygon({
                        signal, color, showSurface: true, showSurfaceLabel: true,
                        surfaceLabelFormatter: this.areaFormatter
                    });
                }
            } catch (e) {
                // Creation was cancelled (Escape / new tool) - nothing to do.
            }

            this.activeTool = null;
            if (shape) {
                this.shapes.push(shape);
                this.measureCount = this.shapes.length;
                this.instance.notifyChange();
            }
        },

        clearMeasurements: function () {
            if (!this.instance) return;
            this.shapes.forEach(s => {
                try { this.instance.remove(s); } catch (e) { /* ignore */ }
            });
            this.shapes = [];
            this.measureCount = 0;
            this.instance.notifyChange();
        },

        // --- Teardown --------------------------------------------------------------------

        disposeViewer: function () {
            if (this.abortController) {
                try { this.abortController.abort(); } catch (e) { /* ignore */ }
                this.abortController = null;
            }
            if (this.drawTool) {
                try { this.drawTool.dispose(); } catch (e) { /* ignore */ }
                this.drawTool = null;
            }
            if (this.controls) {
                this.controls.dispose();
                this.controls = null;
            }
            // Giro3D disposes its renderer, scene, entities, layers and canvas.
            if (this.instance) {
                try { this.instance.dispose(); } catch (e) { /* ignore */ }
                this.instance = null;
            }
            this.map = null;
            this.shapes = [];
            this.layerObjects = {};
            this.libs = null;
        }
    }
}
</script>

<style scoped>
#unified-viewer {
    background: var(--ddb-viewer-bg);
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

#unified-viewer .ui.message {
    margin: 0.5rem;
}

#unified-viewer .container-wrapper {
    display: flex;
    width: 100%;
    height: 100%;
    position: relative;
}

#unified-viewer .giro3d-view {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
}

#unified-viewer .loading {
    color: var(--ddb-text-on-dark);
    font-size: var(--ddb-font-size-base);
    margin: 0.5rem;
    text-align: center;
}

#unified-viewer .loading .fa-circle-notch {
    height: 1.25rem;
    width: 1.25rem;
}

#unified-viewer .toolbar {
    position: absolute;
    top: var(--ddb-spacing-md);
    left: var(--ddb-spacing-md);
    display: flex;
    gap: 0.25rem;
    z-index: 100;
    background: var(--ddb-overlay-bg);
    border: var(--ddb-border-width) solid rgba(255, 255, 255, 0.25);
    border-radius: var(--ddb-border-radius, 4px);
    padding: 0.25rem;
}

#unified-viewer .toolbar button {
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 4px;
    background: transparent;
    border: none;
    color: var(--ddb-text-on-dark);
    font-size: var(--ddb-font-size-base);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s;
}

#unified-viewer .toolbar button:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.15);
}

#unified-viewer .toolbar button.active {
    background: var(--ddb-primary, #2978b4);
}

#unified-viewer .toolbar button:disabled {
    opacity: 0.4;
    cursor: default;
}

#unified-viewer .layer-panel {
    position: absolute;
    top: var(--ddb-spacing-md);
    right: var(--ddb-spacing-md);
    z-index: 100;
    background: var(--ddb-overlay-bg);
    border: var(--ddb-border-width) solid rgba(255, 255, 255, 0.25);
    border-radius: var(--ddb-border-radius, 4px);
    padding: 0.5rem 0.75rem;
    color: var(--ddb-text-on-dark);
    min-width: 10rem;
    max-width: 16rem;
}

#unified-viewer .layer-panel-title {
    font-weight: 600;
    font-size: 0.8rem;
    margin-bottom: 0.4rem;
    opacity: 0.85;
}

#unified-viewer .layer-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.8rem;
    padding: 0.15rem 0;
    cursor: pointer;
}

#unified-viewer .layer-row span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
</style>
