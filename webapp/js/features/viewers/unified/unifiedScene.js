/**
 * The 3D viewer's Giro3D scene (HQ-08, out of UnifiedViewer.vue): the instance in a flat
 * CRS or on the globe, lights, the OSM basemap, the one navigation control, framing and the
 * Home pose, the layer list and teardown. The loaders (loaders.js) put the data in it.
 *
 * `view` is the component's reactive state the scene reports into: loadingText, progress,
 * layers, isLocalPointCloud, isLocalDrawing, localUnits, activeTool.
 */
import ddb from 'ddb';
import { createNavControls, applySceneMetrics, createDoubleClickRecenter, createCameraTweener, NAV } from './navControls';
import { alignContentUpAxis } from './contentOrientation';
import { geojsonBbox, isFiniteBox, ELEVATION_RAMP } from './sceneUtils';

export class UnifiedScene {
    /**
     * @param {any} libs  loadGiro3dLibs()
     * @param {HTMLElement} container
     * @param {object} ctx
     * @param {Record<string, number>} ctx.settings  lighting (reactive, from useViewerSettings)
     * @param {Record<string, any>} ctx.view
     * @param {{ info: Function }} ctx.notify
     */
    constructor(libs, container, { settings, view, notify }) {
        this.libs = libs;
        this.container = container;
        this.settings = settings;
        this.view = view;
        this.notify = notify;
        this.instance = null;
        this.map = null;
        this.controls = null;
        this.globe = null;
        this.globeUpSet = false;
        this.lights = {};
        this.layerSetters = {};
        this.layerId = 0;
        this.homePose = null;
        // The user dragged / zoomed: the loaders' late re-frames must not overwrite that pose
        this.userInteracted = false;
        // Web Mercator length correction (cos of the centre latitude); 1 in metric CRSs
        this.mercatorScale = 1;
        this.tweener = createCameraTweener();
        this.dblClickDispose = null;
    }

    // ---- Instance --------------------------------------------------------------------

    /** A flat scene in `crs` (every type but georeferenced 3D Tiles), Z up. */
    setupInstance(crs) {
        const instance = new this.libs.Instance({ target: this.container, crs, backgroundColor: 0x1a1a2e });
        this.instance = instance;
        instance.view.camera.up.set(0, 0, 1);
        this.addLights({ fill: true });
        // Focusable, so the control's arrow keys work once the canvas is clicked
        instance.domElement.tabIndex = 0;
        this.attachControls();
    }

    /**
     * A globe (EPSG:4978) with the OSM basemap on the ellipsoid. The control is built by
     * frameGlobe, once the local up (the ellipsoid normal under the data) is known: the
     * control freezes camera.up when it is built.
     */
    setupGlobe() {
        const { Instance, Globe, ColorLayer, TiledImageSource, OSM, CoordinateSystem } = this.libs;
        const instance = new Instance({ target: this.container, crs: CoordinateSystem.epsg4978, backgroundColor: 0x0b1021 });
        this.instance = instance;
        this.mercatorScale = 1;
        instance.view.camera.up.set(0, 0, 1);
        this.addLights({ fill: false });
        try {
            const globe = new Globe({ backgroundColor: 0x0b1021 });
            instance.add(globe);
            this.map = this.globe = globe;
            globe.addLayer(new ColorLayer({ name: 'osm', source: new TiledImageSource({ source: new OSM() }) }));
            this.registerLayer('Basemap (OSM)', 'fa-solid fa-earth-europe', () => globe.visible, v => { globe.visible = v; });
        } catch {
            // The basemap is optional
        }
        this.userInteracted = false;
        this.globeUpSet = false;
    }

