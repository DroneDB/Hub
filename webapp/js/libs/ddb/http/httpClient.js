// @ts-check
/**
 * HTTP transport of the Registry client: one
 * authenticated request, its timeout and abort signal, body encoding, response parsing
 * and typed errors (ApiError). Registry adds the request cache and the API methods.
 *
 *   const http = createHttpClient({ baseUrl, getToken, onUnauthorized });
 *   await http.send('/orgs');                          // parsed JSON / text / blob
 *   const res = await http.fetchRaw('/orgs/a/ds/b/download?path=x');   // raw Response
 *
 * Every authenticated request goes through here, so the Authorization header is built
 * in one place.
 */
import { ApiError } from '../apiError';

const DEFAULT_TIMEOUT_MS = 300000;

/** Default error text per HTTP status, when the server's body carries none. */
const STATUS_TEXT = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    422: 'Unprocessable Entity',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable'
};

/**
 * The Authorization header for a session token (the only place it is built).
 * @param {string|null|undefined} token
 * @returns {Record<string, string>}
 */
export function bearer(token) {
    return token ? { Authorization: `Bearer ${token}` } : {};
}

/** @returns {never} */
function fail(message, status, extra = {}) {
    throw new ApiError(message, status, extra);
}

/**
 * Error text of a failed (non-2xx) response: an RFC 9457 ProblemDetails body (`detail`,
 * then `title`) or the legacy `{ error }` body. Reading both lets the Hub run against a
 * Registry before and after its ProblemDetails switch.
 * @param {unknown} json @returns {string|null}
 */
export function failureMessageOf(json) {
    if (!json || typeof json !== 'object') return null;
    const j = /** @type {any} */ (json);
    return j.detail || j.error || j.message || j.title || null;
}

/** @param {Response} response */
const contentTypeOf = response => (response.headers.get('Content-Type') || '').toLowerCase();

/** `application/json` and structured `+json` types such as `application/problem+json`. */
export const isJsonType = (/** @type {string} */ contentType) =>
    contentType.includes('application/json') || contentType.includes('+json');

/**
 * Body of a successful response, by content type. The Registry reports errors only with a
 * non-2xx status, so a 2xx body is data even when it has an `error` or `message` field (the
 * status of a failed task carries its error that way).
 * @param {Response} response
 * @param {number} status
 * @param {string|null} responseType  'text' or 'blob' to force the type
 */
async function parseBody(response, status, responseType) {
    const contentType = contentTypeOf(response);
    try {
        if (responseType === 'text') return await response.text();

        if (isJsonType(contentType)) {
            return await response.json();
        }

        if (contentType.includes('text/')) return await response.text();

        if (!contentType.trim()) {
            const text = await response.text();
            if (!text || !text.trim()) return true;
            if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
                try {
                    return JSON.parse(text);
                } catch {
                    return text;
                }
            }
            return text;
        }

        if (contentType.includes('image/') || contentType.includes('application/octet-stream') || responseType === 'blob') {
            return await response.blob();
        }

        return await response.text();
    } catch (error) {
        if (error.status) throw error;
        fail(`Failed to parse response: ${error.message}`, status, { originalError: error });
    }
}

/**
 * Throw the ApiError for a non-2xx response, with the server's message when it sent one.
 * @param {Response} response
 * @param {number} status
 * @returns {Promise<never>}
 */
async function throwFor(response, status) {
    if (status === 404) fail('Not found', 404);
    const fallback = STATUS_TEXT[status]
        ?? (status >= 500 ? 'Server Error' : status >= 400 ? 'Client Error' : 'Unexpected Response');
    try {
        if (isJsonType(contentTypeOf(response))) {
            const json = await response.json();
            fail(failureMessageOf(json) || fallback, status, json);
        }
        const text = await response.text();
        fail(text || fallback, status);
    } catch (error) {
        if (error.status) throw error;
        fail(fallback, status);
    }
}

/**
 * @param {Response} response
 * @param {string} method
 * @param {string|null} responseType
 */
async function handleResponse(response, method, responseType) {
    const status = response.status;
    if (status >= 200 && status < 300) {
        if (status === 204 || method.toUpperCase() === 'HEAD') return true;
        return parseBody(response, status, responseType);
    }
    return throwFor(response, status);
}

/**
 * Request body and headers for `body` (FormData as is, strings as text, objects as JSON).
 * @param {Record<string, string>} headers  completed in place
 * @param {unknown} body
 * @param {string|null|undefined} contentType  explicit Content-Type
 */
