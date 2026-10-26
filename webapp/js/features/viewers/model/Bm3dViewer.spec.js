import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

const h = vi.hoisted(() => ({ models: [], stage: null, createStage: null }));
vi.mock('bm3d-viewer', () => ({
    Bm3dObject: class {
        constructor(url, onLoad, onUpdate, renderer, material, options) {
            Object.assign(this, { url, onLoad, onUpdate, renderer, material, options });
            this.geometry = { boundingSphere: { center: { x: 1, y: 2, z: 3 }, radius: 4 } };
            this.dispose = vi.fn();
            h.models.push(this);
        }
    }
}));
vi.mock('./modelStage', () => ({
    createModelStage: vi.fn(options => {
        h.stage = {
            options,
            renderer: { name: 'renderer' },
            material: { color: { set: vi.fn() }, needsUpdate: false, vertexColors: false },
            scene: { add: vi.fn() },
            frameModel: vi.fn(),
            start: vi.fn(),
            dispose: vi.fn()
        };
        return h.stage;
    })
}));
vi.mock('three/examples/jsm/controls/ArcballControls.js', () => ({ ArcballControls: class ArcballControls {} }));

const { default: Bm3dViewer } = await import('./Bm3dViewer.vue');

const ARTIFACT = { role: 'model.bm3d', url: 'http://registry.invalid/orgs/o/ds/d/build/h/bm3d/model.bm3d' };
const entry = { path: 'house.obj', hash: 'h', artifacts: [ARTIFACT] };
const dataset = { Entry: vi.fn(e => ({ getModelArtifact: () => `/orgs/o/ds/d/build/${e.hash}/bm3d/model.bm3d` })) };
const ViewerShell = { template: '<div><slot /></div>' };

let wrapper;
async function open(props = { entry, dataset }) {
    wrapper = mount(Bm3dViewer, { props, global: { stubs: { ViewerShell } } });
    // three.js and the viewer are imported when the page opens: wait for the model, or for the error
    await vi.waitFor(() => expect(h.models.length > 0 || wrapper.vm.$.setupState.error !== '').toBe(true));
    await flushPromises();
    return h.models[0];
}
beforeEach(() => { h.models.length = 0; h.stage = null; localStorage.clear(); });
afterEach(() => wrapper?.unmount());

describe('Bm3dViewer', () => {
    it('opens the model of the entry with the decoder served by the Hub, on the renderer of the stage', async () => {
        const model = await open();
        expect(model.url).toBe('/orgs/o/ds/d/build/h/bm3d/model.bm3d');
        expect(model.options.decoderPath).toBe('/wasm/bm3d/');
        expect(model.renderer).toBe(h.stage.renderer);
        expect(h.stage.scene.add).toHaveBeenCalledWith(model);
        expect(h.stage.start).toHaveBeenCalled();
        expect(h.stage.options.canvas).toBeInstanceOf(HTMLCanvasElement);
    });

    it('frames the model on its sphere once the index is read', async () => {
        const model = await open();
        model.material = { map: null, vertexColors: false, isMeshLambertMaterial: true };
        model.onLoad(model);
        expect(h.stage.frameModel).toHaveBeenCalledWith(model, model.geometry.boundingSphere);
    });

    it('shades a model with normals and no texture with the material of the stage, with its vertex colours', async () => {
        const model = await open();
        model.material = { map: null, vertexColors: true, isMeshLambertMaterial: true };
        model.onLoad(model);
        expect(model.material).toBe(h.stage.material);
        expect(h.stage.material.vertexColors).toBe(true);
        expect(h.stage.material.color.set).toHaveBeenCalledWith(0xffffff);
        expect(h.stage.material.needsUpdate).toBe(true);
    });

    it('keeps the material the viewer made for a textured model', async () => {
        const model = await open();
        const own = { map: {}, vertexColors: false, isMeshLambertMaterial: true };
        model.material = own;
        model.onLoad(model);
        expect(model.material).toBe(own);
    });

    it('keeps the material the viewer made for a model without normals: no light shades it', async () => {
        const model = await open();
        const basic = { map: null, vertexColors: true, isMeshBasicMaterial: true };
        model.material = basic;
        model.onLoad(model);
        expect(model.material).toBe(basic);
    });

    it('says a model that cannot be opened, and only logs a node that cannot be read', async () => {
        const model = await open();
        const log = vi.spyOn(console, 'error').mockImplementation(() => {});
        model.options.onError(new Error('node 7 is corrupt'), 7);
        expect(log).toHaveBeenCalled();
        expect(wrapper.vm.$.setupState.error).toBe('');
        model.options.onError(new Error('http error 404'));
        expect(wrapper.vm.$.setupState.error).toContain('http error 404');
        log.mockRestore();
    });

    it('frees the model and the stage when it goes away', async () => {
        const model = await open();
        const stage = h.stage;
        wrapper.unmount();
        expect(model.dispose).toHaveBeenCalled();
        expect(stage.dispose).toHaveBeenCalled();
    });

    it('shows the error of an entry that lists no model', async () => {
        const missing = { Entry: () => ({ getModelArtifact: () => { throw new Error('The 3D model is not available.'); } }) };
        await open({ entry, dataset: missing });
        expect(h.models).toHaveLength(0);
        expect(wrapper.vm.$.setupState.error).toContain('The 3D model is not available');
    });
});
