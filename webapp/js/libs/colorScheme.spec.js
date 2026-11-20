/**
 * The colour scheme (FR-XC-21, FR-NAV-07, D-044): the Appearance preference of the device and, for
 * System, the system's scheme; an embedded view follows the system. The inline script of index.html
 * applies the same rule before the app mounts.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
    DARK_CLASS, SYSTEM_DARK_QUERY, resolveScheme, isEmbedded, currentScheme, applyScheme, startColorScheme,
    onColorSchemeChange, colorToken
} from './colorScheme';
import { PREF, setPref, removePref, _resetPrefListenersForTests } from './preferences';

/** A matchMedia whose answer the test changes, and that counts its listeners. */
function fakeMedia(matches) {
    const listeners = new Set();
    const media = {
        matches,
        media: SYSTEM_DARK_QUERY,
        addEventListener: (_type, fn) => listeners.add(fn),
        removeEventListener: (_type, fn) => listeners.delete(fn),
        listeners,
        /** @param {boolean} dark */
        set(dark) {
            media.matches = dark;
            for (const fn of [...listeners]) fn({ matches: dark });
        }
    };
    return media;
}

const html = () => document.documentElement;
let media;
let stop;
const realMatchMedia = window.matchMedia;

beforeEach(() => {
    _resetPrefListenersForTests();
    removePref(PREF.APPEARANCE);
    html().classList.remove(DARK_CLASS);
    media = fakeMedia(false);
    window.matchMedia = vi.fn(() => media);
    stop = null;
});
afterEach(() => {
    stop?.();
    window.matchMedia = realMatchMedia;
    removePref(PREF.APPEARANCE);
    html().classList.remove(DARK_CLASS);
    _resetPrefListenersForTests();
});

describe('resolveScheme', () => {
    it.each([
        // appearance, system dark, embedded, scheme
        ['system', false, false, 'light'],
        ['system', true, false, 'dark'],
        ['light', true, false, 'light'],
        ['dark', false, false, 'dark'],
        [null, true, false, 'dark'],
        ['sepia', false, false, 'light'],
        // An embedded view follows the system whatever the preference
        ['dark', false, true, 'light'],
        ['light', true, true, 'dark']
    ])('%s with a dark system %s, embedded %s: %s', (appearance, systemDark, embedded, scheme) => {
        expect(resolveScheme(appearance, systemDark, embedded)).toBe(scheme);
    });
});

describe('isEmbedded', () => {
    const win = (search, framed = false) => {
        const self = {};
        return /** @type {any} */ ({ location: { search }, self, top: framed ? {} : self });
    };

    it('is an embed= with a value, as main.js reads it, or a page in a frame', () => {
        expect(isEmbedded(win('?embed=1'))).toBe(true);
        expect(isEmbedded(win('?a=b&embed=true'))).toBe(true);
        expect(isEmbedded(win('?embed='))).toBe(false);
        expect(isEmbedded(win('?reembed=1'))).toBe(false);
        expect(isEmbedded(win(''))).toBe(false);
        expect(isEmbedded(win('', true))).toBe(true);
    });
});

describe('startColorScheme', () => {
    it('follows the system while the preference is System (the default)', () => {
        stop = startColorScheme();
        expect(currentScheme()).toBe('light');
        media.set(true);
        expect(html().classList.contains(DARK_CLASS)).toBe(true);
        expect(html().getAttribute('data-bs-theme')).toBe('dark');
        media.set(false);
        expect(currentScheme()).toBe('light');
    });

    it('applies Dark and Light from the preference, over the system, and System again', () => {
        stop = startColorScheme();
        setPref(PREF.APPEARANCE, 'dark');
        expect(currentScheme()).toBe('dark');
        media.set(true);
        setPref(PREF.APPEARANCE, 'light');
        expect(currentScheme()).toBe('light');
        setPref(PREF.APPEARANCE, 'system');
        expect(currentScheme()).toBe('dark');
    });

    it('reads the stored preference when it starts', () => {
        setPref(PREF.APPEARANCE, 'dark');
        stop = startColorScheme();
        expect(currentScheme()).toBe('dark');
    });

    it('follows the system in an embedded view, whatever the preference', () => {
        setPref(PREF.APPEARANCE, 'dark');
        stop = startColorScheme({ embedded: true });
        expect(currentScheme()).toBe('light');
        media.set(true);
        expect(currentScheme()).toBe('dark');
    });

    it('stops following when stopped', () => {
        stop = startColorScheme();
        expect(media.listeners.size).toBe(1);
        stop();
        stop = null;
        expect(media.listeners.size).toBe(0);
        setPref(PREF.APPEARANCE, 'dark');
        expect(currentScheme()).toBe('light');
    });
});

