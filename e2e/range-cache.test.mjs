/**
 * The viewers that read a build file by ranges (a COPC point cloud in the Potree viewer and in the 3D viewer, a paged
 * splat, a bm3d model) against the disk cache Chrome has on Windows. That cache (blockfile) keeps the 206 answers of
 * one URL as one sparse entry and refuses a second read or write of that entry while one runs
 * (net::ERR_CACHE_OPERATION_NOT_SUPPORTED), so parallel range reads that went through it failed at random and left
 * holes in the model. Chrome on Linux has the same cache behind a feature flag, which this suite turns on, in a
 * persistent profile so the cache is on disk. Each viewer is opened twice (the second visit is the one that finds the
 * ranges of the first in the cache) and moved around; no range may fail and none may come from the disk cache.
 *
 * Not part of `npm test` (needs a server); same environment as smoke.test.mjs:
 *
 *   HUB_URL=http://localhost:5100 node --test e2e/range-cache.test.mjs
 *
 * It creates (then deletes) a throw-away dataset in HUB_USER's organisation with the files it opens:
 *   HUB_RANGE_CLOUD   a point cloud (default point-clouds/lewis.laz of HUB_TEST_DATA)
 *   HUB_RANGE_MODEL   a mesh built to bm3d (default 3d/brighton.ply of HUB_TEST_DATA)
 *   HUB_RANGE_SPLAT   a Gaussian splat .ply built to a paged .rad (none by default: that viewer is skipped)
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { URL_, USER, DATA, HEADLESS, b64, form, chromeExecutable, createRegistryApi, signIn } from './support/hub.mjs';

const DS = `range-cache-${Date.now().toString(36)}`;
const CLOUD = process.env.HUB_RANGE_CLOUD || path.join(DATA, 'point-clouds', 'lewis.laz');
const MODEL = process.env.HUB_RANGE_MODEL || path.join(DATA, '3d', 'brighton.ply');
const SPLAT = process.env.HUB_RANGE_SPLAT;

// Each viewer: the file it opens (its name in the dataset), its route, and the build artifact it reads by ranges
const VIEWERS = [
    { viewer: 'Potree viewer', file: CLOUD, name: 'cloud.laz', route: 'pointcloud', role: 'pointcloud.copc' },
    { viewer: '3D viewer', file: CLOUD, name: 'cloud.laz', route: 'unified', role: 'pointcloud.copc' },
    { viewer: 'model viewer', file: MODEL, name: 'model.ply', route: 'model', role: 'model.bm3d' },
    // The splats keep a headless Chrome so busy drawing that its input never returns: the viewer is left to stream
    { viewer: 'splat viewer', file: SPLAT, name: 'splat.ply', route: 'splat', role: 'gsplat.lod', passive: true }
];
const opened = VIEWERS.filter(v => v.file);
const registry = createRegistryApi();

let profileDir, context;

/** Waits until the entry has the build artifact of the given role. */
async function waitForArtifact(entryPath, role, timeoutMs = 600000) {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
        const [entry] = await registry.call('POST', `/orgs/${USER}/ds/${DS}/list`, form({ path: entryPath }));
        if (entry?.artifacts?.some(a => a.role === role)) return;
        await new Promise(r => setTimeout(r, 2000));
    }
    throw new Error(`${entryPath} has no ${role} build after ${timeoutMs / 1000} s`);
}

/**
 * Opens a viewer route on a new page and records the range requests of build files: those answered (206), those that
 * failed (with the network error) and the answers that came from the disk cache.
 */
