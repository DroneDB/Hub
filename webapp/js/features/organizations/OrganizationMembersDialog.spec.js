/**
 * Adding a member: the owner types the exact user name (no user list, which only admins may
 * read), the server checks it, and its error text is shown when it refuses.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import { ApiError } from '@/libs/ddb/apiError';

const reg = vi.hoisted(() => ({
    features: { get: () => true },
    admin: { users: null },
    orgs: { getOrganizationMembers: null, addOrganizationMember: null }
}));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: reg }));

const { default: OrganizationMembersDialog } = await import('./OrganizationMembersDialog.vue');

let wrapper;
async function render() {
    wrapper = mount(OrganizationMembersDialog, {
        props: { orgSlug: 'acme', canManageMembers: true },
        attachTo: document.body,
        global: { plugins: [PrimeVue], mocks: { $notify: { success: vi.fn() } } }
    });
    await flushPromises();
}
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
});
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
});

describe('OrganizationMembersDialog', () => {
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
});
