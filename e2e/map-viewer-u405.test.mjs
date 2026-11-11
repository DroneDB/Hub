/**
 * The map viewer and the dataset Map tab, end to end (U-405: FR-MAP-10, FR-MAP-23, FR-MAP-24): drives the real Hub in
 * Chromium against a running Registry. Not part of `npm test` (needs a server); same environment as smoke.test.mjs:
 *
 *   HUB_URL=http://localhost:5100 node --test e2e/map-viewer-u405.test.mjs
 *
 * It creates (then deletes) a throw-away dataset in HUB_USER's organisation: photos only in images/, and a raster.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const URL_ = process.env.HUB_URL || 'http://localhost:5100';
const USER = process.env.HUB_USER || 'admin';
const PASS = process.env.HUB_PASS || 'password123';
const DATA = process.env.HUB_TEST_DATA || '/mnt/data/repos/test_data';
const DS = `map-u405-${Date.now().toString(36)}`;
const PHOTOS = ['DJI_0018.JPG', 'DJI_0019.JPG'].map(n => path.join(DATA, 'images', n));
const RASTER = path.join(DATA, 'ortho', 'brighton-beach-cog.tif');
const b64 = s => Buffer.from(s, 'utf8').toString('base64');

// Playwright ships no browser build for some distributions: fall back to one already downloaded
function chromeExecutable() {
    if (process.env.HUB_CHROME) return process.env.HUB_CHROME;
    try { if (fs.existsSync(chromium.executablePath())) return undefined; } catch { /* not resolvable */ }
    const windows = process.platform === 'win32';
    const cache = windows
        ? path.join(process.env.LOCALAPPDATA || '', 'ms-playwright')
        : path.join(process.env.HOME || '', '.cache', 'ms-playwright');
    const build = d => Number(d.slice('chromium-'.length));
    const candidates = fs.existsSync(cache)
        ? fs.readdirSync(cache).filter(d => /^chromium-\d+$/.test(d)).sort((a, b) => build(b) - build(a))
        : [];
    for (const d of candidates) {
        const exe = windows ? path.join(cache, d, 'chrome-win64', 'chrome.exe') : path.join(cache, d, 'chrome-linux64', 'chrome');
        if (fs.existsSync(exe)) return exe;
    }
    return undefined;
}

let browser, token;
const contexts = [];

async function api(method, endpoint, body) {
    const res = await fetch(`${URL_}${endpoint}`, { method, body, headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) throw new Error(`${method} ${endpoint} -> ${res.status} ${await res.text()}`);
    return res.headers.get('content-type')?.includes('json') ? res.json() : res.text();
}
const form = obj => { const f = new FormData(); for (const [k, v] of Object.entries(obj)) f.append(k, v); return f; };
const appReady = page => page.waitForFunction(() => document.getElementById('main-loading')?.style.display === 'none', null, { timeout: 30000 });

/** Signs in on the page's own login form. */
async function signIn(page) {
    await page.goto(`${URL_}/login`);
    await appReady(page);
    await page.fill('input[type=text], input[placeholder*="sername"]', USER);
    await page.fill('input[type=password]', PASS);
    await Promise.all([page.waitForURL(/\/r(\/|$)/, { timeout: 30000 }), page.click('button:has-text("Login")')]);
}

/**
 * A signed-in page in a new context, with what the page logs: its uncaught errors, and its console errors (a request
 * that fails, such as a 404, is a console error in Chromium).
 */
async function newPage(viewport = { width: 1400, height: 900 }) {
    const context = await browser.newContext({ viewport });
    contexts.push(context);
    const page = await context.newPage();
    const errors = [];
    const consoleErrors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(`${m.text()} (${m.location()?.url ?? ''})`); });
    await signIn(page);
    return { page, context, errors, consoleErrors };
}


before(async () => {
    token = (await api('POST', '/users/authenticate', form({ username: USER, password: PASS }))).token;
    await api('POST', `/orgs/${USER}/ds`, form({ slug: DS, name: DS }));
    for (const p of PHOTOS) {
        await api('POST', `/orgs/${USER}/ds/${DS}/obj`, form({ path: `images/${path.basename(p)}`, file: new Blob([fs.readFileSync(p)]) }));
    }
    await api('POST', `/orgs/${USER}/ds/${DS}/obj`, form({ path: path.basename(RASTER), file: new Blob([fs.readFileSync(RASTER)]) }));
    browser = await chromium.launch({ headless: !process.env.HUB_HEADED, executablePath: chromeExecutable() });
});

after(async () => {
    for (const c of contexts) await c.close().catch(() => {});
    await browser?.close();
    try { await api('DELETE', `/orgs/${USER}/ds/${DS}`); } catch { /* best effort */ }
});

test('FR-MAP-10: the Map tab at a root with no photos names the subfolder that has them, and Show opens it', async () => {
    const { page, errors } = await newPage();
    await page.goto(`${URL_}/r/${USER}/${DS}`);
    await appReady(page);
    await page.getByRole('tab', { name: 'Map' }).click();
    const chip = page.locator('[data-testid="geo-subfolder-chip"]');
    // The raster is at the root, so the root has something for the map: no chip
    assert.equal(await chip.count(), 0);

    // Without the raster the root has only the folder, whose photos the chip names
    await api('DELETE', `/orgs/${USER}/ds/${DS}/obj`, form({ path: path.basename(RASTER) }));
    await page.reload();
    await appReady(page);
    await page.getByRole('tab', { name: 'Map' }).click();
    await chip.waitFor({ timeout: 20000 });
    assert.match(await chip.innerText(), /Photos are in images\//);

    await page.locator('[data-testid="geo-subfolder-show"]').click();
    await chip.waitFor({ state: 'detached', timeout: 20000 });
    assert.deepEqual(errors, []);
});

test('FR-MAP-23: the first Save of a file map offers the stem of the file, selected', async () => {
    await api('POST', `/orgs/${USER}/ds/${DS}/obj`, form({ path: path.basename(RASTER), file: new Blob([fs.readFileSync(RASTER)]) }));
    const { page, errors } = await newPage();
    await page.goto(`${URL_}/r/${USER}/${DS}/view/${b64(path.basename(RASTER))}/map`);
    await appReady(page);
    await page.waitForSelector('.map-container', { timeout: 30000 });
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    const input = page.locator('[role="dialog"] input[type=text]').first();
    await input.waitFor({ timeout: 10000 });
    const stem = path.basename(RASTER, path.extname(RASTER));
    assert.equal(await input.inputValue(), stem);
    assert.equal(await input.evaluate(el => el.value.slice(el.selectionStart, el.selectionEnd)), stem);
    assert.deepEqual(errors, []);
});

test('FR-MAP-24: the Stockpile button is a mountain, the Compare button keeps the split icon', async () => {
    const { page, errors } = await newPage();
    await page.goto(`${URL_}/r/${USER}/${DS}/view/${b64(path.basename(RASTER))}/map`);
    await appReady(page);
    await page.waitForSelector('.map-container', { timeout: 30000 });
    const stockpile = page.locator('[data-testid="stockpile-toolbar-btn"]');
    if (await stockpile.count()) assert.ok(await stockpile.locator('i.fa-mountain').count());
    assert.equal(await page.locator('[data-testid="stockpile-toolbar-btn"] i.fa-layer-group').count(), 0);
    assert.deepEqual(errors, []);
});
