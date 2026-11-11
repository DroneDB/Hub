/**
 * ModelViewerShell, the frame of the 3D model viewers (FR-VWR-11): the navigation toolbar with
 * Home (the button and the keys Home, H and 0), and the lighting settings in a panel docked beside
 * the settings button, not over the model.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import ModelViewerShell from './ModelViewerShell.vue';

let wrapper;
const lighting = () => ({ ambientIntensity: 0.4, directionalIntensity: 0.7, shininess: 25 });

async function open(props = {}) {
    wrapper = mount(ModelViewerShell, {
        props: { settings: lighting(), loaded: true, ...props },
        slots: { default: '<canvas class="model-canvas" />' },
        global: { plugins: [PrimeVue], provide: { embed: false } },
        attachTo: document.body
    });
    await flushPromises();
}
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
});

describe('ModelViewerShell', () => {
    it('has the navigation toolbar once the model has loaded, and none before', async () => {
        await open({ loaded: false });
        expect(wrapper.find('.viewer-nav').exists()).toBe(false);
        wrapper.unmount();
        await open();
        expect(wrapper.find('.viewer-nav button[aria-label="Home"]').exists()).toBe(true);
        expect(wrapper.find('.btn-settings').classes()).toContain('bottom-left');
        expect(wrapper.find('.viewer-nav').classes()).toContain('bottom-right');
    });

    it('Home, from the button and from the keys Home, H and 0, is emitted for the viewer', async () => {
        await open();
        await wrapper.find('.viewer-nav button[aria-label="Home"]').trigger('click');
        for (const key of ['Home', 'h', '0']) document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
        expect(wrapper.emitted('home')).toHaveLength(4);
    });

    it('lists how the arcball is driven in the help', async () => {
        await open();
        await wrapper.find('.viewer-nav button[aria-label="Controls"]').trigger('click');
        const actions = wrapper.findAll('.viewer-help dd').map(d => d.text());
        expect(actions).toEqual(expect.arrayContaining(['Rotate', 'Pan', 'Zoom']));
    });

    it('opens the lighting beside its button in a docked panel: the sliders, Reset and Close, and Escape closes it', async () => {
        await open();
        expect(wrapper.find('.viewer-settings-panel').exists()).toBe(false);
        await wrapper.find('.btn-settings').trigger('click');
        const panel = wrapper.find('.viewer-settings-panel');
        expect(panel.classes()).toEqual(expect.arrayContaining(['side-left', 'from-bottom']));
        expect(panel.attributes('aria-label')).toBe('Lighting');
        expect(panel.findAll('input[type="range"]')).toHaveLength(3);
        expect(wrapper.find('.p-dialog').exists()).toBe(false);

        const reset = panel.findAll('button').find(b => b.text() === 'Reset');
        await reset.trigger('click');
        expect(wrapper.emitted('reset')).toHaveLength(1);

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        await flushPromises();
        expect(wrapper.find('.viewer-settings-panel').exists()).toBe(false);
    });

    it('leaves out the shininess of a textured model', async () => {
        await open({ hasTexture: true });
        await wrapper.find('.btn-settings').trigger('click');
        expect(wrapper.findAll('.viewer-settings-panel input[type="range"]')).toHaveLength(2);
    });
});
