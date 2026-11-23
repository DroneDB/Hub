/**
 * A new group made of the rows selected in the measurement list says how many it holds; a rename says nothing of it.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import MeasurementGroupDialog from './MeasurementGroupDialog.vue';

const mountWith = props => mount(MeasurementGroupDialog, {
    props,
    global: { stubs: { Window: { template: '<div><slot /></div>' }, ColorSwatchPicker: true } }
});
const holds = w => w.find('[data-testid="measurement-group-holds"]');

describe('MeasurementGroupDialog', () => {
    it('says how many selected measurements a new group holds', () => {
        expect(holds(mountWith({ count: 3 })).text()).toBe('The group holds the 3 selected measurements.');
        expect(holds(mountWith({ count: 1 })).text()).toBe('The group holds the 1 selected measurement.');
    });

    it('says nothing for an empty new group or a rename', () => {
        expect(holds(mountWith({})).exists()).toBe(false);
        expect(holds(mountWith({ count: 2, group: { id: 'g', name: 'A', color: '#000' } })).exists()).toBe(false);
    });
});
