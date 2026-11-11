/**
 * The framing of the 3D viewer's scene (FR-XC-18, FR-VWR-09, FR-VWR-15, FR-VWR-20, FR-VWR-21):
 * every framing method sizes the near plane, the far plane and the zoom cap through
 * applySceneMetrics; a georeferenced tileset is framed from the south-east above the ground at the
 * distance that fits the view, at any size and in any window; the first frame of a 3D Tiles set is
 * waited for 5 s, with the tile progress in the loading row; the tile cache follows deviceMemoryGb.
 * three.js is the real thing; Giro3D is stubbed.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { ArcballControls } from 'three/examples/jsm/controls/ArcballControls.js';
import ddb from 'ddb';
import { UnifiedScene } from './unifiedScene';
import { LOADERS } from './loaders';

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

// A scene on a stubbed Giro3D instance, its controls attached (the strategy of the scene)
function makeScene({ strategy = 'constrained', fov = 30, aspect = 1, up = [0, 0, 1], libs = {} } = {}) {
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const el = document.createElement('canvas');
    el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 600, height: 400, right: 600, bottom: 400, x: 0, y: 0 });
    const camera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 1000);
    camera.up.set(...up);
    const view = { camera, setControls: vi.fn(), minNearPlane: 0.1, maxFarPlane: 1e9 };
    const scene = new UnifiedScene({ THREE, ArcballControls, ...libs }, el, { settings: {}, view: { activeTool: null, progress: null, layers: [] }, notify: { info: vi.fn() } });
    scene.instance = {
        view, domElement: el, scene: new THREE.Scene(), notifyChange: vi.fn(), pickObjectsAt: vi.fn(() => []),
        add: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn()
    };
    scene.sceneUp = camera.up.clone();
    scene.attachControls(strategy);
    return { scene, camera, view, el };
}

describe('frameGlobe (FR-VWR-09)', () => {
    // A 0.2 m box on the equator at the prime meridian: the local vertical is +X, north +Z, east +Y
    const GROUND = 6378137;
    const box = (half = 0.1) => new THREE.Box3(new THREE.Vector3(GROUND - half, -half, -half), new THREE.Vector3(GROUND + half, half, half));

    it('keeps a 0.2 m model out of the near plane: the camera is more than 100 near planes from it', () => {
        const { scene, camera, view } = makeScene();
        scene.frameGlobe({}, box());
        const center = new THREE.Vector3(GROUND, 0, 0);
        // fitDistance(radius 0.1732, fov 30, aspect 1) = 1.1 x 0.1732 / sin 15 degrees
        expect(camera.position.distanceTo(center)).toBeCloseTo(0.7361343, 5);
        // A hundredth of it (7.4 mm) would pass a quarter of the 4 mm minimum distance: the 1 mm floor
        expect(view.minNearPlane).toBe(0.001);
        expect(scene.controls.minDistance).toBeCloseTo(0.004, 12);
        expect(camera.position.distanceTo(center)).toBeGreaterThan(view.minNearPlane * 100);
        // 2000 sizes of zoom-out at most, the far plane at the horizon from there
        expect(scene.controls.maxDistance).toBeCloseTo(400, 6);
        expect(view.maxFarPlane).toBeCloseTo(143665.9, 0);
    });

    it('looks from the south-east above the ground, as frameBox does, not straight down', () => {
        const { scene, camera } = makeScene();
        scene.frameGlobe({}, box());
        const offset = camera.position.clone().sub(new THREE.Vector3(GROUND, 0, 0));
        // East (+Y) and south (-Z) of the model, 27.94 degrees above the ground
        expect(offset.y).toBeGreaterThan(0.1);
        expect(offset.z).toBeLessThan(-0.1);
        expect(offset.y).toBeCloseTo(-offset.z, 6);
        const elevation = Math.asin(offset.x / offset.length()) * 180 / Math.PI;
        expect(elevation).toBeCloseTo(27.938, 2);
        // The home pose is that view, with the field of view it was framed with
        expect(scene.homePose.position.distanceTo(camera.position)).toBeLessThan(1e-9);
        expect(scene.homePose.fov).toBe(30);
    });

    it('fits a tileset of 500 m the same way, and the camera is still in front of the near plane', () => {
        const { scene, camera, view } = makeScene();
        scene.frameGlobe({}, box(250));
        const distance = camera.position.distanceTo(new THREE.Vector3(GROUND, 0, 0));
        // radius 433.01 m
        expect(distance).toBeCloseTo(1.1 * 433.0127 / Math.sin(15 * Math.PI / 180), 2);
        // A hundredth of 1840 m is 18.4 m, past the 10 m minimum distance: a quarter of it instead
        expect(view.minNearPlane).toBeCloseTo(2.5, 10);
        expect(scene.controls.minDistance).toBeCloseTo(10, 10);
        expect(distance).toBeGreaterThan(view.minNearPlane * 100);
    });

    it('stands farther back for a tall window (390 x 844) than for a wide one (FR-VWR-21)', () => {
        const wide = makeScene({ aspect: 1400 / 900 });
        wide.scene.frameGlobe({}, box());
        const portrait = makeScene({ aspect: 390 / 844 });
        portrait.scene.frameGlobe({}, box());
        const center = new THREE.Vector3(GROUND, 0, 0);
        expect(wide.camera.position.distanceTo(center)).toBeCloseTo(0.7361343, 5);
        // The horizontal field of view limits a portrait view: 1.1 x 0.1732 / sin(7.06 degrees)
        expect(portrait.camera.position.distanceTo(center)).toBeCloseTo(1.5505378, 5);
    });

    it('fixes the up axis of the scene once, at the first framing', () => {
        const { scene } = makeScene();
        scene.frameGlobe({}, box());
        expect(scene.sceneUp.distanceTo(new THREE.Vector3(1, 0, 0))).toBeLessThan(1e-12);
        expect(scene.globeUpSet).toBe(true);
        // A later framing (after the grounding moved the box) does not change it
        scene.frameGlobe({}, new THREE.Box3(new THREE.Vector3(0, GROUND - 1, -1), new THREE.Vector3(1, GROUND + 1, 1)));
        expect(scene.sceneUp.distanceTo(new THREE.Vector3(1, 0, 0))).toBeLessThan(1e-12);
    });
});

describe.each(['constrained', 'free'])('frameBox (%s strategy)', strategy => {
    it('sizes the planes and the cap through applySceneMetrics: near a quarter of minDistance, far twice the cap and the size', () => {
        const { scene, camera, view } = makeScene({ strategy });
        scene.frameBox(new THREE.Box3(new THREE.Vector3(-10, -10, 0), new THREE.Vector3(10, 10, 20)));
        const distance = 1.1 * (Math.sqrt(3) * 20 / 2) / Math.sin(15 * Math.PI / 180);
        expect(camera.position.distanceTo(new THREE.Vector3(0, 0, 10))).toBeCloseTo(distance, 6);
        // A hundredth of the 73.6 m framing (0.736) would pass the 0.4 minimum distance
        expect(view.minNearPlane).toBeCloseTo(0.1, 10);
        expect(scene.controls.maxDistance).toBeCloseTo(400, 6);
        expect(scene.controls.minDistance).toBeCloseTo(0.4, 6);
        expect(view.maxFarPlane).toBeCloseTo(840, 6);
    });
});

describe('a camera zoomed in to the limit sees its pivot (FR-XC-18, FR-VWR-09)', () => {
    // fov 30, a tall window (aspect 0.5): the horizontal half-angle is 7.63 degrees, the framing
    // twice as far as in a square one, and a hundredth of it would pass the minimum distance
    const GROUND = 6378137;

    it.each(['constrained', 'free'])('frameBox (%s strategy): minDistance is four near planes', strategy => {
        const { scene, camera, view } = makeScene({ strategy, fov: 30, aspect: 0.5 });
        scene.frameBox(new THREE.Box3(new THREE.Vector3(-10, -10, 0), new THREE.Vector3(10, 10, 20)));
        expect(camera.position.distanceTo(new THREE.Vector3(0, 0, 10))).toBeCloseTo(143.4808388, 5);
        expect(view.minNearPlane).toBeCloseTo(0.1, 10);
        expect(scene.controls.minDistance).toBeCloseTo(0.4, 10);
        expect(scene.controls.minDistance).toBeGreaterThanOrEqual(4 * view.minNearPlane - 1e-12);
    });

    it.each([[0.1, 1.4348084, 0.001, 0.004], [250, 3587.0209689, 2.5, 10]])('frameGlobe (a box of half-size %s): minDistance is four near planes', (half, distance, near, minDistance) => {
        const { scene, camera, view } = makeScene({ fov: 30, aspect: 0.5 });
        scene.frameGlobe({}, new THREE.Box3(new THREE.Vector3(GROUND - half, -half, -half), new THREE.Vector3(GROUND + half, half, half)));
        expect(camera.position.distanceTo(new THREE.Vector3(GROUND, 0, 0))).toBeCloseTo(distance, 5);
        expect(view.minNearPlane).toBeCloseTo(near, 10);
        expect(scene.controls.minDistance).toBeCloseTo(minDistance, 10);
        expect(scene.controls.minDistance).toBeGreaterThanOrEqual(4 * view.minNearPlane - 1e-12);
    });
});

describe('a flat scene with a basemap (FR-VWR-15)', () => {
    // A basemap whose extent (with its margin) is 154 km x 110 km: the data is 14 km x 10 km
    function withBasemap(strategy = 'constrained') {
        const libs = {
            Map: class { constructor({ extent }) { this.extent = extent; this.object3d = null; } addLayer() {} },
            ColorLayer: class {},
            TiledImageSource: class {},
            OSM: class {}
        };
        const made = makeScene({ strategy, aspect: 1.5, libs });
        const extent = { withRelativeMargin: margin => ({ margin, dimensions: () => ({ x: 154000, y: 110000 }) }) };
        made.scene.addBasemap(extent);
        return made;
    }
    const data = { bbox: [0, 0, 14000, 10000], centerLat: 38 };

    it('keeps the camera where the basemap fills the view: the cap is the distance that fits it', () => {
        const { scene, view } = withBasemap();
        expect(scene.basemapRadius).toBe(55000);
        scene.frameExtent(data);
        // fitDistance(55000, 30, 1.5, 1) = 55000 / sin 15 degrees: nearer than 20 x 14 km
        expect(scene.controls.maxDistance).toBeCloseTo(212503.68, 1);
        expect(view.maxFarPlane).toBeCloseTo(453007.36, 1);
        // A hundredth of the framing distance (16.8 km up and 16.8 km south: 237.6 m) passes a
        // quarter of the 280 m minimum distance
        expect(view.minNearPlane).toBeCloseTo(70, 6);
        expect(scene.controls.minDistance).toBeCloseTo(280, 6);
    });

    it('takes the flat cap, 20 sizes, when there is no basemap to leave', () => {
        const { scene, view } = makeScene({ aspect: 1.5 });
        scene.frameExtent(data);
        expect(scene.controls.maxDistance).toBeCloseTo(280000, 6);
        expect(view.maxFarPlane).toBeCloseTo(2 * (280000 + 14000), 6);
    });

    it('does the same for a point cloud framed in its box', () => {
        const { scene } = withBasemap();
        scene.frameBox(new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(14000, 10000, 100)));
        expect(scene.controls.maxDistance).toBeCloseTo(212503.68, 1);
    });
});

describe('waitForFirstRender (FR-VWR-20)', () => {
    it('gives the progress row the tile progress while it waits, and stops at the timeout', async () => {
        vi.useFakeTimers();
        const { scene } = makeScene();
        let progress = 0.25;
        const done = vi.fn();
        scene.waitForFirstRender(() => false, 5000, () => progress).then(done);
        expect(scene.view.progress).toBe(0.25);
        progress = 0.6;
        await vi.advanceTimersByTimeAsync(300);
        expect(scene.view.progress).toBe(0.6);
        // A value out of range or not a number is not shown as it is
        progress = 3;
        await vi.advanceTimersByTimeAsync(250);
        expect(scene.view.progress).toBe(1);
        progress = NaN;
        await vi.advanceTimersByTimeAsync(250);
        expect(scene.view.progress).toBe(1);
        expect(done).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(5000);
        // false: the wait ended, not the data on screen
        expect(done).toHaveBeenCalledTimes(1);
        expect(done).toHaveBeenCalledWith(false);
        // Nothing keeps polling
        expect(vi.getTimerCount()).toBe(0);
    });

    it('resolves as soon as the data is on screen, and has no progress row without a progress function', async () => {
        vi.useFakeTimers();
        const { scene } = makeScene();
        let onUpdate;
        scene.instance.addEventListener = (type, fn) => { if (type === 'update-end') onUpdate = fn; };
        let ready = false;
        const done = vi.fn();
        scene.waitForFirstRender(() => ready, 5000).then(done);
        expect(scene.view.progress).toBe(null);
        onUpdate();
        await vi.advanceTimersByTimeAsync(0);
        expect(done).not.toHaveBeenCalled();
        ready = true;
        onUpdate();
        await vi.advanceTimersByTimeAsync(0);
        expect(done).toHaveBeenCalledTimes(1);
        expect(done).toHaveBeenCalledWith(true);
        expect(vi.getTimerCount()).toBe(0);
    });
});

// The 'update-end' listeners of a stubbed instance, fired by hand as Giro3D fires them after a frame
function withUpdateEvents(scene) {
    const listeners = new Set();
    scene.instance.addEventListener = vi.fn((type, fn) => { if (type === 'update-end') listeners.add(fn); });
    scene.instance.removeEventListener = vi.fn((type, fn) => { if (type === 'update-end') listeners.delete(fn); });
    return { frame: () => [...listeners].forEach(fn => fn()), count: () => listeners.size };
}

describe('afterFirstRender (FR-VWR-20)', () => {
    it('runs once, on the first frame with the data, and then stops listening', () => {
        const { scene } = makeScene();
        const updates = withUpdateEvents(scene);
        let ready = false;
        const action = vi.fn();
        scene.afterFirstRender(() => ready, action);
        updates.frame();
        expect(action).not.toHaveBeenCalled();
        ready = true;
        updates.frame();
        updates.frame();
        expect(action).toHaveBeenCalledTimes(1);
        expect(updates.count()).toBe(0);
    });

    it('goes with the scene: dispose removes a listener still waiting', () => {
        const { scene } = makeScene();
        const updates = withUpdateEvents(scene);
        const instance = scene.instance;
        instance.dispose = vi.fn();
        const action = vi.fn();
        scene.afterFirstRender(() => true, action);
        expect(updates.count()).toBe(1);
        scene.dispose();
        expect(updates.count()).toBe(0);
        expect(instance.removeEventListener).toHaveBeenCalledWith('update-end', expect.any(Function));
        updates.frame();
        expect(action).not.toHaveBeenCalled();
    });

    it('shows an error of the action instead of throwing it into the render loop', () => {
        const { scene } = makeScene();
        const updates = withUpdateEvents(scene);
        scene.notify.error = vi.fn();
        const failure = new Error('no ellipsoid');
        scene.afterFirstRender(() => true, () => { throw failure; });
        expect(() => updates.frame()).not.toThrow();
        expect(scene.notify.error).toHaveBeenCalledWith(failure);
        expect(updates.count()).toBe(0);
    });
});

describe('a georeferenced tileset slower than the wait of the loading indicator (FR-VWR-20)', () => {
    const GROUND = 6378137;

    it('is grounded and re-framed once, on its first frame with geometry after the 5 s', async () => {
        vi.useFakeTimers();
        const tileset = {
            progress: 0, visible: true, distance: { max: 1 }, tiles: { group: { children: [] }, loadAncestors: false },
            getBoundingBox: () => new THREE.Box3(new THREE.Vector3(GROUND - 1, -1, -1), new THREE.Vector3(GROUND + 1, 1, 1))
        };
        const { scene } = makeScene({ libs: { Tiles3D: class { constructor() { return tileset; } } } });
        const updates = withUpdateEvents(scene);
        scene.setupGlobe = vi.fn();
        const grounded = new THREE.Box3(new THREE.Vector3(GROUND - 3, -1, -1), new THREE.Vector3(GROUND - 1, 1, 1));
        const ground = vi.spyOn(scene, 'groundGlobeTileset').mockReturnValue(grounded);
        const frame = vi.spyOn(scene, 'frameGlobe');
        const dataset = { Entry: () => ({ get3DTiles: () => '/tiles/tileset.json' }) };
        const done = vi.fn();
        LOADERS[ddb.entry.type.TILES3D](scene, { type: ddb.entry.type.TILES3D, path: 'site.3tz' }, dataset).then(done);
        await vi.advanceTimersByTimeAsync(0);
        expect(frame).toHaveBeenCalledTimes(1);

        // No geometry for more than 5 s: the loading indicator stops waiting, nothing is grounded
        updates.frame();
        await vi.advanceTimersByTimeAsync(5000);
        expect(done).toHaveBeenCalledTimes(1);
        updates.frame();
        await vi.advanceTimersByTimeAsync(1000);
        updates.frame();
        expect(ground).not.toHaveBeenCalled();
        expect(frame).toHaveBeenCalledTimes(1);

        // The first tile arrives: grounded once, framed on the grounded box, and no more listening
        tileset.tiles.group.children.push({});
        updates.frame();
        updates.frame();
        expect(ground).toHaveBeenCalledTimes(1);
        expect(ground).toHaveBeenCalledWith(tileset, expect.any(THREE.Box3));
        expect(frame).toHaveBeenCalledTimes(2);
        expect(frame).toHaveBeenLastCalledWith(tileset, grounded);
        expect(updates.count()).toBe(0);
    });

    it('is not re-framed late when the user moved meanwhile, and is not grounded after the viewer closed', async () => {
        vi.useFakeTimers();
        const make = () => {
            const tileset = {
                progress: 0, visible: true, distance: { max: 1 }, tiles: { group: { children: [] }, loadAncestors: false },
                getBoundingBox: () => new THREE.Box3(new THREE.Vector3(GROUND - 1, -1, -1), new THREE.Vector3(GROUND + 1, 1, 1))
            };
            const { scene } = makeScene({ libs: { Tiles3D: class { constructor() { return tileset; } } } });
            const updates = withUpdateEvents(scene);
            scene.setupGlobe = vi.fn();
            scene.instance.dispose = vi.fn();
            const ground = vi.spyOn(scene, 'groundGlobeTileset').mockImplementation((_, box) => box);
            const frame = vi.spyOn(scene, 'frameGlobe');
            const run = LOADERS[ddb.entry.type.TILES3D](scene, { type: ddb.entry.type.TILES3D, path: 'site.3tz' }, { Entry: () => ({ get3DTiles: () => '/t.json' }) });
            return { tileset, scene, updates, ground, frame, run };
        };
        const moved = make();
        await vi.advanceTimersByTimeAsync(5000);
        await moved.run;
        moved.scene.userInteracted = true;
        moved.tileset.tiles.group.children.push({});
        moved.updates.frame();
        expect(moved.ground).toHaveBeenCalledTimes(1);
        expect(moved.frame).toHaveBeenCalledTimes(1);

        const closed = make();
        await vi.advanceTimersByTimeAsync(5000);
        await closed.run;
        closed.scene.dispose();
        closed.tileset.tiles.group.children.push({});
        closed.updates.frame();
        expect(closed.ground).not.toHaveBeenCalled();
    });
});

describe('the 3D Tiles loader (FR-VWR-20)', () => {
    const T = ddb.entry.type;

    function stubTilesScene(entry) {
        const tileset = {
            progress: 0.4, visible: true, tiles: { group: { children: [] }, loadAncestors: false },
            getBoundingBox: () => new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1))
        };
        const scene = {
            view: { loadingText: '' },
            libs: { CoordinateSystem: { epsg3857: {} }, Tiles3D: class { constructor() { return tileset; } } },
            instance: { add: vi.fn() },
            setupGlobe: vi.fn(), setupInstance: vi.fn(), configureTilesetStreaming: vi.fn(), registerLayer: vi.fn(),
            frameGlobe: vi.fn(), frameBox: vi.fn(), groundGlobeTileset: vi.fn(box => box), uprightTileset: vi.fn(),
            waitForFirstRender: vi.fn(async () => true), afterFirstRender: vi.fn(), userInteracted: false
        };
        const dataset = { Entry: () => ({ get3DTiles: () => '/tiles/tileset.json' }) };
        return { scene, tileset, run: () => LOADERS[entry.type](scene, entry, dataset) };
    }

    it.each([
        ['georeferenced', { type: T.TILES3D, path: 'site.3tz' }, 'frameGlobe'],
        ['not georeferenced', { type: T.TILES3D, path: 'site.3tz', properties: { georeferenced: false } }, 'frameBox']
    ])('waits 5 s for the first frame of %s tiles, with the tile progress in the row', async (_, entry, framing) => {
        const { scene, tileset, run } = stubTilesScene(entry);
        await run();
        expect(scene[framing]).toHaveBeenCalledTimes(entry.properties ? 1 : 2);
        expect(scene.waitForFirstRender).toHaveBeenCalledTimes(1);
        const [isReady, timeout, progress] = scene.waitForFirstRender.mock.calls[0];
        expect(timeout).toBe(5000);
        expect(progress()).toBe(0.4);
        expect(isReady()).toBe(false);
        tileset.tiles.group.children.push({});
        expect(isReady()).toBe(true);
    });

    it.each([
        ['georeferenced', { type: T.TILES3D, path: 'site.3tz' }, 'groundGlobeTileset'],
        ['not georeferenced', { type: T.TILES3D, path: 'site.3tz', properties: { georeferenced: false } }, 'uprightTileset']
    ])('measures %s tiles on their first frame when the wait ended before it', async (_, entry, measure) => {
        const { scene, tileset, run } = stubTilesScene(entry);
        scene.waitForFirstRender.mockResolvedValue(false);
        await run();
        expect(scene[measure]).not.toHaveBeenCalled();
        expect(scene.afterFirstRender).toHaveBeenCalledTimes(1);
        const [isReady, settle] = scene.afterFirstRender.mock.calls[0];
        expect(isReady()).toBe(false);
        tileset.tiles.group.children.push({});
        expect(isReady()).toBe(true);
        settle();
        expect(scene[measure]).toHaveBeenCalledTimes(1);
    });

    it('measures at once when the first frame came within the wait', async () => {
        const { scene, run } = stubTilesScene({ type: T.TILES3D, path: 'site.3tz' });
        await run();
        expect(scene.groundGlobeTileset).toHaveBeenCalledTimes(1);
        expect(scene.afterFirstRender).not.toHaveBeenCalled();
    });

    it('keeps the 20 s of a 3D model, and shows its progress too', async () => {
        const { scene, run } = stubTilesScene({ type: T.MODEL, path: 'model.glb' });
        await run();
        const [, timeout, progress] = scene.waitForFirstRender.mock.calls[0];
        expect(timeout).toBe(20000);
        expect(progress()).toBe(0.4);
    });
});

describe('configureTilesetStreaming (FR-XC-18)', () => {
    const cacheOf = deviceMemory => {
        vi.stubGlobal('navigator', deviceMemory === undefined ? {} : { deviceMemory });
        const { scene } = makeScene();
        const cache = { maxBytesSize: 0, minBytesSize: 0 };
        scene.configureTilesetStreaming({ distance: { max: 1 }, tiles: { lruCache: cache } });
        return cache;
    };
    const GIB = 1024 * 1024 * 1024;

    it.each([
        [8, 2 * GIB], [4, 1 * GIB], [2, 0.75 * GIB], [0.5, 0.75 * GIB]
    ])('sizes the tile cache for %s GB of memory', (memory, bytes) => {
        const cache = cacheOf(memory);
        expect(cache.maxBytesSize).toBe(bytes);
        expect(cache.minBytesSize).toBe(Math.round(bytes * 0.75));
    });

    it('takes the 4 GB of deviceMemoryGb() for a browser that does not say', () => {
        expect(cacheOf(undefined).maxBytesSize).toBe(1 * GIB);
    });
});
