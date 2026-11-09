/**
 * Change Password of the account page (FR-ACC-21, FR-ADM-08, FR-ACC-06, FR-ACC-07, FR-XC-11):
 * the requirements are visible from the start, the mismatch shows live, the same password is
 * refused, a submit with invalid input stays enabled and shows the errors at the fields, and a
 * refusal of the Registry shows at its field from the `errors` member.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';

const policy = { minLength: 8, requireDigit: true, requireUppercase: true, requireLowercase: true, requireNonAlphanumeric: false };
const changePwd = vi.fn();
vi.mock('@/libs/api/sharedRegistry', () => ({
    default: {
        changePwd: (...args) => changePwd(...args),
        features: { value: name => (name === 'passwordPolicy' ? policy : null) }
    }
}));

const { default: ChangePwdDialog } = await import('./ChangePwdDialog.vue');
const { ApiError } = await import('@/libs/ddb/apiError');

const WindowStub = {
    props: ['busy', 'confirmLabel', 'confirmDisabled'],
    emits: ['confirm', 'close'],
    template: '<div class="window" :data-busy="busy"><slot /><button type="button" data-confirm :disabled="busy || confirmDisabled" @click="$emit(\'confirm\')">{{ confirmLabel }}</button></div>'
};

let wrapper;
async function render() {
    wrapper = mount(ChangePwdDialog, { attachTo: document.body, global: { plugins: [PrimeVue], stubs: { Window: WindowStub } } });
    await flushPromises();
}
const type = async (name, value) => { await wrapper.find(`input[name="${name}"]`).setValue(value); await flushPromises(); };
const confirm = async () => { await wrapper.find('[data-confirm]').trigger('click'); await flushPromises(); };
const fillValid = async () => {
    await type('oldPassword', 'OldPass123');
    await type('newPassword', 'NewPass123');
    await type('confirmPassword', 'NewPass123');
};
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; changePwd.mockReset(); vi.useRealTimers(); });

describe('ChangePwdDialog', () => {
    it('shows the password rules and the autocomplete values from the start', async () => {
        await render();
        expect(wrapper.findAll('.password-requirements li').map(i => i.text())).toEqual([
            'At least 8 characters', 'At least one digit (0-9)', 'At least one uppercase letter (A-Z)', 'At least one lowercase letter (a-z)'
        ]);
        expect(wrapper.find('input[name="oldPassword"]').attributes('autocomplete')).toBe('current-password');
        expect(wrapper.find('input[name="newPassword"]').attributes('autocomplete')).toBe('new-password');
        expect(wrapper.find('input[name="confirmPassword"]').attributes('autocomplete')).toBe('new-password');
    });

    it('has three keyboard-reachable show-password toggles named "Show password"', async () => {
        await render();
        const toggles = wrapper.findAll('button.password-toggle');
        expect(toggles).toHaveLength(3);
        expect(toggles.every(t => t.attributes('aria-label') === 'Show password')).toBe(true);
    });

    it('keeps the confirm button enabled with an empty form, and shows every error at its field with no request', async () => {
        await render();
        expect(wrapper.find('[data-confirm]').attributes('disabled')).toBeUndefined();
        await confirm();
        expect(changePwd).not.toHaveBeenCalled();
        expect(wrapper.find('#change-pwd-dialog-old-password-error').text()).toBe('Enter the current password.');
        expect(wrapper.find('#change-pwd-dialog-new-error').text()).toBe('Enter a new password.');
        expect(wrapper.find('#change-pwd-dialog-confirm-error').text()).toBe('Confirm the new password.');
        expect(document.activeElement).toBe(wrapper.find('input[name="oldPassword"]').element);
    });

    it('shows the mismatch live under the confirmation, and a submit with it sends nothing', async () => {
        await render();
        await type('oldPassword', 'OldPass123');
        await type('newPassword', 'NewPass123');
        await type('confirmPassword', 'NewPass124');
        expect(wrapper.find('#change-pwd-dialog-confirm-error').text()).toBe('Passwords do not match');
        await confirm();
        expect(changePwd).not.toHaveBeenCalled();
    });

    it('refuses a new password equal to the old one', async () => {
        await render();
        await type('oldPassword', 'SamePass123');
        await type('newPassword', 'SamePass123');
        await type('confirmPassword', 'SamePass123');
        expect(wrapper.find('#change-pwd-dialog-new-error').text()).toBe('The new password must be different from the current one.');
        await confirm();
        expect(changePwd).not.toHaveBeenCalled();
    });

    it('refuses a new password that does not meet the policy', async () => {
        await render();
        await type('oldPassword', 'OldPass123');
        await type('newPassword', 'short');
        await type('confirmPassword', 'short');
        await confirm();
        expect(changePwd).not.toHaveBeenCalled();
        expect(wrapper.find('#change-pwd-dialog-new-error').text()).toBe('The password does not meet the requirements listed below.');
    });

    it('sends the change once, with the busy flag set, and shows the success', async () => {
        vi.useFakeTimers();
        let resolve;
        changePwd.mockReturnValue(new Promise(r => { resolve = r; }));
        await render();
        await fillValid();
        await confirm();
        await confirm();
        expect(changePwd).toHaveBeenCalledTimes(1);
        expect(changePwd).toHaveBeenCalledWith('OldPass123', 'NewPass123');
        expect(wrapper.find('.window').attributes('data-busy')).toBe('true');
        resolve();
        await flushPromises();
        expect(wrapper.text()).toContain('Password changed successfully!');
        expect(wrapper.find('.window').attributes('data-busy')).toBe('true');
        vi.advanceTimersByTime(2500);
        expect(wrapper.emitted('close')).toHaveLength(1);
    });

    it('keeps the fields read-only after the success, and Enter before the window closes sends nothing more (FR-XC-11)', async () => {
        vi.useFakeTimers();
        changePwd.mockResolvedValue(true);
        await render();
        await fillValid();
        await confirm();
        expect(changePwd).toHaveBeenCalledTimes(1);
        expect(wrapper.text()).toContain('Password changed successfully!');
        for (const name of ['oldPassword', 'newPassword', 'confirmPassword']) {
            expect(wrapper.find(`input[name="${name}"]`).attributes('readonly')).toBeDefined();
        }
        // Enter in a field submits the form
        await wrapper.find('form').trigger('submit');
        await flushPromises();
        await confirm();
        expect(changePwd).toHaveBeenCalledTimes(1);
        vi.advanceTimersByTime(2500);
        expect(wrapper.emitted('close')).toHaveLength(1);
    });

    it('shows a wrong current password at its field, from errors.currentPassword, and keeps the dialog open', async () => {
        changePwd.mockRejectedValue(new ApiError('One or more validation errors occurred.', 400, {
            errors: { currentPassword: ['The current password is incorrect.'] }
        }));
        await render();
        await fillValid();
        await confirm();
        expect(wrapper.find('#change-pwd-dialog-old-password-error').text()).toBe('The current password is incorrect.');
        expect(wrapper.find('input[name="oldPassword"]').attributes('aria-invalid')).toBe('true');
        expect(wrapper.find('.form-error').exists()).toBe(false);
        expect(wrapper.emitted('close')).toBeUndefined();
        expect(wrapper.find('.window').attributes('data-busy')).toBe('false');
        // Typing in the field clears it
        await type('oldPassword', 'OldPass1234');
        expect(wrapper.find('#change-pwd-dialog-old-password-error').exists()).toBe(false);
    });

    it('shows the policy refusal under the new password, from errors.newPassword', async () => {
        changePwd.mockRejectedValue(new ApiError('x', 400, { errors: { newPassword: ['Passwords must have at least one non alphanumeric character.'] } }));
        await render();
        await fillValid();
        await confirm();
        expect(wrapper.find('#change-pwd-dialog-new-error').text()).toBe('Passwords must have at least one non alphanumeric character.');
    });

    it('does not map an error to a field by its text: one with no field goes to the form message', async () => {
        changePwd.mockRejectedValue(new ApiError('Cannot change user password: PasswordMismatch - Incorrect password.', 400));
        await render();
        await fillValid();
        await confirm();
        expect(wrapper.find('#change-pwd-dialog-old-password-error').exists()).toBe(false);
        expect(wrapper.find('.form-error').text()).toBe('Cannot change user password: PasswordMismatch - Incorrect password.');
    });
});
