/**
 * The Add User window (FR-ADM-08, FR-XC-11): the shared password fields with the policy checklist,
 * the e-mail checked by the shared `emailProblem`, a submit that stays enabled and shows the errors
 * at the fields, and the Registry's `errors` mapped to the fields (D-047), never to a toast.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';

const policy = { minLength: 6, requireDigit: true, requireUppercase: false, requireLowercase: false, requireNonAlphanumeric: false };
const addUser = vi.fn();
vi.mock('@/libs/api/sharedRegistry', () => ({
    default: {
        admin: { addUser: (...args) => addUser(...args) },
        features: { value: name => (name === 'passwordPolicy' ? policy : null) }
    }
}));

const { default: AddUserDialog } = await import('./AddUserDialog.vue');
const { ApiError } = await import('@/libs/ddb/apiError');

const WindowStub = {
    props: ['busy', 'confirmLabel'],
    emits: ['confirm', 'close'],
    template: '<div :data-busy="busy"><slot /><button type="button" data-confirm :disabled="busy" @click="$emit(\'confirm\')">{{ confirmLabel }}</button></div>'
};
const notify = { success: vi.fn(), error: vi.fn() };

let wrapper;
async function render() {
    wrapper = mount(AddUserDialog, {
        props: { availableRoles: ['admin', 'editor'] },
        attachTo: document.body,
        global: { plugins: [PrimeVue], stubs: { Window: WindowStub }, mocks: { $notify: notify } }
    });
    await flushPromises();
}
const type = async (name, value) => { await wrapper.find(`input[name="${name}"]`).setValue(value); await flushPromises(); };
const confirm = async () => { await wrapper.find('[data-confirm]').trigger('click'); await flushPromises(); };
const fillValid = async () => {
    await type('username', 'bob');
    await type('newPassword', 'abc123');
    await type('confirmPassword', 'abc123');
};
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; addUser.mockReset(); notify.success.mockReset(); notify.error.mockReset(); });

describe('AddUserDialog', () => {
    it('shows the password requirements from the start', async () => {
        await render();
        expect(wrapper.findAll('.password-requirements li').map(i => i.text())).toEqual(['At least 6 characters', 'At least one digit (0-9)']);
    });

    it('keeps Add User enabled and shows the errors of an empty submit at the fields', async () => {
        await render();
        expect(wrapper.find('[data-confirm]').attributes('disabled')).toBeUndefined();
        await confirm();
        expect(addUser).not.toHaveBeenCalled();
        expect(wrapper.find('#add-user-dialog-username-error').text()).toBe('Enter a username.');
        expect(wrapper.find('#add-user-dialog-new-error').text()).toBe('Enter a new password.');
        expect(document.activeElement).toBe(wrapper.find('input[name="username"]').element);
    });

    it('shows the rule text of an e-mail the server would refuse, at the field, before submit', async () => {
        await render();
        await type('email', 'not an email');
        expect(wrapper.find('#add-user-dialog-email-error').text()).toBe('The e-mail address is not valid: enter one address, such as name@example.com');
        await fillValid();
        await confirm();
        expect(addUser).not.toHaveBeenCalled();
    });

    it('sends the user once with the checked values', async () => {
        addUser.mockResolvedValue({ userName: 'bob' });
        await render();
        await fillValid();
        await type('email', 'bob@example.com');
        await confirm();
        expect(addUser).toHaveBeenCalledTimes(1);
        expect(addUser).toHaveBeenCalledWith('bob', 'abc123', [], 'bob@example.com');
        expect(wrapper.emitted('close')[0]).toEqual([{ userName: 'bob' }]);
    });

    it('maps the errors of the Registry to the fields of the request members, with no toast', async () => {
        addUser.mockRejectedValue(new ApiError('x', 409, { errors: { userName: ['The user name is taken.'], email: ['The e-mail is used.'] } }));
        await render();
        await fillValid();
        await confirm();
        expect(wrapper.find('#add-user-dialog-username-error').text()).toBe('The user name is taken.');
        expect(wrapper.find('#add-user-dialog-email-error').text()).toBe('The e-mail is used.');
        expect(notify.error).not.toHaveBeenCalled();
        expect(wrapper.emitted('close')).toBeUndefined();
    });
});
