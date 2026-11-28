/**
 * The website's single sign-on cookie: `<token>|<logout url>`, written URL-encoded by PHP setcookie. A sign-out on
 * purpose is final: the cookie is deleted and the sign-out remembered, because the website writes a fresh token on
 * every page of a signed-in subscriber and Login would sign the visitor in again with it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    xAuthAvailable, getXAuthToken, parseXAuthValue, xAuthSignOut, xAuthSignedOut, clearXAuthSignedOut, XAUTH_LOGOUT_TIMEOUT_MS
} from './xauth';

const LOGOUT = 'https://dronedb.app/wp-login.php?action=logout&_wpnonce=abc';
const EXPIRED = 'expires=Thu, 01 Jan 1970 00:00:00 GMT';

const writeCookie = (token = 'unused-token', logout = LOGOUT) => {
    document.cookie = `xAuthToken=${encodeURIComponent(`${token}|${logout}`)};path=/`;
};

/** The hidden frames the sign-out appends, kept out of the page (a frame would load its address). */
let frames;
beforeEach(() => {
    frames = [];
    localStorage.clear();
    const append = document.body.append.bind(document.body);
    vi.spyOn(document.body, 'append').mockImplementation((...nodes) => {
        const rest = nodes.filter(n => n?.tagName !== 'IFRAME');
        frames.push(...nodes.filter(n => n?.tagName === 'IFRAME'));
        if (rest.length) append(...rest);
    });
});
afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    document.cookie = `xAuthToken=;path=/;${EXPIRED}`;
});

describe('the cookie', () => {
    it('gives the token and the logout URL whole, URL with its query and nonce included', () => {
        writeCookie();
        expect(xAuthAvailable()).toBe(true);
        expect(getXAuthToken()).toBe('unused-token');
        expect(parseXAuthValue(`unused-token|${LOGOUT}`)).toEqual({ token: 'unused-token', logoutUrl: LOGOUT });
    });

    it('is cut at the first `|` only', () => {
        expect(parseXAuthValue('tok|https://dronedb.app/x?a=1|2')).toEqual({ token: 'tok', logoutUrl: 'https://dronedb.app/x?a=1|2' });
        expect(parseXAuthValue('tok')).toEqual({ token: 'tok', logoutUrl: '' });
        expect(parseXAuthValue(undefined)).toEqual({ token: '', logoutUrl: '' });
    });

    it('is not available without it', () => {
        expect(xAuthAvailable()).toBe(false);
        expect(getXAuthToken()).toBe('');
    });
});

describe('xAuthSignOut', () => {
    it('loads the whole logout URL, nonce included, in a hidden frame', async () => {
        writeCookie();
        const done = xAuthSignOut();
        expect(frames).toHaveLength(1);
        expect(frames[0].src).toBe(LOGOUT);
        frames[0].onload();
        await expect(done).resolves.toBeUndefined();
    });

    it('ends signed out at once: the cookie cannot sign in again, even when the website writes a new one', () => {
        writeCookie();
        xAuthSignOut();
        expect(document.cookie).not.toContain('xAuthToken');
        expect(xAuthAvailable()).toBe(false);
        // The website's session is still alive: a fresh, unused token arrives with its next page
        writeCookie('fresh-token');
        expect(xAuthAvailable()).toBe(false);
        expect(getXAuthToken()).toBe('');
        expect(xAuthSignedOut()).toBe(true);
    });

    it('stays signed out until an explicit sign-in clears the mark', () => {
        writeCookie();
        xAuthSignOut();
        writeCookie('fresh-token');
        clearXAuthSignedOut();
        expect(xAuthAvailable()).toBe(true);
        expect(getXAuthToken()).toBe('fresh-token');
    });

    it('deletes the cookie of the parent domains too (the website sets it on its own domain)', () => {
        vi.stubGlobal('location', { ...window.location, hostname: 'hub.dronedb.app' });
        writeCookie();
        const writes = [];
        const setter = vi.spyOn(document, 'cookie', 'set');
        setter.mockImplementation(value => { writes.push(value); });
        xAuthSignOut();
        const domains = writes.filter(w => w.startsWith('xAuthToken=;')).map(w => /domain=([^;]*)/.exec(w)?.[1]);
        expect(domains).toEqual([undefined, 'hub.dronedb.app', 'dronedb.app']);
        expect(writes.every(w => w.includes('path=/') && w.includes(EXPIRED))).toBe(true);
        vi.unstubAllGlobals();
    });

    it('does nothing, and remembers nothing, for a visitor the website never signed in', async () => {
        await expect(xAuthSignOut()).resolves.toBeUndefined();
        expect(frames).toHaveLength(0);
        expect(xAuthSignedOut()).toBe(false);
    });

    it('goes on without the website when its answer does not come', async () => {
        vi.useFakeTimers();
        writeCookie();
        const done = xAuthSignOut();
        await vi.advanceTimersByTimeAsync(XAUTH_LOGOUT_TIMEOUT_MS);
        await expect(done).resolves.toBeUndefined();
    });

    it('does not load an address that is not http(s) (the cookie is not trusted)', async () => {
        writeCookie('tok', 'javascript:alert(1)');
        await expect(xAuthSignOut()).rejects.toThrow('not an http address');
        expect(frames).toHaveLength(0);
        expect(xAuthAvailable()).toBe(false);
    });
});