function encodeBody(headers, body, contentType) {
    if (body === null || body === undefined) return undefined;
    if (contentType) {
        headers['Content-Type'] = contentType;
        return contentType === 'application/json' ? JSON.stringify(body) : /** @type {any} */ (body);
    }
    if (body instanceof FormData) return body;
    if (typeof body === 'string') {
        headers['Content-Type'] = 'text/plain';
        return body;
    }
    if (typeof body === 'object') {
        headers['Content-Type'] = 'application/json';
        return JSON.stringify(body);
    }
    return /** @type {any} */ (body);
}

/**
 * @typedef {object} SendOptions
 * @property {string} [method]
 * @property {unknown} [body]
 * @property {string|null} [contentType]
 * @property {string|null} [responseType]  'text' | 'blob'
 * @property {AbortSignal} [signal]
 * @property {Record<string, string>} [headers]
 * @property {string} [etag]  sent as If-None-Match
 * @property {boolean} [withMeta]  resolve { value, etag, notModified } (request cache)
 * @property {(headers: Headers) => void} [onHeaders]
 */

/**
 * @param {{ baseUrl: string, getToken: () => (string|null), onUnauthorized?: (error: Error) => void, timeoutMs?: number }} config
 */
export function createHttpClient({ baseUrl, getToken, onUnauthorized, timeoutMs = DEFAULT_TIMEOUT_MS }) {
    let unauthorizedHandler = onUnauthorized || null;

    /** @param {Record<string, string>} [extra] @returns {Record<string, string>} */
    function authHeaders(extra = {}) {
        return { ...extra, ...bearer(getToken()) };
    }

    /**
     * fetch() with the session's Authorization header, a timeout and the caller's signal.
     * Network failures and timeouts become ApiError with status 0; an abort by the
     * caller stays an AbortError.
     * @param {string} endpoint  path starting with '/', or an absolute URL of this registry
     * @param {RequestInit} [init]
     * @returns {Promise<Response>}
     */
    async function fetchRaw(endpoint, init = {}) {
        const timeout = new AbortController();
        const timeoutId = setTimeout(() => timeout.abort(), timeoutMs);
        const callerSignal = init.signal || null;
        const signal = callerSignal
            ? (typeof AbortSignal !== 'undefined' && AbortSignal.any ? AbortSignal.any([callerSignal, timeout.signal]) : callerSignal)
            : timeout.signal;
        const url = endpoint.startsWith('/') ? `${baseUrl}${endpoint}` : endpoint;
        try {
            return await fetch(url, { ...init, headers: authHeaders(/** @type {Record<string, string>} */ (init.headers || {})), signal });
        } catch (fetchError) {
            if (fetchError.name === 'AbortError') {
                if (callerSignal?.aborted) throw fetchError;
                fail(`Request timed out after ${timeoutMs / 1000}s`, 0, { originalError: fetchError });
            }
            fail(`Network error: ${fetchError.message}`, 0, { originalError: fetchError });
        } finally {
            clearTimeout(timeoutId);
        }
    }

    /**
     * One request, parsed. A 401 (except for sign-in) is reported to the unauthorized
     * handler before it is thrown.
     * @param {string} endpoint
     * @param {SendOptions} [options]
     */
    async function send(endpoint, options = {}) {
        const method = (options.method || 'GET').toUpperCase();
        try {
            const headers = { ...(options.headers || {}) };
            if (options.etag) headers['If-None-Match'] = options.etag;
            const body = encodeBody(headers, options.body, options.contentType);

            const response = await fetchRaw(endpoint, { method, headers, body, signal: options.signal });
            options.onHeaders?.(response.headers);

            if (options.withMeta) {
                if (response.status === 304) return { value: undefined, notModified: true };
                const value = await handleResponse(response, method, options.responseType ?? null);
                return { value, etag: response.headers.get('ETag') || undefined };
            }
            return await handleResponse(response, method, options.responseType ?? null);
        } catch (error) {
            if (error.status === 401 && unauthorizedHandler && !endpoint.startsWith('/users/authenticate')) {
                unauthorizedHandler(error);
            }
            if (error.status !== undefined || error.name === 'AbortError') throw error;
            fail(`Request failed: ${error.message}`, 0, { originalError: error });
        }
    }

    return {
        send,
        fetchRaw,
        authHeaders,
        /** @param {((error: Error) => void)|null} handler */
        onUnauthorized(handler) { unauthorizedHandler = handler; }
    };
}
