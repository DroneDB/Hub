/**
 * HUB-08: counts the listener and timer registrations of one source file and the
 * removals that pair with them. Shared by scripts/audit_listeners.mjs (CI) and the
 * local `paired-listeners` ESLint rule, so both apply the same rules.
 *
 * Counted per file:
 *   addEventListener / removeEventListener;
 *   .on('event', ...) (event bus, OpenLayers) / .off('event') and OpenLayers unByKey() / .un();
 *   setInterval / clearInterval.
 * Not counted, because they remove themselves:
 *   registrations through the helpers (ListenerBag add/ol/bus, $listen, $onOl, $onBus,
 *   useEventListener, useEmitter, PotreeSession track);
 *   registrations covered by a `// lifetime: <app|element|owner|paired> ...` comment: the comment
 *   applies to the lines below it up to the next blank line, and states why the listener
 *   needs no removal here: it lives as long as the page (app), its target is an element or
 *   object this code created and drops (element, owner), or its key is kept and removed by
 *   a named method (paired).
 */

// The helpers themselves add and remove on behalf of their callers
export const HELPER_FILES = new Set(['libs/listenerBag.js']);

const HELPER_CALL = /(\$listen|\$onOl|\$onBus|useEventListener|useEmitter|\.track|bag\.(?:add|ol|bus)|_listenerBag\.(?:add|ol|bus)|listeners\.(?:add|ol|bus))\(/;
const LIFETIME = /\/\/\s*lifetime:\s*(app|element|owner|paired)\b/;

// Lines covered by a lifetime annotation (up to the next blank line) or a helper call
function exemptLines(lines) {
    const exempt = new Set();
    let active = false;
    lines.forEach((line, i) => {
        if (line.trim() === '') { active = false; return; }
        if (LIFETIME.test(line)) active = true;
        if (active || HELPER_CALL.test(line)) exempt.add(i);
    });
    return exempt;
}

const count = (lines, re, skip) => lines.reduce((n, line, i) => {
    if (skip.has(i)) return n;
    return n + (line.match(re) || []).length;
}, 0);

/**
 * @param {string} text the file's source
 * @returns {{add:number, rem:number, si:number, ci:number, on:number, off:number, unpaired:boolean}}
 */
export function auditSource(text) {
    const lines = text.split('\n');
    const skip = exemptLines(lines);
    const none = new Set();

    const add = count(lines, /\.addEventListener\(/g, skip);
    const rem = count(lines, /\.removeEventListener\(/g, none);
    const si = count(lines, /setInterval\(/g, skip), ci = count(lines, /clearInterval\(/g, none);
    const on = count(lines, /\.on\((['"`])[a-zA-Z:-]+\1/g, skip);
    const off = count(lines, /\.off\((['"`])[a-zA-Z:-]+\1|unByKey\(|\.un\((['"`])[a-zA-Z:-]+\2/g, none);
    return { add, rem, si, ci, on, off, unpaired: add > rem || si > ci || on > off };
}
