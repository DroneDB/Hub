/**
 * HQ-03: a 401 while listing organisations ends the session and goes to Login.
 * Before, the page tested `e.noRetry` (set only by the upload layer), so it always
 * showed "Temporary authentication issue" and never redirected.
 */
import { describe, it, expect, vi } from 'vitest';
import { ApiError } from '@/libs/ddb/apiError';

const reg = vi.hoisted(() => ({ isAdmin: () => false, getOrganizations: null, logout: null }));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: reg }));

const { default: Organizations } = await import('./Organizations.vue');

function fakeView() {
    return {
        showAll: false,
        $router: { push: vi.fn(() => Promise.resolve()) },
        $notify: { error: vi.fn() }
    };
}

describe('Organizations.fetchOrganizations', () => {
    it('logs out and goes to Login when the server rejects the session', async () => {
        reg.getOrganizations = vi.fn(() => Promise.reject(new ApiError('Token expired', 401)));
        reg.logout = vi.fn();
        const vm = fakeView();

        await Organizations.methods.fetchOrganizations.call(vm);

        expect(reg.logout).toHaveBeenCalledOnce();
        expect(vm.$router.push).toHaveBeenCalledWith({ name: 'Login' });
        expect(vm.$notify.error).not.toHaveBeenCalled();
    });

    it('shows other errors', async () => {
        reg.getOrganizations = vi.fn(() => Promise.reject(new ApiError('Boom', 500)));
        reg.logout = vi.fn();
        const vm = fakeView();

        await Organizations.methods.fetchOrganizations.call(vm);

        expect(reg.logout).not.toHaveBeenCalled();
        expect(vm.$notify.error).toHaveBeenCalledWith('Boom');
    });
});
