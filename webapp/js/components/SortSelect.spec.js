import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import SortSelect from './SortSelect.vue';

const options = [{ value: 'name', label: 'Name' }, { value: 'lastModified', label: 'Last modified' }];
let wrapper;
afterEach(() => { wrapper?.unmount(); wrapper = null; });

function render(props = {}) {
    wrapper = mount(SortSelect, {
        props: { column: 'name', direction: 'asc', options, ...props },
        global: { plugins: [PrimeVue] }
    });
    return wrapper;
}
const button = () => wrapper.find('button.sort-select-direction');

describe('SortSelect', () => {
    it('shows the chosen field in a select named for assistive technology', () => {
        render({ column: 'lastModified', label: 'Sort organizations by' });
        expect(wrapper.find('[role="group"]').attributes('aria-label')).toBe('Sort organizations by');
        expect(wrapper.find('.p-select').text()).toContain('Last modified');
    });

    it('tells what the direction button will do, and flips the direction', async () => {
        render({ direction: 'asc' });
        expect(button().attributes('aria-label')).toBe('Sorted ascending: switch to descending');
        expect(button().attributes('title')).toBe('Sorted ascending: switch to descending');
        expect(button().find('.p-button-icon').classes()).toContain('fa-arrow-up-wide-short');
        await button().trigger('click');
        expect(wrapper.emitted('update:direction')).toEqual([['desc']]);
    });

    it('flips a descending sort back to ascending', async () => {
        render({ direction: 'desc' });
        expect(button().attributes('aria-label')).toBe('Sorted descending: switch to ascending');
        expect(button().find('.p-button-icon').classes()).toContain('fa-arrow-down-wide-short');
        await button().trigger('click');
        expect(wrapper.emitted('update:direction')).toEqual([['asc']]);
    });

    it('emits the field the user picks', async () => {
        render();
        wrapper.findComponent({ name: 'Select' }).vm.$emit('update:modelValue', 'lastModified');
        expect(wrapper.emitted('update:column')).toEqual([['lastModified']]);
    });
});
