/**
 * A 401 while listing organisations ends the session and goes to Login: the page leaves
 * 401s to the app's handler (reg.onUnauthorized -> handleUnauthorized) instead of showing
 * a "Temporary authentication issue".
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import { ApiError } from '@/libs/ddb/apiError';

const reg = vi.hoisted(() => ({
    isAdmin: () => false,
    getUsername: () => 'ann',
    features: { get: () => true },
    orgs: { getOrganizations: null }
}));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: reg }));

const { default: Organizations } = await import('./OrganizationsPage.vue');
const { default: OrganizationDialog } = await import('./OrganizationDialog.vue');

function fakeView() {
    return {
        showAll: false,
        $router: { push: vi.fn(() => Promise.resolve()) },
        $notify: { error: vi.fn() }
    };
}

describe('Organizations.fetchOrganizations', () => {
    it('keeps a 401 for the sign-in state (no error box): the app handler signs a session out', async () => {
        reg.orgs.getOrganizations = vi.fn(() => Promise.reject(new ApiError('Token expired', 401)));
        const vm = fakeView();

        await Organizations.methods.fetchOrganizations.call(vm);

        expect(vm.$notify.error).not.toHaveBeenCalled();
        expect(vm.loadError.status).toBe(401);
    });

    it('shows other errors', async () => {
        reg.orgs.getOrganizations = vi.fn(() => Promise.reject(new ApiError('Boom', 500)));
        const vm = fakeView();

        await Organizations.methods.fetchOrganizations.call(vm);

        expect(vm.$notify.error).toHaveBeenCalledWith('Boom');
    });
});

describe('Organizations.onMembersPermissionsChanged', () => {
    const { onMembersPermissionsChanged, fetchOrganizations } = Organizations.methods;
    const OLD = { slug: 'acme', permissions: { canManageMembers: true } };
    function membersView() {
        const vm = { ...fakeView(), membersDialogOpen: true, selectedOrgForMembers: OLD, organizations: [OLD] };
        vm.fetchOrganizations = () => fetchOrganizations.call(vm);
        return vm;
    }

    it('follows the fresh row of the organization', async () => {
        reg.orgs.getOrganizations = vi.fn(() => Promise.resolve([{ org: { slug: 'acme', permissions: { canManageMembers: false } } }]));
        const vm = membersView();
        await onMembersPermissionsChanged.call(vm);
        expect(vm.selectedOrgForMembers.permissions.canManageMembers).toBe(false);
    });

    it('turns read-only when the list cannot be read again (the old row is not trusted)', async () => {
        reg.orgs.getOrganizations = vi.fn(() => Promise.reject(new ApiError('Boom', 500)));
        const vm = membersView();
        await onMembersPermissionsChanged.call(vm);
        expect(vm.selectedOrgForMembers.slug).toBe('acme');
        expect(vm.selectedOrgForMembers.permissions.canManageMembers).toBe(false);
    });

    it('turns read-only when a later request superseded the answer', async () => {
        reg.orgs.getOrganizations = vi.fn(() => Promise.resolve([{ org: OLD }]));
        const vm = membersView();
        const pending = onMembersPermissionsChanged.call(vm);
        vm._organizationsRequest += 1;
        await pending;
        expect(vm.selectedOrgForMembers.permissions.canManageMembers).toBe(false);
    });
});

describe('handleUnauthorized', () => {
    const router = path => {
        window.history.replaceState({}, '', path);
        return {
            currentRoute: { value: { name: path === '/login' ? 'Login' : 'Organizations', fullPath: path } },
            push: vi.fn(() => Promise.resolve())
        };
    };

    it('ends the session and signs in again, told why (FR-ACC-09), coming back afterwards', async () => {
        const { handleUnauthorized } = await import('@/libs/authRoutes');
        const r = router('/r');
        const auth = { isLoggedIn: true, logout: vi.fn() };
        handleUnauthorized(r, auth);
        expect(auth.logout).toHaveBeenCalledOnce();
        expect(r.push).toHaveBeenCalledWith({ name: 'Login', query: { redirect: '/r', notice: 'expired' } });
    });

    it('comes back to the address as it is now, not to the one the route was opened at', async () => {
        const { handleUnauthorized } = await import('@/libs/authRoutes');
        const { replaceQueryKeys } = await import('@/libs/routeQuery');
        const r = router('/r/o/d/view/abc/map?t=1');
        // A map adds its layers without a navigation: the route keeps the address it opened at
        replaceQueryKeys({ layer: ['a'] });
        handleUnauthorized(r, { isLoggedIn: true, logout: vi.fn() });
        expect(r.push).toHaveBeenCalledWith({ name: 'Login', query: { redirect: '/r/o/d/view/abc/map?t=1&layer=a', notice: 'expired' } });
    });

    it('leaves a visitor without a session on the page, which shows the sign-in state (D-048)', async () => {
        const { handleUnauthorized } = await import('@/libs/authRoutes');
        const r = router('/r/acme/private-ds');
        const auth = { isLoggedIn: false, logout: vi.fn() };
        handleUnauthorized(r, auth);
        expect(r.push).not.toHaveBeenCalled();
        expect(auth.logout).not.toHaveBeenCalled();
    });

    it('does nothing on the Login page', async () => {
        const { handleUnauthorized } = await import('@/libs/authRoutes');
        const r = router('/login');
        handleUnauthorized(r, { isLoggedIn: false, logout: vi.fn() });
        expect(r.push).not.toHaveBeenCalled();
    });
});

// What the page and the dialog show now that Public organizations are listed and readable for everyone (D-003)
describe('Public organizations (D-003)', () => {
    let wrapper;
    afterEach(() => {
        wrapper?.unmount();
        wrapper = null;
        localStorage.clear();
    });

    async function renderPage(orgs, { readOnlyOrgs = false } = {}) {
        globalThis.HubOptions = { readOnlyOrgs };
        localStorage.clear();
        reg.orgs.getOrganizations = vi.fn(() => Promise.resolve(orgs.map(org => ({ org }))));
        wrapper = mount(Organizations, {
            global: {
                plugins: [PrimeVue],
                mocks: { $router: { push: vi.fn() }, $notify: { error: vi.fn() } },
                stubs: { OrganizationDialog: true, OrganizationMembersDialog: true, MessageDialog: true, DialogHost: true, Paginator: true, RouterLink: { template: '<a><slot /></a>' } }
            }
        });
        await flushPromises();
    }
    const card = slug => wrapper.findAll('.org-card').find(c => c.text().includes(slug));
    const actions = slug => card(slug).findAll('.org-card-actions button').map(b => b.attributes('aria-label'));

    it('shows no write action on a Public organization the user can only read', async () => {
        const readOnly = { canRead: true, canWrite: false, canDelete: false, canManageMembers: false };
        const owner = { canRead: true, canWrite: true, canDelete: true, canManageMembers: true };
        await renderPage([
            { slug: 'mine', name: 'Mine', owner: 'ann', isPublic: false, permissions: owner },
            { slug: 'open', name: 'Open', owner: 'bob', isPublic: true, permissions: readOnly }
        ]);
        expect(reg.orgs.getOrganizations).toHaveBeenCalledWith(true);
        expect(actions('Mine')).toEqual(['Manage members', 'Edit organization', 'Delete organization']);
        expect(actions('Open')).toEqual([]);
        expect(card('Open').text()).toContain('Public');
    });

    it('says what the default list holds when it is empty, and offers to create one', async () => {
        await renderPage([]);
        expect(wrapper.find('[data-org-empty-hint]').text())
            .toBe("No organizations yet: you don't own or belong to any, and none is public.");
        expect(wrapper.text()).not.toContain('enable Show all');
        expect(wrapper.find('[data-org-empty-create]').exists()).toBe(true);
    });

    it('shows a visitor without a session the sign-in state, with no cards and no Create (D-048)', async () => {
        globalThis.HubOptions = {};
        localStorage.clear();
        reg.orgs.getOrganizations = vi.fn(() => Promise.reject(new ApiError('Unauthorized', 401)));
        window.history.replaceState({}, '', '/r');
        const LinkStub = { props: ['to'], template: '<a :data-to="JSON.stringify(to)"><slot /></a>' };
        wrapper = mount(Organizations, {
            global: {
                plugins: [PrimeVue],
                mocks: { $router: { push: vi.fn() }, $notify: { error: vi.fn() } },
                stubs: { OrganizationDialog: true, OrganizationMembersDialog: true, MessageDialog: true, DialogHost: true, Paginator: true, RouterLink: LinkStub }
            }
        });
        await flushPromises();
        expect(wrapper.find('h1').text()).toBe('Sign in to open this page');
        expect(wrapper.findAll('h1')).toHaveLength(1);
        expect(wrapper.text()).not.toContain('No organizations');
        expect(wrapper.text()).not.toContain('Create Organization');
        expect(wrapper.find('[aria-label="Create organization"]').exists()).toBe(false);
        expect(wrapper.find('.org-cards-area').exists()).toBe(false);
        const links = wrapper.findAll('a').map(a => [a.text(), JSON.parse(a.attributes('data-to'))]);
        expect(links).toEqual([['Sign in', { name: 'Login', query: { redirect: '/r' } }]]);
        window.history.replaceState({}, '', '/');
    });

    it('offers no create action in the empty list when organizations are read-only', async () => {
        await renderPage([], { readOnlyOrgs: true });
        expect(wrapper.find('[data-org-empty-hint]').exists()).toBe(true);
        expect(wrapper.find('[data-org-empty-create]').exists()).toBe(false);
    });

    it('the dialog explains Public under its checkbox', async () => {
        wrapper = mount(OrganizationDialog, {
            props: { mode: 'new', save: vi.fn() },
            global: { plugins: [PrimeVue], stubs: { Window: { template: '<div><slot /></div>' } } }
        });
        await flushPromises();
        const hint = wrapper.find('#organization-dialog-public-hint');
        expect(hint.text()).toBe('Anyone, signed in or not, can see this organization and its public datasets.');
        expect(wrapper.find('#orgPublic').attributes('aria-describedby')).toBe('organization-dialog-public-hint');
    });
});
