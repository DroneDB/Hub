import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';

const h = vi.hoisted(() => ({ fetchWmsLayers: null, loadTestTile: null }));
vi.mock('@/libs/map/wmsCapabilities', () => ({ fetchWmsLayers: (...args) => h.fetchWmsLayers(...args) }));
vi.mock('@/libs/map/basemaps', async importOriginal => ({
    ...(await importOriginal()),
    loadTestTile: (...args) => h.loadTestTile(...args)
}));

const { default: CustomBasemapEditor } = await import('./CustomBasemapEditor.vue');
const { PREF, getPref, setPref, applyAccountValue, _resetPrefListenersForTests } = await import('@/libs/preferences');

const XYZ_URL = 'https://tiles.example.com/{z}/{x}/{y}.png';
const WMS_URL = 'https://maps.example.org/wms';

let wrapper;
async function render() {
    wrapper = mount(CustomBasemapEditor, { props: { idPrefix: 'cb' }, attachTo: document.body, global: { plugins: [PrimeVue] } });
    await flushPromises();
}
const button = text => wrapper.findAll('button').find(b => b.text().includes(text) || b.attributes('aria-label') === text);
const urlInput = () => wrapper.find('#cb-url');
async function typeUrl(value) {
    await urlInput().setValue(value);
    await flushPromises();
}
// The source type select, as a user's choice: its new value, then its change event
async function chooseSource(value) {
    const select = wrapper.findAllComponents({ name: 'Select' })[0];
    select.vm.$emit('update:modelValue', value);
    select.vm.$emit('change', { value });
    await flushPromises();
}
const stored = () => getPref(PREF.CUSTOM_BASEMAP, null);

beforeEach(() => {
    _resetPrefListenersForTests();
    setPref(PREF.CUSTOM_BASEMAP, null);
    h.fetchWmsLayers = vi.fn(() => Promise.resolve([{ name: 'ortho', title: 'Ortho', defaultTime: '2026-03-12' }, { name: 'dem', title: 'DEM', defaultTime: '' }]));
    h.loadTestTile = vi.fn(() => Promise.resolve());
});
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
    _resetPrefListenersForTests();
});

describe('CustomBasemapEditor', () => {
    it('an empty form: XYZ, no URL, Apply disabled, no Clear', async () => {
        await render();
        expect(urlInput().element.value).toBe('');
        expect(wrapper.text()).toContain('XYZ tiles');
        expect(button('Apply').attributes('disabled')).toBeDefined();
        expect(button('Clear')).toBeUndefined();
    });

    it('a URL the map would not draw shows why and cannot be applied', async () => {
        await render();
        await typeUrl('javascript:alert(1)');
        expect(wrapper.text()).toContain('must be absolute');
        expect(button('Apply').attributes('disabled')).toBeDefined();
    });

    it('Apply loads one tile of an XYZ source, then saves it and says so', async () => {
        await render();
        await typeUrl(` ${XYZ_URL} `);
        await button('Apply').trigger('click');
        await flushPromises();
        expect(h.loadTestTile).toHaveBeenCalledWith('https://tiles.example.com/0/0/0.png');
        expect(stored()).toMatchObject({ sourceType: 'xyz', url: XYZ_URL, attribution: '&copy; tiles.example.com' });
        expect(wrapper.emitted('applied')).toHaveLength(1);
    });

    it('a tile that does not load: an error, nothing saved', async () => {
        h.loadTestTile = vi.fn(() => Promise.reject(new Error('Failed to load tile')));
        await render();
        await typeUrl(XYZ_URL);
        await button('Apply').trigger('click');
        await flushPromises();
        expect(wrapper.text()).toContain('Failed to load tiles');
        expect(stored()).toBeNull();
        expect(wrapper.emitted('applied')).toBeUndefined();
    });

    it('a URL changed while its tile loads is not saved', async () => {
        let finish;
        h.loadTestTile = vi.fn(() => new Promise(resolve => { finish = resolve; }));
        await render();
        await typeUrl(XYZ_URL);
        await button('Apply').trigger('click');
        await typeUrl('https://other.example.com/{z}/{x}/{y}.png');
        finish();
        await flushPromises();
        expect(stored()).toBeNull();
        expect(wrapper.emitted('applied')).toBeUndefined();
    });

    it('WMS: Fetch layers lists the layers of the server and chooses the first; Apply saves its TIME', async () => {
        await render();
        await chooseSource('wms');
        await typeUrl(WMS_URL);
        expect(button('Apply').attributes('disabled')).toBeDefined();
        await button('Fetch layers').trigger('click');
        await flushPromises();
        expect(h.fetchWmsLayers).toHaveBeenCalledWith(WMS_URL);
        expect(wrapper.text()).toContain('Ortho');
        await button('Apply').trigger('click');
        await flushPromises();
        expect(h.loadTestTile.mock.calls[0][0]).toContain('LAYERS=ortho');
        expect(stored()).toMatchObject({ sourceType: 'wms', url: WMS_URL, layerName: 'ortho', defaultTime: '2026-03-12' });
    });

    it('WMS: a server without layers says so', async () => {
        h.fetchWmsLayers = vi.fn(() => Promise.resolve([]));
        await render();
        await chooseSource('wms');
        await typeUrl(WMS_URL);
        await button('Fetch layers').trigger('click');
        await flushPromises();
        expect(wrapper.text()).toContain('No layers found');
    });

    it('shows the stored source, and a stored WMS layer before the layers are fetched again', async () => {
        setPref(PREF.CUSTOM_BASEMAP, { sourceType: 'wms', url: WMS_URL, layerName: 'ortho' });
        await render();
        expect(urlInput().element.value).toBe(WMS_URL);
        expect(wrapper.text()).toContain('ortho');
        expect(button('Apply').attributes('disabled')).toBeUndefined();
    });

    it('an invalid stored source shows an empty form', async () => {
        setPref(PREF.CUSTOM_BASEMAP, { sourceType: 'xyz', url: 'javascript:alert(1)' });
        await render();
        expect(urlInput().element.value).toBe('');
        expect(wrapper.text()).not.toContain('javascript:');
    });

    it('follows a source that comes from the account', async () => {
        await render();
        applyAccountValue(PREF.CUSTOM_BASEMAP, { sourceType: 'xyz', url: XYZ_URL });
        await flushPromises();
        expect(urlInput().element.value).toBe(XYZ_URL);
    });

    it('Clear removes the stored source and says so', async () => {
        setPref(PREF.CUSTOM_BASEMAP, { sourceType: 'xyz', url: XYZ_URL });
        await render();
        await button('Clear').trigger('click');
        await flushPromises();
        expect(stored()).toBeNull();
        expect(wrapper.emitted('cleared')).toHaveLength(1);
        expect(urlInput().element.value).toBe('');
    });
});
