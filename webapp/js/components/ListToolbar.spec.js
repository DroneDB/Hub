import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import ListToolbar from './ListToolbar.vue';

const render = (props = {}, slots = {}) => mount(ListToolbar, { props, slots, global: { plugins: [PrimeVue] } });

describe('ListToolbar', () => {
    it('has a small search field named by its label, bound to the search', async () => {
        const wrapper = render({ search: 'quarry', searchLabel: 'Search datasets', 'onUpdate:search': v => wrapper.setProps({ search: v }) });
        const input = wrapper.find('.list-toolbar-start input');
        expect(input.attributes('aria-label')).toBe('Search datasets');
        expect(input.attributes('placeholder')).toBe('Search datasets');
        expect(input.classes()).toContain('p-inputtext-sm');
        expect(input.element.value).toBe('quarry');
        await input.setValue('pile');
        expect(wrapper.props('search')).toBe('pile');
    });

    it('has no search field without a label', () => {
        expect(render().find('input').exists()).toBe(false);
    });

    it('puts the filters after the search and the view controls at the end', () => {
        const wrapper = render({ searchLabel: 'Search' }, { start: '<span class="filter" />', end: '<span class="view" />' });
        expect(wrapper.find('.list-toolbar-start .filter').exists()).toBe(true);
        expect(wrapper.find('.list-toolbar-end .view').exists()).toBe(true);
    });

    it('uses the shared SearchField: a Clear search button while it has text, and Escape empties it (FR-ORG-18)', async () => {
        const wrapper = render({ search: 'quarry', searchLabel: 'Search datasets', 'onUpdate:search': v => wrapper.setProps({ search: v }) });
        expect(wrapper.findComponent({ name: 'SearchField' }).exists()).toBe(true);
        expect(wrapper.find('button[aria-label="Clear search"]').exists()).toBe(true);
        await wrapper.find('input').trigger('keydown', { key: 'Escape' });
        expect(wrapper.props('search')).toBe('');
        expect(wrapper.find('button[aria-label="Clear search"]').exists()).toBe(false);
    });
});
