/**
 * RQ-01 (Registry): the server may set the auth cookie HttpOnly (Basic auth sign-in), which script
 * cannot clear. Sign-out therefore asks the Registry to expire it (POST /users/logout), without
 * waiting for or depending on the answer.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import Registry from './registry';

afterEach(() => vi.restoreAllMocks());

const signedIn = (url) => {
    const reg = new Registry(url);
    reg.setCredentials('ann', 'x.e30.y', Math.floor(Date.now() / 1000) + 3600);
    return reg;
};

const logoutCalls = (fetchSpy) => fetchSpy.mock.calls.filter(([url]) => String(url).endsWith('/users/logout'));

describe('AuthSession sign-out', () => {
    beforeEach(() => localStorage.clear());

    it('asks the same-origin Registry to expire the (possibly HttpOnly) auth cookie', () => {
        const reg = signedIn(window.location.origin);
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));

        reg.logout();

        const calls = logoutCalls(fetchSpy);
        expect(calls).toHaveLength(1);
        expect(calls[0][0]).toBe(`${window.location.origin}/users/logout`);
        expect(calls[0][1].method).toBe('POST');
    });

    it('signs out at once, even when the request fails', async () => {
        const reg = signedIn(window.location.origin);
        let rejectFetch;
        vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise((_, reject) => { rejectFetch = reject; }));
        const onLogout = vi.fn();
        reg.addEventListener('logout', onLogout);

        expect(() => reg.logout()).not.toThrow();
        // Not waiting for the server
        expect(reg.getAuthToken()).toBe(null);
        expect(onLogout).toHaveBeenCalled();

        // A failed request is swallowed (no unhandled rejection)
        rejectFetch(new TypeError('network down'));
        await new Promise(resolve => setTimeout(resolve, 0));
    });

    it('does not call another origin (it cannot hold this site\'s cookie)', () => {
        const reg = signedIn('http://elsewhere.test');
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));

        reg.logout();

        expect(logoutCalls(fetchSpy)).toHaveLength(0);
    });
});
