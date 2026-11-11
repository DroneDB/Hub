import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import LoadingSpinner from './LoadingSpinner.vue';
import EmptyState from './EmptyState.vue';

describe('LoadingSpinner', () => {
    it('is a status, named by its label or "Loading"', () => {
        expect(mount(LoadingSpinner).attributes('role')).toBe('status');
        expect(mount(LoadingSpinner).text()).toBe('Loading');
        const inline = mount(LoadingSpinner, { props: { inline: true, label: 'Validating...' } });
        expect(inline.element.tagName).toBe('SPAN');
        expect(inline.text()).toBe('Validating...');
    });
});

describe('EmptyState', () => {
    it('suggests changing the search when filtered, else shows its own hint', () => {
        const slots = { default: '<p>Create one.</p>' };
        expect(mount(EmptyState, { props: { title: 'No users found' }, slots }).text()).toBe('No users foundCreate one.');
        expect(mount(EmptyState, { props: { title: 'No users found', filtered: true }, slots }).text())
            .toBe('No users foundTry adjusting your search criteria.');
    });
});
