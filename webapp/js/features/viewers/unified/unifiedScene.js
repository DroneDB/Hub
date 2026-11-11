/**
 * The 3D viewer's Giro3D scene: the instance in a flat
 * CRS or on the globe, lights, the OSM basemap, the navigation control (the strategy the loader
 * picks: the constrained orbit of a geo scene or the bm3d viewer's free trackball, see
 * navControls), framing and the Home pose, the layer list and teardown. The loaders (loaders.js) put the data in it.
 *
 * `view` is the component's reactive state the scene reports into: loadingText, progress,
 * layers, isLocalPointCloud, isLocalDrawing, localUnits, activeTool.
 */
import ddb from 'ddb';
import {
    createNavControls, navPivot, orbitTweenStep, stopNavAnimation, focusPosition,
    applySceneMetrics, createDoubleClickRecenter, createCameraTweener, NAV
} from './navControls';
import { navigateByKey } from './navKeys';
import { alignContentUpAxis } from './contentOrientation';
import { deviceMemoryGb } from '@/libs/responsive';
import { appliedPixelRatio, watchPixelRatio } from '@/libs/pixelRatio';
import { tokenHex } from '@/libs/colorScheme';
import { geojsonBbox, isFiniteBox, fitDistance, ELEVATION_RAMP } from './sceneUtils';

// How often the progress row follows the tiles while the scene waits for its first frame
const PROGRESS_POLL_MS = 250;

// What a screen reader says of the canvas (FR-VWR-16); the Controls help of the toolbar lists the rest
const CANVAS_LABEL = '3D view. Arrow keys rotate, Shift and arrow keys pan, plus and minus zoom, Home resets the view.';

// Direction (east, south, up) the camera looks at a framed model from
const THREE_QUARTER_VIEW = [1.2, -1.2, 0.9];

/** North on the ground of an ECEF point whose vertical is `up` (east where north is undefined, at a pole). */
function northOf(THREE, up) {
    const north = new THREE.Vector3(0, 0, 1).addScaledVector(up, -up.z);
    return north.lengthSq() > 1e-12 ? north.normalize() : new THREE.Vector3(0, 1, 0);
}

export class UnifiedScene {
    /**
     * @param {any} libs  loadGiro3dLibs()
     * @param {HTMLElement} container
     * @param {object} ctx
     * @param {Record<string, number>} ctx.settings  lighting (reactive, from useViewerSettings)
     * @param {Record<string, any>} ctx.view
     * @param {{ info: Function, error?: Function }} ctx.notify
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
        // The scene's up axis: Z in a flat scene, the local vertical of the data on the globe
        // (camera.up is the screen's with the free trackball, this one with the constrained orbit:
        // see navControls)
        this.sceneUp = null;
        this.globe = null;
        this.globeUpSet = false;
        this.lights = {};
        this.layerSetters = {};
        this.layerId = 0;
        this.homePose = null;
        // Half the smaller side of the basemap of a flat scene (addBasemap): how far out it still fills the view
        this.basemapRadius = 0;
        // The user dragged / zoomed: the loaders' late re-frames must not overwrite that pose
        this.userInteracted = false;
        // Web Mercator length correction (cos of the centre latitude); 1 in metric CRSs
        this.mercatorScale = 1;
        // Giro3D renders on demand: every step of a flight asks for its frame
        this.tweener = createCameraTweener({
            onFrame: () => { if (this.instance) this.instance.notifyChange(this.instance.view.camera); }
        });
        this.dblClickDispose = null;
        this.keyDispose = null;
        // The cancels of the afterFirstRender listeners still waiting (dispose removes them)
        this.firstRenderCancels = new Set();
        // Point clouds with the size of their points in CSS px (Giro3D draws in the pixels of the buffer: setPointSize)
        this.pointSizes = new Map();
        this.stopPixelRatio = null;
    }

    // ---- Pixel ratio (FR-XC-32, D-042) ------------------------------------------------

    /**
     * Makes the canvas the CSS size x the applied ratio, and keeps it so when the screen's ratio changes. The point
     * clouds with eye-dome lighting render through targets of their own, which Giro3D sizes in CSS px: they get the
     * size of the drawing buffer. The size of the points stays in CSS px.
     */
    applyPixelRatio() {
        const instance = this.instance;
        if (!instance) return;
        instance.renderer.setPixelRatio(appliedPixelRatio());
        this.sizeEdlTargets(instance);
        this.pointSizes.forEach((css, entity) => { entity.pointSize = css * appliedPixelRatio(); });
        instance.notifyChange();
        this.stopPixelRatio ??= watchPixelRatio(() => this.applyPixelRatio());
    }

