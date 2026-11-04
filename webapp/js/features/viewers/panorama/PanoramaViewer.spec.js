import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

vi.mock('@/composables/useViewerEntry', async () => {
    const { ref, shallowRef } = await import('vue');
    return {
        useViewerEntry: () => ({
            entry: shallowRef({ path: 'copr.png', properties: { width: 4000, height: 2000 } }),
            dataset: shallowRef({ downloadUrl: path => `/download/${path}` }),
            loading: ref(true),
            error: ref(''),
            entryLoaded: Promise.resolve(true)
        })
    };
});
vi.mock('@/libs/lazy', () => ({ loadResources: () => Promise.resolve() }));

const { default: PanoramaViewer } = await import('./PanoramaViewer.vue');

let observers;
let viewers;
beforeEach(() => {
    observers = [];
    viewers = [];
    globalThis.ResizeObserver = class {
        constructor(callback) { this.callback = callback; this.targets = []; this.disconnected = false; observers.push(this); }
        observe(target) { this.targets.push(target); }
        disconnect() { this.disconnected = true; }
    };
    globalThis.PhotoSphereViewer = {
        Viewer: class {
            constructor(options) { this.options = options; this.autoSize = vi.fn(); this.destroy = vi.fn(); viewers.push(this); }
        }
    };
});
afterEach(() => {
    delete globalThis.ResizeObserver;
    delete globalThis.PhotoSphereViewer;
});

describe('PanoramaViewer', () => {
    it('resizes the viewer with its container, which grows when the loading row goes', async () => {
        const wrapper = mount(PanoramaViewer, { global: { stubs: { ViewerShell: { template: '<div><slot /></div>' } } } });
        await flushPromises();

        expect(viewers).toHaveLength(1);
        const container = wrapper.find('.viewer').element;
        expect(viewers[0].options.container).toBe(container);
        const observer = observers.find(o => o.targets.includes(container));
        expect(observer).toBeTruthy();

        observer.callback([]);
        expect(viewers[0].autoSize).toHaveBeenCalledTimes(1);

        wrapper.unmount();
        expect(observer.disconnected).toBe(true);
        expect(viewers[0].destroy).toHaveBeenCalled();
    });
});
