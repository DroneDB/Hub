/**
 * The preview of the detail panel is requested at the width of its box times the pixel ratio, in the steps of
 * thumbnailRequestSize (FR-EXP-41), not at a fixed 512 px: a wide panel on a 2x screen asks for 1024 px, and a
 * panel dragged wider later loads the larger step.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import { createPinia, setActivePinia } from 'pinia';
import ddb, { thumbs } from 'ddb';

vi.mock('@/libs/build/buildManager', () => ({
    default: { getBuildState: () => null, hasActiveBuild: () => false, on: vi.fn(), off: vi.fn() },
    BUILD_STATES: {}
}));
vi.mock('@/libs/build/buildHelpers', () => ({
    isBuildableFile: () => false, hasActiveBuild: () => false, isFileBuilt: vi.fn(), buildFile: vi.fn(), isBuildComplete: () => false
}));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: { isLoggedIn: () => true, features: { get: () => false, value: () => null } } }));

const DetailPanel = (await import('./DetailPanel.vue')).default;

const photo = { label: 'a.jpg', path: 'ddb://h/o/d/a.jpg', icon: 'fa-solid fa-image', entry: { path: 'a.jpg', type: ddb.entry.type.GEOIMAGE, size: 5, mtime: 1, hash: 'h1', meta: {}, properties: {} } };

/** jsdom has no layout: the preview box is `width` CSS px wide (0 = not measured) */
function boxWidth(width) {
    return vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function () {
        return this.classList.contains('thumbnail-container') ? width : 0;
    });
}

let observers;
beforeEach(() => {
    setActivePinia(createPinia());
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(thumbs, 'fetch').mockImplementation((uri, size) => `/thumb?size=${size}`);
    observers = [];
    vi.stubGlobal('ResizeObserver', class {
        constructor(cb) { this.cb = cb; observers.push(this); }
        observe() {}
        disconnect() {}
    });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const mountPanel = () => mount(DetailPanel, { props: { file: photo, dataset: { org: 'o', ds: 'd' } }, global: { plugins: [PrimeVue] }, attachTo: document.body });
const sizes = () => thumbs.fetch.mock.calls.map(c => c[1]);

describe('DetailPanel preview size (FR-EXP-41)', () => {
    it('asks for 1024 px for a 400 px box at ratio 2', async () => {
        vi.stubGlobal('devicePixelRatio', 2);
        boxWidth(400);
        const w = mountPanel();
        await flushPromises();
        expect(sizes()).toEqual([1024]);
        expect(w.find('img.detail-thumbnail').attributes('src')).toBe('/thumb?size=1024');
        w.unmount();
    });

    it('asks for 512 px for the same box at ratio 1, as it did before', async () => {
        vi.stubGlobal('devicePixelRatio', 1);
        boxWidth(400);
        const w = mountPanel();
        await flushPromises();
        expect(sizes()).toEqual([512]);
        w.unmount();
    });

    it('asks for the step of a wide box: 700 px at ratio 2 is 2048', async () => {
        vi.stubGlobal('devicePixelRatio', 2);
        boxWidth(700);
        const w = mountPanel();
        await flushPromises();
        expect(sizes()).toEqual([2048]);
        w.unmount();
    });

    it('loads the larger step when the panel is dragged wider, and keeps the bitmap when it gets narrower', async () => {
        vi.stubGlobal('devicePixelRatio', 1);
        let width = 300;
        vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function () {
            return this.classList.contains('thumbnail-container') ? width : 0;
        });
        const w = mountPanel();
        await flushPromises();
        expect(sizes()).toEqual([512]);
        // A box under 300 px is taken as 300 px (the height of the preview): 512 px at ratio 1
        width = 900;
        observers.forEach(o => o.cb());
        await flushPromises();
        expect(sizes()).toEqual([512, 1024]);
        expect(w.find('img.detail-thumbnail').attributes('src')).toBe('/thumb?size=1024');
        width = 350;
        observers.forEach(o => o.cb());
        await flushPromises();
        expect(sizes()).toEqual([512, 1024]);
        w.unmount();
    });
});
