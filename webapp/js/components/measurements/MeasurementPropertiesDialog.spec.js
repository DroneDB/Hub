/**
 * The one properties dialog of a measurement or a point annotation: a stable title that names what is edited, the
 * fields that apply to the geometry (a point has a colour and its coordinates, no width or fill), Delete for a
 * measurement that exists, Discard for a point just placed, and a save of the properties of the geometry only.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import Polygon from 'ol/geom/Polygon';
import LineString from 'ol/geom/LineString';
import { fromLonLat } from 'ol/proj';
import MeasurementPropertiesDialog from './MeasurementPropertiesDialog.vue';

let wrapper;
async function show(feature, props = {}) {
    wrapper = mount(MeasurementPropertiesDialog, {
        props: { feature, geometryType: feature.getGeometry().getType(), ...props },
        attachTo: document.body,
        global: { plugins: [PrimeVue] }
    });
    await flushPromises();
    return wrapper;
}
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
});

const dialog = () => /** @type {HTMLElement} */ (document.querySelector('#measurement-properties'));
const title = () => dialog().querySelector('.p-dialog-title').textContent.trim();
const labels = () => [...dialog().querySelectorAll('label, .fw-semibold')].map(l => l.textContent.trim().replace(/:.*/, ''));
const buttonNamed = name => [...dialog().querySelectorAll('button')].find(b => b.textContent.trim() === name);
const point = (properties = {}) => new Feature({ geometry: new Point(fromLonLat([31.138658, -23.940176])), measurementType: 'point', ...properties });
const area = () => new Feature({ geometry: new Polygon([[[0, 0], [10, 0], [10, 10], [0, 0]]]), measurementType: 'area' });
const line = () => new Feature({ geometry: new LineString([[0, 0], [10, 0]]), measurementType: 'length' });

describe('the properties dialog of a point annotation', () => {
    it('has a name, a description, a colour and the coordinates, and no width or fill', async () => {
        await show(point({ name: 'Pippo', description: 'Ciaone' }), { showDelete: true });
        expect(title()).toBe('Point Annotation');
        expect(labels()).toEqual(['Name', 'Description', 'Color', 'Coordinates']);
        expect(document.getElementById('mp-name').value).toBe('Pippo');
        expect(document.getElementById('mp-description').value).toBe('Ciaone');
        expect(document.getElementById('mp-coords').value).toBe('-23.940176, 31.138658');
        expect(document.getElementById('mp-coords-help').textContent).toContain(`23\u00B056'24.63" S / 31\u00B008'19.17" E`);
        expect(buttonNamed('Delete')).toBeTruthy();
        expect(buttonNamed('Cancel')).toBeTruthy();
    });

    it('keeps its title while the name is typed', async () => {
        await show(point(), { showDelete: true });
        const name = /** @type {HTMLInputElement} */ (document.getElementById('mp-name'));
        name.value = 'Pippo';
        name.dispatchEvent(new Event('input'));
        await flushPromises();
        expect(title()).toBe('Point Annotation');
    });

    it('saves the name, the description, the colour and the group of a point, not a width or a fill', async () => {
        await show(point({ name: 'Pippo', stroke: '#ff0000', groupId: 'g1' }), { showDelete: true });
        buttonNamed('Save').click();
        expect(wrapper.emitted('save')[0][0]).toEqual({ name: 'Pippo', description: '', stroke: '#ff0000', groupId: 'g1' });
        expect(wrapper.emitted('discard')).toBeUndefined();
    });

    it('for a point just placed: a title that says so, Discard and no Delete; Discard and the close button discard it', async () => {
        await show(point(), { isNew: true, showDelete: true });
        expect(title()).toBe('New Point Annotation');
        expect(buttonNamed('Delete')).toBeUndefined();
        buttonNamed('Discard').click();
        expect(wrapper.emitted('discard')).toHaveLength(1);
        wrapper.unmount();

        await show(point(), { isNew: true });
        /** @type {HTMLElement} */ (dialog().querySelector('.p-dialog-close-button, [aria-label="Close"]')).click();
        await flushPromises();
        expect(wrapper.emitted('discard')).toHaveLength(1);
    });

    it('for a point just placed, Save keeps it: nothing is discarded', async () => {
        await show(point(), { isNew: true });
        buttonNamed('Save').click();
        expect(wrapper.emitted('save')).toHaveLength(1);
        expect(wrapper.emitted('discard')).toBeUndefined();
    });
});

