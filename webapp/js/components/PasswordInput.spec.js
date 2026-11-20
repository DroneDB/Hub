import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import PasswordInput from './PasswordInput.vue';

let wrapper;
const render = (props = {}, attrs = {}) => {
    wrapper = mount(PasswordInput, { props: { inputId: 'pw', ...props }, attrs, attachTo: document.body, global: { plugins: [PrimeVue] } });
    return wrapper;
};
afterEach(() => { wrapper?.unmount(); });

describe('PasswordInput (FR-ACC-06, FR-ADM-20)', () => {
    it('has a toggle that is a button named "Show password" with aria-pressed false', () => {
        render();
        const toggle = wrapper.find('button.password-toggle');
        expect(toggle.exists()).toBe(true);
        expect(toggle.attributes('type')).toBe('button');
        expect(toggle.attributes('aria-label')).toBe('Show password');
        expect(toggle.attributes('aria-pressed')).toBe('false');
        expect(toggle.attributes('aria-controls')).toBe('pw');
        expect(wrapper.find('input').attributes('type')).toBe('password');
    });

    it('keeps the name when it shows the password, and says the state with aria-pressed', async () => {
        render();
        await wrapper.find('button.password-toggle').trigger('click');
        const toggle = wrapper.find('button.password-toggle');
        expect(toggle.attributes('aria-label')).toBe('Show password');
        expect(toggle.attributes('aria-pressed')).toBe('true');
        expect(wrapper.find('input').attributes('type')).toBe('text');
        await toggle.trigger('click');
        expect(wrapper.find('button.password-toggle').attributes('aria-pressed')).toBe('false');
        expect(wrapper.find('input').attributes('type')).toBe('password');
    });

    it('keeps the keyboard focus on the toggle: it is the same button in both states (FR-ACC-06)', async () => {
        render();
        const toggle = /** @type {HTMLButtonElement} */ (wrapper.find('button.password-toggle').element);
        toggle.focus();
        expect(document.activeElement).toBe(toggle);

        // Space on a focused button is a click on it
        toggle.click();
        await wrapper.vm.$nextTick();
        expect(wrapper.find('input').attributes('type')).toBe('text');
        expect(toggle.isConnected).toBe(true);
        expect(document.activeElement).toBe(toggle);
        expect(toggle.getAttribute('aria-pressed')).toBe('true');
        expect(toggle.querySelector('i')?.className).toBe('fa-solid fa-eye-slash');

        toggle.click();
        await wrapper.vm.$nextTick();
        expect(wrapper.find('input').attributes('type')).toBe('password');
        expect(document.activeElement).toBe(toggle);
        expect(toggle.getAttribute('aria-pressed')).toBe('false');
        expect(toggle.querySelector('i')?.className).toBe('fa-solid fa-eye');
        expect(wrapper.findAll('button.password-toggle')).toHaveLength(1);
    });

    it('is reachable by keyboard: the toggle is a button with no negative tabindex', () => {
        render();
        expect(wrapper.find('button.password-toggle').attributes('tabindex')).toBeUndefined();
    });

    it('fills the width of its field', () => {
        render();
        expect(wrapper.find('.p-password').classes()).toContain('p-password-fluid');
        expect(wrapper.find('input').classes()).toContain('p-inputtext-fluid');
        expect(wrapper.find('.password-input').exists()).toBe(true);
    });

    it('gives the autocomplete value to the input', () => {
        render({ autocomplete: 'new-password' });
        expect(wrapper.find('input').attributes('autocomplete')).toBe('new-password');
        wrapper.unmount();
        render();
        expect(wrapper.find('input').attributes('autocomplete')).toBe('current-password');
    });

    it('shows its error under the field, with aria-invalid and aria-describedby', () => {
        render({ error: 'Enter your password.', describedby: 'hint' });
        const input = wrapper.find('input');
        expect(wrapper.find('#pw-error').text()).toBe('Enter your password.');
        expect(input.attributes('aria-invalid')).toBe('true');
        expect(input.attributes('aria-describedby')).toBe('pw-error hint');
    });

    it('has no error marks without an error', () => {
        render();
        const input = wrapper.find('input');
        expect(wrapper.find('#pw-error').exists()).toBe(false);
        expect(input.attributes('aria-invalid')).toBeUndefined();
        expect(input.attributes('aria-describedby')).toBeUndefined();
    });

    it('takes v-model like the Password it wraps', async () => {
        render({}, { modelValue: 'abc', 'onUpdate:modelValue': () => {} });
        expect(wrapper.find('input').element.value).toBe('abc');
    });
});
