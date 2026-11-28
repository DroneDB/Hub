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
import { handleUnauthorized } from '../authRoutes';

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

describe('AuthSession: a refused token refresh ends the session', () => {
    beforeEach(() => localStorage.clear());

    // The server refuses the refresh with 401; any other request (POST /users/logout) is answered 200
    const refusingServer = () => vi.spyOn(globalThis, 'fetch').mockImplementation(async url =>
        new Response(String(url).endsWith('/users/authenticate/refresh') ? '{"title":"Unauthorized"}' : null,
            { status: String(url).endsWith('/users/authenticate/refresh') ? 401 : 200 }));

    it('as the app ends a refused session: one logout event, one trip to Login with the "expired" notice', async () => {
        const reg = signedIn('http://refresh.test');
        refusingServer();
        const onLogout = vi.fn();
        reg.addEventListener('logout', onLogout);
        // The app's wiring (main.js): the auth store signs out through the client
        const auth = { isLoggedIn: true, logout: vi.fn(() => { reg.logout(); auth.isLoggedIn = false; }) };
        const router = { currentRoute: { value: { name: 'Datasets' } }, push: vi.fn(() => Promise.resolve()) };
        reg.onUnauthorized(() => handleUnauthorized(/** @type {any} */ (router), auth));

        await expect(reg.refreshToken()).rejects.toThrow('logged out');

        expect(auth.logout).toHaveBeenCalledTimes(1);
        expect(onLogout).toHaveBeenCalledTimes(1);
        expect(router.push).toHaveBeenCalledTimes(1);
        expect(router.push.mock.calls[0][0]).toMatchObject({ name: 'Login', query: { notice: 'expired' } });
        expect(reg.getAuthToken()).toBe(null);
    });

    it('with no handler yet (at boot): the session is ended here, with the logout event, once', async () => {
        const reg = signedIn('http://refresh.test');
        refusingServer();
        const onLogout = vi.fn();
        reg.addEventListener('logout', onLogout);

        await expect(reg.refreshToken()).rejects.toThrow('logged out');

        expect(onLogout).toHaveBeenCalledTimes(1);
        expect(reg.getAuthToken()).toBe(null);
        expect(reg.getUsername()).toBe(null);
    });

    it('when the handler leaves it (the Login page): ended here, once, and nobody navigates', async () => {
        const reg = signedIn('http://refresh.test');
        refusingServer();
        const onLogout = vi.fn();
        reg.addEventListener('logout', onLogout);
        const auth = { isLoggedIn: true, logout: vi.fn() };
        const router = { currentRoute: { value: { name: 'Login' } }, push: vi.fn(() => Promise.resolve()) };
        reg.onUnauthorized(() => handleUnauthorized(/** @type {any} */ (router), auth));

        await expect(reg.refreshToken()).rejects.toThrow('logged out');

        expect(auth.logout).not.toHaveBeenCalled();
        expect(router.push).not.toHaveBeenCalled();
        expect(onLogout).toHaveBeenCalledTimes(1);
        expect(reg.getAuthToken()).toBe(null);
    });

    it('a refresh that fails otherwise (the server is down) keeps the session', async () => {
        const reg = signedIn('http://refresh.test');
        vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('', { status: 503 }));
        const onLogout = vi.fn();
        reg.addEventListener('logout', onLogout);

        await expect(reg.refreshToken()).rejects.toBeTruthy();

        expect(onLogout).not.toHaveBeenCalled();
        expect(reg.getAuthToken()).toBe('x.e30.y');
    });
});

