import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import OpacityControl from './OpacityControl.vue';

let wrapper;
const render = props => {
    wrapper = mount(OpacityControl, { props });
    return wrapper;
};
afterEach(() => wrapper?.unmount());

const addButton = () => wrapper.findAll('button').find(b => b.text() === 'Add layer');

describe('OpacityControl add layer', () => {
    it('is not shown unless asked for', () => {
        render({ modelValue: 1 });
        expect(addButton()).toBeUndefined();
    });

    it('emits add', async () => {
        render({ modelValue: 1, canAdd: true });
        expect(addButton().attributes('disabled')).toBeUndefined();
        expect(addButton().find('i').classes()).toContain('fa-plus');
        await addButton().trigger('click');
        expect(wrapper.emitted('add')).toHaveLength(1);
    });

    it('is disabled at the limit and the title says why', async () => {
        render({ modelValue: 1, canAdd: true, addDisabled: true, addTitle: 'At most 3 layers can be added' });
        expect(addButton().attributes('disabled')).toBeDefined();
        expect(addButton().attributes('title')).toBe('At most 3 layers can be added');
        await addButton().trigger('click');
        expect(wrapper.emitted('add')).toBeUndefined();
    });

    it('still sets the opacity', async () => {
        render({ modelValue: 1, canAdd: true });
        await wrapper.find('input[type="range"]').setValue('0.5');
        expect(wrapper.emitted('update:modelValue')).toEqual([[0.5]]);
    });
});
