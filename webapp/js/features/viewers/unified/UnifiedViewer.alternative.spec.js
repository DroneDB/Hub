/**
 * The 3D viewer of a model whose 3D Tiles could not be generated offers the model viewer of the file, which shows its
 * bm3d output. An embedded 3D viewer (Viewer only) offers it as Viewer only too, so the link does not leave the embed
 * for the whole Hub. The build notice and the scene are stand-ins; the link is the real one.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { ref } from 'vue';
import { b64encode } from '@/libs/base64';

const gate = vi.hoisted(() => ({ buildOptions: null }));

vi.mock('@/composables/useViewerEntry', async () => {
    const { default: ddbLib } = await import('ddb');
    return {
        useViewerEntry: () => ({
            entry: ref({ path: 'parts/house.obj', type: ddbLib.entry.type.MODEL }), dataset: ref({ org: 'o', ds: 'd' }), canWrite: ref(false),
            loading: ref(false), error: ref(''), loadError: ref(null), entryLoaded: Promise.resolve(true)
        })
    };
});
vi.mock('@/composables/useViewerBuild', () => ({
    useViewerBuild: options => {
        gate.buildOptions = options;
        return { notice: ref(null), setAvailability() {}, build() {} };
    },
    isBuildWait: () => true
}));
vi.mock('@/composables/useViewerSettings', () => ({ useViewerSettings: () => ({ settings: ref({}), resetSettings() {} }) }));
vi.mock('@/composables/useNotify', () => ({ useNotify: () => ({}) }));
// The check finds the 3D Tiles not generated: the viewer shows the notice and builds no scene
vi.mock('@/libs/build/fileAvailabilityChecker', () => ({
    default: { check: () => Promise.resolve({ available: false, status: 'not-generated', output: '3D Tiles', reason: '' }) }
}));
vi.mock('./giro3dLibs', () => ({ loadGiro3dLibs: () => Promise.resolve({}) }));
vi.mock('./unifiedScene', () => ({ UnifiedScene: class { dispose() {} } }));
vi.mock('./measureTool', () => ({ MeasureTool: class { dispose() {} } }));

const { default: UnifiedViewer } = await import('./UnifiedViewer.vue');

const stubs = { ViewerShell: { template: '<div><slot /></div>' } };
let wrapper;
afterEach(() => { wrapper?.unmount(); wrapper = null; gate.buildOptions = null; });

const MODEL_VIEWER = `/r/o/d/view/${b64encode('parts/house.obj')}/model`;

describe('the model viewer the 3D viewer offers for a model without 3D Tiles', () => {
    it('opens in the Hub from the 3D viewer of the Hub', async () => {
        wrapper = mount(UnifiedViewer, { global: { stubs } });
        await flushPromises();
        expect(gate.buildOptions.alternative()).toMatchObject({ label: 'Open in the model viewer', icon: 'fa-solid fa-cube', to: MODEL_VIEWER });
    });

    it('opens as Viewer only from an embedded 3D viewer', async () => {
        wrapper = mount(UnifiedViewer, { global: { stubs, provide: { embed: true } } });
        await flushPromises();
        expect(gate.buildOptions.alternative().to).toBe(`${MODEL_VIEWER}?embed=1`);
    });
});
