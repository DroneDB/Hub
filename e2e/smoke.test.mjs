/**
 * HQ-01 smoke suite: drives the real Hub in Chromium against a running Registry.
 * Not part of `npm test` (needs a server). Run before committing component changes:
 *
 *   HUB_URL=http://localhost:5100 npm run e2e
 *
 * Env: HUB_URL (default http://localhost:5100), HUB_USER/HUB_PASS (admin/password123),
 * HUB_TEST_DATA (/mnt/data/repos/test_data), HUB_HEADED=1 to watch, HUB_CHROME to use a given
 * Chromium binary (otherwise Playwright's own, else the newest one in ~/.cache/ms-playwright).
 * It creates a throw-away dataset in the user's organisation and deletes it at the end.
 * To test a local build: `npm run build`, copy build/* into <storage>/ClientApp, write the
 * package version into <storage>/ClientApp/version.txt and restart the Registry. Without
 * version.txt the Registry replaces the folder with the Hub embedded in its own binary.
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
const DS = `smoke-${Date.now().toString(36)}`;
const FILES = {
    photo: path.join(DATA, 'images', 'DJI_0018.JPG'),
    raster: path.join(DATA, 'ortho', 'brighton-beach-cog.tif'),
    cloud: path.join(DATA, 'point-clouds', 'brighton-beach.laz')
};
const b64 = s => Buffer.from(s, 'utf8').toString('base64');

// Playwright ships no browser build for some distributions: fall back to one already downloaded
function chromeExecutable() {
    if (process.env.HUB_CHROME) return process.env.HUB_CHROME;
    try { if (fs.existsSync(chromium.executablePath())) return undefined; } catch { /* not resolvable */ }
    const cache = path.join(process.env.HOME || '', '.cache', 'ms-playwright');
    const candidates = fs.existsSync(cache) ? fs.readdirSync(cache).filter(d => /^chromium-\d+$/.test(d)).sort().reverse() : [];
    for (const d of candidates) {
        const exe = path.join(cache, d, 'chrome-linux64', 'chrome');
        if (fs.existsSync(exe)) return exe;
    }
    return undefined;
}

let browser, page, token;
const pageErrors = [];
const vueWarnings = new Set();

