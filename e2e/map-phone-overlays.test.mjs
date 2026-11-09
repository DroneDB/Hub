/**
 * Map overlays on phones and in embeds, end to end (AC-001, AC-031; FR-XC-20; FR-MAP-12, FR-MAP-16, FR-SHR-05,
 * FR-VWR-14, FR-VWR-27): drives the real Hub in Chromium against a running Registry. Not part of `npm test`
 * (needs a server); same environment and conventions as smoke.test.mjs and phone-tablet-layout.test.mjs:
 *
 *   HUB_URL=http://localhost:5100 node --test e2e/map-phone-overlays.test.mjs
 *
 * It creates (then deletes) a throw-away dataset in HUB_USER's organisation with an orthophoto, a second copy of it
 * (a view needs two layers), and a DEM from HUB_TEST_DATA. The splat and point cloud checks need a built file of the
 * kind (HUB_TEST_SPLAT, HUB_TEST_POINTCLOUD: a path in the dataset that is already built); without one they are skipped.
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
const SUFFIX = Date.now().toString(36);
const DS = `mapphone-${SUFFIX}`;
const ORTHO_FILE = path.join(DATA, 'ortho', 'brighton-beach-cog.tif');
const ORTHO = path.basename(ORTHO_FILE);
const ORTHO_2 = 'second-' + ORTHO;
const DEM_FILE = path.join(DATA, 'dem', 'test_dem.tiff');
const DEM = path.basename(DEM_FILE);
const PHONE = { width: 390, height: 844 };
const FRAME = { width: 600, height: 400 };

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

async function newPage(viewport, { touch = false, login = true } = {}) {
    const context = await browser.newContext({ viewport, isMobile: touch, hasTouch: touch });
    contexts.push(context);
    const page = await context.newPage();
    if (login) {
        await page.goto(`${URL_}/login`);
        await appReady(page);
        await page.fill('input[type=text], input[placeholder*="sername"]', USER);
        await page.fill('input[type=password]', PASS);
        await Promise.all([page.waitForURL(/\/r(\/|$)/, { timeout: 30000 }), page.click('button:has-text("Login")')]);
    }
    return page;
}

const mapUrl = (file, query = '') => `${URL_}/r/${USER}/${DS}/view/${Buffer.from(file).toString('base64')}/map${query}`;

async function openMap(page, file, query = '') {
    await page.goto(mapUrl(file, query));
    await appReady(page);
    await page.waitForSelector('.map-container .ol-zone-top-right button', { timeout: 30000 });
}

/** The buttons of the toolbar rail that are shown (not display:none) */
const railButtons = page => page.locator('.ol-zone-top-right button:visible');

/** The rectangles of the visible overlays of the map that overlap the map's own rail or each other */
const intersects = (a, b) => Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1
    && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1;

before(async () => {
    token = (await api('POST', '/users/authenticate', form({ username: USER, password: PASS }))).token;
    await api('POST', `/orgs/${USER}/ds`, form({ slug: DS, name: DS }));
    for (const [name, file] of [[ORTHO, ORTHO_FILE], [ORTHO_2, ORTHO_FILE], [DEM, DEM_FILE]]) {
        await api('POST', `/orgs/${USER}/ds/${DS}/obj`, form({ path: name, file: new Blob([fs.readFileSync(file)]) }));
    }
    browser = await chromium.launch({ headless: !process.env.HUB_HEADED, executablePath: chromeExecutable() });
});

after(async () => {
    for (const c of contexts) await c.close().catch(() => {});
    await browser?.close();
    try { await api('DELETE', `/orgs/${USER}/ds/${DS}`); } catch { /* best effort */ }
});

test('FR-MAP-12 at 390x844: a map with two layers has no panel over it on load, and a rail of at most 6 buttons', async () => {
    const page = await newPage(PHONE, { touch: true });
    await openMap(page, ORTHO, `?add=${Buffer.from(ORTHO_2).toString('base64url')}`);
    await page.waitForSelector('.raster-opacity-panel', { timeout: 20000 });
    // The size class of the map, not of the window
    assert.match(await page.locator('.map-container').getAttribute('class'), /\bis-compact\b/);
    // The layer panel is folded to its header: no row, no slider
    assert.equal(await page.locator('.raster-opacity-panel.is-folded').count(), 1);
    assert.equal(await page.locator('.raster-opacity-row:visible').count(), 0, 'the layer panel is open on load');
    // The rail: Reset, Fullscreen, Copy link, two analysis tools and the Measure toggle
    assert.ok(await railButtons(page).count() <= 6, 'the rail has more than 6 buttons on load');
    assert.equal(await page.locator('.ol-measure-toggle button:visible').count(), 1);
    assert.equal(await page.locator('.ol-measure-control [aria-label="Measure Length"]:visible').count(), 0);
    // No panel on the map: the folded layer panel is the only overlay and it stays clear of the rail
    const rail = await page.locator('.ol-zone-top-right').boundingBox();
    const panel = await page.locator('.raster-opacity-panel').boundingBox();
    assert.ok(!intersects(rail, panel), 'the layer panel is under the rail');
});

