import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE_BUILD from 'three';
import { createSplatStage, assertWebGL2, supportsWebGL2, progressFraction, MAX_PIXEL_RATIO } from './splatStage';

/** No WebGL context here: the renderer, Spark and the controls are recording stand-ins. */
class FakeRenderer {
    constructor({ canvas }) {
        this.domElement = canvas;
        this.ratio = 1;
        this.setSize = vi.fn((w, h) => { canvas.width = Math.floor(w * this.ratio); canvas.height = Math.floor(h * this.ratio); });
        this.setPixelRatio = vi.fn(r => { this.ratio = r; });
        this.setAnimationLoop = vi.fn(fn => { this.loop = fn; });
        this.render = vi.fn();
        this.dispose = vi.fn();
        this.forceContextLoss = vi.fn();
    }
    getPixelRatio() { return this.ratio; }
}
const THREE = { ...THREE_BUILD, WebGLRenderer: FakeRenderer };

class FakeSparkRenderer extends THREE_BUILD.Object3D {
    constructor(options) {
        super();
        this.options = options;
        this.dispose = vi.fn();
    }
}

/** A mesh whose load ends when the spec says so. */
class FakeSplatMesh extends THREE_BUILD.Object3D {
    constructor(options) {
        super();
        this.options = options;
        this.dispose = vi.fn();
        this.initialized = new Promise((resolve, reject) => { this.finish = () => resolve(this); this.fail = reject; });
        FakeSplatMesh.last = this;
    }
}

class FakeControls {
    constructor(camera, dom) {
        Object.assign(this, { camera, dom });
        // What OrbitControls reads in its constructor and never again
        this.upAtConstruction = camera.up.clone();
        this.update = vi.fn();
        this.dispose = vi.fn();
    }
}

let canvas;
let stage;

function makeStage(extra = {}) {
    stage = createSplatStage({
        THREE, OrbitControls: FakeControls, Spark: { SparkRenderer: FakeSparkRenderer, SplatMesh: FakeSplatMesh },
        canvas, streaming: false, ...extra
    });
    return stage;
}
/** Sets the size the canvas has on the page (happy-dom has no layout). */
function sizeCanvas(width, height) {
    Object.defineProperty(canvas, 'clientWidth', { value: width, configurable: true });
    Object.defineProperty(canvas, 'clientHeight', { value: height, configurable: true });
}
const runFrame = (time = 0) => stage.renderer.loop(time);

beforeEach(() => {
    canvas = document.createElement('canvas');
    sizeCanvas(800, 400);
});
afterEach(() => {
    stage?.dispose();
    stage = null;
    vi.unstubAllGlobals();
});

describe('scene up', () => {
    it('is on the camera before the controls are built, because they read it once', () => {
        makeStage({ up: { x: 0, y: 0.6, z: 0.8 } });
        expect(stage.camera.up.toArray()).toEqual([0, 0.6, 0.8]);
        expect(stage.controls.upAtConstruction.toArray()).toEqual([0, 0.6, 0.8]);
    });

    it('is the world up when none is given', () => {
        makeStage();
        expect(stage.controls.upAtConstruction.toArray()).toEqual([0, 1, 0]);
    });
});

describe('renderer', () => {
    it('draws at the pixel ratio of the screen up to the cap', () => {
        vi.stubGlobal('devicePixelRatio', 1.5);
        expect(makeStage().renderer.setPixelRatio).toHaveBeenCalledWith(1.5);
        stage.dispose();
        vi.stubGlobal('devicePixelRatio', 3);
        expect(makeStage().renderer.setPixelRatio).toHaveBeenCalledWith(MAX_PIXEL_RATIO);
        expect(MAX_PIXEL_RATIO).toBe(2);
    });

    it('gives Spark the renderer, and the foveation options only for a paged file', () => {
        expect(makeStage().spark.options).toEqual({ renderer: stage.renderer, lodRaycast: expect.any(Number) });
        stage.dispose();
        expect(makeStage({ streaming: true }).spark.options).toMatchObject({ renderer: stage.renderer, pagedExtSplats: true });
        expect(stage.scene.children).toContain(stage.spark);
    });
});

describe('render loop', () => {
    it('does not size the canvas again while its buffer matches the page size at a pixel ratio of 2', () => {
        vi.stubGlobal('devicePixelRatio', 2);
        makeStage();
        stage.start();
        stage.renderer.setSize.mockClear();
        expect(canvas.width).toBe(1600);
        runFrame();
        runFrame();
        expect(stage.renderer.setSize).not.toHaveBeenCalled();
    });

    it('sizes the canvas and the camera when the page size changed', () => {
        vi.stubGlobal('devicePixelRatio', 2);
        makeStage();
        stage.start();
        sizeCanvas(400, 800);
        runFrame();
        expect(stage.renderer.setSize).toHaveBeenLastCalledWith(400, 800, false);
        expect(stage.camera.aspect).toBe(0.5);
    });

    it('calls the viewer before it draws, every frame', () => {
        const order = [];
        makeStage({ onFrame: time => order.push(['frame', time]) });
        stage.renderer.render.mockImplementation(() => order.push(['render']));
        stage.start();
        runFrame(16);
        expect(order).toEqual([['frame', 16], ['render']]);
        expect(stage.renderer.render).toHaveBeenCalledWith(stage.scene, stage.camera);
    });
});

