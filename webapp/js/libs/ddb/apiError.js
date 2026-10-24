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

/** @param {unknown} e */
export const isUnauthorized = e => hasStatus(e, 401);
/** @param {unknown} e */
export const isForbidden = e => hasStatus(e, 403);

export { ApiError };
