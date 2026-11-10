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
const setUserQuota = vi.fn();
const limiter = { on: true };
vi.mock('@/libs/api/sharedRegistry', () => ({
    default: {
        admin: { updateUser: (...args) => updateUser(...args), setUserQuota: (...args) => setUserQuota(...args) },
        features: {
            value: name => (name === 'systemRoles' ? ['admin', 'deactivated'] : null),
            get: name => (name === 'storageLimiter' ? limiter.on : false)
        }
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
const quotaInput = () => wrapper.find('#edit-user-dialog-quota');
const emailError = () => wrapper.find('#edit-user-dialog-email-error');
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; limiter.on = true; setUserQuota.mockReset(); updateUser.mockReset(); notify.success.mockReset(); notify.error.mockReset(); });

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

// FR-ADM-16: the storage quota of a user, in MB, sent alone and only when it changed
describe('EditUserDialog storage quota', () => {
    const MB = 1024 * 1024;
    const bob = (extra = {}) => ({ userName: 'bob', email: 'bob@example.com', roles: ['editor'], storageQuota: 40 * MB, storageUsed: 3 * MB, ...extra });

    it('shows the quota in MB, with its label and how much is used', async () => {
        await render(bob());
        expect(wrapper.find('label[for="edit-user-dialog-quota"]').text()).toBe('Storage quota (MB, empty = unlimited)');
        expect(quotaInput().element.value).toBe('40');
        expect(wrapper.find('#edit-user-dialog-quota-help').text()).toContain('3 MB used now');
        expect(quotaInput().attributes('aria-describedby')).toBe('edit-user-dialog-quota-help');
    });

    it('shows an empty field (Unlimited) for a user without a quota', async () => {
        await render(bob({ storageQuota: null }));
        expect(quotaInput().element.value).toBe('');
        expect(quotaInput().attributes('placeholder')).toBe('Unlimited');
    });

    it('sets the quota with a call that carries only the quota, after the profile', async () => {
        updateUser.mockResolvedValue(true);
        setUserQuota.mockResolvedValue({});
        await render(bob({ storageQuota: null }));
        await quotaInput().setValue('64');
        await quotaInput().trigger('blur');
        await confirm();
        expect(setUserQuota).toHaveBeenCalledTimes(1);
        expect(setUserQuota).toHaveBeenCalledWith('bob', 64);
        expect(wrapper.emitted('close')[0]).toEqual(['updated']);
    });

    it('removes the quota when the field is emptied (null)', async () => {
        updateUser.mockResolvedValue(true);
        setUserQuota.mockResolvedValue({});
        await render(bob());
        // The user selects the number and deletes it; the field takes the empty text when it loses the focus
        quotaInput().element.value = '';
        await quotaInput().trigger('blur');
        await confirm();
        expect(setUserQuota).toHaveBeenCalledWith('bob', null);
    });

    it('sends no quota call when the quota is as it was', async () => {
        updateUser.mockResolvedValue(true);
        await render(bob());
        await confirm();
        expect(updateUser).toHaveBeenCalledTimes(1);
        expect(setUserQuota).not.toHaveBeenCalled();
    });

    it('shows the field off, with the reason, when the storage limiter is off, and sends no quota', async () => {
        limiter.on = false;
        updateUser.mockResolvedValue(true);
        await render(bob());
        expect(quotaInput().attributes('disabled')).toBeDefined();
        expect(wrapper.find('#edit-user-dialog-quota-help').text()).toBe('Storage limiter is off on this server');
        await confirm();
        expect(setUserQuota).not.toHaveBeenCalled();
    });

    it('with the limiter off, still removes a stored quota, with a call that carries a null quota', async () => {
        limiter.on = false;
        updateUser.mockResolvedValue(true);
        setUserQuota.mockResolvedValue({});
        await render(bob());
        expect(wrapper.find('.stale-quota').text()).toContain('A quota of 40 MB is stored but not applied.');
        expect(quotaInput().element.value).toBe('');
        await wrapper.find('.stale-quota button').trigger('click');
        await flushPromises();
        expect(wrapper.find('.stale-quota').text()).toBe('The stored quota is removed when you update the user.');
        await confirm();
        expect(setUserQuota).toHaveBeenCalledTimes(1);
        expect(setUserQuota).toHaveBeenCalledWith('bob', null);
    });

    it('with the limiter off and no stored quota, offers no removal', async () => {
        limiter.on = false;
        await render(bob({ storageQuota: null }));
        expect(wrapper.find('.stale-quota').exists()).toBe(false);
    });

    it('with the limiter on, offers no separate removal (the field is emptied)', async () => {
        await render(bob());
        expect(wrapper.find('.stale-quota').exists()).toBe(false);
    });

    it('shows a refusal of the quota once, in the window', async () => {
        updateUser.mockResolvedValue(true);
        setUserQuota.mockRejectedValue(new ApiError('Cannot set the quota', 400));
        await render(bob());
        await quotaInput().setValue('10');
        await quotaInput().trigger('blur');
        await confirm();
        expect(wrapper.findAll('.form-error')).toHaveLength(1);
        expect(wrapper.find('.form-error').text()).toBe('Cannot set the quota');
        expect(wrapper.emitted('close')).toBeUndefined();
    });
});
