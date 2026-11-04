/**
 * Modules reach the ddb library through the 'ddb' alias, often by destructuring its default
 * export (`const { pathutils } = ddb`). Neither lint nor the type check sees a member that the
 * index no longer has: the module then fails when it loads, and with it every page that imports
 * it. This reads the sources and checks each member they take from 'ddb' against the index.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import ddb, * as named from 'ddb';

const root = path.resolve(__dirname, '../..');

function sources(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => {
        const p = path.join(dir, d.name);
        if (d.isDirectory()) return d.name === 'node_modules' ? [] : sources(p);
        return /\.(js|vue)$/.test(d.name) && !d.name.endsWith('.spec.js') ? [p] : [];
    });
}

const names = list => list.split(',').map(x => x.split(/\s+as\s+|:/)[0].trim()).filter(Boolean);

function usedMembers(text) {
    const used = { default: new Set(), named: new Set() };
    if (!/from\s+['"]ddb['"]/.test(text)) return used;
    for (const m of text.matchAll(/\bddb\.(\w+)/g)) used.default.add(m[1]);
    for (const m of text.matchAll(/const\s*\{([^}]*)\}\s*=\s*ddb\b/g)) names(m[1]).forEach(n => used.default.add(n));
    for (const m of text.matchAll(/import\s*(?:\w+\s*,\s*)?\{([^}]*)\}\s*from\s*['"]ddb['"]/g)) names(m[1]).forEach(n => used.named.add(n));
    return used;
}

describe('the ddb index', () => {
    it('has every member the app takes from it', () => {
        const missing = [];
        for (const file of sources(root)) {
            const used = usedMembers(fs.readFileSync(file, 'utf8'));
            const rel = path.relative(root, file);
            for (const n of used.default) if (!(n in ddb)) missing.push(`${rel}: ddb.${n}`);
            for (const n of used.named) if (!(n in named)) missing.push(`${rel}: { ${n} } from 'ddb'`);
        }
        expect(missing).toEqual([]);
    });
});
