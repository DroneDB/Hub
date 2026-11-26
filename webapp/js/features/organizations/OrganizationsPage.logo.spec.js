/**
 * The logo on the organizations page: each row shows the logo of its organization (the initials when it has none), the Edit
 * dialog offers the logo only to an administrator of the organization, and a logo sent or removed there shows in the row at once.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';

const reg = vi.hoisted(() => ({
    isAdmin: () => false,
    getUsername: () => 'ann',
    features: { get: () => false },
    orgs: { getOrganizations: null }
}));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: reg }));

const { default: OrganizationsPage } = await import('./OrganizationsPage.vue');
const { _resetPrefListenersForTests } = await import('@/libs/preferences');

const ADMIN = { canRead: true, canWrite: true, canDelete: true, canManageMembers: true };
const EDITOR = { canRead: true, canWrite: true };
const dto = (slug, extra = {}) => ({
    slug, name: slug.toUpperCase(), description: '', owner: 'zed', isPublic: false, permissions: ADMIN,
    creationDate: '2026-01-01T00:00:00Z', logoUrl: null, ...extra
});

let wrapper;
beforeEach(() => {
    globalThis.HubOptions = {};
    _resetPrefListenersForTests();
    localStorage.clear();
    reg.orgs.getOrganizations = vi.fn(() => Promise.resolve([
        dto('alpha', { logoUrl: '/orgs/alpha/logo?v=1' }),
        dto('beta'),
        dto('gamma', { permissions: EDITOR })
    ].map(org => ({ org }))));
});
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    _resetPrefListenersForTests();
});

async function render() {
    wrapper = mount(OrganizationsPage, {
        global: {
            plugins: [PrimeVue],
            mocks: { $router: { push: vi.fn() }, $notify: { error: vi.fn(), success: vi.fn() } },
            stubs: {
                OrganizationDialog: true, OrganizationMembersDialog: true, MessageDialog: true, DialogHost: true,
                Paginator: { template: '<nav class="paginator-stub" />' }, RouterLink: { props: ['to'], template: '<a><slot /></a>' }
            }
        }
    });
    await flushPromises();
}
const row = slug => wrapper.findAll('tr.org-row').find(r => r.find('.org-name').text() === slug.toUpperCase());
const dialog = () => wrapper.findComponent({ name: 'OrganizationDialog' });
async function openEdit(slug) {
    await row(slug).find('button[aria-label="Edit organization"]').trigger('click');
    await flushPromises();
}

describe('OrganizationsPage logos', () => {
    it('shows the logo of an organization before its name, and its initials when it has none', async () => {
        await render();
        expect(row('alpha').find('img').attributes('src')).toBe('/orgs/alpha/logo?v=1');
        expect(row('beta').find('img').exists()).toBe(false);
        expect(row('beta').find('.org-logo-initials').text()).toBe('B');
        // The name beside it says it: the logo adds no text to the link
        expect(row('beta').find('.org-name').text()).toBe('BETA');
    });

    it('opens the Edit dialog with the logo of the organization, and the logo field for its administrator', async () => {
        await render();
        await openEdit('alpha');
        expect(dialog().props('model')).toMatchObject({ slug: 'alpha', logoUrl: '/orgs/alpha/logo?v=1' });
        expect(dialog().props('canManageLogo')).toBe(true);
    });

    it('does not offer the logo to a user who may edit the organization but not administer it', async () => {
        await render();
        await openEdit('gamma');
        expect(dialog().props('canManageLogo')).toBe(false);
    });

    it('offers it to an administrator of the instance in any organization', async () => {
        reg.isAdmin = () => true;
        try {
            await render();
            await openEdit('gamma');
            expect(dialog().props('canManageLogo')).toBe(true);
        } finally {
            reg.isAdmin = () => false;
        }
    });

    it('shows a new logo in the row as soon as the dialog says it was sent, and the initials when it was removed', async () => {
        await render();
        await openEdit('beta');
        dialog().vm.$emit('logo-changed', '/orgs/beta/logo?v=9');
        await flushPromises();
        expect(row('beta').find('img').attributes('src')).toBe('/orgs/beta/logo?v=9');
        dialog().vm.$emit('logo-changed', null);
        await flushPromises();
        expect(row('beta').find('img').exists()).toBe(false);
        expect(row('beta').find('.org-logo-initials').exists()).toBe(true);
    });
});
