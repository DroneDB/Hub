/**
 * "Capture for report" in the properties dialogs of a 3D annotation and a 3D measure: the button is there only with a
 * capture (a writer's, from the point cloud viewer), runs it, says what came of it and shows the picture in the Photos
 * tab; the capture an item has is shown there too, also to a reader; the map's dialog has none.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import AnnotationPropertiesDialog from './AnnotationPropertiesDialog.vue';
import MeasurementPropertiesDialog from '@/components/measurements/MeasurementPropertiesDialog.vue';
import { CAPTURED_TEXT } from '@/libs/reports/snapshots/useCaptureAction';

let wrapper;
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
});

const annotation = () => ({ title: 'Gate', description: '', position: { toArray: () => [1, 2, 3] } });
const feature = () => ({ get: key => ({ name: 'Wall' })[key], getGeometry: () => null });
const mountDialog = async (component, props) => {
    wrapper = mount(component, { props, attachTo: document.body, global: { plugins: [PrimeVue] } });
    await flushPromises();
};
const capture = () => [...document.querySelectorAll('button')].find(b => b.textContent.includes('Capture for report'));
const tab = name => [...document.querySelectorAll('[role="tab"]')].find(t => t.textContent.includes(name));
const SNAPSHOT = { path: 'annotations/a1-3d.webp', camera: { position: [0, 0, 1], target: [0, 0, 0] }, capturedAt: '2026-11-25T17:46:57.816Z' };
const photoContext = (extra = {}) => ({
    dataset: {
        downloadUrl: vi.fn((path, { inline } = {}) => `/download?path=${path}${inline ? '&inline=1' : ''}`),
        thumbUrl: vi.fn(() => '/thumb'), findCoverage: vi.fn(async () => []), list: vi.fn(async () => []), search: vi.fn(async () => [])
    },
    measurementPath: 'cloud_measurements.geojson', itemId: 'a1', geometry: null, readOnly: false, photos: [], ...extra
});

describe.each([
    ['the 3D annotation dialog', AnnotationPropertiesDialog, () => ({ annotation: annotation() })],
    ['the 3D measure dialog', MeasurementPropertiesDialog, () => ({ feature: feature(), geometryType: 'LineString' })]
])('%s', (_, component, base) => {
    it('has no Capture for report button without a capture (a reader, or the map)', async () => {
        await mountDialog(component, base());
        expect(capture()).toBeUndefined();
    });

    it('runs the capture on the button and says to save when it is done', async () => {
        const run = vi.fn(async () => ({}));
        await mountDialog(component, { ...base(), capture: { run } });
        capture().click();
        await flushPromises();
        expect(run).toHaveBeenCalledTimes(1);
        expect(document.querySelector('[role="status"]').textContent).toBe(CAPTURED_TEXT);
        // The capture is the item's own: it does not close the dialog or change what Save emits
        expect(wrapper.emitted('close')).toBeUndefined();
    });

    it('says why a capture failed, and the button is there to try again', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const run = vi.fn().mockRejectedValueOnce(new Error('Forbidden')).mockResolvedValue({});
        await mountDialog(component, { ...base(), capture: { run } });
        capture().click();
        await flushPromises();
        expect(document.querySelector('[role="status"]').textContent).toBe('The capture failed: Forbidden');
        capture().click();
        await flushPromises();
        expect(document.querySelector('[role="status"]').textContent).toBe(CAPTURED_TEXT);
    });

    it('shows the picture it made in the Photos tab, which the tab counts, and opens that tab', async () => {
        const run = vi.fn(async () => SNAPSHOT);
        await mountDialog(component, { ...base(), photoContext: photoContext(), capture: { run } });
        expect(tab('Photos').textContent).toContain('Photos (0)');

        capture().click();
        await flushPromises();

        expect(tab('Photos').getAttribute('aria-selected')).toBe('true');
        expect(tab('Photos').textContent).toContain('Photos (1)');
        const image = document.querySelector('[data-testid="capture-image"]');
        expect(image.getAttribute('src')).toBe(`/download?path=${SNAPSHOT.path}&inline=1&v=${encodeURIComponent(SNAPSHOT.capturedAt)}`);
        // The capture is not a photo of the item: Save sends no photos for it
        document.querySelector('[data-confirm]').click();
        expect(wrapper.emitted('save')[0][0].photos).toBeUndefined();
    });

    it('shows the capture the item has, also to a reader who cannot capture', async () => {
        await mountDialog(component, { ...base(), photoContext: photoContext({ snapshot: SNAPSHOT, readOnly: true }) });
        expect(tab('Photos').textContent).toContain('Photos (1)');
        tab('Photos').click();
        await flushPromises();
        expect(document.querySelector('[data-testid="capture-image"]')).not.toBeNull();
    });

    it('says there is no picture yet, and how to make one, when it can capture', async () => {
        await mountDialog(component, { ...base(), photoContext: photoContext(), capture: { run: vi.fn() } });
        tab('Photos').click();
        await flushPromises();
        expect(document.querySelector('[data-testid="capture-none"]').textContent).toContain('Capture for report frames the item');
    });

    it('has no capture section for a reader of an item with no capture', async () => {
        await mountDialog(component, { ...base(), photoContext: photoContext({ readOnly: true }) });
        tab('Photos').click();
        await flushPromises();
        expect(document.querySelector('[data-testid="annotation-capture"]')).toBeNull();
    });
});
