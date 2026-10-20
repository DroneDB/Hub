/**
 * Error contract with Registry (plan D1/D2, RQ-05): the Hub reads both the legacy
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
});
