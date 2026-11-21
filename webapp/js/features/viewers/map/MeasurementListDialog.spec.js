/**
 * Deleting a measurement or a group from the measurement list asks with the shared delete
 * wording (Delete / Cancel), and so does Delete saved, on the map and in the 3D viewer.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { mount } from '@vue/test-utils';
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

// FR-MAP-04: the actions of a row are hidden at rest (opacity 0) and shown on hover; a keyboard user who Tabs onto
// Edit, Delete or Move-to-group must see them. The rules are read from the component's own style block (the test
// environment does not apply it), so the rule that shows the container of the focused control is the one tested.
describe('MeasurementListDialog row actions for the keyboard (FR-MAP-04)', () => {
    const style = readFileSync(path.resolve(__dirname, 'MeasurementListDialog.vue'), 'utf8').match(/<style[^>]*>([\s\S]*?)<\/style>/)[1].replace(/\/\*[\s\S]*?\*\//g, '');

    /** The declarations of the first rule whose selector list has `selector` (outside the media queries), or null */
    const ruleOf = selector => {
        const withoutMedia = style.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
        for (const [, selectors, body] of withoutMedia.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
            if (selectors.split(',').map(x => x.trim()).includes(selector)) return body;
        }
        return null;
    };

    const FEATURE = { ol_uid: 1 };
    const wrapper = mount(MeasurementListDialog, {
        props: {
            measurements: [
                { type: 'length', name: 'Length', value: '12 m', feature: FEATURE, groupId: null },
                { type: 'point', name: 'Point', value: '', feature: { ol_uid: 2 }, groupId: 'g1' }
            ],
            groups: [{ id: 'g1', name: 'Piles', color: '#f00', visible: true }]
        },
        global: { stubs: { Window: { template: '<div><slot /></div>' } } },
        attachTo: document.body
    });

    it('hides the actions at rest and shows them while the row is hovered', () => {
        expect(ruleOf('.measurement-actions')).toMatch(/opacity:\s*0/);
        expect(ruleOf('.group-actions')).toMatch(/opacity:\s*0/);
        expect(ruleOf('.measurement-row:hover .measurement-actions')).toMatch(/opacity:\s*1/);
    });

    it('shows the actions of a measurement row and of a group row while a control in them has the focus', () => {
        expect(ruleOf('.measurement-row:focus-within .measurement-actions')).toMatch(/opacity:\s*1/);
        expect(ruleOf('.group-row:focus-within .group-actions')).toMatch(/opacity:\s*1/);
    });

    it('has the Delete, Edit and Move-to-group controls in the container that the focus rule shows, for every row type', () => {
        const rowsWithActions = wrapper.findAll('.measurement-row');
        expect(rowsWithActions).toHaveLength(2);
        for (const row of rowsWithActions) {
            const del = row.find('button[aria-label="Delete"]').element;
            del.focus();
            expect(document.activeElement).toBe(del);
            expect(del.closest('.measurement-actions')).not.toBeNull();
            expect(del.closest('.measurement-actions').closest('.measurement-row')).toBe(row.element);
            expect(row.find('.measurement-actions button[aria-label="Edit"]').exists()).toBe(true);
        }
        expect(wrapper.find('.measurement-row .measurement-actions select[aria-label="Move to group"]').exists()).toBe(true);
        const groupDelete = wrapper.find('.group-row button[aria-label^="Delete group"]').element;
        expect(groupDelete.closest('.group-actions').closest('.group-row')).toBe(wrapper.find('.group-row').element);
    });

    it('lays every row type out the same: one line, the name shrinks with min-width 0', () => {
        expect(ruleOf('.measurement-row')).toMatch(/flex-wrap:\s*nowrap/);
        expect(ruleOf('.measurement-name')).toMatch(/min-width:\s*0/);
    });
});

describe('MeasurementListDialog owner hint', () => {
    const mountWith = props => mount(MeasurementListDialog, {
        props: { measurements: [], ...props },
        global: { stubs: { Window: { template: '<div><slot /></div>' } } }
    });

    it('says which file the measurements are saved in, also with none on the map', () => {
        const wrapper = mountWith({ savedPath: 'flight/measurements.geojson' });
        expect(wrapper.find('[data-testid="measurements-file"]').text()).toBe('Saved in flight/measurements.geojson');
    });

    it('shows no line before the file is known', () => {
        expect(mountWith({}).find('[data-testid="measurements-file"]').exists()).toBe(false);
    });
});

describe('MeasurementListDialog piles', () => {
    const PILE = { type: 'stockpile', name: 'North pile', value: '44 m³', feature: { ol_uid: 3 }, groupId: null };
    const AREA = { type: 'area', name: 'Area', value: '12 m²', feature: { ol_uid: 4 }, groupId: null };
    const mountWith = props => mount(MeasurementListDialog, {
        props: { measurements: [PILE, AREA], ...props },
        global: { stubs: { Window: { template: '<div><slot /></div>' } } }
    });
    const buttons = wrapper => wrapper.findAll('[data-testid="measurement-work-on-stockpile"]');

    it('a pile has a button that asks to work on it in Stockpile Volume, when the map can open it', async () => {
        const wrapper = mountWith({ canWorkOnStockpiles: true });
        expect(buttons(wrapper)).toHaveLength(1);
        await buttons(wrapper)[0].trigger('click');
        expect(wrapper.emitted('workOnStockpile')).toEqual([[PILE]]);
    });

    it('has no such button on a map with no elevation model', () => {
        expect(buttons(mountWith({}))).toHaveLength(0);
    });

    it('has it for a pile in a group too', () => {
        const wrapper = mountWith({
            canWorkOnStockpiles: true,
            measurements: [{ ...PILE, groupId: 'g1' }],
            groups: [{ id: 'g1', name: 'Piles', color: '#f00', visible: true }]
        });
        expect(buttons(wrapper)).toHaveLength(1);
    });
});
