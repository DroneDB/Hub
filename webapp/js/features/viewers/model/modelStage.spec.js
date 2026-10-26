import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { reactive, nextTick } from 'vue';
import * as THREE_BUILD from 'three';
import { createModelStage } from './modelStage';
import { fitDistance } from '@/features/viewers/unified/sceneUtils';

/** A WebGL context is not available: the renderer is a recording stand-in on the real three.js classes. */
class FakeRenderer {
    constructor({ canvas }) {
        this.domElement = canvas;
        this.ratio = 1;
        this.setSize = vi.fn((w, h) => { canvas.width = Math.floor(w * this.ratio); canvas.height = Math.floor(h * this.ratio); });
        this.render = vi.fn();
        this.dispose = vi.fn();
        this.setClearColor = vi.fn();
        this.setPixelRatio = vi.fn(r => { this.ratio = r; });
    }
    getPixelRatio() { return this.ratio; }
}
const THREE = { ...THREE_BUILD, WebGLRenderer: FakeRenderer };

class FakeControls {
    constructor(camera, dom, scene) {
        Object.assign(this, { camera, dom, scene });
        this.target = new THREE_BUILD.Vector3();
        this._gizmos = new THREE_BUILD.Group();
        this.update = vi.fn();
        this.dispose = vi.fn();
        this.setGizmosVisible = vi.fn();
    }
}

let canvas;
let settings;
let frames;
let stage;

function makeStage() {
    stage = createModelStage({ THREE, ArcballControls: FakeControls, canvas, settings });
    return stage;
}
/** Sets the size the canvas has on the page (happy-dom has no layout). */
function sizeCanvas(width, height) {
    Object.defineProperty(canvas, 'clientWidth', { value: width, configurable: true });
    Object.defineProperty(canvas, 'clientHeight', { value: height, configurable: true });
}
const runFrame = () => { const run = frames.shift(); run(); };

beforeEach(() => {
    canvas = document.createElement('canvas');
    sizeCanvas(800, 400);
    settings = reactive({ ambientIntensity: 0.4, directionalIntensity: 0.7, shininess: 25 });
    frames = [];
    vi.stubGlobal('requestAnimationFrame', fn => frames.push(fn));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
});
afterEach(() => {
    stage?.dispose();
    stage = null;
    vi.unstubAllGlobals();
});

describe('lighting', () => {
    it('starts with the settings on the lights and the shaded material', () => {
        makeStage();
        const lights = stage.scene.children.filter(c => c.isLight);
        expect(lights.find(l => l.isAmbientLight).intensity).toBe(0.4);
        expect(lights.filter(l => l.isDirectionalLight).map(l => l.intensity)).toEqual([0.7, 0.7]);
        expect(stage.material.shininess).toBe(25);
    });

    it('follows a change of the settings', async () => {
        makeStage();
        settings.ambientIntensity = 2;
        settings.directionalIntensity = 1.5;
        settings.shininess = 80;
        await nextTick();
        const lights = stage.scene.children.filter(c => c.isLight);
        expect(lights.find(l => l.isAmbientLight).intensity).toBe(2);
        expect(lights.filter(l => l.isDirectionalLight).map(l => l.intensity)).toEqual([1.5, 1.5]);
        expect(stage.material.shininess).toBe(80);
    });

    it('stops following the settings once disposed', async () => {
        makeStage();
        stage.dispose();
        settings.ambientIntensity = 3;
        await nextTick();
        expect(stage.scene.children.find(c => c.isAmbientLight).intensity).toBe(0.4);
        stage = null;
    });
});

describe('frameModel', () => {
    it('scales the model to the unit sphere and moves the centre of its sphere to the origin', () => {
        makeStage();
        const object = new THREE_BUILD.Object3D();
        stage.frameModel(object, { center: { x: 10, y: -4, z: 2 }, radius: 4 });
        expect(object.scale.toArray()).toEqual([0.25, 0.25, 0.25]);
        expect(object.position.toArray()).toEqual([-2.5, 1, -0.5]);
    });
});

describe('render loop', () => {
    it('sizes the canvas and fits the camera to the shape of the view, then renders and updates the controls', () => {
        makeStage();
        stage.start();   // draws the first frame at once
        expect(stage.renderer.setSize).toHaveBeenCalledWith(800, 400, false);
        expect(stage.camera.aspect).toBe(2);
        expect(stage.camera.position.length()).toBeCloseTo(fitDistance(1, stage.camera.fov, 2, 1.25), 6);
        expect(stage.renderer.render).toHaveBeenCalledWith(stage.scene, stage.camera);
        expect(stage.controls.update).toHaveBeenCalledTimes(1);
    });

    it('sizes the canvas again only when its size changed, keeping the view the user has around the pivot', () => {
        makeStage();
        stage.start();
        stage.renderer.setSize.mockClear();
        runFrame();
        expect(stage.renderer.setSize).not.toHaveBeenCalled();

        // The user panned and zoomed: the pivot is off the origin, the camera stands 3 from it. The
        // camera keeps its zoom relative to the fitted distance and its pivot
        stage.controls._gizmos.position.set(0.5, 0, 0);
        stage.camera.position.set(0.5, 0, 3);
        sizeCanvas(400, 800);
        runFrame();
        expect(stage.renderer.setSize).toHaveBeenCalledWith(400, 800, false);
        const wide = fitDistance(1, stage.camera.fov, 2, 1.25);
        const tall = fitDistance(1, stage.camera.fov, 0.5, 1.25);
        expect(stage.camera.position.x).toBeCloseTo(0.5, 6);
        expect(stage.camera.position.z).toBeCloseTo(3 * tall / wide, 6);
    });

    it('asks for one frame at a time, and starting twice does not double the loop', () => {
        makeStage();
        stage.start();
        stage.start();
        expect(frames).toHaveLength(1);
        expect(stage.renderer.render).toHaveBeenCalledTimes(1);
        runFrame();
        expect(frames).toHaveLength(1);
    });

    it('dispose cancels the loop and releases the controls, the material and the renderer', () => {
        makeStage();
        stage.start();
        stage.dispose();
        expect(cancelAnimationFrame).toHaveBeenCalled();
        expect(stage.controls.dispose).toHaveBeenCalled();
        expect(stage.renderer.dispose).toHaveBeenCalled();
        stage = null;
    });
});
