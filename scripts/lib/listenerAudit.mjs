/**
 * Counts the listener and timer registrations of one source file and the
 * removals that pair with them. Shared by scripts/audit_listeners.mjs (CI) and the
 * local `paired-listeners` ESLint rule, so both apply the same rules.
 *
 * Counted per file:
 *   addEventListener / removeEventListener;
 *   .on('event', ...) (event bus, OpenLayers) / .off('event') and OpenLayers unByKey() / .un();
 *   setInterval / clearInterval;
 *   setTimeout / clearTimeout, in components and composables only (a timeout that outlives its component runs on an unmounted instance).
 * Not counted, because they remove themselves:
 *   registrations through the helpers (ListenerBag add/ol/bus, useListenerBag,
 *   useEventListener, useEmitter, PotreeSession track, and the component timers of
 *   composables/useTimers: useTimeout/useInterval/useDebounceFn and a useTimerGroup()
 *   function such as `this.later(...)`);
 *   registrations covered by a `// lifetime: <app|element|owner|paired> ...` comment: the comment
 *   applies to the lines below it up to the next blank line, and states why the listener
 *   needs no removal here: it lives as long as the page (app), its target is an element or
 *   object this code created and drops (element, owner), its key is kept and removed by
 *   a named method (paired), or it only defers work to the next frame or two (defer).
 */

import fs from 'node:fs';
import path from 'node:path';

// The helpers themselves add and remove on behalf of their callers
export const HELPER_FILES = new Set(['libs/listenerBag.js']);

const HELPER_CALL = /(useEventListener|useEmitter|\.track|bag\.(?:add|ol|bus)|_listenerBag\.(?:add|ol|bus)|listeners\.(?:add|ol|bus)|useTimeout|useInterval|useDebounceFn|\blater|\bapplyLater)\(/;
const LIFETIME = /\/\/\s*lifetime:\s*(app|element|owner|paired|defer)\b/;

// Net open parentheses on a line, from `from` on (strings are not parsed: good enough here)
function parenDepth(line, from = 0) {
    let depth = 0;
    for (const ch of line.slice(from)) {
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
    }
    return depth;
}

// Lines covered by a lifetime annotation (up to the next blank line) or a helper call
// (up to the line that closes it, so `listeners.ol([\n map.on(...),\n ...])` counts)
function exemptLines(lines) {
    const exempt = new Set();
    let active = false;
    let helperDepth = 0;
    lines.forEach((line, i) => {
        if (helperDepth > 0) {
            exempt.add(i);
            helperDepth += parenDepth(line);
            return;
        }
        if (line.trim() === '') { active = false; return; }
        if (LIFETIME.test(line)) active = true;
        const helper = HELPER_CALL.exec(line);
        if (helper) helperDepth = Math.max(0, parenDepth(line, helper.index));
        if (active || helper) exempt.add(i);
    });
    return exempt;
}

const count = (lines, re, skip) => lines.reduce((n, line, i) => {
    if (skip.has(i)) return n;
    return n + (line.match(re) || []).length;
}, 0);

// The event a registration names: its literal, or '?' when it is a variable or an expression
const ANY = '?';

/** Registrations by event name. @param {string[]} lines @param {RegExp} re global, group 2 = the literal event @param {Set<number>} skip */
function byEvent(lines, re, skip) {
    const events = new Map();
    lines.forEach((line, i) => {
        if (skip.has(i)) return;
        for (const m of line.matchAll(re)) {
            const key = m[2] ?? ANY;
            events.set(key, (events.get(key) ?? 0) + 1);
        }
    });
    return events;
}

/**
 * Whether the registrations of some event outnumber its removals. A removal that does not
 * name its event (a variable, OpenLayers' unByKey) covers one registration of any event,
 * but a removal of one event never covers a registration of another.
 */
function outnumbered(added, removed) {
    let missing = 0;
    for (const [event, n] of added) if (event !== ANY) missing += Math.max(0, n - (removed.get(event) ?? 0));
    const anyAdded = added.get(ANY) ?? 0, anyRemoved = removed.get(ANY) ?? 0;
    return anyAdded > anyRemoved || missing > anyRemoved - anyAdded;
}

const EVENT = /\s*(?:(['"`])([^'"`]*)\1)?/;
const call = (name, event = EVENT) => new RegExp(`\\.${name}\\(${event.source}`, 'g');

/**
 * @param {string} text the file's source
 * @param {{ timeouts?: boolean }} [options] also pair setTimeout/clearTimeout (components, composables)
 * @returns {{add:number, rem:number, si:number, ci:number, st:number, ct:number, on:number, off:number, unpaired:boolean}}
 */
export function auditSource(text, { timeouts = false } = {}) {
    const lines = text.split('\n');
    const skip = exemptLines(lines);
    const none = new Set();

    const add = count(lines, /\.addEventListener\(/g, skip);
    const rem = count(lines, /\.removeEventListener\(/g, none);
    const si = count(lines, /setInterval\(/g, skip), ci = count(lines, /clearInterval\(/g, none);
    const on = count(lines, /\.on\((['"`])[a-zA-Z:-]+\1/g, skip);
    const off = count(lines, /\.off\((['"`])[a-zA-Z:-]+\1|unByKey\(|\.un\((['"`])[a-zA-Z:-]+\2/g, none);
    const st = timeouts ? count(lines, /setTimeout\(/g, skip) : 0, ct = timeouts ? count(lines, /clearTimeout\(/g, none) : 0;

    // Pairing is per event: a removal of 'resize' does not stand for the listener of 'scroll'
    const domAdded = byEvent(lines, call('addEventListener'), skip), domRemoved = byEvent(lines, call('removeEventListener'), none);
    const busAdded = byEvent(lines, call('on', /(['"`])([a-zA-Z:-]+)\1/), skip);
    const busRemoved = byEvent(lines, new RegExp(`${call('(?:off|un)', /(['"`])([a-zA-Z:-]+)\1/).source}|(unByKey)\\(`, 'g'), none);
    return {
        add, rem, si, ci, st, ct, on, off,
        unpaired: outnumbered(domAdded, domRemoved) || outnumbered(busAdded, busRemoved) || si > ci || st > ct
    };
}

/** Whether a file's timeouts are audited: components and composables (path relative to webapp/js). @param {string} rel */
export const auditsTimeouts = rel => rel.endsWith('.vue') || rel.startsWith('composables/');

/**
 * The source files the audit reads under `root`: components and scripts, no specs, no vendored code.
 * A folder is skipped by its own name, so a checkout whose path contains "vendor" is read as any other.
 * @param {string} root the folder to walk (webapp/js)
 * @returns {string[]} absolute paths
 */
export function listSources(root) {
    const files = [];
    (function walk(dir) {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, e.name);
            if (e.isDirectory()) { if (e.name !== 'vendor' && e.name !== 'node_modules') walk(p); }
            else if (/\.(vue|js)$/.test(e.name) && !/\.spec\.|\.test\./.test(e.name)) files.push(p);
        }
    })(root);
    return files;
}
