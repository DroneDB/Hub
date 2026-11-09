/**
 * Deleting a measurement or a group from the measurement list asks with the shared delete
 * wording (Delete / Cancel), and so does Delete saved, on the map and in the 3D viewer.
 */
import { describe, it, expect } from 'vitest';
import MeasurementListDialog from './MeasurementListDialog.vue';
import DeleteSavedMeasurementsDialog from '@/components/measurements/DeleteSavedMeasurementsDialog.vue';

const { deleteConfirmDialog, deleteGroupConfirmDialog } = MeasurementListDialog.computed;
const typeLabel = MeasurementListDialog.methods.typeLabel;

describe('MeasurementListDialog delete questions', () => {
    it('names a measurement (or its type) and its value', () => {
        const props = deleteConfirmDialog.call({ pendingDeleteItem: { type: 'area', value: '12 m²' }, typeLabel });
        expect(props).toMatchObject({ title: 'Delete measurement “Area”', confirmText: 'Delete', cancelText: 'Cancel', confirmButtonClass: 'danger' });
        expect(props.message).toContain('<strong>Area</strong> (12 m²)');
    });

    it('names a group and counts its measurements', () => {
        const props = deleteGroupConfirmDialog.call({ pendingDeleteGroup: { name: 'Piles', items: [{}, {}] } });
        expect(props).toMatchObject({ title: 'Delete measurement group “Piles”', confirmText: 'Delete', cancelText: 'Cancel' });
        expect(props.message).toContain('its 2 measurements');
    });
});

describe('DeleteSavedMeasurementsDialog', () => {
    it('asks with the shared wording', () => {
        const { question } = DeleteSavedMeasurementsDialog.setup();
        expect(question).toMatchObject({ title: 'Delete saved measurements', confirmText: 'Delete', cancelText: 'Cancel', confirmButtonClass: 'danger' });
        expect(question.message).toContain('the saved measurements of this view');
    });
});
