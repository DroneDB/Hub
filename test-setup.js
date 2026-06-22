/**
 * Vitest setup file — runs before each test.
 * Provides mocks for browser APIs and global constants.
 */
import { vi } from 'vitest';

// Mock __APP_PRODUCTION__ global (set by webpack DefinePlugin)
globalThis.__APP_PRODUCTION__ = true;

// Mock __HUB_VERSION__ global
globalThis.__HUB_VERSION__ = '2.5.1';

// Mock window/localStorage for Node environment
if (typeof window === 'undefined') {
    globalThis.window = {
        location: {
            origin: 'http://localhost:7000',
            protocol: 'http:',
            href: 'http://localhost:7000/',
            search: '',
            pathname: '/'
        },
        sessionStorage: {
            getItem: vi.fn(() => null),
            setItem: vi.fn(),
            removeItem: vi.fn()
        },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
        scrollTo: vi.fn(),
        get scrollY() { return 0; }
    };
    globalThis.document = {
        title: 'Test',
        cookie: '',
        body: { style: { cursor: '' } },
        createElement: vi.fn(() => ({
            addEventListener: vi.fn(),
            style: {},
            className: '',
            getBoundingClientRect: vi.fn(() => ({ top: 0, left: 0, width: 100, height: 100 }))
        })),
        getElementById: vi.fn(() => null),
        getElementsByTagName: vi.fn(() => []),
        querySelector: vi.fn(() => null),
        querySelectorAll: vi.fn(() => []),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        exitFullscreen: vi.fn(),
        webkitExitFullscreen: vi.fn(),
        mozExitFullscreen: vi.fn(),
        msExitFullscreen: vi.fn(),
        scrollLeft: 0,
        scrollTop: 0
    };
    globalThis.localStorage = {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn()
    };
    globalThis.navigator = {
        userAgent: 'Vitest'
    };
    globalThis.atob = (str) => Buffer.from(str, 'base64').toString('binary');
    globalThis.btoa = (str) => Buffer.from(str, 'binary').toString('base64');
    globalThis.fetch = vi.fn();
    globalThis.AbortController = class AbortController {
        signal = { aborted: false };
        abort() { this.signal.aborted = true; }
    };
}
