/**
 * EmptyState (FR-XC-20, FR-ORG-13): the one empty list. A search says what it found nothing for and
 * has Clear search; a filter has its own button; an empty list has its hint and the `#actions` buttons.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import EmptyState from './EmptyState.vue';

const render = (props, slots = {}) => mount(EmptyState, { props, slots, global: { plugins: [PrimeVue] } });

describe('EmptyState', () => {
    it('names the query of a search and offers to clear it', async () => {
        const w = render({ title: 'No datasets found', items: 'datasets', query: 'nomatchxyz' });
        expect(w.find('h3').text()).toBe('No datasets match "nomatchxyz"');
        expect(w.text()).toContain('Try adjusting your search criteria.');
        const button = w.find('button');
        expect(button.text()).toBe('Clear search');
        await button.trigger('click');
        expect(w.emitted('clear')).toHaveLength(1);
    });

    it('shows the title and the hint of a list that is empty, with its action buttons', () => {
        const w = render({ title: 'No datasets found' }, { default: '<p class="hint">Create one.</p>', actions: '<button class="create">Create dataset</button>' });
        expect(w.find('h3').text()).toBe('No datasets found');
        expect(w.find('.hint').text()).toBe('Create one.');
        expect(w.findAll('.empty-state-actions .create')).toHaveLength(1);
        expect(w.text()).not.toContain('Clear search');
    });

    it('does not show the action buttons beside Clear search: a search that found nothing is not an empty list', () => {
        const w = render({ title: 'No datasets found', query: 'pile' }, { default: '<p class="hint">Create one.</p>', actions: '<button class="create">Create dataset</button>' });
        expect(w.find('.create').exists()).toBe(false);
        expect(w.find('.hint').exists()).toBe(false);
    });

    it('has the button of a filter without text only when it is given a label', async () => {
        expect(render({ title: 'No tasks found', filtered: true }).find('button').exists()).toBe(false);
        const w = render({ title: 'No tasks found', filtered: true, clearLabel: 'Clear filters' });
        expect(w.text()).toContain('Try adjusting your search criteria.');
        await w.find('button').trigger('click');
        expect(w.find('button').text()).toBe('Clear filters');
        expect(w.emitted('clear')).toHaveLength(1);
    });

    it('says "items" when it is not told what the list holds', () => {
        expect(render({ query: 'x' }).find('h3').text()).toBe('No items match "x"');
    });
});