    /** The navigation control (and its double-click re-centre); replaces the previous one. */
    attachControls() {
        const { instance } = this;
        const camera = instance.view.camera;
        if (this.dblClickDispose) this.dblClickDispose();
        if (this.controls) {
            try { this.controls.dispose(); } catch { /* already gone */ }
        }
        // Its turntable drags never fire 'start': take ownership of the camera here
        const controls = createNavControls(this.libs, camera, instance.domElement, {
            onDragStart: () => {
                this.userInteracted = true;
                this.tweener.stop();
            }
        });
        // Giro3D then updates it every frame and relays its changes (what keeps 3D Tiles streaming)
        instance.view.setControls(controls);
        this.controls = controls;
        this.userInteracted = false;
        // lifetime: owner (the control is disposed with the scene)
        controls.addEventListener('start', () => { this.userInteracted = true; });
        // OrbitControls resets touch-action on attach: a touch drag must never scroll the page
        instance.domElement.style.touchAction = 'none';
        this.dblClickDispose = createDoubleClickRecenter(this.libs, instance, camera, controls,
            () => !this.view.activeTool, point => this.flyTo(point));
    }

    /** Ambient, hemisphere (sky/ground fill: 3D Tiles are dark without it), sun and fill lights. */
    addLights({ fill }) {
        const { THREE } = this.libs;
        const s = this.settings;
        const scene = this.instance.scene;
        this.lights = {
            ambient: new THREE.AmbientLight(0xffffff, s.ambientIntensity),
            hemisphere: new THREE.HemisphereLight(0xffffff, 0x444444, s.hemisphereIntensity),
            sun: new THREE.DirectionalLight(0xffffff, s.directionalIntensity),
            fill: fill ? new THREE.DirectionalLight(0xffffff, s.directionalIntensity * 0.35) : null
        };
        this.lights.sun.position.set(1, 1, 2);
        if (fill) this.lights.fill.position.set(-1, -1, 1);
        Object.values(this.lights).forEach(light => { if (light) scene.add(light); });
    }

    /** Lights retuned to the settings. */
    updateLighting() {
        const { ambient, hemisphere, sun, fill } = this.lights;
        const s = this.settings;
        if (ambient) ambient.intensity = s.ambientIntensity;
        if (hemisphere) hemisphere.intensity = s.hemisphereIntensity;
        if (sun) sun.intensity = s.directionalIntensity;
        if (fill) fill.intensity = s.directionalIntensity * 0.35;
        if (this.instance) this.instance.notifyChange();
    }

    /**
     * An OSM basemap with a wide margin around the data, lifted to `elevation` (a point
     * cloud's ground). Best effort: it never keeps the data from showing.
     */
    addBasemap(extent, elevation) {
        try {
            const { Map, ColorLayer, TiledImageSource, OSM } = this.libs;
            const map = new Map({ extent: extent.withRelativeMargin(5) });
            this.instance.add(map);
            this.map = map;
            if (typeof elevation === 'number' && isFinite(elevation) && map.object3d) {
                map.object3d.position.z = elevation;
                map.object3d.updateMatrixWorld(true);
            }
            const basemap = new ColorLayer({ name: 'osm', source: new TiledImageSource({ source: new OSM() }) });
            map.addLayer(basemap);
            this.registerLayer('Basemap (OSM)', 'fa-solid fa-map', () => basemap.visible, v => { basemap.visible = v; });
        } catch {
            // The basemap is optional
        }
    }

    // ---- Layers ----------------------------------------------------------------------

    registerLayer(name, icon, getVisible, setVisible) {
        const id = ++this.layerId;
        this.layerSetters[id] = setVisible;
        this.view.layers.push({ id, name, icon, visible: getVisible() });
    }

    toggleLayer(layer) {
        layer.visible = !layer.visible;
        const set = this.layerSetters[layer.id];
        if (set) set(layer.visible);
        if (this.instance) this.instance.notifyChange();
    }

    // ---- Data helpers ----------------------------------------------------------------

