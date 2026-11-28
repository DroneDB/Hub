import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import RowActionSlot from './RowActionSlot.vue';

const render = shown => mount(RowActionSlot, { props: { shown }, slots: { default: '<button>Edit</button>' } });

describe('RowActionSlot', () => {
    it('shows the button of an action that applies to the row', () => {
        const wrapper = render(true);
        expect(wrapper.find('button').exists()).toBe(true);
        expect(wrapper.find('.row-action-placeholder').exists()).toBe(false);
    });

    it('keeps an empty place, hidden from assistive technology, where the action does not apply', () => {
        const wrapper = render(false);
        expect(wrapper.find('button').exists()).toBe(false);
        expect(wrapper.find('.row-action-placeholder').attributes('aria-hidden')).toBe('true');
    });
});
