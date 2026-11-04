import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';

const h = vi.hoisted(() => ({ loadTestTile: null }));
vi.mock('@/libs/map/basemaps', async importOriginal => ({
    ...(await importOriginal()),
    loadTestTile: (...args) => h.loadTestTile(...args)
}));

const { default: MapSettingsDialog } = await import('./MapSettingsDialog.vue');
const { Basemaps } = await import('@/libs/map/basemaps');
const { PREF, getPref, setPref, _resetPrefListenersForTests } = await import('@/libs/preferences');

let wrapper;
async function render(selectedBasemap = 'satellite') {
    wrapper = mount(MapSettingsDialog, {
        props: { basemaps: Basemaps, selectedBasemap, unitPref: 'metric' },
        attachTo: document.body,
        global: { plugins: [PrimeVue] }
    });
    await flushPromises();
}
const urlInput = () => document.getElementById('map-settings-dialog-custom-url');
// The basemap select, as a user's choice
async function chooseBasemap(value) {
    wrapper.findAllComponents({ name: 'Select' }).find(c => c.props('inputId') === 'map-settings-dialog-basemap').vm.$emit('update:modelValue', value);
    await flushPromises();
}
const applyButton = () => [...document.body.querySelectorAll('button')].find(b => b.textContent.includes('Apply'));

beforeEach(() => {
    _resetPrefListenersForTests();
    setPref(PREF.CUSTOM_BASEMAP, null);
    h.loadTestTile = vi.fn(() => Promise.resolve());
});
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
    _resetPrefListenersForTests();
});

describe('MapSettingsDialog', () => {
    it('another basemap is emitted at once', async () => {
        await render();
        await chooseBasemap('osm');
        expect(wrapper.emitted('basemapChanged')).toEqual([['osm']]);
    });

    it('Custom without a source opens the editor and switches the map only once a source is saved', async () => {
        await render();
        await chooseBasemap('custom');
        expect(urlInput()).not.toBeNull();
        expect(wrapper.emitted('basemapChanged')).toBeUndefined();

        urlInput().value = 'https://tiles.example.com/{z}/{x}/{y}.png';
        urlInput().dispatchEvent(new Event('input'));
        await flushPromises();
        applyButton().click();
        await flushPromises();
        expect(getPref(PREF.CUSTOM_BASEMAP, null)).toMatchObject({ url: 'https://tiles.example.com/{z}/{x}/{y}.png' });
        expect(wrapper.emitted('basemapChanged')).toEqual([['custom']]);
    });

    it('Custom with a stored source is emitted at once', async () => {
        setPref(PREF.CUSTOM_BASEMAP, { sourceType: 'xyz', url: 'https://tiles.example.com/{z}/{x}/{y}.png' });
        await render();
        await chooseBasemap('custom');
        expect(wrapper.emitted('basemapChanged')).toEqual([['custom']]);
    });

    it('a changed unit is emitted with the previous one', async () => {
        await render();
        wrapper.findAllComponents({ name: 'Select' }).find(c => c.props('inputId') === 'map-settings-dialog-measurement-units').vm.$emit('update:modelValue', 'imperial');
        await flushPromises();
        expect(wrapper.emitted('unitsChanged')).toEqual([['imperial', 'metric']]);
    });
});