    /** Extent (EPSG:3857) of an entry's WGS84 footprint, with its bbox and centre latitude. */
    computeExtent(entry) {
        const geom = entry.polygon_geom || entry.point_geom;
        if (!geom) return null;
        const { Extent, CoordinateSystem, olProj } = this.libs;
        let [minx, miny, maxx, maxy] = geojsonBbox(geom);
        if (minx === maxx) { minx -= 0.0005; maxx += 0.0005; }
        if (miny === maxy) { miny -= 0.0005; maxy += 0.0005; }
        const min = olProj.fromLonLat([minx, miny]);
        const max = olProj.fromLonLat([maxx, maxy]);
        return {
            extent: new Extent(CoordinateSystem.epsg3857, min[0], max[0], min[1], max[1]),
            bbox: [min[0], min[1], max[0], max[1]],
            centerLat: (miny + maxy) / 2
        };
    }

    /** Georeferenced: a WGS84 footprint (rasters always); only those get a basemap or a globe. */
    isGeoreferenced(entry) {
        if (entry.type === ddb.entry.type.GEORASTER) return true;
        if (entry.properties && entry.properties.georeferenced === false) return false;
        return ddb.entry.hasGeometry(entry);
    }

    /**
     * Registers a point cloud's CRS (from the COPC WKT) with proj4 / OpenLayers so the basemap
     * can be reprojected into it. False when unusable: the caller then skips the basemap
     * (reprojection errors would flood the render loop and freeze the controls).
     */
    registerCrs(crs) {
        try {
            const CS = this.libs.CoordinateSystem;
            if (!crs || crs === CS.epsg3857) return true;
            if (crs === CS.unknown) return false;
            const id = crs.id || (crs.srid && crs.srid.toString ? crs.srid.toString() : null);
            if (!id || !crs.definition) return false;
            CS.register(id, crs.definition, { throwIfFailedToRegisterWithProj: true });
            return true;
        } catch {
            return false;
        }
    }

    /** RGB when the cloud has it, else an elevation ramp (never a flat black/white blob). */
    colorizePointCloud(entity) {
        try {
            const attrs = entity.getSupportedAttributes ? entity.getSupportedAttributes() : [];
            const color = attrs.find(a => a.interpretation === 'color');
            if (color) {
                entity.setActiveAttribute(color.name);
                entity.setColoringMode('attribute');
                return;
            }
            const z = attrs.find(a => a.name === 'Z') || attrs.find(a => a.interpretation === 'unknown');
            if (!z) return;
            const { ColorMap, ColorMapMode, THREE } = this.libs;
            const min = typeof z.min === 'number' ? z.min : 0;
            const max = typeof z.max === 'number' && z.max > min ? z.max : min + 1;
            entity.setAttributeColorMap(z.name, new ColorMap({ colors: ELEVATION_RAMP.map(c => new THREE.Color(c)), min, max, mode: ColorMapMode.Elevation }));
            entity.setActiveAttribute(z.name);
            entity.setColoringMode('attribute');
        } catch {
            // Keep the default colouring
        }
    }

    /**
     * Prepares a Tiles3D entity, right after instance.add, for progressive streaming:
     * distance.max = Infinity keeps a valid frustum while the first tiles load (an empty
     * tileset otherwise collapses the far plane and nothing ever loads), and the shared LRU
     * cache gets a device-sized budget (1/4 of the memory, 0.75 to 2 GiB) instead of
     * Giro3D's ~410 MB, which halts high-resolution models before anything is drawn.
     */
    configureTilesetStreaming(tileset) {
        if (tileset.distance) tileset.distance.max = Infinity;
        const cache = tileset.tiles && tileset.tiles.lruCache;
        if (!cache) return;
        const deviceMemGb = navigator.deviceMemory || 4;
        const budget = Math.min(2, Math.max(0.75, deviceMemGb * 0.25)) * 1024 * 1024 * 1024;
        if (!(cache.maxBytesSize >= budget)) {
            cache.maxBytesSize = budget;
            cache.minBytesSize = Math.round(budget * 0.75);
        }
    }

