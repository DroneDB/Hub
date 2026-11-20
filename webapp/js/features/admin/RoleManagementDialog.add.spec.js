/**
 * Add Role and Delete Role of the Role Management window (FR-ADM-01, FR-ADM-22, FR-XC-11): a role name
 * follows the user name rule of the Registry (lowercase letters and digits), stated before input and
 * shown at the field; an invalid name sends no request; a failed delete closes the question and shows
 * its error once, in the window, with no toast.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';

const admin = { createRole: vi.fn(), deleteRole: vi.fn() };
vi.mock('@/libs/api/sharedRegistry', () => ({
    default: { admin, features: { value: name => (name === 'systemRoles' ? ['admin', 'deactivated'] : null) } }
}));

const { default: RoleManagementDialog } = await import('./RoleManagementDialog.vue');
const { ApiError } = await import('@/libs/ddb/apiError');

// The question of a delete: its answer is what the window gets
const ConfirmDialog = {
    props: ['title', 'message'],
    emits: ['close'],
    template: '<div id="confirmDialog"><button type="button" data-confirm @click="$emit(\'close\', \'confirm\')">Delete</button></div>'
};
const RULE = '1 to 127 characters: lowercase letters (a–z) and digits (0–9)';
const notify = { success: vi.fn(), error: vi.fn() };

let wrapper;
async function render(roles = ['admin', 'deactivated', 'editor', 'a/b']) {
    wrapper = mount(RoleManagementDialog, {
        props: { roles },
        attachTo: document.body,
        global: { plugins: [PrimeVue], stubs: { Window: { template: '<div><slot /></div>' }, ConfirmDialog }, mocks: { $notify: notify } }
    });
    await flushPromises();
}
const nameInput = () => wrapper.find('input[name="roleName"]');
const nameError = () => wrapper.find('#role-management-dialog-role-name-error');
const type = async value => { await nameInput().setValue(value); await flushPromises(); };
const addButton = () => wrapper.find('button[type="submit"]');
const submit = async () => { await addButton().trigger('click'); await flushPromises(); };
const rolesTab = () => wrapper.findAll('[role="tab"]');

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    wrapper?.unmount();
    document.body.innerHTML = '';
    admin.createRole.mockReset();
    admin.deleteRole.mockReset();
    notify.success.mockReset();
    notify.error.mockReset();
});

describe('Add Role', () => {
    it('states the name rule at the field before any input, and keeps Add Role enabled', async () => {
        await render();
        expect(wrapper.find('#role-management-dialog-role-name-help').text()).toBe(`Use ${RULE}`);
        expect(nameInput().attributes('aria-describedby')).toContain('role-management-dialog-role-name-help');
        expect(nameError().exists()).toBe(false);
        expect(addButton().attributes('disabled')).toBeUndefined();
    });

    it.each(['a/b', 'Bad Role!', 'a-b', 'Editor'])('shows the rule at the field for "%s" and sends no request', async name => {
        await render();
        await type(name);
        const message = `Role name is invalid: use ${RULE}`;
        expect(nameError().text()).toBe(message);
        expect(nameInput().attributes('aria-invalid')).toBe('true');
        await submit();
        expect(admin.createRole).not.toHaveBeenCalled();
        expect(nameError().text()).toBe(message);
        expect(notify.error).not.toHaveBeenCalled();
    });

    it('asks for a name when the field is empty, with no request', async () => {
        await render();
        await submit();
        expect(admin.createRole).not.toHaveBeenCalled();
        expect(nameError().text()).toBe('Enter a role name.');
    });

    it('creates a role that follows the rule, lists it, and goes back to the list', async () => {
        admin.createRole.mockResolvedValue({});
        await render();
        await type(' surveyors2 ');
        await submit();
        expect(admin.createRole).toHaveBeenCalledTimes(1);
        expect(admin.createRole).toHaveBeenCalledWith('surveyors2');
        expect(notify.success).toHaveBeenCalledWith('Role "surveyors2" created successfully', { summary: 'Role Created' });
        expect(wrapper.emitted('rolesChanged')).toHaveLength(1);
        expect(wrapper.findAll('.role-name').map(n => n.text())).toContain('surveyors2');
        expect(nameInput().element.value).toBe('');
    });

    it('shows a refusal that names the role name at the field, once, with no toast', async () => {
        admin.createRole.mockRejectedValue(new ApiError('x', 400, { errors: { roleName: ['Role name is invalid: use something'] } }));
        await render();
        await type('editor2');
        await submit();
        expect(wrapper.findAll('.field-error')).toHaveLength(1);
        expect(nameError().text()).toBe('Role name is invalid: use something');
        expect(wrapper.find('.form-error').exists()).toBe(false);
        expect(notify.error).not.toHaveBeenCalled();
    });

    it('shows any other refusal once, in the Add Role panel, styled as an error, with no toast', async () => {
        admin.createRole.mockRejectedValue(new ApiError("Role 'editor2' already exists", 400));
        await render();
        await type('editor2');
        await submit();
        expect(wrapper.findAll('.form-error')).toHaveLength(1);
        expect(wrapper.find('.form-error').text()).toBe("Role 'editor2' already exists");
        expect(notify.error).not.toHaveBeenCalled();
        expect(rolesTab()).toHaveLength(2);
    });
});

describe('Delete Role', () => {
    const rowOf = role => wrapper.findAll('.role-item').find(r => r.find('.role-name').text() === role);
    const question = () => wrapper.find('#confirmDialog');
    const answer = async () => {
        await question().find('[data-confirm]').trigger('click');
        await flushPromises();
    };

    it('deletes a legacy role whose name has a slash, by its own name', async () => {
        admin.deleteRole.mockResolvedValue(true);
        await render();
        await rowOf('a/b').find('button').trigger('click');
        await flushPromises();
        await answer();
        expect(admin.deleteRole).toHaveBeenCalledWith('a/b');
        expect(wrapper.findAll('.role-name').map(n => n.text())).not.toContain('a/b');
        expect(notify.success).toHaveBeenCalledWith('Role "a/b" deleted successfully', { summary: 'Role Deleted' });
    });

    it('a refusal that does not say "Failed to delete role" gets the prefix, once', async () => {
        admin.deleteRole.mockRejectedValue(new ApiError("Role 'editor' does not exist", 400));
        await render();
        await rowOf('editor').find('button').trigger('click');
        await flushPromises();
        await answer();
        expect(wrapper.find('.p-message').text()).toContain("Failed to delete role: Role 'editor' does not exist");
    });

    it('a failed delete closes the question and shows its error once in the window, with no toast', async () => {
        admin.deleteRole.mockRejectedValue(new ApiError('Failed to delete role: in use', 409));
        await render();
        await rowOf('editor').find('button').trigger('click');
        await flushPromises();
        expect(question().exists()).toBe(true);
        await answer();
        expect(question().exists()).toBe(false);
        const shown = wrapper.find('.p-message').text();
        expect(shown).toContain('Failed to delete role: in use');
        expect(shown).not.toContain('Failed to delete role: Failed to delete role');
        expect(wrapper.findAll('.p-message')).toHaveLength(1);
        expect(notify.error).not.toHaveBeenCalled();
        // The role stays listed
        expect(wrapper.findAll('.role-name').map(n => n.text())).toContain('editor');
    });
});
