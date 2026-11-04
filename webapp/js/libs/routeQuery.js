// @ts-check
/**
 * Writes some keys of the address bar's query (or its hash) without a navigation, leaving the
 * rest of the address (other keys and their order, hash) as it is, and reads the address back.
 *
 * Without a navigation the router's route (`$route.query`, `.hash`, `.fullPath`) keeps the
 * address of its last navigation, so a navigation that keeps the rest of the address builds its
 * location from currentLocation() / currentPath(), never from the route: that would put back
 * what was written here since.
 */
import { parseQuery } from 'vue-router';

/** @param {string} segment  one `key=value` piece of a query */
function keyOf(segment) {
    const raw = segment.split('=')[0];
    try {
        return decodeURIComponent(raw.replace(/\+/g, ' '));
    } catch {
        return raw;
    }
}

/**
 * The query string for `search` with `updates` applied: a key is replaced where it first appears
 * (other occurrences are dropped) or appended at the end when it was not there.
 * @param {string} search  location.search, with or without the leading "?"
 * @param {Record<string, string|string[]|null>} updates  null or an empty array removes a key; an array repeats it
 * @returns {string}  without the leading "?"
 */
export function applyQueryUpdates(search, updates) {
    const pending = new Map(Object.entries(updates).map(([key, value]) => {
        const values = value === null ? [] : Array.isArray(value) ? value : [value];
        return [key, values.map(v => `${encodeURIComponent(key)}=${encodeURIComponent(v)}`)];
    }));
    const done = new Set();
    /** @type {string[]} */
    const out = [];
    for (const segment of search.replace(/^\?/, '').split('&')) {
        if (!segment) continue;
        const key = keyOf(segment);
        if (!pending.has(key)) {
            out.push(segment);
        } else if (!done.has(key)) {
            done.add(key);
            out.push(...(pending.get(key) ?? []));
        }
    }
    for (const [key, segments] of pending) {
        if (!done.has(key)) out.push(...segments);
    }
    return out.join('&');
}

/**
 * Puts `url` in place of the current address; nothing happens when it is the same.
 * The router keeps the address it believes it is at in the history state (`current`), so that is
 * written too, with the rest of its state: a later navigation or back then starts from this
 * address, not the old one (with no state, the router writes back the address of its last
 * navigation when it next pushes).
 * @param {string} url  path, query and hash
 */
function replaceAddress(url) {
    if (url === currentPath()) return;
    window.history.replaceState({ ...window.history.state, current: url }, '', url);
}

/**
 * Replaces these keys of the current address; nothing happens when the address would not change.
 * @param {Record<string, string|string[]|null>} updates
 */
export function replaceQueryKeys(updates) {
    const { pathname, search, hash } = window.location;
    const next = applyQueryUpdates(search, updates);
    replaceAddress(`${pathname}${next ? `?${next}` : ''}${hash}`);
}

/**
 * Replaces the hash of the current address, keeping its path and query.
 * @param {string} hash  with or without the leading "#"; empty removes it
 */
export function replaceHash(hash) {
    const { pathname, search } = window.location;
    const fragment = hash.replace(/^#/, '');
    replaceAddress(`${pathname}${search}${fragment ? `#${fragment}` : ''}`);
}

/**
 * What a page keeps in the browser's history entry under `key` (it survives a reload of the tab
 * and a step back to the entry), or undefined.
 * @param {string} key
 * @returns {any}
 */
export function readHistoryState(key) {
    const state = window.history.state;
    return state && typeof state === 'object' ? state[key] : undefined;
}

/**
 * Keeps `value` in the history entry under `key` without changing the address or adding an entry.
 * Every other key stays, the router's own among them (it reads `current`, `back` and `position`
 * from there). `undefined` or null removes the key. The value must be cloneable by the
 * browser (plain data).
 * @param {string} key
 * @param {any} value
 */
export function writeHistoryState(key, value) {
    const next = { ...(window.history.state && typeof window.history.state === 'object' ? window.history.state : {}) };
    const had = key in next;
    delete next[key];
    if (value === undefined || value === null) {
        if (had) window.history.replaceState(next, '');
        return;
    }
    window.history.replaceState({ ...next, [key]: value }, '');
}

/** The address bar as an in-app path (path, query and hash), as a route's fullPath. */
export function currentPath() {
    const { pathname, search, hash } = window.location;
    return `${pathname}${search}${hash}`;
}

/**
 * The query and the hash of the address bar as a router location, with `updates` applied as
 * replaceQueryKeys applies them; the query is parsed as the router parses one. It has no path,
 * so a navigation to it stays on the current route.
 * @param {Record<string, string|string[]|null>} [updates]
 * @returns {{ query: import('vue-router').LocationQuery, hash: string }}
 */
export function currentLocation(updates = {}) {
    const { search, hash } = window.location;
    return { query: parseQuery(applyQueryUpdates(search, updates)), hash };
}
