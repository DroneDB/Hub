/**
 * The logo in the header of the organization page: its logo (the initials when it has none) in place of the generic icon,
 * a placeholder while the organization loads, and a logo sent or removed in the Edit dialog shows at once.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils';
import PrimeVue from 'primevue/config';

const reg = vi.hoisted(() => ({
    isAdmin: () => false,
    isLoggedIn: () => true,
    features: { get: () => false, value: () => undefined },
    Organization: null
}));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: reg }));

const { default: DatasetsPage } = await import('./DatasetsPage.vue');
const { _resetPrefListenersForTests } = await import('@/libs/preferences');

let wrapper;
afterEach(() => {
    wrapper?.unmount();
    _resetPrefListenersForTests();
});
beforeEach(() => {
    globalThis.HubOptions = {};
    localStorage.clear();
});

async function render(info) {
    reg.Organization = vi.fn(() => ({
        info: () => Promise.resolve({ slug: 'acme', name: 'Acme Drone Lab', permissions: { canManageMembers: true, canWrite: true }, ...info }),
        datasetsPage: vi.fn(() => Promise.resolve({ items: [], total: 0 }))
    }));
    wrapper = mount(DatasetsPage, {
        global: {
            plugins: [PrimeVue],
            components: { RouterLink: RouterLinkStub },
            mocks: { $route: { params: { org: 'acme' } }, $router: { push: vi.fn() } },
            stubs: { DatasetDialog: true, ImportDatasetDialog: true, OrganizationDialog: true, OrganizationMembersDialog: true, MessageDialog: true, DialogHost: true, EmptyState: true, Paginator: true }
        }
    });
    await flushPromises();
}
const header = () => wrapper.find('.org-header');
const dialog = () => wrapper.findComponent({ name: 'OrganizationDialog' });

describe('DatasetsPage organization logo', () => {
    it('shows the logo of the organization in the header, in place of the generic icon', async () => {
        await render({ logoUrl: '/orgs/acme/logo?v=1' });
        expect(header().find('img.org-logo-lg').attributes('src')).toBe('/orgs/acme/logo?v=1');
        expect(header().find('.fa-sitemap').exists()).toBe(false);
    });

    it('shows the initials of an organization without a logo', async () => {
        await render({ logoUrl: null });
        expect(header().find('.org-logo-initials').text()).toBe('AD');
        expect(header().find('h1').text()).toBe('Acme Drone Lab');
    });

    it('opens the Edit dialog with the logo of the organization, for its administrator', async () => {
        await render({ logoUrl: '/orgs/acme/logo?v=1' });
        await header().find('button[aria-label="Edit Organization"]').trigger('click');
        expect(dialog().props('model')).toMatchObject({ slug: 'acme', logoUrl: '/orgs/acme/logo?v=1' });
        expect(dialog().props('canManageLogo')).toBe(true);
    });

    it('shows a new logo in the header as soon as the dialog says it was sent, and the initials when it was removed', async () => {
        await render({ logoUrl: null });
        await header().find('button[aria-label="Edit Organization"]').trigger('click');
        dialog().vm.$emit('logo-changed', '/orgs/acme/logo?v=5');
        await flushPromises();
        expect(header().find('img.org-logo-lg').attributes('src')).toBe('/orgs/acme/logo?v=5');
        dialog().vm.$emit('logo-changed', null);
        await flushPromises();
        expect(header().find('img.org-logo-lg').exists()).toBe(false);
        expect(header().find('.org-logo-initials').exists()).toBe(true);
    });
});
