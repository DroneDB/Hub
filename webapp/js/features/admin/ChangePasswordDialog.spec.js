/**
 * The admin's Change Password window: it uses the shared password
 * fields (rules, live mismatch), the current password stays optional, errors show at the fields
 * and in the window, never in a toast.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';

const policy = { minLength: 6, requireDigit: true, requireUppercase: false, requireLowercase: false, requireNonAlphanumeric: false };
const changeUserPassword = vi.fn();
const session = vi.hoisted(() => ({ username: 'admin', login: vi.fn() }));
vi.mock('@/libs/api/sharedRegistry', () => ({
    default: {
        admin: { changeUserPassword: (...args) => changeUserPassword(...args) },
        getUsername: () => session.username,
        login: (...args) => session.login(...args),
        features: { value: name => (name === 'passwordPolicy' ? policy : null) }
    }
}));

const { default: ChangePasswordDialog } = await import('./ChangePasswordDialog.vue');
const { ApiError } = await import('@/libs/ddb/apiError');

const WindowStub = {
    props: ['busy', 'confirmLabel'],
    emits: ['confirm', 'close'],
    template: '<div :data-busy="busy"><slot /><button type="button" data-confirm :disabled="busy" @click="$emit(\'confirm\')">{{ confirmLabel }}</button></div>'
};
const notify = { success: vi.fn(), error: vi.fn(), warn: vi.fn() };

let wrapper;
async function render(userName = 'bob') {
    wrapper = mount(ChangePasswordDialog, {
        props: { user: { userName } },
        attachTo: document.body,
        global: { plugins: [PrimeVue], stubs: { Window: WindowStub }, mocks: { $notify: notify } }
    });
    await flushPromises();
}
const type = async (name, value) => { await wrapper.find(`input[name="${name}"]`).setValue(value); await flushPromises(); };
const confirm = async () => { await wrapper.find('[data-confirm]').trigger('click'); await flushPromises(); };
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; changeUserPassword.mockReset(); session.login.mockReset(); session.username = 'admin'; notify.success.mockReset(); notify.error.mockReset(); notify.warn.mockReset(); });

describe('admin ChangePasswordDialog', () => {
    it('lists the password requirements and the three fields fill the width, each with a toggle', async () => {
        await render();
        expect(wrapper.findAll('.password-requirements li').map(i => i.text())).toEqual(['At least 6 characters', 'At least one digit (0-9)']);
        expect(wrapper.findAll('.p-password-fluid')).toHaveLength(3);
        expect(wrapper.findAll('button.password-toggle')).toHaveLength(3);
    });

    it('turns autocomplete off on the three fields: the passwords are not the admin\'s own', async () => {
        await render();
        expect(wrapper.find('input[name="currentPassword"]').attributes('autocomplete')).toBe('off');
        expect(wrapper.find('input[name="newPassword"]').attributes('autocomplete')).toBe('off');
        expect(wrapper.find('input[name="confirmPassword"]').attributes('autocomplete')).toBe('off');
    });

    it('shows the mismatch under the confirmation and sends nothing', async () => {
        await render();
        await type('newPassword', 'abc123');
        await type('confirmPassword', 'abc124');
        expect(wrapper.find('#change-password-dialog-confirm-error').text()).toBe('Passwords do not match');
        await confirm();
        expect(changeUserPassword).not.toHaveBeenCalled();
    });

    it('changes the password without a current one (admin override) and closes', async () => {
        await render();
        await type('newPassword', 'abc123');
        await type('confirmPassword', 'abc123');
        await confirm();
        expect(changeUserPassword).toHaveBeenCalledWith('bob', null, 'abc123');
        expect(notify.success).toHaveBeenCalledTimes(1);
        expect(wrapper.emitted('close')[0]).toEqual(['updated']);
    });

    it('shows an errors.currentPassword answer at the current-password field, once, with no toast', async () => {
        changeUserPassword.mockRejectedValue(new ApiError('x', 400, { errors: { currentPassword: ['The current password is incorrect.'] } }));
        await render();
        await type('currentPassword', 'wrong1');
        await type('newPassword', 'abc123');
        await type('confirmPassword', 'abc123');
        await confirm();
        expect(wrapper.find('#change-password-dialog-current-password-error').text()).toBe('The current password is incorrect.');
        expect(wrapper.text().split('The current password is incorrect.')).toHaveLength(2);
        expect(notify.error).not.toHaveBeenCalled();
        expect(wrapper.emitted('close')).toBeUndefined();
    });

    it('shows an error without a field in the window, not in a toast', async () => {
        changeUserPassword.mockRejectedValue(new ApiError('Server Error', 500));
        await render();
        await type('newPassword', 'abc123');
        await type('confirmPassword', 'abc123');
        await confirm();
        expect(wrapper.find('.form-error').text()).toBe('Server Error');
        expect(notify.error).not.toHaveBeenCalled();
    });

    it('leaves the session of another user alone: nobody signs in again', async () => {
        await render('bob');
        await type('newPassword', 'abc123');
        await type('confirmPassword', 'abc123');
        await confirm();
        expect(session.login).not.toHaveBeenCalled();
    });

    it('signs the admin in again with the new password after changing their own, so the session keeps working', async () => {
        session.username = 'Admin';
        await render('admin');
        await type('newPassword', 'abc123');
        await type('confirmPassword', 'abc123');
        await confirm();
        expect(changeUserPassword).toHaveBeenCalledWith('admin', null, 'abc123');
        expect(session.login).toHaveBeenCalledWith('admin', 'abc123');
        expect(changeUserPassword.mock.invocationCallOrder[0]).toBeLessThan(session.login.mock.invocationCallOrder[0]);
        expect(wrapper.emitted('close')[0]).toEqual(['updated']);
    });

    it('does not sign in again when the change was refused', async () => {
        session.username = 'admin';
        changeUserPassword.mockRejectedValue(new ApiError('Server Error', 500));
        await render('admin');
        await type('newPassword', 'abc123');
        await type('confirmPassword', 'abc123');
        await confirm();
        expect(session.login).not.toHaveBeenCalled();
    });

    it('says so when the sign-in with the new password fails, the password being changed already', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        session.username = 'admin';
        session.login.mockRejectedValue(new Error('Cannot login'));
        await render('admin');
        await type('newPassword', 'abc123');
        await type('confirmPassword', 'abc123');
        await confirm();
        expect(notify.warn).toHaveBeenCalledTimes(1);
        expect(wrapper.emitted('close')[0]).toEqual(['updated']);
    });
});