    /**
     * Giro3D's render pipeline (eye-dome lighting) makes its targets the size it was given: the CSS size of the canvas.
     * It is given the size of the drawing buffer instead, for the pass that renders the scene, so the cloud is drawn at
     * the applied ratio too (the width and height of the engine, which picking reads in CSS px, are put back after).
     */
    sizeEdlTargets(instance) {
        const engine = instance.engine;
        if (!engine || engine.drawsAtBufferSize || typeof engine.renderUsingCustomPipeline !== 'function') return;
        const render = engine.renderUsingCustomPipeline;
        const size = new this.libs.THREE.Vector2();
        engine.renderUsingCustomPipeline = function (...args) {
            const { width, height } = engine;
            engine.renderer.getDrawingBufferSize(size);
            engine.width = size.x;
            engine.height = size.y;
            try {
                return render.apply(engine, args);
            } finally {
                engine.width = width;
                engine.height = height;
            }
        };
        engine.drawsAtBufferSize = true;
    }

    /**
     * The size of the points of a point cloud, in CSS px (Giro3D takes the size in the pixels of the drawing buffer).
     * @param {any} entity @param {number} cssPx
     */
    setPointSize(entity, cssPx) {
        this.pointSizes.set(entity, cssPx);
        entity.pointSize = cssPx * appliedPixelRatio();
    }

    // ---- Instance --------------------------------------------------------------------

    /**
     * A flat scene in `crs` (every type but georeferenced 3D Tiles), Z up. `nav` is the
     * navigation strategy of the scene the loader builds: 'constrained' (a geo scene) or 'free'.
     */
    setupInstance(crs, { nav = 'free' } = {}) {
        const instance = new this.libs.Instance({ target: this.container, crs, backgroundColor: tokenHex('--ddb-viewer-bg') });
        this.instance = instance;
        this.applyPixelRatio();
        instance.view.camera.up.set(0, 0, 1);
        this.sceneUp = instance.view.camera.up.clone();
        this.addLights({ fill: true });
        this.attachControls(nav);
    }

    /**
     * A globe (EPSG:4978) with the OSM basemap on the ellipsoid. Its up axis is the ellipsoid
     * normal under the data, which frameGlobe knows. A globe is a geo scene: the constrained
     * orbit unless `nav` says otherwise.
     */
    setupGlobe({ nav = 'constrained' } = {}) {
        const { Instance, Globe, ColorLayer, TiledImageSource, OSM, CoordinateSystem } = this.libs;
        const instance = new Instance({ target: this.container, crs: CoordinateSystem.epsg4978, backgroundColor: tokenHex('--ddb-viewer-space-bg') });
        this.instance = instance;
        this.applyPixelRatio();
        this.mercatorScale = 1;
        instance.view.camera.up.set(0, 0, 1);
        this.sceneUp = instance.view.camera.up.clone();
        this.addLights({ fill: false });
        try {
            const globe = new Globe({ backgroundColor: tokenHex('--ddb-viewer-space-bg') });
            instance.add(globe);
            this.map = this.globe = globe;
            globe.addLayer(new ColorLayer({ name: 'osm', source: new TiledImageSource({ source: new OSM() }) }));
            this.registerLayer('Basemap (OSM)', 'fa-solid fa-earth-europe', () => globe.visible, v => { globe.visible = v; });
        } catch {
            // The basemap is optional
        }
        this.globeUpSet = false;
        this.attachControls(nav);
    }

