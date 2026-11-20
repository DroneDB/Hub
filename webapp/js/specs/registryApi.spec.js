/**
 * One HTTP client owns auth headers, timeouts, error typing and the 401 callback;
 * task states have one definition.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

afterEach(() => vi.restoreAllMocks());

describe('httpClient', () => {
    it('adds the bearer token and returns parsed JSON', async () => {
        const { createHttpClient } = await import('@/libs/ddb/http/httpClient');
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: 1 }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
        const http = createHttpClient({ baseUrl: 'http://h', getToken: () => 'T' });
        expect(await http.send('/x')).toEqual({ ok: 1 });
        expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer T');
    });

    it('raises ApiError with the server message and calls onUnauthorized on 401', async () => {
        const { createHttpClient } = await import('@/libs/ddb/http/httpClient');
        const { ApiError } = await import('@/libs/ddb/apiError');
        vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ error: 'Token expired' }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
        const onUnauthorized = vi.fn();
        const http = createHttpClient({ baseUrl: 'http://h', getToken: () => 'T', onUnauthorized });
        await expect(http.send('/x')).rejects.toBeInstanceOf(ApiError);
        await expect(http.send('/x')).rejects.toMatchObject({ status: 401, message: 'Token expired' });
        expect(onUnauthorized).toHaveBeenCalledTimes(2);
    });

    it('does not report a failed sign-in as a rejected session', async () => {
        const { createHttpClient } = await import('@/libs/ddb/http/httpClient');
        vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('', { status: 401 }));
        const onUnauthorized = vi.fn();
        const http = createHttpClient({ baseUrl: 'http://h', getToken: () => null, onUnauthorized });
        await expect(http.send('/users/authenticate', { method: 'POST' })).rejects.toMatchObject({ status: 401 });
        expect(onUnauthorized).not.toHaveBeenCalled();
    });

    it('turns a network failure into ApiError status 0', async () => {
        const { createHttpClient } = await import('@/libs/ddb/http/httpClient');
        vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
        const http = createHttpClient({ baseUrl: 'http://h', getToken: () => null });
        await expect(http.send('/x')).rejects.toMatchObject({ status: 0, message: 'Network error: Failed to fetch' });
    });

    it('fetchRaw returns the Response with auth for blob/stream callers', async () => {
        const { createHttpClient } = await import('@/libs/ddb/http/httpClient');
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('bytes', { status: 200 }));
        const http = createHttpClient({ baseUrl: 'http://h', getToken: () => 'T' });
        const res = await http.fetchRaw('/file');
        expect(await res.text()).toBe('bytes');
        expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer T');
    });
});

describe('taskStates', () => {
    it('defines active states and the dataset key once', async () => {
        const { ACTIVE_STATES, TERMINAL_STATES, datasetKey } = await import('@/libs/tasks/taskStates');
        expect(TERMINAL_STATES).toEqual(expect.arrayContaining(['Succeeded', 'Failed']));
        expect(ACTIVE_STATES).not.toEqual(expect.arrayContaining(['Succeeded']));
        expect(datasetKey({ org: 'org', ds: 'ds' })).toBe('org/ds');
        expect(datasetKey({ baseApi: '/orgs/o/ds/d', org: 'o', ds: 'd' })).toBe('/orgs/o/ds/d');
    });
});

describe('e-mail templates and notification status', () => {
    /** The requests a client sends, answered with `status` and a JSON `body`. */
    async function client(status = 200, body = {}) {
        const { default: Registry } = await import('@/libs/ddb/registry');
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
            new Response(JSON.stringify(body), { status, headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' } }));
        const sent = () => fetchMock.mock.calls.map(([url, init]) => [init.method, new URL(url).pathname, init.body ? JSON.parse(init.body) : undefined]);
        return { reg: new Registry('http://hub.test'), sent };
    }
    const text = { subject: 'S', body: 'B' };

    it('reach the endpoints of the Registry with the name encoded', async () => {
        const { reg, sent } = await client();
        await reg.sys.emailTemplates();
        await reg.sys.emailTemplate('build-notification');
        await reg.sys.saveEmailTemplate('a/b', text);
        await reg.sys.resetEmailTemplate('build-notification');
        await reg.sys.previewEmailTemplate('build-notification', text);
        await reg.sys.testEmailTemplate('build-notification', text);
        await reg.notificationStatus();
        expect(sent()).toEqual([
            ['GET', '/sys/email/templates', undefined],
            ['GET', '/sys/email/templates/build-notification', undefined],
            ['PUT', '/sys/email/templates/a%2Fb', text],
            ['DELETE', '/sys/email/templates/build-notification', undefined],
            ['POST', '/sys/email/templates/build-notification/preview', text],
            ['POST', '/sys/email/templates/build-notification/test', text],
            ['GET', '/users/notifications/status', undefined]
        ]);
    });

    it('a refused text rejects with status 400 and the ProblemDetails detail', async () => {
        const { isBadRequest } = await import('@/libs/ddb/apiError');
        const { reg } = await client(400, { title: 'Bad Request', status: 400, detail: 'Unknown placeholder {{foo}} in the body' });
        const error = await reg.sys.saveEmailTemplate('build-notification', text).catch(e => e);
        expect(isBadRequest(error)).toBe(true);
        expect(error.message).toBe('Unknown placeholder {{foo}} in the body');
    });
});