describe('the properties dialog of a measurement', () => {
    it('of an area: outline and fill colours, outline width and fill opacity, no coordinates', async () => {
        await show(area(), { showDelete: true });
        expect(title()).toBe('Measurement Properties');
        expect(labels()).toEqual(['Name', 'Description', 'Outline color', 'Fill color', 'Outline width', 'Fill opacity']);
        buttonNamed('Save').click();
        expect(Object.keys(wrapper.emitted('save')[0][0]).sort())
            .toEqual(['description', 'fill', 'fill-opacity', 'groupId', 'name', 'stroke', 'stroke-opacity', 'stroke-width']);
    });

    it('of a line: its colour and width, no fill', async () => {
        await show(line());
        expect(labels()).toEqual(['Name', 'Description', 'Line color', 'Line width']);
        buttonNamed('Save').click();
        expect(wrapper.emitted('save')[0][0]).not.toHaveProperty('fill');
    });

    it('offers the groups when there are some', async () => {
        await show(line(), { groups: [{ id: 'g1', name: 'North' }] });
        expect(labels()).toContain('Group');
    });
});

describe('the coordinates of a point', () => {
    const coords = () => /** @type {HTMLInputElement} */ (document.getElementById('mp-coords'));
    async function type(value) {
        coords().value = value;
        coords().dispatchEvent(new Event('input'));
        await flushPromises();
    }

    it('saves no coordinates when they are not changed, so the point is not rounded to the 6 decimals shown', async () => {
        await show(new Feature({ geometry: new Point(fromLonLat([31.1386581234, -23.9401761234])), measurementType: 'point' }));
        buttonNamed('Save').click();
        expect(wrapper.emitted('save')[0][0]).not.toHaveProperty('coordinates');
    });

    it('saves the coordinates typed, as [longitude, latitude], and shows them in DMS under the field', async () => {
        await show(point());
        await type('45.5, 9.25');
        expect(document.getElementById('mp-coords-help').textContent).toContain(`45\u00B030'00.00" N / 9\u00B015'00.00" E`);
        buttonNamed('Save').click();
        expect(wrapper.emitted('save')[0][0].coordinates).toEqual([9.25, 45.5]);
    });

    it('takes coordinates pasted in DMS', async () => {
        await show(point());
        await type(`45\u00B030'00.00" N / 9\u00B015'00.00" W`);
        buttonNamed('Save').click();
        expect(wrapper.emitted('save')[0][0].coordinates).toEqual([-9.25, 45.5]);
    });

    it('says what is wrong with coordinates that cannot be used, and saves nothing until they are fixed (Save and Enter)', async () => {
        await show(point());
        await type('120, 45');
        expect(coords().getAttribute('aria-invalid')).toBe('true');
        expect(coords().getAttribute('aria-describedby')).toBe('mp-coords-error');
        expect(document.getElementById('mp-coords-error').textContent).toContain('is the longitude first?');
        expect(buttonNamed('Save').disabled).toBe(true);
        wrapper.vm.save();
        expect(wrapper.emitted('save')).toBeUndefined();
        await type('45, 120');
        expect(document.getElementById('mp-coords-error')).toBeNull();
        buttonNamed('Save').click();
        expect(wrapper.emitted('save')[0][0].coordinates).toEqual([120, 45]);
    });

    it('is not a field of a measurement', async () => {
        await show(line());
        expect(coords()).toBeNull();
        buttonNamed('Save').click();
        expect(wrapper.emitted('save')[0][0]).not.toHaveProperty('coordinates');
    });
});
