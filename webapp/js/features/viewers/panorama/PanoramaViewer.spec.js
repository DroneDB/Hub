import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

let entryProperties;
vi.mock('@/composables/useViewerEntry', async () => {
    const { ref, shallowRef } = await import('vue');
    return {
        useViewerEntry: () => ({
            entry: shallowRef({ path: 'copr.png', properties: entryProperties }),
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
    entryProperties = { width: 4000, height: 2000 };
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

    const open = async () => {
        mount(PanoramaViewer, { global: { stubs: { ViewerShell: { template: '<div><slot /></div>' } } } });
        await flushPromises();
        return viewers[0].options;
    };

    it('gives the full size of a cropped panorama from the entry, not the size of the image', async () => {
        entryProperties = {
            width: 4000, height: 1500, fullWidth: 6000, fullHeight: 3000,
            croppedWidth: 4000, croppedHeight: 1500, croppedX: 1000, croppedY: 750
        };
        const options = await open();
        expect(options.useXmpData).toBe(false);
        expect(options.panoData).toMatchObject({
            fullWidth: 6000, fullHeight: 3000, croppedWidth: 4000, croppedHeight: 1500, croppedX: 1000, croppedY: 750
        });
    });

    it('without a full size in the entry reads the XMP of the file and does not take the image size for it', async () => {
        entryProperties = { width: 4000, height: 1500, croppedWidth: 4000, croppedHeight: 1500 };
        const options = await open();
        expect(options.useXmpData).toBe(true);
        expect(options.panoData.fullWidth).toBeUndefined();
        expect(options.panoData.fullHeight).toBeUndefined();
        expect(options.panoData.croppedWidth).toBe(4000);
    });

    it('works for an entry with no properties at all', async () => {
        entryProperties = undefined;
        const options = await open();
        expect(options.useXmpData).toBe(true);
        expect(options.panoData.fullWidth).toBeUndefined();
    });
});
