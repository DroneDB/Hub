import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import CompareToolbar from './CompareToolbar.vue';

const NOTICES = [
    { path: 'gone.tif', kind: 'missing', text: 'Missing: gone.tif' },
    { path: 'flat.tif', kind: 'unavailable', text: 'Not available: flat.tif' }
];
const LAYER_EDITS = ['Add raster', 'Pick another', 'Remove'];

let wrapper;
afterEach(() => wrapper?.unmount());

const render = provide => {
    wrapper = mount(CompareToolbar, {
        props: { name: 'Site', maxLayers: 4, layerCount: 3, notices: NOTICES },
        global: { plugins: [PrimeVue], ...(provide ? { provide } : {}) }
    });
    return wrapper.findAll('button').map(b => b.text());
};

describe('CompareToolbar layer buttons', () => {
    it('add a raster and pick another for or remove a layer that cannot be shown', () => {
        const labels = render();
        for (const label of LAYER_EDITS) expect(labels).toContain(label);
        expect(wrapper.text()).toContain('Missing: gone.tif');
    });

    it('are not shown in an embedded view, which keeps the notices and Copy link', () => {
        const labels = render({ embed: true });
        for (const label of LAYER_EDITS) expect(labels).not.toContain(label);
        expect(labels).toContain('Copy link');
        expect(wrapper.text()).toContain('Missing: gone.tif');
        expect(wrapper.text()).toContain('Not available: flat.tif');
    });
});