    /**
     * Rests a georeferenced tileset on the ellipsoid (the globe has no elevation) once its
     * first tiles rendered: shifted by the 2nd-percentile vertex altitude (photogrammetry
     * meshes often close their bottom with a cap metres below the real ground), then clipped
     * at the ground. Returns the shifted box.
     */
    groundGlobeTileset(tileset, box) {
        const { THREE } = this.libs;
        const ellipsoid = this.globe && this.globe.ellipsoid;
        if (!ellipsoid) return box;
        tileset.object3d.updateMatrixWorld(true);
        const vertex = new THREE.Vector3();
        const samples = [];
        tileset.object3d.traverse(obj => {
            const positions = obj.geometry && obj.geometry.attributes && obj.geometry.attributes.position;
            if (!positions) return;
            const step = Math.max(1, Math.floor(positions.count / 2000));
            for (let i = 0; i < positions.count; i += step) {
                vertex.fromBufferAttribute(positions, i).applyMatrix4(obj.matrixWorld);
                samples.push({ altitude: ellipsoid.toGeodetic(vertex.x, vertex.y, vertex.z).altitude, position: vertex.clone() });
            }
        });
        if (!samples.length) return box;
        // toGeodetic's altitude has a latitude-dependent bias (a Giro3D bug) shared by every
        // sample: fine for ranking; the clipping point is a real vertex, never a round-trip
        samples.sort((a, b) => a.altitude - b.altitude);
        const ground = samples[Math.floor(samples.length * 0.02)];
        if (!Number.isFinite(ground.altitude)) return box;
        const up = ellipsoid.getNormalFromCartesian(ground.position, new THREE.Vector3());
        const offset = up.clone().multiplyScalar(-ground.altitude);
        if (Math.abs(ground.altitude) >= 0.01) {
            tileset.object3d.position.add(offset);
            tileset.object3d.updateMatrixWorld(true);
            this.notify.info(`The model was shifted by ${Math.round(Math.abs(ground.altitude))} m to rest on the ground.`,
                { summary: 'Altitude adjusted', life: 'long' });
        }
        tileset.clippingPlanes = [new THREE.Plane().setFromNormalAndCoplanarPoint(up, ground.position.clone().add(offset))];
        return box.clone().translate(offset);
    }

    /** Stands a flat-scene tileset up when its content is not Z-up (measured once it rendered). */
    uprightTileset(tileset, box) {
        const camera = this.instance.view.camera;
        const rotation = alignContentUpAxis(this.libs, tileset.object3d, camera.up);
        if (!rotation) return box;
        const upright = box.clone().applyMatrix4(rotation);
        if (!this.userInteracted && isFiniteBox(upright)) this.frameBox(upright);
        this.instance.notifyChange(camera);
        return upright;
    }

    /** Resolves once `isReady()` after a frame (the data is on screen), or after the timeout. */
    waitForFirstRender(isReady, timeoutMs = 30000) {
        return new Promise(resolve => {
            const instance = this.instance;
            if (!instance) { resolve(); return; }
            let timer = null;
            const finish = () => {
                instance.removeEventListener('update-end', onUpdate);
                clearTimeout(timer);
                resolve();
            };
            const onUpdate = () => { try { if (isReady()) finish(); } catch { finish(); } };
            // lifetime: paired (removed by finish)
            timer = setTimeout(finish, timeoutMs);
            instance.addEventListener('update-end', onUpdate);
            instance.notifyChange();
        });
    }

    // ---- Framing and navigation ------------------------------------------------------

    savePose(target) {
        const camera = this.instance.view.camera;
        this.homePose = { position: camera.position.clone(), target: target.clone(), up: camera.up.clone() };
    }

