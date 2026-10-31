/**
 * No icon-only button without an accessible name, no clickable div/span without a role
 * (or hidden from screen readers, as a mouse shortcut for a key), every <img> has alt.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
function walk(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, out); else if (e.name.endsWith('.vue')) out.push(p);
    }
    return out;
}
const templates = walk(ROOT).map(p => [path.relative(ROOT, p), (fs.readFileSync(p, 'utf8').match(/<template>([\s\S]*)<\/template>/) || ['', ''])[1]]);
const find = re => templates.flatMap(([f, t]) => [...t.matchAll(re)].map(m => `${f}: ${m[0].slice(0, 80)}`));

describe('accessibility of the templates', () => {
    it('icon-only buttons have an accessible name', () => {
        const prime = find(/<Button\b(?![^>]*\b(?::?label|:?aria-label)=)[^>]*\bicon=[^>]*>/g);
        const native = find(/<button\b(?![^>]*aria-label=)[^>]*>\s*<i\b[^>]*?\/?>\s*(?:<\/i>)?\s*<\/button>/g);
        expect([...prime, ...native]).toEqual([]);
    });

    it('clickable div/span elements have a role', () => {
        expect(find(/<(div|span)\b(?![^>]*\b(?:role|aria-hidden)=)[^>]*@click[^>]*>/g)).toEqual([]);
    });

    it('images have alt text', () => {
        expect(find(/<img\b(?![^>]*\b:?alt=)[^>]*>/g)).toEqual([]);
    });
});
