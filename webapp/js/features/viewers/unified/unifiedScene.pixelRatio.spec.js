/**
 * The 3D viewer draws at the applied ratio of FR-XC-32 (FR-VWR-34, D-042): min(devicePixelRatio, 2). Giro3D is a fake
 * Instance that records what it is asked; three.js is the real one.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { UnifiedScene } from './unifiedScene';
import { readSource } from '@/specs/cssSource';

vi.mock('@/libs/colorScheme', () => ({ tokenHex: () => 0x101010 }));

afterEach(() => vi.unstubAllGlobals());

const ratioOf = dpr => vi.stubGlobal('devicePixelRatio', dpr);

function makeScene({ failing = false } = {}) {
    const calls = [];
    const buffer = { width: 3840, height: 2048 };
    class Instance {
        constructor(options) {
            this.crs = options.crs;
            this.view = { camera: new THREE.PerspectiveCamera(), setControls() {} };
            this.scene = new THREE.Scene();
            this.domElement = { style: {}, setAttribute() {}, addEventListener() {}, removeEventListener() {} };
            this.renderer = {
                setPixelRatio: vi.fn(r => calls.push(['setPixelRatio', r])),
                getDrawingBufferSize: target => target.set(buffer.width, buffer.height)
            };
            this.engine = {
                width: 1920, height: 1024, renderer: this.renderer,
                renderUsingCustomPipeline: vi.fn(function () {
                    calls.push(['edl', this.width, this.height]);
                    if (failing) throw new Error('GL');
                })
            };
            this.notifyChange = vi.fn(() => calls.push(['notifyChange']));
            this.dispose = vi.fn();
        }
    }
    const libs = { THREE, Instance, CoordinateSystem: { epsg3857: { id: 'EPSG:3857' }, epsg4978: { id: 'EPSG:4978' } } };
    const scene = new UnifiedScene(libs, null, { settings: {}, view: { layers: [] }, notify: { info() {} } });
    scene.attachControls = vi.fn();
    scene.addLights = vi.fn();
    return { scene, calls, buffer };
}

describe('the Giro3D instance draws at the applied ratio (FR-VWR-34)', () => {
    it.each([[2, 2], [3, 2], [1.5, 1.5], [1, 1]])('at devicePixelRatio %s the flat scene sets %s, then asks for a frame', (dpr, applied) => {
        ratioOf(dpr);
        const { scene, calls } = makeScene();
        scene.setupInstance(scene.libs.CoordinateSystem.epsg3857);
        expect(scene.instance.renderer.setPixelRatio).toHaveBeenCalledTimes(1);
        expect(scene.instance.renderer.setPixelRatio).toHaveBeenCalledWith(applied);
        expect(calls.findIndex(c => c[0] === 'notifyChange')).toBeGreaterThan(calls.findIndex(c => c[0] === 'setPixelRatio'));
    });

    it('the globe sets it too', () => {
        ratioOf(2);
        const { scene } = makeScene();
        scene.setupGlobe();
        expect(scene.instance.renderer.setPixelRatio).toHaveBeenCalledWith(2);
    });

    it('applies the ratio again when the screen changes, and no more after dispose', () => {
        let onChange;
        const stop = vi.fn();
        vi.stubGlobal('matchMedia', () => ({
            addEventListener: (type, fn) => { onChange = fn; },
            removeEventListener: stop
        }));
        ratioOf(1);
        const { scene } = makeScene();
        scene.setupInstance(scene.libs.CoordinateSystem.epsg3857);
        const instance = scene.instance;
        ratioOf(2);
        onChange();
        expect(instance.renderer.setPixelRatio).toHaveBeenLastCalledWith(2);
        scene.dispose();
        expect(stop).toHaveBeenCalled();
    });
});

describe('the eye-dome lighting pass of a point cloud (FR-VWR-34)', () => {
    it('renders through targets of the drawing buffer size, and gives the engine its CSS size back', () => {
        ratioOf(2);
        const { scene, calls } = makeScene();
        scene.setupInstance(scene.libs.CoordinateSystem.epsg3857);
        const engine = scene.instance.engine;
        engine.renderUsingCustomPipeline({}, {});
        expect(calls.find(c => c[0] === 'edl')).toEqual(['edl', 3840, 2048]);
        expect([engine.width, engine.height]).toEqual([1920, 1024]);
    });

    it('puts the size back when the pass throws', () => {
        ratioOf(2);
        const { scene } = makeScene({ failing: true });
        scene.setupInstance(scene.libs.CoordinateSystem.epsg3857);
        const engine = scene.instance.engine;
        expect(() => engine.renderUsingCustomPipeline()).toThrow('GL');
        expect([engine.width, engine.height]).toEqual([1920, 1024]);
    });

    it('wraps the pipeline once, whatever the number of times the ratio is applied', () => {
        ratioOf(2);
        const { scene } = makeScene();
        scene.setupInstance(scene.libs.CoordinateSystem.epsg3857);
        const wrapped = scene.instance.engine.renderUsingCustomPipeline;
        scene.applyPixelRatio();
        expect(scene.instance.engine.renderUsingCustomPipeline).toBe(wrapped);
    });
});

describe('the size of the points stays in CSS px', () => {
    it('Giro3D draws in buffer pixels: a point of 2 CSS px is 4 at a ratio of 2, and 2 again when the ratio goes back to 1', () => {
        ratioOf(2);
        const { scene } = makeScene();
        scene.setupInstance(scene.libs.CoordinateSystem.epsg3857);
        const entity = { pointSize: 0 };
        scene.setPointSize(entity, 2);
        expect(entity.pointSize).toBe(4);
        ratioOf(1);
        scene.applyPixelRatio();
        expect(entity.pointSize).toBe(2);
        ratioOf(3);
        scene.applyPixelRatio();
        expect(entity.pointSize).toBe(4);
    });
});

describe('the installed Giro3D works as sizeEdlTargets and setPointSize assume', () => {
    const giro3d = file => readSource(__dirname, `../../../../../node_modules/@giro3d/giro3d/${file}`);

    it('the custom pipeline (eye-dome lighting) sizes its scene target from engine.width and engine.height', () => {
        expect(giro3d('renderer/c3DEngine.js')).toContain('renderUsingCustomPipeline(scene, camera) {');
        expect(giro3d('renderer/c3DEngine.js')).toContain('this._renderPipeline.render(scene, camera, this.width, this.height, this.renderingOptions);');
        expect(giro3d('renderer/RenderPipeline.js')).toContain('this.prepareRenderTargets(width, height, samples);');
        expect(giro3d('renderer/RenderPipeline.js')).toContain('this.sceneRenderTarget = new WebGLRenderTarget(width, height, {');
    });

    it('a point cloud draws pointSize as gl_PointSize, in the pixels of the drawing buffer', () => {
        expect(giro3d('entities/PointCloud.js')).toContain('this.traversePointCloudMaterials(m => m.size = size);');
        expect(giro3d('renderer/PointCloudMaterial.js')).toContain('if (size > 0.) {\\n        gl_PointSize = size;');
    });
});
