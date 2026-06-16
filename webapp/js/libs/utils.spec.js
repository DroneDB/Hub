/**
 * Unit tests for libs/utils.js
 * Run with: npx vitest run --reporter=verbose
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    setTitle,
    getCookie,
    clearCookie,
    queryParams,
    inIframe,
    clone,
    bytesToSize
} from './utils';

describe('setTitle', () => {
    it('sets document title with app name', () => {
        window.document.title = '';
        window.HubOptions = { appName: 'DroneDB' };
        setTitle('My Dataset');
        expect(window.document.title).toBe('My Dataset - DroneDB');
    });

    it('uses default app name when HubOptions not set', () => {
        // HubOptions is a global variable referenced directly in utils.js
        // When undefined, the || "DroneDB" fallback kicks in
        const savedHubOptions = globalThis.HubOptions;
        globalThis.HubOptions = { appName: undefined };
        try {
            setTitle('Test');
            expect(window.document.title).toBe('Test - DroneDB');
        } finally {
            globalThis.HubOptions = savedHubOptions;
        }
    });
});

describe('getCookie', () => {
    beforeEach(() => {
        window.document.cookie = 'jwtToken=abc123;theme=dark;path=/';
    });

    it('returns cookie value by key', () => {
        expect(getCookie('jwtToken')).toBe('abc123');
    });

    it('returns undefined for missing key', () => {
        expect(getCookie('nonexistent')).toBeUndefined();
    });
});

describe('clearCookie', () => {
    it('sets cookie with past expiration', () => {
        window.document.cookie = '';
        clearCookie('testKey');
        // The cookie string is appended; check that testKey was written
        expect(window.document.cookie).toContain('testKey');
    });
});

describe('queryParams', () => {
    it('parses query string parameters', () => {
        const location = { search: '?org=test&ds=data&embed=1' };
        const result = queryParams(location);
        expect(result).toEqual({ org: 'test', ds: 'data', embed: '1' });
    });

    it('handles empty search', () => {
        const location = { search: '' };
        expect(queryParams(location)).toEqual({});
    });

    it('handles parameter without value', () => {
        const location = { search: '?flag' };
        const result = queryParams(location);
        expect(result.flag).toBeUndefined();
    });
});

describe('inIframe', () => {
    it('returns true when in iframe', () => {
        const originalTop = window.top;
        Object.defineProperty(window, 'top', {
            get: () => { throw new Error('Denied'); },
            configurable: true
        });
        expect(inIframe()).toBe(true);
        Object.defineProperty(window, 'top', {
            get: () => originalTop,
            configurable: true
        });
    });

    it('returns false when not in iframe', () => {
        Object.defineProperty(window, 'self', { value: 'same', configurable: true });
        Object.defineProperty(window, 'top', { value: 'same', configurable: true });
        expect(inIframe()).toBe(false);
    });
});

describe('clone', () => {
    it('clones a plain object', () => {
        const obj = { a: 1, b: { c: 2 } };
        const cloned = clone(obj);
        expect(cloned).toEqual({ a: 1, b: { c: 2 } });
        expect(cloned).not.toBe(obj);
        expect(cloned.b).not.toBe(obj.b);
    });

    it('clones an array', () => {
        const arr = [1, { x: 2 }];
        const cloned = clone(arr);
        expect(cloned).toEqual([1, { x: 2 }]);
        expect(cloned).not.toBe(arr);
    });

    it('returns undefined for undefined input', () => {
        expect(clone(undefined)).toBeUndefined();
    });

    it('returns undefined for circular reference', () => {
        const circular = { a: 1 };
        circular.self = circular;
        expect(clone(circular)).toBeUndefined();
    });

    it('returns undefined for function (cannot serialize)', () => {
        expect(clone(() => {})).toBeUndefined();
    });
});

describe('bytesToSize', () => {
    it('formats bytes', () => {
        expect(bytesToSize(0)).toBe('0 B');
    });

    it('formats kilobytes', () => {
        expect(bytesToSize(1024)).toBe('1 KB');
    });

    it('formats megabytes', () => {
        expect(bytesToSize(1536000)).toBe('1.46 MB');
    });

    it('formats gigabytes', () => {
        expect(bytesToSize(1610612736)).toBe('1.5 GB');
    });

    it('respects decimals parameter', () => {
        expect(bytesToSize(1536000, 0)).toBe('1 MB');
        expect(bytesToSize(1536000, 3)).toBe('1.465 MB');
    });
});