test('FR-MAP-12 at 390x844: the Measure toggle opens the tools, and the saves of the view bar are in a menu', async () => {
    const page = await newPage(PHONE, { touch: true });
    await openMap(page, ORTHO);
    await page.locator('.ol-measure-toggle button').click();
    await page.locator('.ol-measure-control [aria-label="Measure Length"]').waitFor({ state: 'visible' });
    // The bar of the viewer: the way back, the name and one menu button, not two Save buttons
    const bar = page.locator('.viewer-bar');
    assert.equal(await bar.locator('button:has-text("Save")').count(), 0);
    await bar.locator('button[aria-label="View actions"]').click();
    await page.locator('[role="menuitem"]:has-text("Save")').first().waitFor({ state: 'visible' });
});

test('FR-SHR-05 in a 600x400 frame: every button of the rail is in the frame, or behind the Measure toggle', async () => {
    const page = await newPage(FRAME);
    await openMap(page, ORTHO, '?embed=1');
    assert.match(await page.locator('.map-container').getAttribute('class'), /\bis-short\b/);
    const buttons = await railButtons(page).all();
    assert.ok(buttons.length > 0);
    for (const button of buttons) {
        const box = await button.boundingBox();
        assert.ok(box.y >= 0 && box.y + box.height <= FRAME.height && box.x >= 0 && box.x + box.width <= FRAME.width,
            `${await button.getAttribute('aria-label')} is outside the frame`);
    }
    // The measure tools are one toggle until it is pressed
    assert.equal(await page.locator('.ol-measure-toggle button:visible').count(), 1);
    assert.equal(await page.locator('.ol-measure-control [aria-label="Measure Area"]:visible').count(), 0);
});

test('FR-MAP-16 at 390x844: Click map shows its banner, and the result shows without scrolling', async () => {
    const page = await newPage(PHONE, { touch: true });
    await openMap(page, DEM);
    await page.locator('[data-testid="stockpile-toolbar-btn"]').click();
    await page.locator('[data-testid="stockpile-panel"]').waitFor({ state: 'visible' });
    await page.locator('[data-testid="stockpile-click-btn"]').click();
    const banner = page.locator('[data-testid="stockpile-click-banner"]');
    await banner.waitFor({ state: 'visible' });
    // The settings are behind a Settings button, so the banner is inside the sheet, and the sheet inside the window
    assert.equal(await page.locator('[data-testid="stockpile-settings-toggle"]').isVisible(), true);
    assert.equal(await page.locator('[data-testid="stockpile-settings"]').isVisible(), false);
    const sheet = await page.locator('[data-testid="stockpile-panel"]').boundingBox();
    const box = await banner.boundingBox();
    assert.ok(box.y >= sheet.y && box.y + box.height <= sheet.y + sheet.height + 1, 'the banner is below the visible part of the sheet');
    // A tap on the map (the pile detection needs a DEM with a pile: the result is checked when there is one)
    const map = await page.locator('.map-container').boundingBox();
    await page.touchscreen.tap(map.x + map.width / 2, map.y + map.height / 2);
    const result = page.locator('[data-testid="stockpile-result"]');
    if (await result.waitFor({ state: 'visible', timeout: 20000 }).then(() => true, () => false)) {
        const r = await result.boundingBox();
        assert.ok(r.y + Math.min(r.height, 80) <= sheet.y + sheet.height + 1, 'the result is below the visible part of the sheet');
    }
});

test('FR-VWR-14 at 390x844: the movement pad of a splat does not touch the bottom bar', { skip: !process.env.HUB_TEST_SPLAT }, async () => {
    const page = await newPage(PHONE, { touch: true });
    await page.goto(`${URL_}/r/${USER}/${DS}/view/${Buffer.from(process.env.HUB_TEST_SPLAT).toString('base64')}/splat`);
    await appReady(page);
    await page.waitForSelector('#splat .nav-controls', { timeout: 60000 });
    const pad = await page.locator('#splat .nav-controls').boundingBox();
    const bar = await page.locator('#splat .btn-stack').boundingBox();
    assert.ok(!intersects(pad, bar), 'the movement pad overlaps the bottom bar');
});

test('FR-VWR-27 at 390x844: the Local coordinates badge, the measure toolbar and the Layers panel do not overlap', { skip: !process.env.HUB_TEST_POINTCLOUD }, async () => {
    const page = await newPage(PHONE, { touch: true });
    await page.goto(`${URL_}/r/${USER}/${DS}/view/${Buffer.from(process.env.HUB_TEST_POINTCLOUD).toString('base64')}/unified`);
    await appReady(page);
    await page.waitForSelector('#unified-viewer .local-coords-badge', { timeout: 60000 });
    const badge = await page.locator('#unified-viewer .local-coords-badge').boundingBox();
    const toolbar = await page.locator('#unified-viewer .toolbar-buttons').boundingBox();
    assert.ok(!intersects(badge, toolbar), 'the badge overlaps the measure toolbar');
    if (await page.locator('#unified-viewer .layer-panel').count()) {
        assert.ok(!intersects(badge, await page.locator('#unified-viewer .layer-panel').boundingBox()), 'the badge overlaps the Layers panel');
    }
});
