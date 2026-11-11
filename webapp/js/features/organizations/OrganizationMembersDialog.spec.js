/**
 * Adding a member: the owner types the exact user name (no user list, which only admins may
 * read), the server checks it, and its error text is shown when it refuses.
 *
 * Changing permissions: dropping your own row below Admin asks first (Cancel puts the level
 * back), a change to yourself tells the parent, and a refused change leaves its error visible.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import { ApiError } from '@/libs/ddb/apiError';

const reg = vi.hoisted(() => ({
    features: { get: () => true },
    admin: { users: null },
    getUsername: () => 'me',
    orgs: { getOrganizationMembers: null, addOrganizationMember: null, updateMemberPermissions: null }
}));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: reg }));

const { default: OrganizationMembersDialog } = await import('./OrganizationMembersDialog.vue');
const { default: Select } = await import('primevue/select');

let wrapper;
async function render() {
    wrapper = mount(OrganizationMembersDialog, {
        props: { orgSlug: 'acme', canManageMembers: true },
        attachTo: document.body,
        global: { plugins: [PrimeVue], mocks: { $notify: { success: vi.fn() } } }
    });
    await flushPromises();
}
const ADMIN = 3;
const READ_ONLY = 0;
const rows = () => [{ userName: 'me', permissions: ADMIN }, { userName: 'bob', permissions: 1 }];
const member = name => wrapper.vm.members.find(m => m.userName === name);
const selectOf = name => wrapper.findAllComponents(Select).find(s => s.props('ariaLabel') === `Permissions of ${name}`);
async function choose(name, value) {
    selectOf(name).vm.$emit('update:modelValue', value);
    await flushPromises();
}
const confirmDialog = () => document.getElementById('confirmDialog');
const nameInput = () => document.getElementById('organization-members-dialog-user');
const addButton = () => [...document.body.querySelectorAll('button')].find(b => b.textContent.trim() === 'Add');
async function typeName(value) {
    const input = nameInput();
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await flushPromises();
}

beforeEach(() => {
    reg.admin.users = vi.fn(() => Promise.reject(new ApiError('Forbidden', 403)));
    reg.orgs.getOrganizationMembers = vi.fn(() => Promise.resolve([]));
    reg.orgs.addOrganizationMember = vi.fn(() => Promise.resolve());
    reg.orgs.updateMemberPermissions = vi.fn(() => Promise.resolve());
});
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
});

describe('OrganizationMembersDialog', () => {
    // FR-ORG-26: 30 members must not grow the window or push Close away
    it('shows the members in user name order, whatever the order the server sends (FR-ORG-26)', async () => {
        reg.orgs.getOrganizationMembers = vi.fn(() => Promise.resolve([
            { userName: 'Zed', permissions: 1 }, { userName: 'bob', permissions: 1 }, { userName: 'Alice', permissions: 1 }, { userName: 'me', permissions: ADMIN }
        ]));
        await render();
        const names = [...document.body.querySelectorAll('.members-scroll tbody tr td:first-child')].map(td => td.textContent.trim());
        expect(names).toEqual(['Alice', 'bob', 'me', 'Zed']);
        expect(wrapper.vm.members.map(m => m.userName)).toEqual(['Alice', 'bob', 'me', 'Zed']);
    });

    it('puts Close in the footer of the window, outside the box that scrolls the table (FR-ORG-26)', async () => {
        reg.orgs.getOrganizationMembers = vi.fn(() => Promise.resolve(rows()));
        await render();
        const dialog = document.querySelector('.p-dialog.window-dialog');
        const close = [...dialog.querySelectorAll('button')].find(b => b.textContent.trim() === 'Close');
        expect(close.closest('.window-footer')).not.toBeNull();
        expect(close.closest('.members-scroll')).toBeNull();
        // the table is in the scroll box, the Add Member form is not
        expect(dialog.querySelector('.members-scroll table')).not.toBeNull();
        expect(nameInput().closest('.members-scroll')).toBeNull();
        close.click();
        expect(wrapper.emitted('close')).toHaveLength(1);
    });

    it('takes its width from the dialog-xl size class, with no width of its own (FR-XC-33)', async () => {
        await render();
        const dialog = document.querySelector('.p-dialog.window-dialog');
        expect(dialog.classList.contains('dialog-xl')).toBe(true);
        expect(dialog.getAttribute('style') || '').not.toContain('width');
    });

    it('does not read the user list', async () => {
        await render();
        expect(reg.admin.users).not.toHaveBeenCalled();
        expect(document.body.textContent).not.toContain('Forbidden');
        expect(nameInput()).not.toBeNull();
    });

    it('adds the typed user name, without surrounding spaces', async () => {
        await render();
        expect(addButton().disabled).toBe(true);
        await typeName('  alice ');
        expect(addButton().disabled).toBe(false);
        addButton().click();
        await flushPromises();
        expect(reg.orgs.addOrganizationMember).toHaveBeenCalledWith('acme', 'alice', 1);
        expect(nameInput().value).toBe('');
    });

    it("shows the server's message when it refuses the name", async () => {
        reg.orgs.addOrganizationMember = vi.fn(() => Promise.reject(new ApiError('User not found', 404)));
        await render();
        await typeName('nobody');
        addButton().click();
        await flushPromises();
        expect(document.body.textContent).toContain('User not found');
        expect(nameInput().value).toBe('nobody');
    });

    // FR-ORG-23: the Registry names the field of its refusal (errors.userName, D-047)
    it('shows "No user named x" at the user name field, from errors.userName, not in the banner', async () => {
        reg.orgs.addOrganizationMember = vi.fn(() => Promise.reject(new ApiError('No user named nosuchuser123', 404, {
            errors: { userName: ['No user named nosuchuser123'] }
        })));
        await render();
        await typeName('nosuchuser123');
        addButton().click();
        await flushPromises();
        const error = document.getElementById('organization-members-dialog-user-error');
        expect(error.textContent).toBe('No user named nosuchuser123');
        expect(nameInput().getAttribute('aria-invalid')).toBe('true');
        expect(nameInput().getAttribute('aria-describedby')).toContain('organization-members-dialog-user-error');
        expect(document.querySelector('.p-message-error')).toBeNull();
        expect(nameInput().value).toBe('nosuchuser123');

        // typing again clears it
        await typeName('nosuchuser1234');
        expect(document.getElementById('organization-members-dialog-user-error')).toBeNull();
        expect(nameInput().getAttribute('aria-invalid')).toBeNull();
    });

    it('asks before you drop your own row below Admin; Cancel puts Admin back and saves nothing', async () => {
        reg.orgs.getOrganizationMembers = vi.fn(() => Promise.resolve(rows()));
        await render();
        await choose('me', READ_ONLY);
        expect(confirmDialog().textContent).toContain('Remove your admin rights?');
        expect(confirmDialog().textContent).toContain('Read Only');
        expect(reg.orgs.updateMemberPermissions).not.toHaveBeenCalled();

        confirmDialog().querySelector('[data-cancel]').click();
        await flushPromises();
        expect(confirmDialog()).toBeNull();
        expect(member('me').permissions).toBe(ADMIN);
        expect(reg.orgs.updateMemberPermissions).not.toHaveBeenCalled();
        expect(wrapper.emitted('permissions-changed')).toBeUndefined();
    });

    it('saves your own demotion once confirmed, and tells the parent', async () => {
        reg.orgs.getOrganizationMembers = vi.fn(() => Promise.resolve(rows()));
        await render();
        await choose('me', READ_ONLY);
        confirmDialog().querySelector('[data-confirm]').click();
        await flushPromises();
        expect(reg.orgs.updateMemberPermissions).toHaveBeenCalledWith('acme', 'me', READ_ONLY);
        expect(wrapper.emitted('permissions-changed')).toHaveLength(1);
    });

    it("changes another member's permissions without asking, and does not tell the parent", async () => {
        reg.orgs.getOrganizationMembers = vi.fn(() => Promise.resolve(rows()));
        await render();
        await choose('bob', READ_ONLY);
        expect(confirmDialog()).toBeNull();
        expect(reg.orgs.updateMemberPermissions).toHaveBeenCalledWith('acme', 'bob', READ_ONLY);
        expect(wrapper.emitted('permissions-changed')).toBeUndefined();
    });

    it('leaves the error of a refused change visible, over the reloaded list', async () => {
        reg.orgs.getOrganizationMembers = vi.fn(() => Promise.resolve(rows()));
        reg.orgs.updateMemberPermissions = vi.fn(() => Promise.reject(new ApiError('You are not an admin', 403)));
        await render();
        await choose('bob', READ_ONLY);
        expect(reg.orgs.getOrganizationMembers).toHaveBeenCalledTimes(2);
        expect(member('bob').permissions).toBe(1);
        expect(document.body.textContent).toContain('You are not an admin');
    });

    it('is read-only once the parent says you may no longer manage the members', async () => {
        reg.orgs.getOrganizationMembers = vi.fn(() => Promise.resolve(rows()));
        await render();
        await wrapper.setProps({ canManageMembers: false });
        expect(nameInput()).toBeNull();
        expect(wrapper.findAllComponents(Select)).toHaveLength(0);
    });
});