async function openViewer({ name, route }) {
    const page = await context.newPage();
    const failed = [];
    const fromDiskCache = [];
    const ranges = [];
    // A file of a build of the dataset (/orgs/<org>/ds/<ds>/build/<hash>[@<version>]/...), not the Hub's own files
    const isBuildFile = url => new URL(url).pathname.startsWith(`/orgs/${USER}/ds/${DS}/build/`);
    page.on('requestfailed', r => {
        if (isBuildFile(r.url())) failed.push(`${r.failure()?.errorText} ${r.headers().range ?? ''} ${r.url()}`);
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    cdp.on('Network.responseReceived', e => {
        // Range answers only: a whole file (a tileset, the bounds of a splat) keeps its cache
        if (!isBuildFile(e.response.url) || e.response.status !== 206) return;
        ranges.push(e.response.url);
        if (e.response.fromDiskCache) fromDiskCache.push(e.response.url);
    });
    await page.goto(`${URL_}/r/${USER}/${DS}/view/${b64(name)}/${route}`);
    return { page, failed, fromDiskCache, ranges };
}

/**
 * Moves the view across the model (zooming in and out at several points) so that many parts of it load at once, or,
 * for a passive viewer, lets it stream its levels of detail for 30 s.
 */
async function explore(page, { passive = false } = {}) {
    if (passive) {
        await new Promise(r => setTimeout(r, 30000));
        return;
    }
    const canvas = page.locator('canvas').first();
    await canvas.waitFor({ timeout: 60000 });
    const box = await canvas.boundingBox();
    await page.waitForTimeout(4000);
    for (const [fx, fy] of [[0.5, 0.5], [0.3, 0.4], [0.7, 0.6], [0.4, 0.7], [0.6, 0.3]]) {
        await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy);
        for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, -300); await page.waitForTimeout(150); }
        await page.waitForTimeout(1500);
        for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 300); await page.waitForTimeout(150); }
    }
    // Let the last parts arrive
    await page.waitForTimeout(4000);
}

/** The disk cache of the profile is the one of Chrome on Windows (blockfile: data_N block files and an index). */
function assertBlockfileCache() {
    const files = [];
    const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.isDirectory()) walk(path.join(d, e.name)); else files.push(e.name); } };
    walk(profileDir);
    assert.ok(files.includes('data_0') && files.includes('index'),
        `the profile has no blockfile disk cache (files: ${files.filter(f => /^(data_|index|f_)/.test(f)).join(', ')})`);
}

before(async () => {
    await registry.signIn();
    await registry.call('POST', `/orgs/${USER}/ds`, form({ slug: DS, name: DS }));
    const uploads = new Map(opened.map(v => [v.name, v]));
    for (const { name, file } of uploads.values()) {
        await registry.call('POST', `/orgs/${USER}/ds/${DS}/obj`, form({ path: name, file: new Blob([fs.readFileSync(file)]) }));
    }
    for (const { name, role } of opened) await waitForArtifact(name, role);
    profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-range-cache-'));
    context = await chromium.launchPersistentContext(profileDir, {
        headless: HEADLESS,
        executablePath: chromeExecutable(),
        viewport: { width: 1400, height: 900 },
        args: ['--enable-features=DiskCacheBackendExperiment:backend/blockfile']
    });
    await signIn(await context.newPage());
});

after(async () => {
    await context?.close();
    if (profileDir) fs.rmSync(profileDir, { recursive: true, force: true });
    try { await registry.call('DELETE', `/orgs/${USER}/ds/${DS}`); } catch { /* best effort */ }
});

for (const v of VIEWERS) {
    const title = `${v.viewer}: no range of the ${v.role} fails or comes from the disk cache, on the first visit and the next`;
    test(title, { skip: !v.file && `no file (${v.viewer})` }, async t => {
        for (const visit of ['first', 'second']) {
            const { page, failed, fromDiskCache, ranges } = await openViewer(v);
            await explore(page, v);
            await page.close();
            t.diagnostic(`${visit} visit: ${ranges.length} range answers, ${failed.length} failed, ${fromDiskCache.length} from the disk cache`);
            // The viewer did read its file by ranges, many of them (else there was nothing to contend for)
            assert.ok(ranges.length >= 10, `${visit} visit: only ${ranges.length} range answers`);
            assert.deepEqual(failed, [], `${visit} visit: range requests failed`);
            assert.deepEqual(fromDiskCache, [], `${visit} visit: range answers came from the disk cache`);
        }
        assertBlockfileCache();
    });
}
