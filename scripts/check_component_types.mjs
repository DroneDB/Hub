#!/usr/bin/env node
/**
 * Type check of the Vue components against a baseline that only shrinks.
 *
 * `npm run typecheck` (jsconfig.json) checks the `.js` files that carry `// @ts-check`; it checks no
 * component. This runs vue-tsc on the components with checkJs on (jsconfig.components.json) and
 * compares the number of diagnostics in `.vue` files with scripts/componentTypesBaseline.json:
 * more fails (a new error), fewer fails too until the baseline is lowered (--update), so what is
 * fixed stays fixed.
 *
 * Usage: node scripts/check_component_types.mjs [--update]
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { vueDiagnostics, compareWithBaseline } from './lib/componentTypes.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const baselineFile = path.join(root, 'scripts', 'componentTypesBaseline.json');

const run = spawnSync(process.execPath,
    [path.join(root, 'node_modules', 'vue-tsc', 'bin', 'vue-tsc.js'), '--noEmit', '-p', 'jsconfig.components.json', '--pretty', 'false'],
    { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
if (run.error) { console.error(run.error.message); process.exit(2); }
const output = run.stdout + run.stderr;
// Without any diagnostic line vue-tsc must have exited cleanly; else it failed before checking
if (run.status !== 0 && !/error TS\d+:/.test(output)) { console.error(output); process.exit(2); }

const found = vueDiagnostics(output);
if (process.argv.includes('--update')) {
    fs.writeFileSync(baselineFile, JSON.stringify({ vueErrors: found.length }, null, 4) + '\n');
    console.log(`Baseline set to ${found.length} type errors in components`);
    process.exit(0);
}
const { vueErrors } = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
const { ok, message } = compareWithBaseline(found.length, vueErrors);
console.log(message);
process.exit(ok ? 0 : 1);
