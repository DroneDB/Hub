// @ts-check
/**
 * Error raised for a failed Registry request. `status` is the HTTP status
 * (0 for network errors and timeouts); `message` is the server's error text when it
 * sent one. Callers test the status, never the message.
 */
class ApiError extends Error {
    /**
     * @param {string} message
     * @param {number} [status]
     * @param {object} [extra]  extra fields (server JSON body, originalError, ...)
     */
    constructor(message, status = 0, extra = {}) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        Object.assign(this, extra);
    }
}

/** @param {unknown} e @param {number} status */
const hasStatus = (e, status) => !!e && typeof e === 'object' && /** @type {any} */ (e).status === status;

/** The server refused the request's content (its `message` says why). @param {unknown} e */
export const isBadRequest = e => hasStatus(e, 400);
/** @param {unknown} e */
export const isUnauthorized = e => hasStatus(e, 401);
/** @param {unknown} e */
export const isForbidden = e => hasStatus(e, 403);
/** The thing asked for is not there (a status of 0, a network failure or a timeout, says nothing about it). @param {unknown} e */
export const isNotFound = e => hasStatus(e, 404);

/**
 * An address the app cannot read (a file path in a viewer link that does not decode): the page
 * shows the "invalid link" state, not the error text.
 */
class InvalidLinkError extends Error {
    /** @param {string} message */
    constructor(message) {
        super(message);
        this.name = 'InvalidLinkError';
    }
}

/**
 * The page states of a primary resource that did not load (FR-XC-13): ResourceState shows one
 * for each, with its own text and ways out.
 */
export const LoadErrorKind = Object.freeze({
    NOT_FOUND: 'not-found',
    NO_ACCESS: 'no-access',
    SIGN_IN: 'sign-in',
    INVALID_LINK: 'invalid-link'
});

/**
 * The page state of the error of a page's primary resource (the organization, the dataset, the
 * file of a viewer), or null for an error that is none of them (a network failure, a 500): the
 * page shows that one's message. A 401 means sign in: with a session, the unauthorized handler
 * has already sent the user to Login.
 * @param {unknown} e
 * @returns {string|null}  a LoadErrorKind value
 */
export function loadErrorKind(e) {
    if (e instanceof InvalidLinkError) return LoadErrorKind.INVALID_LINK;
    if (isNotFound(e)) return LoadErrorKind.NOT_FOUND;
    if (isForbidden(e)) return LoadErrorKind.NO_ACCESS;
    if (isUnauthorized(e)) return LoadErrorKind.SIGN_IN;
    return null;
}

export { ApiError, InvalidLinkError };