describe('picking', () => {
    /** A mesh at the origin whose splats a ray meets at the given distances along it. */
    async function loadPickable(distances) {
        const loading = stage.loadMesh({ url: 'a.rad', paged: true });
        const mesh = FakeSplatMesh.last;
        // What Spark's raycast does: every splat the ray meets, in no order
        mesh.raycast = vi.fn((raycaster, intersects) => {
            for (const distance of distances) {
                intersects.push({ distance, point: raycaster.ray.direction.clone().multiplyScalar(distance).add(raycaster.ray.origin), object: mesh });
            }
        });
        mesh.finish();
        await loading;
        return mesh;
    }

    it('is on for the splats and for the level of detail Spark keeps for picking, which a paged file needs', async () => {
        makeStage({ streaming: true });
        expect(stage.spark.options.lodRaycast).toBeGreaterThan(0);
        await loadPickable([]);
        expect(FakeSplatMesh.last.options.raycastable).toBe(true);
        // A plain file is picked too
        stage.dispose();
        makeStage();
        expect(stage.spark.options.lodRaycast).toBeGreaterThan(0);
    });

    it('returns the nearest splat the ray from the camera meets, as a point in the world and its distance', async () => {
        makeStage();
        stage.camera.position.set(1, 2, 10);
        stage.camera.lookAt(1, 2, 0);
        stage.camera.updateMatrixWorld(true);
        const mesh = await loadPickable([7, 3, 5]);

        // The middle of the screen looks straight along -z
        const hit = stage.pickSplat({ x: 0, y: 0 });

        expect(mesh.raycast).toHaveBeenCalledTimes(1);
        expect(hit.distance).toBeCloseTo(3, 6);
        expect(hit.point.toArray().map(v => Math.round(v * 1e6) / 1e6)).toEqual([1, 2, 7]);
    });

    it('casts through the point of the screen it is given', async () => {
        makeStage();
        stage.camera.position.set(0, 0, 0);
        stage.camera.lookAt(0, 0, -1);
        stage.camera.updateMatrixWorld(true);
        const mesh = await loadPickable([1]);

        stage.pickSplat({ x: 1, y: 0 });

        // The right edge of a 60 degree field of view (aspect 2): the ray leans to +x
        const ray = mesh.raycast.mock.calls[0][0].ray;
        expect(ray.direction.x).toBeGreaterThan(0.5);
        expect(ray.direction.y).toBeCloseTo(0, 6);
    });

    it('finds nothing where the ray meets no splat, before a mesh is loaded, or after the stage is gone', async () => {
        makeStage();
        expect(stage.pickSplat({ x: 0, y: 0 })).toBeNull();
        await loadPickable([]);
        expect(stage.pickSplat({ x: 0, y: 0 })).toBeNull();
        stage.dispose();
        expect(stage.pickSplat({ x: 0, y: 0 })).toBeNull();
    });
});

describe('overlay and labels', () => {
    class FakeLabels {
        constructor(options) {
            this.options = options;
            this.setSize = vi.fn();
            this.render = vi.fn();
            FakeLabels.last = this;
        }
    }
    beforeEach(() => { FakeLabels.last = undefined; });

    it('keeps what is drawn over the splats in a group of the scene that goes with the stage', () => {
        makeStage();
        expect(stage.scene.children).toContain(stage.overlay);
        stage.dispose();
        expect(stage.scene.children).toEqual([]);
    });

    it('draws the HTML labels into the layer after the scene, and sizes them with the canvas', () => {
        vi.stubGlobal('devicePixelRatio', 1);
        const order = [];
        const labelLayer = document.createElement('div');
        makeStage({ CSS2DRenderer: FakeLabels, labelLayer });
        stage.renderer.render.mockImplementation(() => order.push('scene'));
        const labels = FakeLabels.last;
        labels.render.mockImplementation(() => order.push('labels'));
        expect(labels.options).toEqual({ element: labelLayer });
        stage.start();
        runFrame();
        expect(order).toEqual(['scene', 'labels']);
        expect(labels.render).toHaveBeenCalledWith(stage.scene, stage.camera);

        sizeCanvas(300, 200);
        runFrame();
        expect(labels.setSize).toHaveBeenLastCalledWith(300, 200);
    });

    it('has no labels to draw when the viewer gave no layer', () => {
        makeStage({ CSS2DRenderer: FakeLabels });
        expect(FakeLabels.last).toBeUndefined();
    });
});

describe('context loss', () => {
    it('asks the browser for the context back, draws nothing meanwhile and goes on when it is back', () => {
        const onContextLost = vi.fn();
        const onContextRestored = vi.fn();
        makeStage({ onContextLost, onContextRestored });
        stage.start();
        const lost = new Event('webglcontextlost', { cancelable: true });
        canvas.dispatchEvent(lost);
        expect(lost.defaultPrevented).toBe(true);
        expect(onContextLost).toHaveBeenCalledTimes(1);
        runFrame();
        expect(stage.renderer.render).not.toHaveBeenCalled();

        canvas.dispatchEvent(new Event('webglcontextrestored'));
        expect(onContextRestored).toHaveBeenCalledTimes(1);
        runFrame();
        expect(stage.renderer.render).toHaveBeenCalledTimes(1);
    });
});