describe('the account of the signed-in user', () => {
    it('is read from the routes of the signed-in user, which answer every user, not from the routes that take a user name', async () => {
        const { default: Registry } = await import('@/libs/ddb/registry');
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => new Response(
            JSON.stringify(new URL(url).pathname === '/users/storage'
                ? { used: 5, total: 10 }
                : { userName: 'docsdemo', email: 'docsdemo@example.com', roles: [], organizations: ['quarry'] }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }));
        const reg = new Registry('http://hub.test');
        vi.spyOn(reg, 'ensureLoggedIn').mockReturnValue(true);

        expect(await reg.currentUser()).toEqual({ userName: 'docsdemo', email: 'docsdemo@example.com', roles: [], organizations: ['quarry'] });
        expect(await reg.storageInfo()).toMatchObject({ used: 5, total: 10 });
        expect(fetchMock.mock.calls.map(([url, init]) => [init.method, new URL(url).pathname])).toEqual([
            ['GET', '/users/me'],
            ['GET', '/users/storage']
        ]);
    });
});

describe('upload diagnostics requests', () => {
    /** A response whose body reports when it is read to its end */
    function trackedResponse(status, text) {
        const state = { drained: false };
        const body = new ReadableStream({
            start(controller) { controller.enqueue(new TextEncoder().encode(text)); },
            pull(controller) { state.drained = true; controller.close(); }
        });
        return { state, response: new Response(body, { status }) };
    }

    async function sysWith(response) {
        const { default: SysApi } = await import('@/libs/ddb/sysApi');
        const registry = { fetchRaw: vi.fn(async () => response) };
        return { sys: new SysApi(registry), registry };
    }

    it('the upload probe reads its answer to the end and answers the status', async () => {
        const { state, response } = trackedResponse(429, '{"error":"Too many"}');
        const { sys, registry } = await sysWith(response);
        const res = await sys.uploadProbe(new Blob(['x']));
        expect(registry.fetchRaw).toHaveBeenCalledWith('/sys/upload-probe', expect.objectContaining({ method: 'POST', cache: 'no-store' }));
        expect(state.drained).toBe(true);
        expect(response.bodyUsed).toBe(true);
        expect(res).toEqual({ status: 429, ok: false });
    });

    it('the round trip reads its answer to the end', async () => {
        const { state, response } = trackedResponse(200, '{"version":"1"}');
        const { sys } = await sysWith(response);
        expect(await sys.ping()).toEqual({ status: 200, ok: true });
        expect(state.drained).toBe(true);
    });
});
