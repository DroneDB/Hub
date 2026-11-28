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

    // The two units as buttons of a group named by its label, the current one pressed
    const unitsGroup = () => document.getElementById('map-settings-dialog-measurement-units');
    const unitButton = label => [...unitsGroup().querySelectorAll('button')].find(b => b.textContent.trim() === label);

    it('shows both units at once, in a group named by its label, the current one pressed', async () => {
        await render();
        const group = unitsGroup();
        expect(group.getAttribute('role')).toBe('group');
        expect(document.getElementById(group.getAttribute('aria-labelledby')).textContent.trim()).toBe('Measurement units');
        expect(unitButton('Metric').getAttribute('aria-pressed')).toBe('true');
        expect(unitButton('Imperial').getAttribute('aria-pressed')).toBe('false');
    });

    it('a click on the other unit emits it with the previous one', async () => {
        await render();
        unitButton('Imperial').click();
        await flushPromises();
        expect(wrapper.emitted('unitsChanged')).toEqual([['imperial', 'metric']]);
    });

    it('a click on the current unit changes nothing', async () => {
        await render();
        unitButton('Metric').click();
        await flushPromises();
        expect(wrapper.emitted('unitsChanged')).toBeUndefined();
        expect(unitButton('Metric').getAttribute('aria-pressed')).toBe('true');
    });

    it('each setting is its label above its control; the custom basemap editor is under the basemap', async () => {
        await render();
        const fields = [...document.querySelectorAll('.map-settings-content > .setting-field')];
        expect(fields.map(f => [...f.children].map(el => el.classList[0]))).toEqual([['setting-label', 'p-select'], ['setting-label', 'p-selectbutton']]);
        await chooseBasemap('custom');
        expect(fields[0].lastElementChild.classList).toContain('custom-basemap-editor');
    });

    it('Close in the footer closes the window', async () => {
        await render();
        [...document.querySelectorAll('.window-footer button')].find(b => b.textContent.includes('Close')).click();
        expect(wrapper.emitted('close')).toHaveLength(1);
    });
});

describe('MapSettingsDialog keyboard', () => {
    const escapeOn = target => target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));

    it('closes on Escape, also from the basemap Select after a basemap was chosen', async () => {
        await render();
        await chooseBasemap('osm');
        const combo = document.getElementById('map-settings-dialog-basemap');
        combo.focus();
        escapeOn(combo);
        expect(wrapper.emitted('close')).toHaveLength(1);
    });

    it('with the basemap list open, Escape closes only the list', async () => {
        await render();
        wrapper.findAllComponents({ name: 'Select' }).find(c => c.props('inputId') === 'map-settings-dialog-basemap').vm.show();
        await flushPromises();
        const combo = document.getElementById('map-settings-dialog-basemap');
        expect(combo.getAttribute('aria-expanded')).toBe('true');
        escapeOn(combo);
        expect(wrapper.emitted('close')).toBeUndefined();
    });
});
