/**
 * The one properties dialog of a measurement or a point annotation: a stable title that names what is edited, the
 * fields that apply to the geometry (a point has a colour and its coordinates, no width or fill), Delete for a
 * measurement that exists, Discard for a point just placed, and a save of the properties of the geometry only.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import Polygon from 'ol/geom/Polygon';
import LineString from 'ol/geom/LineString';
import { fromLonLat } from 'ol/proj';
import MeasurementPropertiesDialog from './MeasurementPropertiesDialog.vue';
import { _resetFoldedSectionsForTests } from '@/composables/useFoldedSections';

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
    _resetFoldedSectionsForTests();
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
});

const dialog = () => /** @type {HTMLElement} */ (document.querySelector('#measurement-properties'));
const title = () => dialog().querySelector('.p-dialog-title').textContent.trim();
// The Inspection part at the end of every form (AnnotationFields)
const FIELDS = ['Inspection', 'Category', 'Severity', 'Status', 'Due date', 'Assignee', 'Include in reports'];
const labels = () => [...dialog().querySelectorAll('label, .fw-semibold')].map(l => l.textContent.trim().replace(/:.*/, ''));
const buttonNamed = name => [...dialog().querySelectorAll('button')].find(b => b.textContent.trim() === name);
const point = (properties = {}) => new Feature({ geometry: new Point(fromLonLat([31.138658, -23.940176])), measurementType: 'point', ...properties });
const area = () => new Feature({ geometry: new Polygon([[[0, 0], [10, 0], [10, 10], [0, 0]]]), measurementType: 'area' });
const line = () => new Feature({ geometry: new LineString([[0, 0], [10, 0]]), measurementType: 'length' });

