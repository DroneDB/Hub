#!/usr/bin/env node
/**
 * Every listener the Hub adds must be removed by the code that adds it.
 * The counting rules are in scripts/lib/listenerAudit.mjs (shared with the
 * `paired-listeners` ESLint rule). Exits 1 when a file adds more than it removes.
 *
 * Usage: node scripts/audit_listeners.mjs [webapp/js]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditSource, auditsTimeouts, listSources, HELPER_FILES } from './lib/listenerAudit.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.argv[2] || path.join(here, '..', 'webapp', 'js');
const files = listSources(root);
// A folder that holds no source is a wrong path, not a clean audit
if (!files.length) { console.error(`No source files under ${root}`); process.exit(2); }

const rows = [];
for (const f of files) {
    const rel = path.relative(root, f);
    if (HELPER_FILES.has(rel)) continue;
    const r = auditSource(fs.readFileSync(f, 'utf8'), { timeouts: auditsTimeouts(rel.split(path.sep).join('/')) });
    if (r.unpaired) rows.push({ file: rel, ...r });
}
rows.sort((a, b) => (b.add - b.rem) - (a.add - a.rem));
console.log('file'.padEnd(60), 'add/remove', 'setInterval/clear', 'setTimeout/clear', 'on/off');
for (const r of rows) console.log(r.file.padEnd(60), `${r.add}/${r.rem}`.padEnd(11), `${r.si}/${r.ci}`.padEnd(18), `${r.st}/${r.ct}`.padEnd(17), `${r.on}/${r.off}`);
console.log(`\n${files.length} files scanned, ${rows.length} with listeners or timers that are not removed`);
process.exit(rows.length ? 1 : 0);