    /** Oblique top-down view of a map extent; sets the Mercator correction. */
    frameExtent({ bbox: [xmin, ymin, xmax, ymax], centerLat }) {
        const cx = (xmin + xmax) / 2;
        const cy = (ymin + ymax) / 2;
        const span = Math.max(xmax - xmin, ymax - ymin) || 100;
        const dist = span * 1.2;
        this.mercatorScale = Math.cos(centerLat * Math.PI / 180);
        this.instance.view.camera.position.set(cx, cy - dist, dist);
        this.instance.view.minNearPlane = Math.max(dist / 1000, 0.1);
        this.controls.target.set(cx, cy, 0);
        applySceneMetrics(this.controls, span);
        this.controls.update();
        this.savePose(this.controls.target);
        this.instance.notifyChange();
    }

    /** Three-quarter view of a 3D entity's box (metric CRS). */
    frameBox(box) {
        const { THREE } = this.libs;
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        this.mercatorScale = 1;
        this.instance.view.minNearPlane = Math.max(maxDim / 1000, 0.01);
        // Also the far plane while a tileset streams (distance.max = Infinity): contains the model
        this.instance.view.maxFarPlane = maxDim * 1000;
        this.instance.view.camera.position.set(center.x + maxDim * 1.2, center.y - maxDim * 1.2, center.z + maxDim * 0.9);
        this.controls.target.copy(center);
        applySceneMetrics(this.controls, maxDim);
        this.controls.update();
        this.savePose(center);
        this.instance.notifyChange();
    }

    /**
     * Frames a georeferenced tileset from its declared bounding volume (view.goTo would use
     * the still empty object hierarchy and park the camera at the Earth's centre, where no
     * tile ever loads). The first call fixes the local up and builds the control.
     */
    frameGlobe(tileset, box) {
        const { THREE } = this.libs;
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 10;
        const up = center.clone().normalize();
        const camera = this.instance.view.camera;
        this.instance.view.minNearPlane = Math.max(maxDim / 1000, 0.5);
        this.instance.view.maxFarPlane = Math.max(maxDim * 1000, 5.0e7);
        camera.position.copy(center).add(up.clone().multiplyScalar(maxDim * 2.5));
        if (!this.globeUpSet) {
            camera.up.copy(up);
            this.globeUpSet = true;
        }
        camera.lookAt(center);
        camera.updateMatrixWorld();
        if (!this.controls) this.attachControls();
        this.controls.target.copy(center);
        // Pulling back to the continent is legitimate on a globe
        applySceneMetrics(this.controls, maxDim, NAV.globeMaxDistanceFactor);
        this.controls.update();
        this.savePose(center);
        this.instance.notifyChange(camera);
    }

    /** Re-centres on a point, keeping the view direction and distance (double click). */
    flyTo(point) {
        if (!this.instance || !this.controls) return;
        const camera = this.instance.view.camera;
        const position = camera.position.clone().add(point.clone().sub(this.controls.target));
        this.tweener.tweenTo(camera, this.controls, position, point, NAV.dblClickDurationMs, () => { this.userInteracted = true; });
    }

    /** Back to the pose the last framing computed. */
    goHome() {
        if (!this.instance || !this.homePose || !this.controls) return;
        const { position, target } = this.homePose;
        this.tweener.tweenTo(this.instance.view.camera, this.controls, position.clone(), target.clone(), NAV.dblClickDurationMs,
            () => { this.userInteracted = false; });
    }

    setNavigationEnabled(enabled) {
        if (this.controls) this.controls.enabled = enabled;
    }

    /** Releases everything: Giro3D disposes its renderer, scene, entities and canvas. */
    dispose() {
        this.tweener.stop();
        if (this.dblClickDispose) this.dblClickDispose();
        if (this.controls) {
            try { this.controls.dispose(); } catch { /* already gone */ }
        }
        if (this.instance) {
            try { this.instance.dispose(); } catch { /* already gone */ }
        }
        this.dblClickDispose = this.controls = this.instance = this.map = this.globe = this.homePose = null;
        this.lights = {};
        this.layerSetters = {};
    }
}