describe('the properties dialog of a point annotation', () => {
    it('has a name, a description, a colour and the coordinates, and no width or fill', async () => {
        await show(point({ name: 'Pippo', description: 'Ciaone' }), { showDelete: true });
        expect(title()).toBe('Point Annotation');
        expect(labels()).toEqual(['Name', 'Reference', 'Description', 'Coordinates', 'Appearance', 'Color', ...FIELDS]);
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
        expect(labels()).toEqual(['Name', 'Reference', 'Description', 'Appearance', 'Outline color', 'Fill color', 'Outline width', 'Fill opacity', ...FIELDS]);
        buttonNamed('Save').click();
        expect(Object.keys(wrapper.emitted('save')[0][0]).sort())
            .toEqual(['assignee', 'category', 'description', 'dueDate', 'fill', 'fill-opacity', 'groupId', 'name', 'report', 'severity', 'status', 'stroke', 'stroke-opacity', 'stroke-width']);
    });

    it('of a line: its colour and width, no fill', async () => {
        await show(line());
        expect(labels()).toEqual(['Name', 'Reference', 'Description', 'Appearance', 'Line color', 'Line width', ...FIELDS]);
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

describe('the annotation fields of a measurement', () => {
    const input = (id, value) => {
        const el = document.getElementById(id);
        el.value = value;
        el.dispatchEvent(new Event('input'));
        return flushPromises();
    };

    it('start from what the measurement has, and a new one has no category, severity or status', async () => {
        await show(line());
        expect(document.getElementById('mp-ref').value).toBe('');
        expect(document.querySelectorAll('#measurement-properties .p-select-label.p-placeholder')).toHaveLength(3);
        wrapper.unmount();

        const f = line();
        f.setProperties({ ref: '4', category: 'defect', assignee: 'Anna', dueDate: '2026-12-01', report: false });
        await show(f);
        expect(document.getElementById('mp-ref').value).toBe('4');
        expect(document.getElementById('mp-assignee').value).toBe('Anna');
        expect(document.getElementById('mp-due').value).toBe('2026-12-01');
        expect(document.getElementById('mp-report').checked).toBe(false);
    });

    it('are saved with the properties: a cleared field is undefined so that the measurement loses it, and an empty ref leaves the ref', async () => {
        const f = line();
        f.setProperties({ ref: '4', category: 'defect', assignee: 'Anna' });
        await show(f);
        await input('mp-assignee', '');
        await input('mp-due', '2026-12-01');
        buttonNamed('Save').click();
        const saved = wrapper.emitted('save')[0][0];
        expect(saved).toMatchObject({ ref: '4', category: 'defect', dueDate: '2026-12-01' });
        expect(saved).toHaveProperty('assignee', undefined);
        expect(saved).toHaveProperty('severity', undefined);

        wrapper.unmount();
        await show(line());
        buttonNamed('Save').click();
        expect(wrapper.emitted('save')[0][0]).not.toHaveProperty('ref');
    });

    it('refuse a ref another measurement has: the message, and no Save', async () => {
        const f = line();
        f.set('ref', '4');
        await show(f, { isRefTaken: ref => ref === '5' });
        await input('mp-ref', '5');
        expect(document.getElementById('mp-ref-error').textContent).toBe('Reference 5 is already used');
        expect(buttonNamed('Save').disabled).toBe(true);
        wrapper.vm.save();
        expect(wrapper.emitted('save')).toBeUndefined();
        await input('mp-ref', '6');
        expect(buttonNamed('Save').disabled).toBe(false);
        buttonNamed('Save').click();
        expect(wrapper.emitted('save')[0][0].ref).toBe('6');
    });

    it('limit the description to 10000 characters', async () => {
        await show(line());
        expect(document.getElementById('mp-description').maxLength).toBe(10000);
    });

    it('offer the categories of the schema it is given', async () => {
        const schema = { categories: [{ id: 'x', name: 'Xylo', colour: '#000000' }], severities: [], statuses: [{ id: 's', name: 'Seen', closed: false }] };
        const f = line();
        f.set('category', 'x');
        await show(f, { schema });
        expect(dialog().textContent).toContain('Xylo');
        expect(document.getElementById('mp-severity')).toBeNull();
    });
});

describe('the Photos tab of the dialog', () => {
    const photo = (path, extra = {}) => ({ path, source: 'dataset', ...extra });
    const dataset = () => ({
        thumbUrl: (path) => `/thumb?path=${path}`,
        findCoverage: vi.fn(async () => [{ path: 'images/a.jpg', score: 0.1, overlap: 1, pixel: null }]),
        list: vi.fn(async () => []),
        search: vi.fn(async () => []),
        writeObj: vi.fn(async () => ({}))
    });
    const context = (extra = {}) => ({
        dataset: dataset(), measurementPath: 'site/survey_measurements.geojson', itemId: 'id-1', readOnly: false,
        geometry: { type: 'Point', coordinates: [11.2, 45.1] }, photos: [], ...extra
    });
    const tab = name => [...dialog().querySelectorAll('[role="tab"]')].find(t => t.textContent.includes(name));
    const photosPanel = () => dialog().querySelector('.annotation-photos');

    it('tells the host of a photo it uploaded, so that the file list of the page shows it', async () => {
        const ctx = context({ onWritten: vi.fn() });
        await show(line(), { photoContext: ctx });
        tab('Photos').click();
        await flushPromises();
        const input = photosPanel().querySelector('input[type="file"]');
        Object.defineProperty(input, 'files', { value: [new File(['x'], 'IMG_1.JPG', { type: 'image/jpeg' })], configurable: true });
        input.dispatchEvent(new Event('change'));
        await flushPromises();
        expect(ctx.dataset.writeObj).toHaveBeenCalledTimes(1);
        expect(ctx.onWritten).toHaveBeenCalledWith('site/annotations/id-1-1.jpg');
    });

    it('has no tabs and saves no photos without a photo context', async () => {
        await show(line());
        expect(dialog().querySelector('[role="tab"]')).toBeNull();
        buttonNamed('Save').click();
        expect(wrapper.emitted('save')[0][0]).not.toHaveProperty('photos');
    });

    it('has a Details tab with the form and a Photos tab with the count of the photos', async () => {
        await show(line(), { photoContext: context({ photos: [photo('a.jpg'), photo('b.jpg')] }) });
        expect([...dialog().querySelectorAll('[role="tab"]')].map(t => t.textContent.trim())).toEqual(['Details', 'Photos (2)']);
        expect(document.getElementById('mp-name')).toBeTruthy();
    });

    it('does not look for covering photos until the tab is opened', async () => {
        const ctx = context();
        await show(line(), { photoContext: ctx });
        expect(ctx.dataset.findCoverage).not.toHaveBeenCalled();
        expect(photosPanel()).toBeNull();
        tab('Photos').click();
        await flushPromises();
        expect(ctx.dataset.findCoverage).toHaveBeenCalledTimes(1);
        expect(photosPanel()).toBeTruthy();
    });

    it('saves the photos when they were changed, with the properties of the measurement', async () => {
        const ctx = context({ photos: [photo('a.jpg')] });
        await show(line(), { photoContext: ctx });
        tab('Photos').click();
        await flushPromises();
        [...photosPanel().querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Remove a.jpg').click();
        await flushPromises();
        buttonNamed('Save').click();
        const saved = wrapper.emitted('save')[0][0];
        expect(saved).toHaveProperty('photos', undefined);
        expect(saved.stroke).toBeTruthy();
    });

    it('leaves the photos out of the save when the tab did not change them', async () => {
        await show(line(), { photoContext: context({ photos: [photo('a.jpg')] }) });
        tab('Photos').click();
        await flushPromises();
        buttonNamed('Save').click();
        expect(wrapper.emitted('save')[0][0]).not.toHaveProperty('photos');
    });

    it('saves the photos pinned from the coverage, with the pixel', async () => {
        const ctx = context();
        ctx.dataset.findCoverage = vi.fn(async () => [{ path: 'images/a.jpg', score: 0.1, overlap: 1, pixel: [5, 6] }]);
        await show(line(), { photoContext: ctx });
        tab('Photos').click();
        await flushPromises();
        [...photosPanel().querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Add a.jpg to this annotation').click();
        await flushPromises();
        buttonNamed('Save').click();
        expect(wrapper.emitted('save')[0][0].photos).toEqual([{ path: 'images/a.jpg', source: 'coverage', pixel: [5, 6] }]);
    });

    it('does not keep the changes of the photos when the dialog is cancelled, and deletes no file', async () => {
        const ctx = context({ photos: [photo('a.jpg')] });
        ctx.dataset.deleteObj = vi.fn();
        await show(line(), { photoContext: ctx });
        tab('Photos').click();
        await flushPromises();
        [...photosPanel().querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Remove a.jpg').click();
        buttonNamed('Cancel').click();
        expect(wrapper.emitted('save')).toBeUndefined();
        expect(ctx.dataset.deleteObj).not.toHaveBeenCalled();
    });

    it('is read-only for a user who cannot change the annotation', async () => {
        await show(line(), { photoContext: context({ readOnly: true, photos: [photo('a.jpg')] }) });
        tab('Photos').click();
        await flushPromises();
        expect(photosPanel().querySelectorAll('input')).toHaveLength(0);
        expect([...photosPanel().querySelectorAll('button')]).toHaveLength(0);
    });
});

describe('the parts that fold away', () => {
    const header = id => /** @type {HTMLElement} */ (dialog().querySelector(`[data-testid="mp-${id}"]`));
    const summary = id => dialog().querySelector(`[data-testid="mp-${id}-summary"]`).textContent.replace(/\s+/g, ' ').trim();
    const isOpen = id => header(id).getAttribute('aria-expanded') === 'true';

    it('are closed for a measurement with no inspection values, and say what they hold', async () => {
        await show(area());
        expect(isOpen('appearance')).toBe(false);
        expect(isOpen('inspection')).toBe(false);
        expect(summary('appearance')).toBe('Outline 2 px · fill 20%');
        expect(summary('inspection')).toBe('Nothing set');
        wrapper.unmount();
        await show(line());
        expect(summary('appearance')).toBe('Line 2 px');
    });

    it('open Inspection by itself when the measurement has values, and sum them up', async () => {
        const f = line();
        f.setProperties({ category: 'defect', status: 'open', assignee: 'Anna', dueDate: '2026-12-01', report: false });
        await show(f);
        expect(isOpen('inspection')).toBe(true);
        expect(summary('inspection')).toBe('Defect · Open · Anna · due 2026-12-01 · not in reports');
    });

    it('stay as the user left them the next time the dialog opens', async () => {
        await show(line());
        header('appearance').click();
        await flushPromises();
        expect(isOpen('appearance')).toBe(true);
        wrapper.unmount();
        await show(area());
        expect(isOpen('appearance')).toBe(true);
        header('appearance').click();
        await flushPromises();
        wrapper.unmount();
        await show(line());
        expect(isOpen('appearance')).toBe(false);
    });

    it('open Inspection when a field in it cannot be saved, and Save waits for it', async () => {
        await show(line());
        expect(isOpen('inspection')).toBe(false);
        const due = /** @type {HTMLInputElement} */ (document.getElementById('mp-due'));
        Object.defineProperty(due, 'value', { value: '2026-02-30', configurable: true });
        due.dispatchEvent(new Event('input'));
        await flushPromises();
        expect(isOpen('inspection')).toBe(true);
        expect(buttonNamed('Save').disabled).toBe(true);
        // Opened by the check, not by the user: the next dialog is closed again
        wrapper.unmount();
        await show(line());
        expect(isOpen('inspection')).toBe(false);
    });

    it('a reference another annotation has keeps Save off', async () => {
        await show(line(), { isRefTaken: ref => ref === '5' });
        const ref = /** @type {HTMLInputElement} */ (document.getElementById('mp-ref'));
        ref.value = '5';
        ref.dispatchEvent(new Event('input'));
        await flushPromises();
        expect(buttonNamed('Save').disabled).toBe(true);
    });
});
