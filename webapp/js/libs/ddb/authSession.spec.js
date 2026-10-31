/**
 * The server may set the auth cookie HttpOnly (Basic auth sign-in), which script
 * cannot clear. Sign-out therefore asks the Registry to expire it (POST /users/logout), without
 * waiting for or depending on the answer. Sign-in asks the same before writing its cookie: the
 * browser silently drops a script-written cookie with the name of an HttpOnly one, so the previous
 * user's cookie would keep authenticating images, tiles and downloads.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import Registry from './registry';
import { EXPIRE_COOKIE_TIMEOUT_MS } from './authSession';

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

describe('AuthSession sign-in', () => {
    beforeEach(() => localStorage.clear());
    afterEach(() => { document.cookie = 'jwtToken=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/'; });

    const newToken = 'x.eyJzdWIiOiJib2IifQ.y';
    const cookieWritten = () => document.cookie.includes(`jwtToken=${newToken}`);

    /**
     * fetch answering sign-in with bob's token and /users/logout with `logoutResponse()`; every
     * request is recorded with whether the new auth cookie was already written at that moment.
     */
    const mockServer = (events, logoutResponse = () => Promise.resolve(new Response(null, { status: 200 }))) =>
        vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
            const path = new URL(String(url)).pathname;
            events.push(`${path}${cookieWritten() ? ' (cookie written)' : ''}`);
            if (path === '/users/logout') return logoutResponse();
            return Promise.resolve(new Response(JSON.stringify({
                username: 'bob', token: newToken, expires: Math.floor(Date.now() / 1000) + 3600
            }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
        });

    it('expires the (possibly HttpOnly) server cookie before writing its own', async () => {
        const reg = signedIn(window.location.origin);
        const events = [];
        let answerLogout;
        mockServer(events, () => new Promise(resolve => { answerLogout = resolve; }));

        const signingIn = reg.login('bob', 'secret');
        await vi.waitFor(() => expect(events).toContain('/users/logout'));

        // The cookie waits for the server's answer
        expect(cookieWritten()).toBe(false);
        answerLogout(new Response(null, { status: 200 }));
        await signingIn;

        expect(events).toEqual(['/users/authenticate', '/users/logout']);
        expect(cookieWritten()).toBe(true);
    });

    it('signs in even when expiring the server cookie fails', async () => {
        const reg = signedIn(window.location.origin);
        const events = [];
        mockServer(events, () => Promise.reject(new TypeError('network down')));

        const res = await reg.login('bob', 'secret');

        expect(res.username).toBe('bob');
        expect(reg.getAuthToken()).toBe(newToken);
        expect(events).toEqual(['/users/authenticate', '/users/logout']);
        expect(cookieWritten()).toBe(true);
    });

    it('does not wait for the server cookie forever', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        try {
            const reg = signedIn(window.location.origin);
            // The logout request never answers; it only ends when aborted
            mockServer([], () => new Promise(() => {}));
            const fetchSpy = vi.mocked(globalThis.fetch);
            const inner = fetchSpy.getMockImplementation();
            fetchSpy.mockImplementation((url, init) => String(url).endsWith('/users/logout')
                ? new Promise((_, reject) => init.signal.addEventListener('abort',
                    () => reject(new DOMException('Aborted', 'AbortError'))))
                : inner(url, init));

            let signedInAs = null;
            const signingIn = reg.login('bob', 'secret').then(res => { signedInAs = res.username; });

            await vi.advanceTimersByTimeAsync(EXPIRE_COOKIE_TIMEOUT_MS - 1);
            expect(signedInAs).toBe(null);

            await vi.advanceTimersByTimeAsync(1);
            await signingIn;
            expect(signedInAs).toBe('bob');
            expect(cookieWritten()).toBe(true);
        } finally {
            vi.useRealTimers();
        }
    });

    it('does not call another origin at sign-in', async () => {
        const reg = new Registry('http://elsewhere.test');
        const fetchSpy = mockServer([]);

        await reg.login('bob', 'secret');

        expect(logoutCalls(fetchSpy)).toHaveLength(0);
    });
});