async function api(method, endpoint, body) {
    const res = await fetch(`${URL_}${endpoint}`, { method, body, headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) throw new Error(`${method} ${endpoint} -> ${res.status} ${await res.text()}`);
    return res.headers.get('content-type')?.includes('json') ? res.json() : res.text();
}

const form = obj => { const f = new FormData(); for (const [k, v] of Object.entries(obj)) f.append(k, v); return f; };
const appReady = () => page.waitForFunction(() => document.getElementById('main-loading')?.style.display === 'none', null, { timeout: 30000 });

before(async () => {
    token = (await api('POST', '/users/authenticate', form({ username: USER, password: PASS }))).token;
    await api('POST', `/orgs/${USER}/ds`, form({ slug: DS, name: DS }));
    for (const p of Object.values(FILES)) {
        await api('POST', `/orgs/${USER}/ds/${DS}/obj`, form({ path: path.basename(p), file: new Blob([fs.readFileSync(p)]) }));
    }
    await api('POST', `/orgs/${USER}/ds/${DS}/obj`, form({ path: 'sub' }));
    browser = await chromium.launch({ headless: !process.env.HUB_HEADED, executablePath: chromeExecutable() });
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    page.on('pageerror', e => pageErrors.push(e.message));
    // Development builds only: Vue reports misuse (unknown props, missing emits, …) as console warnings
    page.on('console', m => { if (m.text().startsWith('[Vue warn]')) vueWarnings.add(m.text().split('\n')[0]); });
});

after(async () => {
    await browser?.close();
    try { await api('DELETE', `/orgs/${USER}/ds/${DS}`); } catch { /* best effort */ }
});

test('anonymous admin page goes to Login and back after sign-in', async () => {
    await page.goto(`${URL_}/admin/users`);
    await appReady();
    await page.waitForSelector('input[type=password]', { timeout: 15000 });
    assert.equal(new URL(page.url()).searchParams.get('redirect'), '/admin/users');
    await page.fill('input[type=text], input[placeholder*="sername"]', USER);
    await page.fill('input[type=password]', PASS);
    await Promise.all([page.waitForURL(/\/admin\/users$/, { timeout: 30000 }), page.click('button:has-text("Login")')]);
    await page.evaluate(() => { localStorage.clear(); document.cookie = 'jwtToken=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/'; });
});

test('login lands on the organisations page', async () => {
    await page.goto(`${URL_}/login`);
    await appReady();
    await page.fill('input[type=text], input[placeholder*="sername"]', USER);
    await page.fill('input[type=password]', PASS);
    await Promise.all([page.waitForURL(/\/r(\/|$)/, { timeout: 30000 }), page.click('button:has-text("Login")')]);
});

test('dataset list shows the smoke dataset', async () => {
    await page.goto(`${URL_}/r/${USER}`);
    await page.waitForSelector(`text=${DS}`, { timeout: 15000 });
});

test('dataset page lists the uploaded files', async () => {
    await page.goto(`${URL_}/r/${USER}/${DS}`);
    for (const p of Object.values(FILES)) await page.waitForSelector(`text=${path.basename(p)}`, { timeout: 20000 });
});

test('dragging a file onto a folder moves it', async () => {
    const name = path.basename(FILES.photo);
    await page.dragAndDrop(`#explorer >> text=${name}`, '#explorer >> text=sub');
    for (let i = 0; i < 40; i++) {
        const listed = await api('POST', `/orgs/${USER}/ds/${DS}/list`, form({ path: 'sub' })).catch(() => []);
        if (Array.isArray(listed) && listed.some(e => e.path === `sub/${name}`)) return;
        await page.waitForTimeout(250);
    }
    assert.fail(`${name} was not moved into sub/`);
});

test('the header downloads the selected file', async () => {
    const name = path.basename(FILES.raster);
    await page.click(`#explorer >> text=${name}`);
    await page.click(`button[title="Download ${name}"]`);
    const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 30000 }),
        page.click('.p-dialog button:has-text("Download")')
    ]);
    assert.equal(download.suggestedFilename(), name);
    await download.cancel();
});

test('the header Settings button opens the dataset settings', async () => {
    await page.click('button[title="Settings"]');
    await page.waitForSelector('text=License:', { timeout: 15000 });
    await page.keyboard.press('Escape');
});

test('map tab renders an OpenLayers map', async () => {
    await page.goto(`${URL_}/r/${USER}/${DS}/view/${b64(path.basename(FILES.raster))}/map`);
    await page.waitForSelector('.ol-viewport canvas', { timeout: 30000 });
});

test('point cloud viewer renders a canvas', async () => {
    await page.goto(`${URL_}/r/${USER}/${DS}/view/${b64(path.basename(FILES.cloud))}/pointcloud`);
    await page.waitForSelector('canvas', { timeout: 60000 });
});

test('admin pages render for an admin', async () => {
    await page.goto(`${URL_}/admin/users`);
    await page.waitForSelector(`text=${USER}`, { timeout: 15000 });
});

test('a session the server rejects goes to Login', async () => {
    await page.goto(`${URL_}/r/${USER}`);
    await page.waitForSelector(`text=${DS}`, { timeout: 15000 });
    // The token is still "valid" locally (not expired) but the server no longer accepts it
    await page.evaluate(origin => localStorage.setItem(`${origin}_jwt_token`, 'revoked'), URL_);
    await page.evaluate(() => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push('/r'));
    await page.waitForSelector('input[type=password]', { timeout: 15000 });
});

test('no uncaught page errors', () => {
    assert.deepEqual(pageErrors, []);
});

test('no Vue warnings (development build)', () => {
    assert.deepEqual([...vueWarnings], []);
});
