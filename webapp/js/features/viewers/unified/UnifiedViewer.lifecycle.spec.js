/**
 * The 3D viewer that is left while it loads: the scene that was being built is not left running, and nothing is built
 * for a page that is gone. The scene, the loaders and the libraries are stand-ins that the test lets go on.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { ref } from 'vue';

const gate = vi.hoisted(() => ({ libs: null, load: null, check: null, scenes: [], hint: vi.fn() }));

vi.mock('@/composables/useViewerEntry', () => ({
    useViewerEntry: () => ({
        entry: ref({ path: 'model.3tz', type: 'model' }), dataset: ref({}), canWrite: ref(false), loading: ref(false), error: ref(''),
        loadError: ref(null), entryLoaded: Promise.resolve(true)
    })
}));
vi.mock('@/composables/useViewerBuild', () => ({
    useViewerBuild: () => ({ notice: ref(null), setAvailability() {}, build() {} }),
    isBuildWait: () => false
}));
vi.mock('@/composables/useViewerSettings', () => ({ useViewerSettings: () => ({ settings: ref({}), resetSettings() {} }) }));
vi.mock('@/composables/useNotify', () => ({ useNotify: () => ({}) }));
vi.mock('@/libs/build/fileAvailabilityChecker', () => ({ default: { check: () => gate.check ?? Promise.resolve({ available: true }) } }));
vi.mock('./giro3dLibs', () => ({ loadGiro3dLibs: () => gate.libs ?? Promise.resolve({}) }));
vi.mock('./unifiedScene', () => ({
    UnifiedScene: class {
        constructor() { this.dispose = vi.fn(); gate.scenes.push(this); }
    }
}));
vi.mock('./measureTool', () => ({ MeasureTool: class { dispose() {} } }));
vi.mock('./loaders', () => ({
    LOADERS: { model: () => gate.load ?? Promise.resolve() },
    viewableEntry: entry => entry
}));
vi.mock('./navKeys', async importOriginal => ({ ...(await importOriginal()), showNavHintOnce: (...args) => gate.hint(...args) }));

const { default: UnifiedViewer } = await import('./UnifiedViewer.vue');

const stubs = { ViewerShell: { template: '<div><slot /></div>' } };
let wrapper;
const deferred = () => {
    let resolve;
    const promise = new Promise(r => { resolve = r; });
    return { promise, resolve };
};

beforeEach(() => {
    Object.assign(gate, { libs: null, load: null, check: null, scenes: [] });
    gate.hint.mockClear();
});
afterEach(() => wrapper?.unmount());

describe('UnifiedViewer that is left while it loads', () => {
    it('shows its navigation hint once the scene is ready', async () => {
        wrapper = mount(UnifiedViewer, { global: { stubs } });
        await flushPromises();

        expect(gate.scenes).toHaveLength(1);
        expect(gate.hint).toHaveBeenCalledTimes(1);
    });

    it('does not show the hint, and releases the scene, when the page is left while the data loads', async () => {
        const data = deferred();
        gate.load = data.promise;
        wrapper = mount(UnifiedViewer, { global: { stubs } });
        await vi.waitFor(() => expect(gate.scenes).toHaveLength(1));

        wrapper.unmount();
        wrapper = null;
        data.resolve();
        await flushPromises();

        expect(gate.hint).not.toHaveBeenCalled();
        expect(gate.scenes[0].dispose).toHaveBeenCalledTimes(1);
    });

    it('builds no scene when the libraries arrive after the page was left', async () => {
        const libs = deferred();
        gate.libs = libs.promise;
        wrapper = mount(UnifiedViewer, { global: { stubs } });
        await flushPromises();

        wrapper.unmount();
        wrapper = null;
        libs.resolve({});
        await flushPromises();

        expect(gate.scenes).toHaveLength(0);
        expect(gate.hint).not.toHaveBeenCalled();
    });

    it('builds no scene when the check of the file ends after the page was left', async () => {
        const check = deferred();
        gate.check = check.promise;
        wrapper = mount(UnifiedViewer, { global: { stubs } });
        await flushPromises();

        wrapper.unmount();
        wrapper = null;
        check.resolve({ available: true });
        await flushPromises();

        expect(gate.scenes).toHaveLength(0);
    });
});
