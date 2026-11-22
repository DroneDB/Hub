/**
 * "Capture for report" in the properties dialogs of a 3D annotation and a 3D measure: the button is there only with a
 * capture (a writer's, from the point cloud viewer), runs it, and says what came of it; the map's dialog has none.
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
});