describe('AuthSession: a refresh that answers after the session changed', () => {
    beforeEach(() => localStorage.clear());

    const bobToken = 'x.eyJzdWIiOiJib2IifQ.y';
    const answer = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

    /** fetch that holds the refresh request until `release(response)`; every other request is answered 200 at once. */
    const holdRefresh = () => {
        let release;
        vi.spyOn(globalThis, 'fetch').mockImplementation(url => {
            if (String(url).endsWith('/users/authenticate/refresh')) return new Promise(resolve => { release = resolve; });
            if (String(url).endsWith('/users/authenticate')) return Promise.resolve(answer({ token: bobToken, username: 'bob', expires: Math.floor(Date.now() / 1000) + 3600 }));
            return Promise.resolve(new Response(null, { status: 200 }));
        });
        return response => release(response);
    };

    it('does not sign the user back in after a sign-out', async () => {
        const reg = signedIn('http://refresh.test');
        const release = holdRefresh();
        const onLogin = vi.fn();
        reg.addEventListener('login', onLogin);

        const refreshing = reg.refreshToken();
        const outcome = refreshing.catch(e => e);
        await Promise.resolve();
        reg.logout();
        release(answer({ token: 'x.e30.old', expires: Math.floor(Date.now() / 1000) + 3600 }));

        expect((await outcome).message).toBe('logged out');
        expect(reg.getAuthToken()).toBe(null);
        expect(reg.getUsername()).toBe(null);
        expect(localStorage.getItem('http://refresh.test_jwt_token')).toBe(null);
    });

    it('does not store the old user\'s token under the next user', async () => {
        const reg = signedIn('http://refresh.test');
        const release = holdRefresh();

        const outcome = reg.refreshToken().catch(e => e);
        await Promise.resolve();
        reg.logout();
        await reg.login('bob', 'pw');
        release(answer({ token: 'x.e30.ann-refreshed', expires: Math.floor(Date.now() / 1000) + 3600 }));

        expect((await outcome).message).toBe('logged out');
        expect(reg.getUsername()).toBe('bob');
        expect(reg.getAuthToken()).toBe(bobToken);
    });

    it('a refusal that arrives after the sign-out does not end the next user\'s session', async () => {
        const reg = signedIn('http://refresh.test');
        const release = holdRefresh();
        const onLogout = vi.fn();
        reg.addEventListener('logout', onLogout);
        const unauthorized = vi.fn();
        reg.onUnauthorized(unauthorized);

        const outcome = reg.refreshToken().catch(e => e);
        await Promise.resolve();
        reg.logout();
        await reg.login('bob', 'pw');
        onLogout.mockClear();
        release(answer({ title: 'Unauthorized' }, 401));

        expect((await outcome).message).toBe('logged out');
        expect(unauthorized).not.toHaveBeenCalled();
        expect(onLogout).not.toHaveBeenCalled();
        expect(reg.getUsername()).toBe('bob');
    });

    // localStorage is shared by every tab of the site: another tab writes it while this one waits for its answer
    it('does not sign the user back in after another tab signed out', async () => {
        const reg = signedIn('http://refresh.test');
        const release = holdRefresh();
        const outcome = reg.refreshToken().catch(e => e);
        await Promise.resolve();
        // The other tab's sign-out: the stored session goes, this tab's own count of sessions does not change
        for (const key of ['_jwt_token', '_jwt_token_expires', '_username']) localStorage.removeItem(`http://refresh.test${key}`);
        release(answer({ token: 'x.e30.old', expires: Math.floor(Date.now() / 1000) + 3600 }));

        expect((await outcome).message).toBe('logged out');
        expect(localStorage.getItem('http://refresh.test_jwt_token')).toBe(null);
        expect(reg.getUsername()).toBe(null);
    });

    it('does not store the old user\'s token under the user another tab signed in', async () => {
        const reg = signedIn('http://refresh.test');
        const release = holdRefresh();
        const outcome = reg.refreshToken().catch(e => e);
        await Promise.resolve();
        localStorage.setItem('http://refresh.test_username', 'bob');
        localStorage.setItem('http://refresh.test_jwt_token', bobToken);
        release(answer({ token: 'x.e30.ann-refreshed', expires: Math.floor(Date.now() / 1000) + 3600 }));

        expect((await outcome).message).toBe('logged out');
        expect(reg.getUsername()).toBe('bob');
        expect(reg.getAuthToken()).toBe(bobToken);
    });

    it('keeps the token another tab renewed for the same user, and a refusal of the old one does not end the session', async () => {
        for (const reply of [answer({ token: 'x.e30.mine', expires: Math.floor(Date.now() / 1000) + 3600 }), answer({ title: 'Unauthorized' }, 401)]) {
            localStorage.clear();
            vi.restoreAllMocks();
            const reg = signedIn('http://refresh.test');
            const release = holdRefresh();
            const onLogout = vi.fn();
            reg.addEventListener('logout', onLogout);
            const refreshing = reg.refreshToken();
            await Promise.resolve();
            localStorage.setItem('http://refresh.test_jwt_token', 'x.e30.other-tab');
            release(reply);
            await refreshing;

            expect(reg.getAuthToken()).toBe('x.e30.other-tab');
            expect(reg.getUsername()).toBe('ann');
            expect(onLogout).not.toHaveBeenCalled();
        }
    });

    it('still renews the token of a session that did not change', async () => {
        const reg = signedIn('http://refresh.test');
        const release = holdRefresh();
        const refreshing = reg.refreshToken();
        await Promise.resolve();
        release(answer({ token: 'x.e30.renewed', expires: Math.floor(Date.now() / 1000) + 7200 }));
        await refreshing;
        expect(reg.getAuthToken()).toBe('x.e30.renewed');
        expect(reg.getUsername()).toBe('ann');
    });
});
