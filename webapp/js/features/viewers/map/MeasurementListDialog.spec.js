/**
 * Deleting a measurement or a group from the measurement list asks with the shared delete
 * wording (Delete / Cancel), and so does Delete saved, on the map and in the 3D viewer.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import MeasurementListDialog from './MeasurementListDialog.vue';
import DeleteSavedMeasurementsDialog from '@/components/measurements/DeleteSavedMeasurementsDialog.vue';

const { deleteConfirmDialog, deleteGroupConfirmDialog } = MeasurementListDialog.computed;
// Every mount of the list: PrimeVue (its search field) and the window as a plain box
const GLOBAL = { plugins: [PrimeVue], stubs: { Window: { template: '<div><slot /></div>' } } };

describe('MeasurementListDialog delete questions', () => {
    it('names a measurement (or its type) and its value', () => {
        const props = deleteConfirmDialog.call({ pendingDeleteItems: [{ type: 'area', value: '12 m²' }] });
        expect(props).toMatchObject({ title: 'Delete measurement “Area”', confirmText: 'Delete', cancelText: 'Cancel', confirmButtonClass: 'danger' });
        expect(props.message).toContain('<strong>Area</strong> (12 m²)');
    });

    it('asks once for several measurements, naming them', () => {
        const props = deleteConfirmDialog.call({ pendingDeleteItems: [{ type: 'area', name: 'Roof', value: '12 m²' }, { type: 'length', name: 'Fence' }] });
        expect(props.title).toBe('Delete 2 items');
        expect(props.message).toContain('<strong>Roof</strong> (12 m²)');
        expect(props.message).toContain('<strong>Fence</strong>');
    });

    it('names a group and counts its measurements', () => {
        const measurements = [{ groupId: 'g1' }, { groupId: 'g1' }, { groupId: 'other' }, { groupId: '' }];
        const props = deleteGroupConfirmDialog.call({ measurements, pendingDeleteGroup: { id: 'g1', name: 'Piles', items: [{}, {}] } });
        expect(props).toMatchObject({ title: 'Delete measurement group “Piles”', confirmText: 'Delete', cancelText: 'Cancel' });
        expect(props.message).toContain('its 2 measurements');
    });

    it('counts every measurement of the group when a filter shows only some of them', () => {
        const measurements = Array.from({ length: 12 }, (_, i) => ({ groupId: 'g1', type: i === 0 ? 'area' : 'length' }));
        // The group row holds the one measurement the filter shows; all 12 are deleted with the group
        const props = deleteGroupConfirmDialog.call({ measurements, pendingDeleteGroup: { id: 'g1', name: 'Piles', items: [measurements[0]] } });
        expect(props.message).toContain('its 12 measurements');
        expect(props.message).not.toContain('its 1 measurement');
    });
});

describe('DeleteSavedMeasurementsDialog', () => {
    it('asks with the shared wording', () => {
        const { question } = DeleteSavedMeasurementsDialog.setup();
        expect(question).toMatchObject({ title: 'Delete saved measurements', confirmText: 'Delete', cancelText: 'Cancel', confirmButtonClass: 'danger' });
        expect(question.message).toContain('the saved measurements of this view');
    });
});

// The actions of a row are hidden at rest (opacity 0) and shown on hover; a keyboard user who Tabs onto
// Edit, Delete or Move-to-group must see them. The rules are read from the component's own style block (the test
// environment does not apply it), so the rule that shows the container of the focused control is the one tested.
describe('MeasurementListDialog row actions for the keyboard', () => {
    // The rows of the measurements are MeasurementRow's, the group rows the list's
    const styleOf = file => readFileSync(path.resolve(__dirname, file), 'utf8').match(/<style[^>]*>([\s\S]*?)<\/style>/)[1].replace(/\/\*[\s\S]*?\*\//g, '');
    const style = styleOf('MeasurementListDialog.vue') + styleOf('MeasurementRow.vue');

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
        global: GLOBAL,
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

    it('has the Delete and Edit controls in the container that the focus rule shows, for every row type', () => {
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
        // A row is moved to a group by the selection's Move to, or by a drag: it has no group list of its own
        expect(wrapper.find('.measurement-row select').exists()).toBe(false);
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
        global: GLOBAL
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
        global: GLOBAL
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

describe('MeasurementListDialog annotation columns and filters', () => {
    const item = (name, extra = {}) => ({ type: 'length', name, value: '1 m', feature: { ol_uid: name }, groupId: '', ref: '', category: '', status: '', ...extra });
    const ITEMS = [
        item('Crack', { ref: '1', category: 'defect', categoryLabel: 'Defect', status: 'open', statusLabel: 'Open' }),
        item('Gate', { ref: '2', category: 'safety', categoryLabel: 'Safety', status: 'resolved', statusLabel: 'Resolved' }),
        item('Fence', { ref: '3', category: 'defect', categoryLabel: 'Defect', status: 'resolved', statusLabel: 'Resolved' }),
        item('Plain')
    ];
    const mountList = props => mount(MeasurementListDialog, {
        props: { measurements: ITEMS, ...props },
        global: GLOBAL
    });
    const names = wrapper => wrapper.findAll('.measurement-name').map(n => n.text());

    it('shows the reference, the category and the status of each measurement, in a group or not', () => {
        const wrapper = mountList({ measurements: ITEMS.map(i => (i.name === 'Fence' ? { ...i, groupId: 'g1' } : i)), groups: [{ id: 'g1', name: 'Piles', color: '#f00', visible: true }] });
        const rows = wrapper.findAll('.measurement-row');
        expect(rows).toHaveLength(4);
        const crack = rows.find(r => r.text().includes('Crack'));
        expect(crack.find('[data-testid="annotation-ref"]').text()).toBe('1');
        expect(crack.find('[data-testid="annotation-category"]').text()).toBe('Defect');
        expect(crack.find('[data-testid="annotation-status"]').text()).toBe('Open');
        const fence = rows.find(r => r.text().includes('Fence'));
        expect(fence.find('[data-testid="annotation-ref"]').text()).toBe('3');
        const plain = rows.find(r => r.text().includes('Plain'));
        expect(plain.find('.annotation-chips').exists()).toBe(false);
    });

    it('filters by category and by status, each alone and both together, and shows all again', async () => {
        const wrapper = mountList();
        const category = wrapper.find('[data-testid="category-filter"]');
        const status = wrapper.find('[data-testid="status-filter"]');
        expect(category.findAll('option').map(o => o.text())).toEqual(['All', 'Defect', 'Safety']);
        expect(status.findAll('option').map(o => o.text())).toEqual(['All', 'Open', 'Resolved']);

        await category.setValue('defect');
        expect(names(wrapper)).toEqual(['Crack', 'Fence']);
        await status.setValue('resolved');
        expect(names(wrapper)).toEqual(['Fence']);
        await category.setValue('');
        expect(names(wrapper)).toEqual(['Gate', 'Fence']);
        await status.setValue('');
        expect(names(wrapper)).toHaveLength(4);
    });

    it('says when no measurement matches, and keeps the filters to change them', async () => {
        const wrapper = mountList();
        await wrapper.find('[data-testid="category-filter"]').setValue('safety');
        await wrapper.find('[data-testid="status-filter"]').setValue('open');
        expect(wrapper.find('.measurement-row').exists()).toBe(false);
        expect(wrapper.text()).toContain('No measurements match the filters.');
        expect(wrapper.find('[data-testid="category-filter"]').exists()).toBe(true);
    });

    it('has labelled filters, and none while no measurement has a category or a status', () => {
        const wrapper = mountList();
        expect(wrapper.find('label[for="ml-category-filter"]').text()).toBe('Category');
        expect(wrapper.find('label[for="ml-status-filter"]').text()).toBe('Status');
        expect(mountList({ measurements: [item('Plain')] }).find('.measurement-filters').exists()).toBe(false);
    });

    it('warns of a reference that more than one measurement has, and not otherwise', () => {
        expect(mountList().find('[data-testid="duplicate-refs"]').exists()).toBe(false);
        const wrapper = mountList({ measurements: [item('A', { ref: '4' }), item('B', { ref: '4' }), item('C', { ref: '5' })] });
        expect(wrapper.find('[data-testid="duplicate-refs"]').text()).toBe('Reference 4 is used by more than one measurement.');
        expect(mountList({ measurements: [item('A', { ref: '4' }), item('B', { ref: '4' }), item('C', { ref: '5' }), item('D', { ref: '5' })] })
            .find('[data-testid="duplicate-refs"]').text()).toBe('References 4, 5 are used by more than one measurement.');
    });

    it('warns of a reference that a measurement shares with an annotation of the 3D viewer in the same file', () => {
        expect(mountList({ measurements: [item('A', { ref: '4' })], otherRefs: ['5'] }).find('[data-testid="duplicate-refs"]').exists()).toBe(false);
        expect(mountList({ measurements: [item('A', { ref: '4' })], otherRefs: ['4'] })
            .find('[data-testid="duplicate-refs"]').text()).toBe('Reference 4 is used by more than one measurement.');
        // Two annotations of the 3D viewer with one reference are a duplicate of the file too
        expect(mountList({ measurements: [item('A', { ref: '1' })], otherRefs: ['6', '6'] })
            .find('[data-testid="duplicate-refs"]').text()).toBe('Reference 6 is used by more than one measurement.');
    });

    it('shows the empty message when there is no measurement, not the filters', () => {
        const wrapper = mountList({ measurements: [] });
        expect(wrapper.text()).toContain('No measurements on the map.');
        expect(wrapper.find('.measurement-filters').exists()).toBe(false);
    });
});

describe('MeasurementListDialog selection', () => {
    const GROUPS = [{ id: 'g1', name: 'Piles', color: '#f00', visible: true }, { id: 'g2', name: 'Roads', color: '#0f0', visible: true }];
    const row = (name, extra = {}) => ({ type: 'length', name, value: '1 m', feature: { ol_uid: name, get: () => undefined }, groupId: '', ref: '', ...extra });
    // On screen: Piles (A, B), Roads (C), Ungrouped (D, E)
    const ITEMS = [row('A', { groupId: 'g1', ref: '6' }), row('B', { groupId: 'g1', ref: '7' }), row('C', { groupId: 'g2', type: 'area' }), row('D'), row('E', { type: 'point' })];
    const mountList = props => mount(MeasurementListDialog, { props: { measurements: ITEMS, groups: GROUPS, ...props }, global: GLOBAL, attachTo: document.body });
    const rows = w => w.findAll('.measurement-row');
    const rowOf = (w, name) => rows(w).find(r => r.find('.measurement-name').text() === name);
    const selectedNames = w => rows(w).filter(r => r.classes('measurement-row--selected')).map(r => r.find('.measurement-name').text());
    const lastSelection = w => (w.emitted('selectionChange') || []).at(-1)?.[0].map(m => m.name);
    const tree = w => w.find('[data-testid="measurement-tree"]');

    it('a click selects one row, Ctrl or Cmd adds one, Shift takes the range on screen across groups', async () => {
        const w = mountList();
        await rowOf(w, 'B').trigger('click');
        expect(selectedNames(w)).toEqual(['B']);
        await rowOf(w, 'D').trigger('click', { ctrlKey: true });
        expect(selectedNames(w)).toEqual(['B', 'D']);
        await rowOf(w, 'A').trigger('click', { metaKey: true });
        expect(selectedNames(w)).toEqual(['A', 'B', 'D']);
        await rowOf(w, 'E').trigger('click', { shiftKey: true });
        expect(selectedNames(w)).toEqual(['A', 'B', 'C', 'D', 'E']);
        await rowOf(w, 'C').trigger('click');
        expect(selectedNames(w)).toEqual(['C']);
        expect(lastSelection(w)).toEqual(['C']);
        w.unmount();
    });

    it('a check box toggles its row and keeps the others; a click on a row button does not select', async () => {
        const w = mountList();
        await rowOf(w, 'A').find('[data-testid="measurement-row-check"]').trigger('click');
        await rowOf(w, 'D').find('[data-testid="measurement-row-check"]').trigger('click');
        expect(selectedNames(w)).toEqual(['A', 'D']);
        await rowOf(w, 'A').find('[data-testid="measurement-row-check"]').trigger('click');
        expect(selectedNames(w)).toEqual(['D']);
        await rowOf(w, 'B').find('button[aria-label="Edit"]').trigger('click');
        expect(selectedNames(w)).toEqual(['D']);
        expect(w.emitted('editMeasurement')[0][0].name).toBe('B');
        w.unmount();
    });

    it('a group check box selects its rows, shows a part selected, and clears them when all were', async () => {
        const w = mountList();
        const check = () => w.find('[data-testid="measurement-group-g1"] [data-testid="measurement-group-check"]');
        await rowOf(w, 'A').trigger('click');
        expect(check().element.indeterminate).toBe(true);
        await check().trigger('change');
        expect(selectedNames(w)).toEqual(['A', 'B']);
        expect(check().element.checked).toBe(true);
        expect(check().element.indeterminate).toBe(false);
        await check().trigger('change');
        expect(selectedNames(w)).toEqual([]);
        w.unmount();
    });

    it('Select all takes the rows the filters show, a collapsed group\'s too, and a filter drops the rows it hides', async () => {
        const w = mountList();
        await w.find('[data-testid="type-filter"]').setValue('length');
        await w.find('.group-row .btn-collapse').trigger('click');
        await w.find('[data-testid="measurement-select-all"]').trigger('change');
        expect(lastSelection(w)).toEqual(['A', 'B', 'D']);
        await w.find('[data-testid="type-filter"]').setValue('');
        expect(lastSelection(w)).toEqual(['A', 'B', 'D']);
        expect(w.find('[data-testid="measurement-select-all"]').element.indeterminate).toBe(true);
        await w.find('[data-testid="measurement-search"] input').setValue('B');
        expect(lastSelection(w)).toEqual(['B']);
        w.unmount();
    });

    it('searches by name, or by the whole reference', async () => {
        const w = mountList();
        const names = () => rows(w).map(r => r.find('.measurement-name').text());
        await w.find('[data-testid="measurement-search"] input').setValue('d');
        expect(names()).toEqual(['D']);
        await w.find('[data-testid="measurement-search"] input').setValue('7');
        expect(names()).toEqual(['B']);
        await w.find('[data-testid="measurement-search"] input').setValue('zz');
        expect(w.text()).toContain('No measurements match the filters.');
        w.unmount();
    });

    it('filters by type, with the types the list has', async () => {
        const w = mountList();
        const type = w.find('[data-testid="type-filter"]');
        expect(type.findAll('option').map(o => o.text())).toEqual(['All', 'Length', 'Area', 'Point']);
        await type.setValue('area');
        expect(rows(w).map(r => r.find('.measurement-name').text())).toEqual(['C']);
        w.unmount();
    });

    it('the keyboard: arrows move and select, Shift extends, Space toggles, Ctrl+A selects all, Escape clears, Delete asks', async () => {
        const w = mountList();
        await tree(w).trigger('keydown', { key: 'ArrowDown' });
        expect(selectedNames(w)).toEqual(['A']);
        await tree(w).trigger('keydown', { key: 'ArrowDown', shiftKey: true });
        expect(selectedNames(w)).toEqual(['A', 'B']);
        await tree(w).trigger('keydown', { key: 'End', ctrlKey: true });
        await tree(w).trigger('keydown', { key: ' ' });
        expect(selectedNames(w)).toEqual(['A', 'B', 'E']);
        await tree(w).trigger('keydown', { key: 'Escape' });
        expect(selectedNames(w)).toEqual([]);
        await tree(w).trigger('keydown', { key: 'a', ctrlKey: true });
        expect(selectedNames(w)).toHaveLength(5);
        await tree(w).trigger('keydown', { key: 'Delete' });
        expect(w.vm.pendingDeleteItems.map(m => m.name)).toEqual(['A', 'B', 'C', 'D', 'E']);
        w.vm.handleDeleteConfirm('confirm');
        expect(w.emitted('deleteMeasurements')[0][0].map(m => m.name)).toEqual(['A', 'B', 'C', 'D', 'E']);
        w.unmount();
    });

    it('owns Escape only while something is selected, so the window closes on it otherwise', async () => {
        const w = mountList();
        expect(tree(w).attributes('data-owns-escape')).toBeUndefined();
        await rowOf(w, 'A').trigger('click');
        expect(tree(w).attributes('data-owns-escape')).toBe('');
        w.unmount();
    });

    it('a delete that is cancelled deletes nothing', async () => {
        const w = mountList();
        await rowOf(w, 'A').trigger('click');
        await w.find('[data-testid="measurement-delete-selected"]').trigger('click');
        w.vm.handleDeleteConfirm('cancel');
        expect(w.emitted('deleteMeasurements')).toBeUndefined();
        w.unmount();
    });

    it('the selection bar counts the rows and moves, shows, exports and deletes them', async () => {
        const w = mountList();
        expect(w.find('[data-testid="measurement-selection-bar"]').exists()).toBe(false);
        await rowOf(w, 'B').trigger('click');
        await rowOf(w, 'D').trigger('click', { ctrlKey: true });
        expect(w.find('[data-testid="measurement-selection-count"]').text()).toBe('2 measurements selected');
        await w.find('[data-testid="measurement-move-to"]').trigger('click');
        await w.find('[data-testid="measurement-move-to-g2"]').trigger('click');
        expect(w.emitted('moveMeasurementsToGroup')[0][0].map(m => m.name)).toEqual(['B', 'D']);
        expect(w.emitted('moveMeasurementsToGroup')[0][1]).toBe('g2');
        await w.find('[data-testid="measurement-move-to"]').trigger('click');
        await w.find('[data-testid="measurement-move-to-__ungrouped__"]').trigger('click');
        expect(w.emitted('moveMeasurementsToGroup')[1][1]).toBe('');
        await w.find('[data-testid="measurement-show-on-map"]').trigger('click');
        expect(w.emitted('showOnMap')[0][0].map(m => m.name)).toEqual(['B', 'D']);
        await w.find('[data-testid="measurement-export"]').trigger('click');
        await w.find('[data-testid="measurement-export-csv"]').trigger('click');
        expect(w.emitted('exportMeasurements')[0][1]).toBe('csv');
        await w.find('[data-testid="measurement-selection-clear"]').trigger('click');
        expect(selectedNames(w)).toEqual([]);
        w.unmount();
    });

    it('New group takes the selected rows, or makes an empty group with none', async () => {
        const w = mountList();
        const button = () => w.find('[data-testid="measurement-new-group"]');
        expect(button().text()).toBe('New group');
        await button().trigger('click');
        expect(w.emitted('createGroup')[0][0]).toEqual([]);
        await rowOf(w, 'A').trigger('click');
        await rowOf(w, 'E').trigger('click', { ctrlKey: true });
        expect(button().text()).toBe('New group from 2 measurements');
        await button().trigger('click');
        expect(w.emitted('createGroup')[1][0].map(m => m.name)).toEqual(['A', 'E']);
        w.unmount();
    });

    describe('drag and drop onto a group', () => {
        const transfer = () => {
            const data = {};
            return { data, types: [], effectAllowed: '', dropEffect: '', setData(type, v) { data[type] = v; this.types.push(type); }, setDragImage() {} };
        };
        const block = (w, id) => w.find(`[data-testid="measurement-group-${id}"]`);

        it('a selected row takes the selection; the rows already in the group stay out of the move', async () => {
            const w = mountList();
            await rowOf(w, 'A').trigger('click');
            await rowOf(w, 'C').trigger('click', { ctrlKey: true });
            const dataTransfer = transfer();
            await rowOf(w, 'A').trigger('dragstart', { dataTransfer });
            expect(dataTransfer.types).toEqual(['application/x-ddb-measurements']);
            await block(w, 'g2').trigger('dragover', { dataTransfer });
            expect(block(w, 'g2').classes()).toContain('group-block--drop');
            await block(w, 'g2').trigger('drop', { dataTransfer });
            expect(w.emitted('moveMeasurementsToGroup')).toEqual([[[ITEMS[0]], 'g2']]);
            expect(block(w, 'g2').classes()).not.toContain('group-block--drop');
            w.unmount();
        });

        it('an unselected row goes alone, also out of its group onto Ungrouped', async () => {
            const w = mountList();
            await rowOf(w, 'C').trigger('click');
            const dataTransfer = transfer();
            await rowOf(w, 'B').trigger('dragstart', { dataTransfer });
            await block(w, 'ungrouped').trigger('dragover', { dataTransfer });
            await block(w, 'ungrouped').trigger('drop', { dataTransfer });
            expect(w.emitted('moveMeasurementsToGroup')).toEqual([[[ITEMS[1]], '']]);
            w.unmount();
        });

        it('a drop on the group the rows are in, or of something else (a file), moves nothing', async () => {
            const w = mountList();
            const dataTransfer = transfer();
            await rowOf(w, 'A').trigger('dragstart', { dataTransfer });
            await block(w, 'g1').trigger('drop', { dataTransfer });
            await rowOf(w, 'A').trigger('dragend');
            const files = { types: ['Files'], dropEffect: '' };
            await block(w, 'g2').trigger('dragover', { dataTransfer: files });
            await block(w, 'g2').trigger('drop', { dataTransfer: files });
            expect(w.emitted('moveMeasurementsToGroup')).toBeUndefined();
            expect(block(w, 'g2').classes()).not.toContain('group-block--drop');
            w.unmount();
        });

        it('rows cannot be dragged while there is no group to drop them on', () => {
            const w = mountList({ groups: [], measurements: ITEMS.map(m => ({ ...m, groupId: '' })) });
            expect(w.findAll('[data-testid="measurement-row"]').every(r => r.attributes('draggable') === 'false')).toBe(true);
            w.unmount();
        });
    });
});

describe('MeasurementListDialog order', () => {
    it('lists the numbered annotations by reference, then the others by name, numbers as numbers', () => {
        const m = (name, ref = '') => ({ type: 'point', name, ref, value: '', feature: { ol_uid: name + ref }, groupId: '' });
        const w = mount(MeasurementListDialog, {
            props: { measurements: [m('Marker 10'), m('Crack', '10'), m('Marker 2'), m('Gate', '2'), m('Area')] },
            global: GLOBAL
        });
        expect(w.findAll('.measurement-name').map(n => n.text())).toEqual(['Gate', 'Crack', 'Area', 'Marker 2', 'Marker 10']);
    });
});