describe('onColorSchemeChange', () => {
    it('tells the subscribers of a change, once, until they unsubscribe', () => {
        const listener = vi.fn();
        const off = onColorSchemeChange(listener);
        applyScheme('dark');
        applyScheme('dark');
        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith('dark');
        off();
        applyScheme('light');
        expect(listener).toHaveBeenCalledTimes(1);
    });
});

describe('colorToken', () => {
    it('reads the current value of a token, and the fallback when there is none', () => {
        html().style.setProperty('--ddb-test-colour', ' #123456 ');
        expect(colorToken('--ddb-test-colour')).toBe('#123456');
        html().style.removeProperty('--ddb-test-colour');
        expect(colorToken('--ddb-test-colour', '#fff')).toBe('#fff');
    });
});

// The script runs before the app's code: it cannot import the rule, so it is checked against it
describe('the inline script of index.html', () => {
    const index = fs.readFileSync(path.resolve(__dirname, '../../public/index.html'), 'utf8');
    const script = [...index.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(code => code.includes(PREF.APPEARANCE));

    /** Runs the script on a page of its own and returns the class it put on <html>. */
    function run({ stored, systemDark, search = '', framed = false, storageFails = false }) {
        const classes = new Set();
        const self = {};
        const win = {
            localStorage: { getItem: key => { if (storageFails) throw new Error('denied'); return key === PREF.APPEARANCE ? stored : null; } },
            location: { search },
            self,
            top: framed ? {} : self,
            matchMedia: query => ({ matches: query === SYSTEM_DARK_QUERY && systemDark })
        };
        const attributes = new Map();
        const doc = { documentElement: { classList: { add: c => classes.add(c) }, setAttribute: (k, v) => attributes.set(k, v) } };
        new Function('window', 'document', script)(win, doc);
        const scheme = classes.has(DARK_CLASS) ? 'dark' : 'light';
        // Bootstrap's utilities follow (its light values are the default)
        expect(attributes.get('data-bs-theme') ?? 'light').toBe(scheme);
        return scheme;
    }

    it('exists and comes before the app', () => {
        expect(script).toBeTruthy();
        expect(index.indexOf(script)).toBeLessThan(index.indexOf('<body>'));
    });

    it.each([
        [null, false, '', false], [null, true, '', false],
        ['system', true, '', false], ['light', true, '', false], ['dark', false, '', false], ['sepia', true, '', false],
        ['dark', false, '?embed=1', false], ['light', true, '?embed=1', false], ['dark', false, '', true]
    ])('applies what resolveScheme gives: stored %s, dark system %s, query "%s", framed %s', (stored, systemDark, search, framed) => {
        const self = {};
        const embedded = isEmbedded(/** @type {any} */ ({ location: { search }, self, top: framed ? {} : self }));
        expect(run({ stored, systemDark, search, framed })).toBe(resolveScheme(stored, systemDark, embedded));
    });

    it('follows the system when the storage cannot be read', () => {
        expect(run({ storageFails: true, systemDark: true })).toBe('dark');
        expect(run({ storageFails: true, systemDark: false })).toBe('light');
    });
});
