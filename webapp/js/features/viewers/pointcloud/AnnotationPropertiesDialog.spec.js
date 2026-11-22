/**
 * The properties dialog of a 3D annotation: with a photo context it has a Photos tab, whose changes are saved with the
 * annotation; without one it is the plain form.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import AnnotationPropertiesDialog from './AnnotationPropertiesDialog.vue';

let wrapper;
const annotation = () => ({ title: 'Gate', description: '', position: { toArray: () => [1, 2, 3] } });
const context = (extra = {}) => ({
    dataset: {
        thumbUrl: path => `/thumb?path=${path}`,
        findCoverage: vi.fn(async () => []),
        list: vi.fn(async () => []),
        search: vi.fn(async () => []),
        writeObj: vi.fn(async () => ({}))
    },
    measurementPath: 'a/cloud_measurements.geojson', itemId: 'id-1', readOnly: false, geometry: null, photos: [], ...extra
});
async function show(props = {}) {
    wrapper = mount(AnnotationPropertiesDialog, { props: { annotation: annotation(), ...props }, attachTo: document.body, global: { plugins: [PrimeVue] } });
    await flushPromises();
}
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
});
const dialog = () => document.querySelector('#annotation-properties');
const tab = name => [...dialog().querySelectorAll('[role="tab"]')].find(t => t.textContent.includes(name));
const buttonNamed = name => [...dialog().querySelectorAll('button')].find(b => b.textContent.trim() === name);

describe('the annotation dialog without a photo context', () => {
    it('has no tabs and saves no photos', async () => {
        await show();
        expect(dialog().querySelector('[role="tab"]')).toBeNull();
        buttonNamed('Save').click();
        expect(wrapper.emitted('save')[0][0]).not.toHaveProperty('photos');
    });
});

describe('the Photos tab of the annotation dialog', () => {
    it('is next to the details, and an item that is not georeferenced makes no coverage request', async () => {
        const ctx = context({ geometry: null });
        await show({ photoContext: ctx });
        expect([...dialog().querySelectorAll('[role="tab"]')].map(t => t.textContent.trim())).toEqual(['Details', 'Photos (0)']);
        tab('Photos').click();
        await flushPromises();
        expect(ctx.dataset.findCoverage).not.toHaveBeenCalled();
        expect(dialog().textContent).toContain('no position on the earth');
    });

    it('asks for the covering photos of a georeferenced annotation and saves the one pinned, with the name typed', async () => {
        const ctx = context({ geometry: { type: 'Point', coordinates: [11.2, 45.1] } });
        ctx.dataset.findCoverage = vi.fn(async () => [{ path: 'images/a.jpg', score: 0.1, overlap: 1, pixel: [1, 2] }]);
        await show({ photoContext: ctx });
        tab('Photos').click();
        await flushPromises();
        expect(ctx.dataset.findCoverage).toHaveBeenCalledTimes(1);
        [...dialog().querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Add a.jpg to this annotation').click();
        await flushPromises();
        expect(tab('Photos').textContent).toContain('(1)');
        buttonNamed('Save').click();
        expect(wrapper.emitted('save')[0][0]).toMatchObject({ name: 'Gate', photos: [{ path: 'images/a.jpg', source: 'coverage', pixel: [1, 2] }] });
    });

    it('saves no photos when none changed, and an empty list (to clear them) when all were removed', async () => {
        await show({ photoContext: context({ photos: [{ path: 'a.jpg', source: 'dataset' }] }) });
        buttonNamed('Save').click();
        expect(wrapper.emitted('save')[0][0]).not.toHaveProperty('photos');
        wrapper.unmount();
        await show({ photoContext: context({ photos: [{ path: 'a.jpg', source: 'dataset' }] }) });
        tab('Photos').click();
        await flushPromises();
        [...dialog().querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Remove a.jpg').click();
        await flushPromises();
        buttonNamed('Save').click();
        expect(wrapper.emitted('save')[0][0]).toHaveProperty('photos', undefined);
    });
});
