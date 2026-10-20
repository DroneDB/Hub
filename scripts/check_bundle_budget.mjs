#!/usr/bin/env node
/**
 * HUB-01 / HUB-02 bundle budget check.
 *
 * Reads a webpack stats file (produced with `NODE_ENV=production npx webpack --profile --json > stats.json`)
 * and reports:
 *   - the initial (entrypoint `main`) payload, raw and gzip-6, with the biggest packages inside it;
 *   - packages that only lazy routes import but that landed in an initial chunk;
 *   - which vendor chunks each route group pulls (to catch eager imports inside route components);
 *   - data: URIs embedded in CSS (fonts inlined by the asset module rule).
 * Exits 1 when the budgets below are exceeded (they are the HUB-01/HUB-02 acceptance criteria).
 *
 *   - the size of the vendored Potree folder, with no source maps or never-loaded libraries (HUB-04/09).
 *
 * Usage: node check_bundle_budget.mjs <stats.json> <outputDir> [--budget-initial-kb 2600] [--budget-initial-gzip-kb 1000]
 * In this repository: npm run build:stats && npm run check:bundle
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const [statsPath, outDir] = process.argv.slice(2);
if (!statsPath || !outDir) { console.error('usage: check_bundle_budget.mjs <stats.json> <outputDir>'); process.exit(2); }
const arg = (name, def) => { const i = process.argv.indexOf(name); return i > 0 ? Number(process.argv[i + 1]) : def; };
const BUDGET_INITIAL_KB = arg('--budget-initial-kb', 2600);
const BUDGET_INITIAL_GZIP_KB = arg('--budget-initial-gzip-kb', 1000);
const LAZY_ONLY_PACKAGES = ['three', '@sparkjsdev/spark', '@giro3d/giro3d', 'ol', 'proj4', '@codemirror/view', 'chart.js', 'markdown-it', 'laz-perf', 'copc'];
// HUB-02: the dataset page loads the map, the text editor and the upload panel on first use
const EAGER_VENDORS_FORBIDDEN_IN = { dataset: ['vendor-openlayers', 'vendor-codemirror', 'dataset-map', 'dataset-upload', 'dataset-editor'] };
// HUB-04 / HUB-09: what the Potree viewer ships (7.9 MB with its scripts minified at copy time)
const POTREE_BUDGET_MB = 9;

const st = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
const sizes = Object.fromEntries(st.assets.map(a => [a.name, a.size]));
const pkgOf = (n) => { const m = /node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(n || ''); return m ? m[1] : null; };
const names = (list) => list.map(a => (typeof a === 'string' ? a : a.name));

let failed = false;
const fail = (msg) => { failed = true; console.log('  FAIL ' + msg); };

// 1. initial payload
const initial = names(st.entrypoints.main.assets).filter(n => /\.(js|css)$/.test(n));
let raw = 0, gz = 0;
console.log('== initial payload (entrypoint main) ==');
for (const n of initial) {
    const buf = fs.readFileSync(path.join(outDir, n));
    const g = zlib.gzipSync(buf, { level: 6 }).length;
    raw += buf.length; gz += g;
    console.log(`  ${(buf.length / 1024).toFixed(0).padStart(6)} KB  ${(g / 1024).toFixed(0).padStart(5)} KB gz  ${n}`);
}
console.log(`  total: ${(raw / 1024).toFixed(0)} KB raw, ${(gz / 1024).toFixed(0)} KB gzip (budget ${BUDGET_INITIAL_KB} / ${BUDGET_INITIAL_GZIP_KB})`);
if (raw / 1024 > BUDGET_INITIAL_KB) fail(`initial raw payload ${(raw / 1024).toFixed(0)} KB > ${BUDGET_INITIAL_KB} KB`);
if (gz / 1024 > BUDGET_INITIAL_GZIP_KB) fail(`initial gzip payload ${(gz / 1024).toFixed(0)} KB > ${BUDGET_INITIAL_GZIP_KB} KB`);

// 2. packages inside initial chunks
const initialChunkIds = new Set(st.chunks.filter(c => c.initial).map(c => c.id));
const pkgBytesInitial = {};
for (const m of st.modules) {
    const p = pkgOf(m.name);
    if (!p) continue;
    if ((m.chunks || []).some(id => initialChunkIds.has(id))) pkgBytesInitial[p] = (pkgBytesInitial[p] || 0) + (m.size || 0);
}
console.log('== largest packages in initial chunks (module source size) ==');
for (const [p, b] of Object.entries(pkgBytesInitial).sort((a, b) => b[1] - a[1]).slice(0, 10))
    console.log(`  ${(b / 1024).toFixed(0).padStart(6)} KB  ${p}`);
for (const p of LAZY_ONLY_PACKAGES)
    if (pkgBytesInitial[p]) fail(`lazy-only package '${p}' (${(pkgBytesInitial[p] / 1024).toFixed(0)} KB) is in an initial chunk`);

// 3. route groups
console.log('== chunks loaded per route group ==');
for (const [name, cg] of Object.entries(st.namedChunkGroups)) {
    const assets = names(cg.assets).filter(n => n.endsWith('.js'));
    const total = assets.reduce((a, n) => a + (sizes[n] || 0), 0);
    console.log(`  ${name.padEnd(18)} ${(total / 1024).toFixed(0).padStart(6)} KB  ${assets.join(' ')}`);
    for (const forbidden of EAGER_VENDORS_FORBIDDEN_IN[name] || [])
        if (assets.some(a => a.startsWith(forbidden))) fail(`route '${name}' eagerly loads ${forbidden}`);
}

// 4. data URIs in CSS
console.log('== data: URIs embedded in CSS ==');
for (const n of st.assets.map(a => a.name).filter(n => n.endsWith('.css'))) {
    const css = fs.readFileSync(path.join(outDir, n), 'utf8');
    const uris = css.match(/url\(data:[^)]+\)/g) || [];
    const bytes = uris.reduce((a, u) => a + u.length, 0);
    if (bytes > 50 * 1024) { console.log(`  ${n}: ${uris.length} data URIs, ${(bytes / 1024).toFixed(0)} KB`); fail(`${n} embeds ${(bytes / 1024).toFixed(0)} KB of data: URIs (fonts should be separate cacheable files)`); }
}

// 5. vendored Potree: no source maps, no libraries the viewer never loads (HUB-04, HUB-09)
const potree = path.join(outDir, 'potree');
if (fs.existsSync(potree)) {
    let bytes = 0;
    const offending = [];
    const walk = (dir) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, e.name);
            if (e.isDirectory()) {
                if (['lazylibs', 'openlayers3', 'vendor'].includes(e.name)) offending.push(path.relative(outDir, p));
                walk(p);
            } else {
                // Build-time compressed twins are not shipped twice in the count
                if (!/\.(br|gz)$/.test(e.name)) bytes += fs.statSync(p).size;
                if (e.name.endsWith('.map')) offending.push(path.relative(outDir, p));
                // The viewer loads the minified d3 and jsTree
                if (['d3.js', 'jstree.js'].includes(e.name)) offending.push(path.relative(outDir, p));
            }
        }
    };
    walk(potree);
    console.log('== vendored Potree ==');
    console.log(`  ${(bytes / 1024 / 1024).toFixed(1)} MB (budget ${POTREE_BUDGET_MB} MB)`);
    if (bytes / 1024 / 1024 > POTREE_BUDGET_MB) fail(`potree/ is ${(bytes / 1024 / 1024).toFixed(1)} MB > ${POTREE_BUDGET_MB} MB`);
    for (const o of offending) fail(`potree/ ships ${o}, which the viewer never loads`);
}

console.log(failed ? '\nRESULT: budget exceeded' : '\nRESULT: within budget');
process.exit(failed ? 1 : 0);
