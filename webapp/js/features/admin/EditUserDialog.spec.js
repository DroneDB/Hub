/**
 * The Edit User window (FR-ADM-07, FR-ADM-22, FR-XC-11): the e-mail is optional and checked by the
 * shared `emailProblem` at the field, an empty e-mail is sent as it is, a submit that stays enabled
 * shows the errors at the fields, and a refused request shows once, at its field or in the window
 * (never in a toast as well).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import PrimeMessage from 'primevue/message';

const updateUser = vi.fn();
vi.mock('@/libs/api/sharedRegistry', () => ({
    default: {
        admin: { updateUser: (...args) => updateUser(...args) },
        features: { value: name => (name === 'systemRoles' ? ['admin', 'deactivated'] : null) }
    }
}));

const { default: EditUserDialog } = await import('./EditUserDialog.vue');
const { ApiError } = await import('@/libs/ddb/apiError');

const WindowStub = {
    props: ['busy', 'confirmLabel', 'confirmDisabled'],
    emits: ['confirm', 'close'],
    template: '<div :data-busy="busy"><slot /><button type="button" data-confirm :disabled="confirmDisabled || busy" @click="$emit(\'confirm\')">{{ confirmLabel }}</button></div>'
};
const notify = { success: vi.fn(), error: vi.fn() };

let wrapper;
async function render(user = { userName: 'bob', email: 'bob@example.com', roles: ['editor', 'deactivated'] }) {
    wrapper = mount(EditUserDialog, {
        props: { user, availableRoles: ['admin', 'deactivated', 'editor', 'viewer'] },
        attachTo: document.body,
        global: { plugins: [PrimeVue], stubs: { Window: WindowStub }, mocks: { $notify: notify } }
    });
    await flushPromises();
}
const type = async (name, value) => { await wrapper.find(`input[name="${name}"]`).setValue(value); await flushPromises(); };
const confirm = async () => { await wrapper.find('[data-confirm]').trigger('click'); await flushPromises(); };
const emailError = () => wrapper.find('#edit-user-dialog-email-error');
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; updateUser.mockReset(); notify.success.mockReset(); notify.error.mockReset(); });

describe('EditUserDialog', () => {
    it('fills the form with the user, and keeps Update User enabled', async () => {
        await render();
        expect(wrapper.find('#edit-user-dialog-username').element.value).toBe('bob');
        expect(wrapper.find('input[name="email"]').element.value).toBe('bob@example.com');
        expect(wrapper.find('[data-confirm]').attributes('disabled')).toBeUndefined();
        expect(wrapper.find('#edit-user-dialog-email-help').text()).toBe('Optional. Leave it empty for a user without an address.');
    });

    it('sends an empty e-mail as it is: the address is optional', async () => {
        updateUser.mockResolvedValue(true);
        await render();
        await type('email', '');
        expect(emailError().exists()).toBe(false);
        await confirm();
        expect(updateUser).toHaveBeenCalledTimes(1);
        expect(updateUser).toHaveBeenCalledWith('bob', '', ['editor']);
        expect(notify.success).toHaveBeenCalledWith('User "bob" updated successfully', { summary: 'User Updated' });
        expect(wrapper.emitted('close')[0]).toEqual(['updated']);
    });

    it('leaves the e-mail out of the request when it was not changed: the Registry keeps it (FR-ADM-07)', async () => {
        updateUser.mockResolvedValue(true);
        await render();
        await type('email', ' bob@example.com ');
        await confirm();
        expect(updateUser).toHaveBeenCalledWith('bob', undefined, ['editor']);
    });

    it('leaves the e-mail out for a user without an address that is still empty, and sends the one that is typed', async () => {
        updateUser.mockResolvedValue(true);
        await render({ userName: 'amy', email: null, roles: ['viewer'] });
        await confirm();
        expect(updateUser).toHaveBeenLastCalledWith('amy', undefined, ['viewer']);
    });

    it('sends a user without an address and with no change of it, trimmed', async () => {
        updateUser.mockResolvedValue(true);
        await render({ userName: 'amy', email: null, roles: ['viewer'] });
        expect(wrapper.find('input[name="email"]').element.value).toBe('');
        await type('email', ' amy@example.com ');
        await confirm();
        expect(updateUser).toHaveBeenCalledWith('amy', 'amy@example.com', ['viewer']);
    });

    it('shows the rule text of an e-mail the server would refuse at the field, and sends nothing', async () => {
        await render();
        await type('email', 'not an email');
        expect(emailError().text()).toBe('The e-mail address is not valid: enter one address, such as name@example.com');
        expect(wrapper.find('input[name="email"]').attributes('aria-invalid')).toBe('true');
        await confirm();
        expect(updateUser).not.toHaveBeenCalled();
        expect(document.activeElement).toBe(wrapper.find('input[name="email"]').element);
    });

    // FR-ADM-22: one error, at its field or in the window, never in a toast as well
    it('shows an error of the Registry that names the e-mail at the e-mail field, once, with no toast', async () => {
        updateUser.mockRejectedValue(new ApiError('x', 400, { errors: { email: ['The e-mail address is not valid: enter one address, such as name@example.com'] } }));
        await render();
        await confirm();
        expect(wrapper.findAll('.field-error')).toHaveLength(1);
        expect(emailError().text()).toContain('The e-mail address is not valid');
        expect(wrapper.find('.form-error').exists()).toBe(false);
        expect(notify.error).not.toHaveBeenCalled();
        expect(wrapper.emitted('close')).toBeUndefined();
    });

    it('shows any other error once, in the window, styled as an error, with no toast', async () => {
        updateUser.mockRejectedValue(new ApiError('Cannot remove admin role from admin user', 400));
        await render();
        await confirm();
        const messages = wrapper.findAll('.form-error');
        expect(messages).toHaveLength(1);
        expect(messages[0].text()).toBe('Cannot remove admin role from admin user');
        expect(wrapper.findComponent(PrimeMessage).props('severity')).toBe('error');
        expect(wrapper.findAll('.field-error')).toHaveLength(0);
        expect(notify.error).not.toHaveBeenCalled();
    });

    it('clears the error when the form is edited', async () => {
        updateUser.mockRejectedValue(new ApiError('Cannot remove admin role from admin user', 400));
        await render();
        await confirm();
        expect(wrapper.find('.form-error').exists()).toBe(true);
        await type('email', 'bob2@example.com');
        expect(wrapper.find('.form-error').exists()).toBe(false);
    });
});
