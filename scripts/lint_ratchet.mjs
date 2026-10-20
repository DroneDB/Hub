#!/usr/bin/env node
/**
 * ESLint ratchet: existing errors are recorded per file in eslint-baseline.json, and the check
 * fails when a file has more errors than recorded (new files: any error). Style warnings are not
 * counted. Fixing errors lowers the counts: run with --update to record the lower numbers (it
 * never raises a count).
 *
 * The Hub reaches Registry CI as a submodule at its latest commit, so "files changed by this
 * change" has no base there; the per-file baseline stops new errors in the same way.
 *
 * Usage: node scripts/lint_ratchet.mjs [--update]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = path.join(root, 'eslint-baseline.json');
const update = process.argv.includes('--update');

const eslint = new ESLint({ cwd: root });
const results = await eslint.lintFiles(['webapp/js']);
const counts = {};
for (const r of results) {
    if (r.errorCount > 0) counts[path.relative(root, r.filePath).split(path.sep).join('/')] = r.errorCount;
}

const baseline = fs.existsSync(baselinePath) ? JSON.parse(fs.readFileSync(baselinePath, 'utf8')) : null;
if (!baseline || update) {
    // First run records everything; --update only lowers (or drops) counts
    const next = baseline
        ? Object.fromEntries(Object.entries(baseline)
            .map(([file, n]) => [file, Math.min(n, counts[file] ?? 0)])
            .filter(([, n]) => n > 0))
        : counts;
    fs.writeFileSync(baselinePath, JSON.stringify(Object.fromEntries(Object.entries(next).sort()), null, 1) + '\n');
    const total = Object.values(next).reduce((a, b) => a + b, 0);
    console.log(`eslint-baseline.json: ${Object.keys(next).length} files, ${total} errors recorded`);
    process.exit(0);
}

const worse = Object.entries(counts).filter(([file, n]) => n > (baseline[file] ?? 0));
if (worse.length === 0) {
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const recorded = Object.values(baseline).reduce((a, b) => a + b, 0);
    console.log(`ESLint ratchet: no new errors (${total} existing, ${recorded} recorded${total < recorded ? '; run with --update to record the fixes' : ''})`);
    process.exit(0);
}

const formatter = await eslint.loadFormatter('stylish');
const shown = results.filter(r => worse.some(([file]) => r.filePath.endsWith(file)))
    .map(r => ({ ...r, messages: r.messages.filter(m => m.severity === 2), warningCount: 0 }));
console.log(formatter.format(shown));
for (const [file, n] of worse) console.log(`  ${file}: ${n} errors, ${baseline[file] ?? 0} allowed`);
process.exit(1);