    /**
     * The navigation control and its double-click focus; replaces the previous ones. `strategy`
     * is picked once per scene ('constrained' or 'free'); the scene's up axis is read at every
     * use (frameGlobe sets the globe's after this).
     */
    attachControls(strategy = 'free') {
        const { instance } = this;
        const camera = instance.view.camera;
        if (this.dblClickDispose) this.dblClickDispose();
        if (this.keyDispose) this.keyDispose();
        if (this.controls) {
            try { this.controls.dispose(); } catch { /* already gone */ }
        }
        const controls = createNavControls(this.libs, camera, instance.domElement, instance.scene,
            { strategy, getUp: () => this.sceneUp });
        // Giro3D then updates it every frame and relays its changes (what keeps 3D Tiles streaming)
        instance.view.setControls(controls);
        this.controls = controls;
        this.userInteracted = false;
        // lifetime: owner (the control is disposed with the scene). A press or a wheel notch
        // takes the camera over from a flight
        controls.addEventListener('start', () => {
            this.userInteracted = true;
            this.tweener.stop();
        });
        // A touch drag must never scroll the page
        instance.domElement.style.touchAction = 'none';
        // Focusable (a click on the view takes the keyboard focus), named, and moved by the keys of
        // navKeys while it has the focus (FR-VWR-16)
        const canvas = instance.domElement;
        canvas.tabIndex = 0;
        canvas.setAttribute('role', 'application');
        canvas.setAttribute('aria-label', CANVAS_LABEL);
        const onKeyDown = event => this.onKeyDown(event);
        canvas.addEventListener('keydown', onKeyDown);
        this.keyDispose = () => canvas.removeEventListener('keydown', onKeyDown);
        // Navigation is disabled while a measurement is drawn; the focus is too
        this.dblClickDispose = createDoubleClickRecenter(this.libs, instance, camera, controls,
            () => !this.view.activeTool && controls.enabled, point => this.flyTo(point), () => this.sceneUp);
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
            const extentWithMargin = extent.withRelativeMargin(5);
            const map = new Map({ extent: extentWithMargin });
            this.instance.add(map);
            this.map = map;
            // How far out the camera can go before the basemap no longer fills the view (FR-VWR-15)
            const { x, y } = extentWithMargin.dimensions();
            this.basemapRadius = Math.min(x, y) / 2;
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
        const budget = Math.min(2, Math.max(0.75, deviceMemoryGb() * 0.25)) * 1024 * 1024 * 1024;
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
        const rotation = alignContentUpAxis(this.libs, tileset.object3d, this.sceneUp);
        if (!rotation) return box;
        const upright = box.clone().applyMatrix4(rotation);
        if (!this.userInteracted && isFiniteBox(upright)) this.frameBox(upright);
        this.instance.notifyChange(camera);
        return upright;
    }

    /**
     * Resolves once `isReady()` after a frame (the data is on screen) with true, or after the
     * timeout (the cap of the loading indicator, not of the data: it may come later) with false.
     * With `progress` (a function giving 0..1, the tiles loaded) the progress row of the loading
     * indicator follows it while the scene waits. A scene without an instance resolves false; an
     * `isReady` that throws ends the wait with false.
     * @returns {Promise<boolean>}
     */
    waitForFirstRender(isReady, timeoutMs = 30000, progress = null) {
        return new Promise(resolve => {
            const instance = this.instance;
            if (!instance) { resolve(false); return; }
            let timer = null;
            let poll = null;
            const finish = ready => {
                instance.removeEventListener('update-end', onUpdate);
                clearTimeout(timer);
                clearInterval(poll);
                resolve(ready);
            };
            const onUpdate = () => { try { if (isReady()) finish(true); } catch { finish(false); } };
            const report = () => {
                try {
                    const value = progress();
                    if (Number.isFinite(value)) this.view.progress = Math.min(1, Math.max(0, value));
                } catch { /* the bar stays where it was */ }
            };
            // lifetime: paired (removed by finish)
            timer = setTimeout(() => finish(false), timeoutMs);
            instance.addEventListener('update-end', onUpdate);
            if (progress) {
                report();
                poll = setInterval(report, PROGRESS_POLL_MS);
            }
            instance.notifyChange();
        });
    }

