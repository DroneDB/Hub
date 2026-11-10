/**
 * The detail panel starts at the top for each file it shows (FR-EXP-34): the content keeps the scroll position of the
 * file before otherwise, and the preview of a raster selected after a long list of properties shows with its upper
 * part out of view.
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

const item = (name, type) => ({
    label: name, path: `ddb://h/o/d/${name}`, icon: 'fa-solid fa-image',
    entry: { path: name, type, size: 5, mtime: 1, hash: `h-${name}`, properties: {} }
});
const photo = item('a.jpg', ddb.entry.type.GEOIMAGE);
const raster = item('ortho.tif', ddb.entry.type.GEORASTER);

beforeEach(() => {
    setActivePinia(createPinia());
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(thumbs, 'fetch').mockImplementation((uri, size) => `/thumb?size=${size}`);
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('DetailPanel scroll position', () => {
    it('is 0 after the file prop changes, whatever the panel was scrolled to', async () => {
        const w = mount(DetailPanel, { props: { file: photo, dataset: { org: 'o', ds: 'd' } }, global: { plugins: [PrimeVue] }, attachTo: document.body });
        await flushPromises();
        const content = w.find('.detail-content').element;
        content.scrollTop = 240;
        expect(content.scrollTop).toBe(240);

        await w.setProps({ file: raster });
        await flushPromises();

        expect(w.find('.detail-content').element.scrollTop).toBe(0);
        w.unmount();
    });

    it('does not touch the scroll position while the same file is shown', async () => {
        const w = mount(DetailPanel, { props: { file: photo, dataset: { org: 'o', ds: 'd' } }, global: { plugins: [PrimeVue] }, attachTo: document.body });
        await flushPromises();
        const content = w.find('.detail-content').element;
        content.scrollTop = 240;

        await w.setProps({ canWrite: true });
        await flushPromises();

        expect(w.find('.detail-content').element.scrollTop).toBe(240);
        w.unmount();
    });
});
