/**
 * SearchField (FR-XC-20, FR-ORG-18, FR-EXP-31): the one search box. A 'Clear search' button while it
 * has text, Escape empties it, and the dialog around it keeps the key only while there is something to clear.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import SearchField from './SearchField.vue';

const render = (props = {}) => {
    const wrapper = mount(SearchField, {
        props: { label: 'Search users', modelValue: '', 'onUpdate:modelValue': v => wrapper.setProps({ modelValue: v }), ...props },
        attachTo: document.body,
        global: { plugins: [PrimeVue] }
    });
    return wrapper;
};
const clearButton = w => w.find('button[aria-label="Clear search"]');
const escape = () => new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });

describe('SearchField', () => {
    it('is named and placed by its label', () => {
        const w = render();
        const input = w.find('input');
        expect(input.attributes('aria-label')).toBe('Search users');
        expect(input.attributes('placeholder')).toBe('Search users');
        expect(w.find('.fa-magnifying-glass').exists()).toBe(true);
        w.unmount();
    });

    it('can have a placeholder other than its label', () => {
        const w = render({ placeholder: 'Search' });
        expect(w.find('input').attributes('placeholder')).toBe('Search');
        expect(w.find('input').attributes('aria-label')).toBe('Search users');
        w.unmount();
    });

    it('shows the Clear search button only while the field has text', async () => {
        const w = render();
        expect(clearButton(w).exists()).toBe(false);
        await w.find('input').setValue('pile');
        expect(clearButton(w).exists()).toBe(true);
        w.unmount();
    });

    it('empties the field, tells the page and keeps the focus in the field when the button is clicked', async () => {
        const w = render({ modelValue: 'pile' });
        await clearButton(w).trigger('click');
        expect(w.props('modelValue')).toBe('');
        expect(w.emitted('clear')).toHaveLength(1);
        expect(clearButton(w).exists()).toBe(false);
        expect(document.activeElement).toBe(w.find('input').element);
        w.unmount();
    });

    it('is emptied by Escape, which nothing around the field takes as well', async () => {
        const w = render({ modelValue: 'pile' });
        const input = w.find('input').element;
        const seen = [];
        const onKey = e => seen.push(e.key);
        document.addEventListener('keydown', onKey);
        const key = escape();
        input.dispatchEvent(key);
        await w.vm.$nextTick();
        expect(w.props('modelValue')).toBe('');
        expect(w.emitted('clear')).toHaveLength(1);
        expect(key.defaultPrevented).toBe(true);
        expect(seen).toEqual([]);
        document.removeEventListener('keydown', onKey);
        w.unmount();
    });

    it('is emptied by Escape on its Clear search button too, the focus going back to the field', async () => {
        const w = render({ modelValue: 'pile' });
        const button = clearButton(w).element;
        button.focus();
        const seen = [];
        const onKey = e => seen.push(e.key);
        document.addEventListener('keydown', onKey);
        const key = escape();
        button.dispatchEvent(key);
        await w.vm.$nextTick();
        expect(w.props('modelValue')).toBe('');
        expect(w.emitted('clear')).toHaveLength(1);
        expect(key.defaultPrevented).toBe(true);
        expect(seen).toEqual([]);
        expect(clearButton(w).exists()).toBe(false);
        expect(document.activeElement).toBe(w.find('input').element);
        document.removeEventListener('keydown', onKey);
        w.unmount();
    });

    it('puts the focus in the field with focus()', () => {
        const w = render();
        w.vm.focus();
        expect(document.activeElement).toBe(w.find('input').element);
        w.unmount();
    });

    it('leaves Escape to the dialog around it when it is empty', async () => {
        const w = render();
        const key = escape();
        w.find('input').element.dispatchEvent(key);
        expect(key.defaultPrevented).toBe(false);
        expect(w.emitted('clear')).toBeUndefined();
        w.unmount();
    });

    it('owns Escape (useOverlay data-owns-escape) only while it has text to clear', async () => {
        const w = render();
        expect(w.attributes('data-owns-escape')).toBeUndefined();
        await w.find('input').setValue('pile');
        expect(w.attributes('data-owns-escape')).toBe('');
        w.unmount();
    });

    it('says when Enter is pressed', async () => {
        const w = render({ modelValue: 'pile' });
        await w.find('input').trigger('keyup', { key: 'Enter' });
        expect(w.emitted('enter')).toEqual([['pile']]);
        w.unmount();
    });
});