    /**
     * Runs `action` once, after the first frame at which `isReady()` (the data is on screen): what
     * needs the streamed geometry (the grounding of a tileset) when waitForFirstRender stopped
     * waiting before it came (FR-VWR-20). The listener goes after its run, with the scene
     * (dispose), or when `isReady` throws. An error of `action` is shown, not thrown into Giro3D's
     * render loop.
     * @returns {() => void} cancels it
     */
    afterFirstRender(isReady, action) {
        const instance = this.instance;
        if (!instance) return () => {};
        const cancel = () => {
            if (!this.firstRenderCancels.delete(cancel)) return;
            try { instance.removeEventListener('update-end', onUpdate); } catch { /* the instance is gone */ }
        };
        const onUpdate = () => {
            let ready;
            try {
                ready = isReady();
            } catch {
                cancel();
                return;
            }
            if (!ready) return;
            cancel();
            try {
                action();
            } catch (e) {
                if (this.notify.error) this.notify.error(e);
                else throw e;
            }
        };
        this.firstRenderCancels.add(cancel);
        // lifetime: paired (removed by cancel: after the run, or by dispose)
        instance.addEventListener('update-end', onUpdate);
        instance.notifyChange();
        return cancel;
    }

    // ---- Framing and navigation ------------------------------------------------------

    savePose(target) {
        const camera = this.instance.view.camera;
        // The field of view too: Home gives back what Shift+wheel changed (FR-VWR-29)
        this.homePose = {
            position: camera.position.clone(), target: target.clone(), up: camera.up.clone(), quaternion: camera.quaternion.clone(), fov: camera.fov
        };
    }

    /** The distance at which the basemap of a flat scene still fills the view (0 without one). */
    basemapFillDistance() {
        if (!(this.basemapRadius > 0)) return 0;
        const { camera } = this.instance.view;
        return fitDistance(this.basemapRadius, camera.fov, camera.aspect, 1);
    }

    /** Oblique top-down view of a map extent; sets the Mercator correction. */
    frameExtent({ bbox: [xmin, ymin, xmax, ymax], centerLat }) {
        const cx = (xmin + xmax) / 2;
        const cy = (ymin + ymax) / 2;
        const span = Math.max(xmax - xmin, ymax - ymin) || 100;
        const dist = span * 1.2;
        const { THREE } = this.libs;
        this.mercatorScale = Math.cos(centerLat * Math.PI / 180);
        const target = new THREE.Vector3(cx, cy, 0);
        const position = new THREE.Vector3(cx, cy - dist, dist);
        applySceneMetrics(this.controls, span, {
            view: this.instance.view, distance: position.distanceTo(target), fillDistance: this.basemapFillDistance()
        });
        this.controls.setPose({ position, target, up: this.sceneUp }, { save: true });
        this.savePose(target);
        this.instance.notifyChange();
    }

    /** Three-quarter view of a 3D entity's box (metric CRS). */
    frameBox(box) {
        const { THREE } = this.libs;
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        this.mercatorScale = 1;
        // Far enough for the whole box to fit the screen, narrow (a phone upright) or wide
        const camera = this.instance.view.camera;
        const distance = fitDistance(size.length() / 2 || maxDim / 2, camera.fov, camera.aspect);
        const position = new THREE.Vector3(...THREE_QUARTER_VIEW).normalize().multiplyScalar(distance).add(center);
        // The near plane, the far plane (also while a tileset streams: distance.max = Infinity) and the zoom cap
        applySceneMetrics(this.controls, maxDim, {
            view: this.instance.view, distance, fillDistance: this.basemapFillDistance()
        });
        this.controls.setPose({ position, target: center, up: this.sceneUp }, { save: true });
        this.savePose(center);
        this.instance.notifyChange();
    }

