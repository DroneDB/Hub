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

describe('handleUnauthorized', () => {
    const router = path => ({
        currentRoute: { value: { name: path === '/login' ? 'Login' : 'Organizations', fullPath: path } },
        push: vi.fn(() => Promise.resolve())
    });

    it('ends the session and signs in again, coming back afterwards', async () => {
        const { handleUnauthorized } = await import('@/libs/authRoutes');
        const r = router('/r');
        const auth = { isLoggedIn: true, logout: vi.fn() };
        handleUnauthorized(r, auth);
        expect(auth.logout).toHaveBeenCalledOnce();
        expect(r.push).toHaveBeenCalledWith({ name: 'Login', query: { redirect: '/r' } });
    });

    it('does nothing on the Login page', async () => {
        const { handleUnauthorized } = await import('@/libs/authRoutes');
        const r = router('/login');
        handleUnauthorized(r, { isLoggedIn: false, logout: vi.fn() });
        expect(r.push).not.toHaveBeenCalled();
    });
});
