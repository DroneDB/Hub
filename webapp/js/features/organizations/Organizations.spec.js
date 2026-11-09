/**
 * A 401 while listing organisations ends the session and goes to Login: the page leaves
 * 401s to the app's handler (reg.onUnauthorized -> handleUnauthorized) instead of showing
 * a "Temporary authentication issue".
 */
import { describe, it, expect, vi } from 'vitest';
import { ApiError } from '@/libs/ddb/apiError';

const reg = vi.hoisted(() => ({ isAdmin: () => false, orgs: { getOrganizations: null } }));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: reg }));

const { default: Organizations } = await import('./OrganizationsPage.vue');

function fakeView() {
    return {
        showAll: false,
        $router: { push: vi.fn(() => Promise.resolve()) },
        $notify: { error: vi.fn() }
    };
}

describe('Organizations.fetchOrganizations', () => {
    it('leaves a rejected session to the app handler (no error box)', async () => {
        reg.orgs.getOrganizations = vi.fn(() => Promise.reject(new ApiError('Token expired', 401)));
        const vm = fakeView();

        await Organizations.methods.fetchOrganizations.call(vm);

        expect(vm.$notify.error).not.toHaveBeenCalled();
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

    it('ends the session and signs in again, coming back afterwards', async () => {
        const { handleUnauthorized } = await import('@/libs/authRoutes');
        const r = router('/r');
        const auth = { isLoggedIn: true, logout: vi.fn() };
        handleUnauthorized(r, auth);
        expect(auth.logout).toHaveBeenCalledOnce();
        expect(r.push).toHaveBeenCalledWith({ name: 'Login', query: { redirect: '/r' } });
    });

    it('comes back to the address as it is now, not to the one the route was opened at', async () => {
        const { handleUnauthorized } = await import('@/libs/authRoutes');
        const { replaceQueryKeys } = await import('@/libs/routeQuery');
        const r = router('/r/o/d/view/abc/map?t=1');
        // A map adds its layers without a navigation: the route keeps the address it opened at
        replaceQueryKeys({ layer: ['a'] });
        handleUnauthorized(r, { isLoggedIn: true, logout: vi.fn() });
        expect(r.push).toHaveBeenCalledWith({ name: 'Login', query: { redirect: '/r/o/d/view/abc/map?t=1&layer=a' } });
    });

    it('does nothing on the Login page', async () => {
        const { handleUnauthorized } = await import('@/libs/authRoutes');
        const r = router('/login');
        handleUnauthorized(r, { isLoggedIn: false, logout: vi.fn() });
        expect(r.push).not.toHaveBeenCalled();
    });
});
