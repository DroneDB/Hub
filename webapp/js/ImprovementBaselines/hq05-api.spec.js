/**
 * HQ-05 acceptance: one HTTP client owns auth headers, timeouts, error typing
 * and the 401 callback; task states have one definition.
 * Fails today: libs/ddb/http/httpClient.js and libs/tasks/taskStates.js do not exist.
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
