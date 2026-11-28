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

describe('Registry writes and the request cache', () => {
    // /orgs/<org>/ and /sys/features are cached for seconds; /users/preferences is not
    let calls;
    let n = 0;
    // The request cache is shared per origin: each test gets its own
    const newRegistry = () => new Registry(`http://cache${++n}.test`);
    beforeEach(() => {
        calls = [];
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init = {}) => {
            calls.push({ url: String(url), method: init.method, body: init.body });
            return new Response(JSON.stringify({ n: calls.length }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        });
    });
    const gets = path => calls.filter(c => c.method === 'GET' && c.url.endsWith(path)).length;

    it('patchRequest with invalidate keeps the cached reads of other endpoints', async () => {
        const reg = newRegistry();
        await reg.getRequest('/orgs/ann/');
        await reg.getRequest('/sys/features');
        await reg.patchRequest('/users/preferences', { units: { measurement: 'imperial' } }, { invalidate: '/users/preferences' });
        await reg.getRequest('/orgs/ann/');
        await reg.getRequest('/sys/features');
        expect(gets('/orgs/ann/')).toBe(1);
        expect(gets('/sys/features')).toBe(1);
    });

    it('patchRequest sends a PATCH with the JSON body', async () => {
        const reg = newRegistry();
        await reg.patchRequest('/users/preferences', { units: null }, { invalidate: '/users/preferences' });
        const patch = calls.find(c => c.method === 'PATCH');
        expect(patch.url).toBe(`http://cache${n}.test/users/preferences`);
        expect(JSON.parse(patch.body)).toEqual({ units: null });
    });

    it('invalidate drops the cached reads that start with the prefix', async () => {
        const reg = newRegistry();
        await reg.getRequest('/orgs/ann/');
        await reg.getRequest('/orgs/bob/');
        await reg.patchRequest('/orgs/ann/x', {}, { invalidate: '/orgs/ann' });
        await reg.getRequest('/orgs/ann/');
        await reg.getRequest('/orgs/bob/');
        expect(gets('/orgs/ann/')).toBe(2);
        expect(gets('/orgs/bob/')).toBe(1);
    });

    it('a default write still drops every cached read', async () => {
        const reg = newRegistry();
        await reg.getRequest('/orgs/ann/');
        await reg.getRequest('/sys/features');
        await reg.patchRequest('/users/preferences', {});
        await reg.postRequest('/anything', {});
        await reg.getRequest('/orgs/ann/');
        await reg.getRequest('/sys/features');
        expect(gets('/orgs/ann/')).toBe(2);
        expect(gets('/sys/features')).toBe(2);
    });

    it('other writes (put, post) drop everything as before', async () => {
        const reg = newRegistry();
        await reg.getRequest('/orgs/ann/');
        await reg.putRequest('/x', {});
        await reg.getRequest('/orgs/ann/');
        expect(gets('/orgs/ann/')).toBe(2);
    });

    it('a read sent with cache:false is not cached (the preferences read)', async () => {
        const reg = newRegistry();
        await reg.getRequest('/users/preferences', { cache: false });
        await reg.getRequest('/users/preferences', { cache: false });
        expect(gets('/users/preferences')).toBe(2);
    });

    // FR-XC-05: skipUnauthorized is part of the cache key
    it('a silent and a normal GET of the same endpoint are two flights', async () => {
        const reg = newRegistry();
        await Promise.all([
            reg.getRequest('/orgs/x/', { skipUnauthorized: true }),
            reg.getRequest('/orgs/x/')
        ]);
        expect(gets('/orgs/x/')).toBe(2);
        // The real endpoint is sent, without the cache marker
        expect(calls.every(c => c.url === `http://cache${n}.test/orgs/x/`)).toBe(true);
    });

    it('invalidate of the endpoint prefix drops the silent and the normal read', async () => {
        const reg = newRegistry();
        await reg.getRequest('/orgs/x/', { skipUnauthorized: true });
        await reg.getRequest('/orgs/x/');
        reg.invalidateCache('/orgs/x/');
        await reg.getRequest('/orgs/x/', { skipUnauthorized: true });
        await reg.getRequest('/orgs/x/');
        expect(gets('/orgs/x/')).toBe(4);
    });

    it('the TTL of the endpoint applies to the silent read', async () => {
        let now = 1_000_000;
        vi.spyOn(Date, 'now').mockImplementation(() => now);
        const reg = newRegistry();
        await reg.getRequest('/orgs/x/', { skipUnauthorized: true });
        await reg.getRequest('/orgs/x/', { skipUnauthorized: true });
        expect(gets('/orgs/x/')).toBe(1);
        now += 10_001;
        await reg.getRequest('/orgs/x/', { skipUnauthorized: true });
        expect(gets('/orgs/x/')).toBe(2);
    });

    it('a 401 of a silent read rejects without reaching the unauthorized handler; a normal one reaches it', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
            new Response(JSON.stringify({ title: 'Unauthorized', status: 401 }), { status: 401, headers: { 'Content-Type': 'application/problem+json' } }));
        const reg = newRegistry();
        const handler = vi.fn();
        reg.onUnauthorized(handler);
        await expect(reg.getRequest('/orgs/x/', { skipUnauthorized: true })).rejects.toMatchObject({ status: 401 });
        expect(handler).not.toHaveBeenCalled();
        await expect(reg.getRequest('/orgs/x/')).rejects.toMatchObject({ status: 401 });
        expect(handler).toHaveBeenCalledTimes(1);
    });
});

describe('Registry writes that are still running', () => {
    let n = 0;
    const newRegistry = () => new Registry(`http://writes${++n}.test`);

    it('do not leave the read that started meanwhile in the cache: it may have seen the old state', async () => {
        let finishWrite;
        let version = 'old';
        const reads = [];
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init = {}) => {
            const body = (data) => new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
            if (init.method === 'PATCH') {
                await new Promise(resolve => { finishWrite = resolve; });
                version = 'new';
                return body({ ok: true });
            }
            reads.push(version);
            return body({ version });
        });
        const reg = newRegistry();

        const write = reg.patchRequest('/users/preferences', { a: 1 });
        // A read that starts while the write is running is answered with the state before it
        const during = await reg.getRequest('/sys/features');
        expect(during).toEqual({ version: 'old' });
        finishWrite();
        await write;

        // The next read asks again: it is not the answer kept for the next 30 seconds
        expect(await reg.getRequest('/sys/features')).toEqual({ version: 'new' });
        expect(reads).toEqual(['old', 'new']);
    });
});

describe('Registry endpoint validation', () => {
    const reg = new Registry('http://validation.test');
    beforeEach(() => {
        vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
            new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    });

    it('accepts a name that only contains dots', async () => {
        await expect(reg.getRequest('/orgs/a/ds/b/download/misc.../notes.md')).resolves.toEqual({});
        await expect(reg.getRequest('/orgs/a/ds/b/download/v1..2/x?path=misc...%2Fnotes.md')).resolves.toEqual({});
        await expect(reg.getRequest('/orgs/a/ds/b/download/x..')).resolves.toEqual({});
    });

    it('still refuses a segment that climbs out of the folder, in the path and in the query', async () => {
        for (const endpoint of ['/orgs/a/../b', '/orgs/a/ds/b/download/../x', '/orgs/a/ds/b/download/x/..', '/x?path=../y', '/x\\..\\y']) {
            await expect(reg.getRequest(endpoint)).rejects.toThrow('dangerous');
        }
    });
});
