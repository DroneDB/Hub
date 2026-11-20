/**
 * The one pattern of a disabled action (FR-XC-22): it stays focusable, says why through
 * aria-describedby and its tooltip, and a click does nothing.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import ActionButton from './ActionButton.vue';

const mountButton = props => mount(ActionButton, { props, global: { plugins: [PrimeVue] }, attachTo: document.body });

describe('ActionButton', () => {
    it('runs an enabled action, named by its label, with no description', async () => {
        const w = mountButton({ label: 'Rename', icon: 'fa-solid fa-pencil' });
        const b = w.find('button');
        expect(b.attributes('aria-label')).toBe('Rename');
        expect(b.attributes('title')).toBe('Rename');
        expect(b.attributes('aria-disabled')).toBeUndefined();
        expect(b.attributes('aria-describedby')).toBeUndefined();
        expect(b.attributes('aria-pressed')).toBeUndefined();
        await b.trigger('click');
        expect(w.emitted('click')).toHaveLength(1);
        w.unmount();
    });

    it('keeps a disabled action focusable, gives its reason, and ignores a click', async () => {
        const w = mountButton({ label: 'Rename', icon: 'fa-solid fa-pencil', disabled: true, disabledReason: 'Select one file to rename' });
        const b = w.find('button');
        expect(b.attributes('disabled')).toBeUndefined();
        expect(b.attributes('aria-disabled')).toBe('true');
        expect(b.attributes('title')).toBe('Rename: Select one file to rename');
        const reason = document.getElementById(b.attributes('aria-describedby'));
        expect(reason.textContent).toBe('Select one file to rename');
        expect(reason.classList).toContain('visually-hidden');
        b.element.focus();
        expect(document.activeElement).toBe(b.element);
        await b.trigger('click');
        expect(w.emitted('click')).toBeUndefined();
        w.unmount();
    });

    it('shows its label on request, and the state of a toggle', () => {
        const w = mountButton({ label: 'Grid', icon: 'fa-solid fa-table-cells-large', showLabel: true, pressed: true });
        expect(w.find('button').text()).toBe('Grid');
        expect(w.find('button').attributes('aria-pressed')).toBe('true');
        w.unmount();
    });
});
