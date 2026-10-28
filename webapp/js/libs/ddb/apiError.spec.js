import { describe, it, expect } from 'vitest';
import { ApiError, isBadRequest, isUnauthorized, isForbidden, isNotFound } from './apiError';

describe('the status tests of an ApiError', () => {
    const cases = [
        ['isBadRequest', isBadRequest, 400],
        ['isUnauthorized', isUnauthorized, 401],
        ['isForbidden', isForbidden, 403],
        ['isNotFound', isNotFound, 404]
    ];

    it.each(cases)('%s is true for its own status only', (_name, test, status) => {
        expect(test(new ApiError('x', status))).toBe(true);
        for (const other of [0, 400, 401, 403, 404, 500].filter(s => s !== status)) {
            expect(test(new ApiError('x', other))).toBe(false);
        }
    });

    it('isNotFound does not take a network failure (status 0) for a missing thing', () => {
        expect(isNotFound(new ApiError('network', 0))).toBe(false);
    });

    it('isNotFound reads the status of any error-like object and is false for anything else', () => {
        expect(isNotFound({ status: 404 })).toBe(true);
        expect(isNotFound(new Error('404'))).toBe(false);
        expect(isNotFound(null)).toBe(false);
        expect(isNotFound(undefined)).toBe(false);
        expect(isNotFound('404')).toBe(false);
    });
});
