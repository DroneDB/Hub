/**
 * Registry is a facade over the transport, the session and the API groups.
 * These tests pin its public surface and the session's storage/refresh behaviour.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import Registry from './registry';

afterEach(() => vi.restoreAllMocks());

const SESSION_API = ['login', 'logout', 'changePwd', 'refreshToken', 'setAutoRefreshToken', 'setCredentials',
    'clearCredentials', 'getAuthToken', 'getAuthTokenExpiration', 'getUsername', 'isAdmin', 'isLoggedIn', 'ensureLoggedIn'];

describe('Registry facade', () => {
    it('keeps the session methods and exposes the API groups', () => {
        const reg = new Registry('http://facade.test');
        for (const m of SESSION_API) expect(typeof reg[m]).toBe('function');
        for (const m of ['makeRequest', 'getRequest', 'postRequest', 'fetchRaw', 'authHeaders', 'onUnauthorized', 'Organization']) {
            expect(typeof reg[m]).toBe('function');
        }
        expect(typeof reg.admin.users).toBe('function');
        expect(typeof reg.orgs.getOrganizations).toBe('function');
        expect(typeof reg.features.get).toBe('function');
        expect(typeof reg.sys.config).toBe('function');
        expect(typeof reg.share.init).toBe('function');
    });
});

describe('AuthSession', () => {
    beforeEach(() => localStorage.clear());

    // A JWT whose payload is { "admin": true }
    const ADMIN_JWT = `x.${btoa(JSON.stringify({ admin: true }))}.y`;

    it('stores the credentials and reads them back until they expire', () => {
        const reg = new Registry('http://session.test');
        const future = Math.floor(Date.now() / 1000) + 3600;
        reg.setCredentials('ann', ADMIN_JWT, future);
        expect(reg.getAuthToken()).toBe(ADMIN_JWT);
        expect(reg.getUsername()).toBe('ann');
        expect(reg.isLoggedIn()).toBe(true);
        expect(reg.authHeaders()).toEqual({ Authorization: `Bearer ${ADMIN_JWT}` });

        reg.setCredentials('ann', ADMIN_JWT, Math.floor(Date.now() / 1000) - 10);
        expect(reg.getAuthToken()).toBe(null);
        expect(reg.isLoggedIn()).toBe(false);
    });

    it('a rejected refresh clears the session', async () => {
        const reg = new Registry('http://refresh.test');
        reg.setCredentials('ann', ADMIN_JWT, Math.floor(Date.now() / 1000) + 3600);
        vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('', { status: 401 }));
        await expect(reg.refreshToken()).rejects.toThrow('logged out');
        expect(reg.getAuthToken()).toBe(null);
    });

    it('logout clears the token, the feature flags and tells listeners', () => {
        const reg = new Registry('http://logout.test');
        reg.setCredentials('ann', ADMIN_JWT, Math.floor(Date.now() / 1000) + 3600);
        reg.features.values = { X: true };
        const onLogout = vi.fn();
        reg.addEventListener('logout', onLogout);
        reg.logout();
        expect(reg.getAuthToken()).toBe(null);
        expect(reg.features.get('X')).toBe(false);
        expect(onLogout).toHaveBeenCalled();
    });
});
