#!/usr/bin/env node
/**
 * HUB-08: every listener the Hub adds must be removed by the code that adds it.
 * The counting rules are in scripts/lib/listenerAudit.mjs (shared with the
 * `paired-listeners` ESLint rule). Exits 1 when a file adds more than it removes
 * (the HUB-08 acceptance criterion).
 *
 * Usage: node scripts/audit_listeners.mjs [webapp/js]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditSource, HELPER_FILES } from './lib/listenerAudit.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.argv[2] || path.join(here, '..', 'webapp', 'js');
const files = [];
(function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) { if (!/vendor|node_modules/.test(p)) walk(p); }
        else if (/\.(vue|js)$/.test(e.name) && !/\.spec\.|\.test\./.test(e.name)) files.push(p);
    }
})(root);

const rows = [];
for (const f of files) {
    const rel = path.relative(root, f);
    if (HELPER_FILES.has(rel)) continue;
    const r = auditSource(fs.readFileSync(f, 'utf8'));
    if (r.unpaired) rows.push({ file: rel, ...r });
}
rows.sort((a, b) => (b.add - b.rem) - (a.add - a.rem));
console.log('file'.padEnd(60), 'add/remove', 'setInterval/clear', 'on/off');
for (const r of rows) console.log(r.file.padEnd(60), `${r.add}/${r.rem}`.padEnd(11), `${r.si}/${r.ci}`.padEnd(18), `${r.on}/${r.off}`);
console.log(`\n${files.length} files scanned, ${rows.length} with listeners or timers that are not removed`);
process.exit(rows.length ? 1 : 0);
