/**
 * Error contract with Registry: the Hub reads both the legacy
 * `{ error }` body and RFC 9457 ProblemDetails, so it runs against a Registry before
 * and after the ProblemDetails switch.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHttpClient } from './httpClient';
import { isForbidden } from '../apiError';

afterEach(() => vi.restoreAllMocks());

const client = () => createHttpClient({ baseUrl: 'http://http.test', getToken: () => null });

/** @param {number} status @param {object} body @param {string} contentType */
function respondWith(status, body, contentType) {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
        new Response(JSON.stringify(body), { status, headers: { 'Content-Type': contentType } }));
}

describe('httpClient error messages', () => {
    it('reads a ProblemDetails body sent as application/problem+json', async () => {
        respondWith(403, { type: 'about:blank', title: 'Forbidden', status: 403,
            detail: 'You cannot write to this dataset', noRetry: true }, 'application/problem+json');
        const error = await client().send('/orgs/x/ds/y').catch(e => e);
        expect(error.message).toBe('You cannot write to this dataset');
        expect(error.status).toBe(403);
        expect(error.noRetry).toBe(true);
        expect(isForbidden(error)).toBe(true);
    });

    it('falls back to the ProblemDetails title when there is no detail', async () => {
        respondWith(409, { title: 'Conflict', status: 409 }, 'application/problem+json; charset=utf-8');
        const error = await client().send('/x').catch(e => e);
        expect(error.message).toBe('Conflict');
        expect(error.status).toBe(409);
    });

    it('still reads the legacy { error } body', async () => {
        respondWith(400, { error: 'Invalid slug', noRetry: true }, 'application/json');
        const error = await client().send('/x').catch(e => e);
        expect(error.message).toBe('Invalid slug');
        expect(error.noRetry).toBe(true);
    });

    it('does not treat a successful body with a title or detail field as an error', async () => {
        respondWith(200, { title: 'Survey 2026', detail: 'notes' }, 'application/json');
        await expect(client().send('/x')).resolves.toEqual({ title: 'Survey 2026', detail: 'notes' });
    });

    // The status of a failed task carries its error as data: reading it must not fail
    it('returns a successful body with an error or message field as data', async () => {
        const failedTask = { taskId: '7', state: 'Failed', logTail: ['Build failed: bm3d_runner not found'],
            error: 'InvalidOperationException' };
        respondWith(200, failedTask, 'application/json');
        await expect(client().send('/orgs/x/ds/y/tasks/7')).resolves.toEqual(failedTask);

        respondWith(200, { message: 'Import queued' }, 'application/json');
        await expect(client().send('/x')).resolves.toEqual({ message: 'Import queued' });
    });

    it('returns a successful untyped JSON body with an error field as data', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
            new Response(new TextEncoder().encode('{"state":"Failed","error":"Timeout"}'), { status: 200 }));
        await expect(client().send('/x')).resolves.toEqual({ state: 'Failed', error: 'Timeout' });
    });
});

// FR-XC-05: a request the user did not start can opt out of the global 401 handler
describe('httpClient skipUnauthorized', () => {
    const withHandler = () => {
        const onUnauthorized = vi.fn();
        return { onUnauthorized, http: createHttpClient({ baseUrl: 'http://http.test', getToken: () => null, onUnauthorized }) };
    };

    it('a 401 with skipUnauthorized does not reach the handler and still rejects with 401', async () => {
        respondWith(401, { title: 'Unauthorized', status: 401 }, 'application/problem+json');
        const { onUnauthorized, http } = withHandler();
        const error = await http.send('/orgs/acme/', { skipUnauthorized: true }).catch(e => e);
        expect(error.status).toBe(401);
        expect(onUnauthorized).not.toHaveBeenCalled();
    });

    it('a 403 with skipUnauthorized does not reach the handler and still rejects with 403', async () => {
        respondWith(403, { title: 'Forbidden', status: 403 }, 'application/problem+json');
        const { onUnauthorized, http } = withHandler();
        await expect(http.send('/orgs/acme/', { skipUnauthorized: true })).rejects.toMatchObject({ status: 403 });
        expect(onUnauthorized).not.toHaveBeenCalled();
    });

    it('a 401 without the option reaches the handler', async () => {
        respondWith(401, { title: 'Unauthorized', status: 401 }, 'application/problem+json');
        const { onUnauthorized, http } = withHandler();
        await expect(http.send('/orgs/acme/')).rejects.toMatchObject({ status: 401 });
        expect(onUnauthorized).toHaveBeenCalledTimes(1);
        expect(onUnauthorized.mock.calls[0][0].status).toBe(401);
    });
});