    /**
     * Frames a georeferenced tileset from its declared bounding volume (view.goTo would use
     * the still empty object hierarchy and park the camera at the Earth's centre, where no
     * tile ever loads), as frameBox frames a model: from the south-east above the ground (east,
     * south and up of the tileset's own vertical), far enough for the whole box to fit the view
     * (fitDistance). applySceneMetrics sizes the planes to that distance, so a tileset of any size
     * is in front of the near plane. The first call fixes the scene's up axis.
     */
    frameGlobe(tileset, box) {
        const { THREE } = this.libs;
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 10;
        const up = center.clone().normalize();
        const camera = this.instance.view.camera;
        const distance = fitDistance(size.length() / 2 || maxDim / 2, camera.fov, camera.aspect);
        const north = northOf(THREE, up);
        const east = new THREE.Vector3().crossVectors(north, up);
        const [e, n, u] = THREE_QUARTER_VIEW;
        const position = east.multiplyScalar(e).addScaledVector(north, n).addScaledVector(up, u).normalize()
            .multiplyScalar(distance).add(center);
        if (!this.globeUpSet) {
            this.sceneUp = up.clone();
            this.globeUpSet = true;
        }
        // Pulling back to the continent is legitimate on a globe
        applySceneMetrics(this.controls, maxDim, { view: this.instance.view, distance, globe: true });
        this.controls.setPose({ position, target: center, up: north }, { save: true });
        this.savePose(center);
        this.instance.notifyChange(camera);
    }

    /**
     * Focuses on a point (double click), as the bm3d viewer does: the point becomes the pivot,
     * in the middle of the view, which keeps its direction and comes closer by a wheel notch.
     * The flight goes through the strategy's setPose: its last step is saved, so the next
     * gesture starts from the focus.
     */
    flyTo(point) {
        if (!this.instance || !this.controls) return;
        const camera = this.instance.view.camera;
        const controls = this.controls;
        stopNavAnimation(controls);
        const position = focusPosition(camera, controls, point);
        controls.target.copy(navPivot(controls));
        this.tweener.tweenTo(camera, controls, position, point, NAV.dblClickDurationMs, () => {
            this.userInteracted = true;
        });
    }

    /**
     * Back to the pose the last framing computed: the camera turns around the pivot to it (and
     * rolls back upright), from wherever a pan or a focus left the pivot. As the focus, through
     * setPose; a flight is not an input, so it never fires 'start'.
     */
    goHome() {
        if (!this.instance || !this.homePose || !this.controls) return;
        const { position, target, quaternion, fov } = this.homePose;
        const camera = this.instance.view.camera;
        const controls = this.controls;
        stopNavAnimation(controls);
        controls.target.copy(navPivot(controls));
        const orbit = orbitTweenStep(this.libs.THREE, camera, controls, quaternion, position.distanceTo(target));
        // The field of view goes back with the pose (setPose takes it; FR-VWR-29)
        const fromFov = camera.fov;
        const onStep = e => {
            orbit(e);
            return typeof fov === 'number' ? { fov: fromFov + (fov - fromFov) * e } : undefined;
        };
        this.tweener.tweenTo(camera, controls, position.clone(), target.clone(), NAV.dblClickDurationMs, () => {
            this.userInteracted = false;
        }, onStep);
    }

    /**
     * A key on the canvas (it has the focus): the arrows, Shift+arrows and +/- move the view
     * through the strategy's interface (navKeys), as a drag or a wheel notch would: they take the
     * camera over from a flight and count as an interaction. Nothing while navigation is off.
     */
    onKeyDown(event) {
        const controls = this.controls;
        if (!this.instance || !controls || !controls.enabled) return;
        if (!navigateByKey(controls, event, () => {
            // Before the move: a flight or the inertia of a drag would undo it
            this.tweener.stop();
            stopNavAnimation(controls);
        })) return;
        event.preventDefault();
        this.userInteracted = true;
        this.instance.notifyChange(this.instance.view.camera);
    }

    setNavigationEnabled(enabled) {
        if (this.controls) this.controls.enabled = enabled;
    }

    /** Releases everything: Giro3D disposes its renderer, scene, entities and canvas. */
    dispose() {
        this.tweener.stop();
        if (this.stopPixelRatio) this.stopPixelRatio();
        this.stopPixelRatio = null;
        this.pointSizes.clear();
        [...this.firstRenderCancels].forEach(cancel => cancel());
        if (this.dblClickDispose) this.dblClickDispose();
        if (this.keyDispose) this.keyDispose();
        if (this.controls) {
            try { this.controls.dispose(); } catch { /* already gone */ }
        }
        if (this.instance) {
            try { this.instance.dispose(); } catch { /* already gone */ }
        }
        this.dblClickDispose = this.keyDispose = this.controls = this.instance = this.map = this.globe = this.homePose = null;
        this.lights = {};
        this.layerSetters = {};
    }
}