describe('dispose', () => {
    it('releases Spark, the mesh, the controls and the renderer, and stops the loop', async () => {
        makeStage();
        const loading = stage.loadMesh({ url: 'a.spz' });
        const mesh = FakeSplatMesh.last;
        mesh.finish();
        expect(await loading).toBe(mesh);
        stage.start();

        stage.dispose();

        expect(stage.spark.dispose).toHaveBeenCalledTimes(1);
        expect(mesh.dispose).toHaveBeenCalledTimes(1);
        expect(stage.controls.dispose).toHaveBeenCalledTimes(1);
        expect(stage.renderer.dispose).toHaveBeenCalledTimes(1);
        expect(stage.renderer.forceContextLoss).toHaveBeenCalledTimes(1);
        expect(stage.renderer.setAnimationLoop).toHaveBeenLastCalledWith(null);
        expect(stage.scene.children).toEqual([]);
        expect(stage.disposed).toBe(true);
    });

    it('is safe to call twice, and stops listening to the context', () => {
        const onContextLost = vi.fn();
        makeStage({ onContextLost });
        stage.dispose();
        stage.dispose();
        expect(stage.spark.dispose).toHaveBeenCalledTimes(1);
        canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
        expect(onContextLost).not.toHaveBeenCalled();
    });

    it('does not start the loop of a stage that is gone', () => {
        makeStage();
        stage.dispose();
        stage.start();
        expect(stage.renderer.setAnimationLoop).not.toHaveBeenCalledWith(expect.any(Function));
    });
});

describe('a load that the page outlives', () => {
    it('ends with nothing when the stage is disposed before the mesh has loaded, and releases the mesh', async () => {
        const onProgress = vi.fn();
        makeStage();
        const loading = stage.loadMesh({ url: 'a.rad', paged: true }, onProgress);
        const mesh = FakeSplatMesh.last;
        mesh.options.onProgress({ lengthComputable: true, loaded: 1, total: 4 });
        expect(onProgress).toHaveBeenLastCalledWith(0.25);

        stage.dispose();
        mesh.options.onProgress({ lengthComputable: true, loaded: 2, total: 4 });
        mesh.finish();

        expect(await loading).toBeNull();
        expect(onProgress).toHaveBeenCalledTimes(1);
        expect(mesh.dispose).toHaveBeenCalledTimes(1);
        expect(stage.scene.children).toEqual([]);
        expect(stage.renderer.setAnimationLoop).not.toHaveBeenCalledWith(expect.any(Function));
    });

    it('swallows the failure of a load that was abandoned, but not of one that was not', async () => {
        makeStage();
        const abandoned = stage.loadMesh({ url: 'a.spz' });
        const mesh = FakeSplatMesh.last;
        stage.dispose();
        mesh.fail(new Error('aborted'));
        expect(await abandoned).toBeNull();

        makeStage();
        const failing = stage.loadMesh({ url: 'b.spz' });
        FakeSplatMesh.last.fail(new Error('Failed to fetch'));
        await expect(failing).rejects.toThrow('Failed to fetch');
    });

    it('does not create a mesh once the stage is gone', async () => {
        makeStage();
        FakeSplatMesh.last = null;
        stage.dispose();
        expect(await stage.loadMesh({ url: 'a.spz' })).toBeNull();
        expect(FakeSplatMesh.last).toBeNull();
    });
});

describe('WebGL 2 check', () => {
    const canvasWith = gl => () => ({ getContext: vi.fn(type => (type === 'webgl2' ? gl : null)) });

    it('passes when a WebGL 2 context can be created, and frees the probe context', () => {
        const loseContext = vi.fn();
        const gl = { getExtension: vi.fn(() => ({ loseContext })) };
        expect(supportsWebGL2(canvasWith(gl))).toBe(true);
        expect(() => assertWebGL2(canvasWith(gl))).not.toThrow();
        expect(loseContext).toHaveBeenCalled();
    });

    it('says what is missing and what to do when there is none', () => {
        expect(supportsWebGL2(canvasWith(null))).toBe(false);
        expect(() => assertWebGL2(canvasWith(null))).toThrow(/WebGL 2.*hardware acceleration/);
        expect(supportsWebGL2(() => { throw new Error('no canvas'); })).toBe(false);
    });
});

describe('progressFraction', () => {
    it('is the fraction loaded, or null when the total is not known', () => {
        expect(progressFraction({ lengthComputable: true, loaded: 25, total: 100 })).toBe(0.25);
        expect(progressFraction({ lengthComputable: true, loaded: 120, total: 100 })).toBe(1);
        expect(progressFraction({ lengthComputable: false, loaded: 25, total: 0 })).toBeNull();
        expect(progressFraction({ lengthComputable: true, loaded: 25, total: 0 })).toBeNull();
    });
});
