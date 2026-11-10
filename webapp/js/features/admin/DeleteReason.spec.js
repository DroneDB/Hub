/**
 * The disabled Delete of the admin lists says why (FR-ADM-24, FR-XC-22): the button stays focusable (aria-disabled), and its
 * description and tooltip hold the reason of the rule; a click does nothing. The reason comes from deleteBlockReason.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';

const reg = vi.hoisted(() => ({ admin: {}, orgs: {}, features: { value: () => null } }));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: reg }));

const { default: UsersPage } = await import('./UsersPage.vue');
const { default: OrganizationManagementDialog } = await import('./OrganizationManagementDialog.vue');

let wrapper;
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
});

const notify = () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() });
const describedBy = button => document.getElementById(button.attributes('aria-describedby'))?.textContent;

describe('Users: Delete of the built-in admin', () => {
    async function render() {
        reg.admin.usersDetailed = vi.fn(() => Promise.resolve([
            { userName: 'admin', roles: ['admin'] },
            { userName: 'alice', roles: ['editor'] }
        ]));
        reg.admin.userRoles = () => Promise.resolve(['admin', 'editor']);
        wrapper = mount(UsersPage, { attachTo: document.body, global: { plugins: [PrimeVue], mocks: { $notify: notify() } } });
        await flushPromises();
    }
    const rowOf = name => wrapper.findAll('tbody tr').find(r => r.find('strong').text() === name);

    it('keeps the button focusable and gives the reason as its description and tooltip', async () => {
        await render();
        const button = rowOf('admin').find('button[aria-label="Delete User"]');
        expect(button.attributes('disabled')).toBeUndefined();
        expect(button.attributes('aria-disabled')).toBe('true');
        expect(describedBy(button)).toBe('The built-in admin account cannot be deleted');
        expect(button.attributes('title')).toBe('Delete User: The built-in admin account cannot be deleted');
        button.element.focus();
        expect(document.activeElement).toBe(button.element);
    });

    it('does not open the delete window on a click, and leaves another user\'s Delete enabled', async () => {
        await render();
        await rowOf('admin').find('button[aria-label="Delete User"]').trigger('click');
        await flushPromises();
        expect(wrapper.vm.showDeleteDialog).toBe(false);

        const other = rowOf('alice').find('button[aria-label="Delete User"]');
        expect(other.attributes('aria-disabled')).toBeUndefined();
        expect(other.attributes('aria-describedby')).toBeUndefined();
        await other.trigger('click');
        expect(wrapper.vm.showDeleteDialog).toBe(true);
    });
});

describe('Organization Management: Delete of the Public organization', () => {
    async function render() {
        reg.orgs.getOrganizations = vi.fn(() => Promise.resolve([
            { slug: 'public', name: 'Public', description: '' },
            { slug: 'acme', name: 'Acme', description: '' }
        ].map(org => ({ org }))));
        wrapper = mount(OrganizationManagementDialog, { attachTo: document.body, global: { plugins: [PrimeVue], mocks: { $notify: notify() } } });
        await flushPromises();
    }
    const deleteOf = slug => [...document.querySelectorAll('tbody tr')]
        .find(r => r.textContent.includes(slug)).querySelector('button');

    it('says why it is off, through its description and tooltip, and stays focusable', async () => {
        await render();
        const button = deleteOf('Public');
        expect(button.getAttribute('aria-disabled')).toBe('true');
        expect(button.hasAttribute('disabled')).toBe(false);
        expect(document.getElementById(button.getAttribute('aria-describedby')).textContent).toBe('The Public organization cannot be deleted');
        expect(button.title).toBe('Delete Organization: The Public organization cannot be deleted');
        button.focus();
        expect(document.activeElement).toBe(button);
        button.click();
        await flushPromises();
        expect(wrapper.vm.showDeleteDialog).toBe(false);
    });

    it('leaves the Delete of another organization enabled, with its plain tooltip', async () => {
        await render();
        const button = deleteOf('Acme');
        expect(button.getAttribute('aria-disabled')).toBeNull();
        expect(button.getAttribute('aria-describedby')).toBeNull();
        expect(button.title).toBe('Delete Organization');
        button.click();
        await flushPromises();
        expect(wrapper.vm.showDeleteDialog).toBe(true);
    });
});
