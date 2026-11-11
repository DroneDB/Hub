import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import ViewSelect from './ViewSelect.vue';

const render = (props = {}) => mount(ViewSelect, { props: { modelValue: 'list', ...props }, global: { plugins: [PrimeVue] } });

describe('ViewSelect', () => {
    it('offers the list and the map, and marks the current view', () => {
        const wrapper = render({ modelValue: 'map', label: 'Show as' });
        const buttons = wrapper.findAll('[role="button"], button');
        expect(buttons.map(b => b.text())).toEqual(['List', 'Map']);
        expect(wrapper.attributes('aria-label')).toBe('Show as');
        expect(buttons[1].attributes('aria-pressed')).toBe('true');
        expect(buttons[0].attributes('aria-pressed')).toBe('false');
    });

    it('emits the view that was chosen', async () => {
        const wrapper = render();
        await wrapper.findAll('[role="button"], button')[1].trigger('click');
        expect(wrapper.emitted('update:modelValue')).toEqual([['map']]);
    });

    it('does not let the current view be unchosen', async () => {
        const wrapper = render({ modelValue: 'list' });
        await wrapper.findAll('[role="button"], button')[0].trigger('click');
        expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    });
});
