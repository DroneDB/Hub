import { describe, it, expect, afterEach, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import Form from '@primevue/forms/form';
import NewPasswordFields from './NewPasswordFields.vue';
import { createResolver } from '@/libs/forms/resolver';
import { newPasswordProblem, confirmPasswordProblem } from '@/libs/accountProblems';
import { useHubForm } from '@/composables/useHubForm';

const policy = { minLength: 8, requireDigit: true, requireUppercase: true, requireLowercase: false, requireNonAlphanumeric: false };

let wrapper;
let submitted;
// The component as a dialog uses it: inside a Form, with the validators of libs/accountProblems
function mountFields({ withPolicy = policy, autocomplete = undefined } = {}) {
    submitted = vi.fn();
    const Host = {
        components: { Form, NewPasswordFields },
        setup() {
            const resolver = createResolver({
                newPassword: v => newPasswordProblem(v, { policy: withPolicy }),
                confirmPassword: (v, values) => confirmPasswordProblem(v, { newPassword: values.newPassword })
            });
            const form = useHubForm({ fields: ['newPassword', 'confirmPassword'], dependents: { newPassword: ['confirmPassword'] } });
            return { ...form, resolver, policy: withPolicy, submitted, autocomplete };
        },
        template: `<Form ref="formRef" :resolver="resolver" @submit="submit(submitted, $event)">
            <template #default="$form">
                <NewPasswordFields :policy="policy" :new-password="$form.newPassword?.value ?? ''" :autocomplete="autocomplete"
                    :errors="{ newPassword: errorOf($form, 'newPassword'), confirmPassword: errorOf($form, 'confirmPassword') }" />
                <button type="submit">Go</button>
            </template>
        </Form>`
    };
    wrapper = mount(Host, { attachTo: document.body, global: { plugins: [PrimeVue] } });
    return wrapper;
}
const type = async (selector, value) => { await wrapper.find(selector).setValue(value); await flushPromises(); };
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; });

describe('NewPasswordFields (FR-ADM-08, FR-ACC-21)', () => {
    it('lists the requirements from the start, with no verdict yet', async () => {
        mountFields();
        await flushPromises();
        const items = wrapper.findAll('.password-requirements li');
        expect(items.map(i => i.text())).toEqual(['At least 8 characters', 'At least one digit (0-9)', 'At least one uppercase letter (A-Z)']);
        expect(items.every(i => !i.classes().includes('met') && !i.classes().includes('unmet'))).toBe(true);
    });

    it('marks each requirement met or not as the user types', async () => {
        mountFields();
        await type('input[name="newPassword"]', 'Abcdefg');
        const items = wrapper.findAll('.password-requirements li');
        expect(items.map(i => i.classes().includes('met'))).toEqual([false, false, true]);
        expect(items.map(i => i.classes().includes('unmet'))).toEqual([true, true, false]);
        await type('input[name="newPassword"]', 'Abcdefg1');
        expect(wrapper.findAll('.password-requirements li').every(i => i.classes().includes('met'))).toBe(true);
    });

    it('shows no list without a policy', async () => {
        mountFields({ withPolicy: null });
        await flushPromises();
        expect(wrapper.find('.password-requirements').exists()).toBe(false);
    });

    it('shows "Passwords do not match" under the confirmation as soon as both are filled and differ', async () => {
        mountFields({ withPolicy: null });
        await type('input[name="newPassword"]', 'abc');
        await type('input[name="confirmPassword"]', 'abd');
        const confirm = wrapper.find('input[name="confirmPassword"]');
        expect(wrapper.text()).toContain('Passwords do not match');
        expect(confirm.attributes('aria-invalid')).toBe('true');
        const describedBy = confirm.attributes('aria-describedby');
        expect(wrapper.find(`#${describedBy}`).text()).toBe('Passwords do not match');
    });

    it('clears the mismatch when the new password is changed to equal the confirmation', async () => {
        mountFields({ withPolicy: null });
        await type('input[name="newPassword"]', 'abc');
        await type('input[name="confirmPassword"]', 'abd');
        await type('input[name="newPassword"]', 'abd');
        expect(wrapper.text()).not.toContain('Passwords do not match');
    });

    it('does not say anything about the confirmation before the user fills it', async () => {
        mountFields({ withPolicy: null });
        await type('input[name="newPassword"]', 'abc');
        expect(wrapper.text()).not.toContain('Confirm the new password.');
    });

    it('uses new-password autocomplete on both fields', async () => {
        mountFields();
        await flushPromises();
        expect(wrapper.find('input[name="newPassword"]').attributes('autocomplete')).toBe('new-password');
        expect(wrapper.find('input[name="confirmPassword"]').attributes('autocomplete')).toBe('new-password');
    });

    it('takes another autocomplete value for both fields (off, for an admin setting another user\'s password)', async () => {
        mountFields({ autocomplete: 'off' });
        await flushPromises();
        expect(wrapper.find('input[name="newPassword"]').attributes('autocomplete')).toBe('off');
        expect(wrapper.find('input[name="confirmPassword"]').attributes('autocomplete')).toBe('off');
    });

    it('refuses a submit with both fields empty, shows both errors and sends nothing', async () => {
        mountFields();
        await wrapper.find('form').trigger('submit');
        await flushPromises();
        expect(submitted).not.toHaveBeenCalled();
        expect(wrapper.text()).toContain('Enter a new password.');
        expect(wrapper.text()).toContain('Confirm the new password.');
    });
});
