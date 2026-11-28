/**
 * User preferences, end to end: drives the real Hub in Chromium against a running Registry.
 * Not part of `npm test` (needs a server); same environment and conventions as smoke.test.mjs:
 *
 *   HUB_URL=http://localhost:5100 node --test e2e/preferences.test.mjs
 *
 * It resets the preferences of HUB_USER before and after, and creates (then deletes) a
 * throw-away dataset in that user's organisation for the open-map scenario.
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
const DS = `prefs-${Date.now().toString(36)}`;
const RASTER = path.join(DATA, 'ortho', 'brighton-beach-cog.tif');
const SECTIONS = ['units', 'map', 'explorer', 'datasets', 'orgs', 'viewers'];

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

let browser, token;
const contexts = [];

async function api(method, endpoint, body, asJson = false) {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    if (asJson) headers['Content-Type'] = 'application/json';
    const res = await fetch(`${URL_}${endpoint}`, { method, body: asJson ? JSON.stringify(body) : body, headers });
    if (!res.ok) throw new Error(`${method} ${endpoint} -> ${res.status} ${await res.text()}`);
    return res.headers.get('content-type')?.includes('json') ? res.json() : res.text();
}
const form = obj => { const f = new FormData(); for (const [k, v] of Object.entries(obj)) f.append(k, v); return f; };
const accountPreferences = () => api('GET', '/users/preferences');
const resetAccount = () => api('PATCH', '/users/preferences', Object.fromEntries(SECTIONS.map(s => [s, null])), true);

async function newPage() {
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    contexts.push(context);
    return { context, page: await context.newPage() };
}
const appReady = page => page.waitForFunction(() => document.getElementById('main-loading')?.style.display === 'none', null, { timeout: 30000 });

async function login(page) {
    await page.goto(`${URL_}/login`);
    await appReady(page);
    await page.fill('input[type=text], input[placeholder*="sername"]', USER);
    await page.fill('input[type=password]', PASS);
    await Promise.all([page.waitForURL(/\/r(\/|$)/, { timeout: 30000 }), page.click('button:has-text("Login")')]);
}

// Preferences are a window opened from the user menu of the header, over whatever page is open
async function openPreferences(page) {
    await page.click('button[aria-controls="user_menu"]');
    await page.click('#user_menu >> text=Preferences');
    await page.waitForSelector('#preferencesDialog #pref-measurement-units', { timeout: 15000 });
}

// `sent`, when given, is text the saved request carries
const savedToAccount = (page, sent = '') => page.waitForResponse(
    r => r.url().endsWith('/users/preferences') && r.request().method() === 'PATCH' && r.ok()
        && (r.request().postData() ?? '').includes(sent), { timeout: 15000 });

async function chooseUnits(page, label) {
    await page.click('#pref-measurement-units');
    await page.click(`li[role="option"]:has-text("${label}")`);
}

before(async () => {
    token = (await api('POST', '/users/authenticate', form({ username: USER, password: PASS }))).token;
    await resetAccount();
    await api('POST', `/orgs/${USER}/ds`, form({ slug: DS, name: DS }));
    await api('POST', `/orgs/${USER}/ds/${DS}/obj`, form({ path: path.basename(RASTER), file: new Blob([fs.readFileSync(RASTER)]) }));
    browser = await chromium.launch({ headless: !process.env.HUB_HEADED, executablePath: chromeExecutable() });
});

after(async () => {
    for (const c of contexts) await c.close().catch(() => {});
    await browser?.close();
    try { await resetAccount(); } catch { /* best effort */ }
    try { await api('DELETE', `/orgs/${USER}/ds/${DS}`); } catch { /* best effort */ }
});

test('1. changed units are saved to the account and kept after a reload', async () => {
    const { page } = await newPage();
    await login(page);
    await openPreferences(page);
    // An empty account was seeded or left empty by the login; the change below is the one that is awaited
    const saved = savedToAccount(page);
    await chooseUnits(page, 'Imperial');
    await saved;
    await page.waitForSelector('.sync-status:has-text("Saved to your account")', { timeout: 10000 });
    assert.equal((await accountPreferences()).units?.measurement, 'imperial');

    await page.reload();
    await appReady(page);
    // The window is closed by the reload: open it again
    assert.equal(await page.locator('#preferencesDialog').count(), 0);
    await openPreferences(page);
    assert.match(await page.locator('#pref-measurement-units').textContent(), /Imperial/);
});

test('2. a second browser context with the same user sees the same values', async () => {
    const { page } = await newPage();
    await login(page);
    await openPreferences(page);
    await page.waitForFunction(() => /Imperial/.test(document.querySelector('#pref-measurement-units')?.textContent || ''), null, { timeout: 15000 });
    assert.equal(await page.evaluate(() => localStorage.getItem('measureUnitPref')), 'imperial');
});

test('3. an anonymous change is kept on the device and seeds an empty account at the first login', async () => {
    await resetAccount();
    assert.deepEqual(Object.values(await accountPreferences()).filter(Boolean), []);
    const { page } = await newPage();
    await page.goto(`${URL_}/login`);
    await appReady(page);
    // What an anonymous visitor's map would store when they switch units
    await page.evaluate(() => localStorage.setItem('measureUnitPref', 'imperial'));
    await page.reload();
    await appReady(page);
    assert.equal(await page.evaluate(() => localStorage.getItem('measureUnitPref')), 'imperial');

    const seeded = savedToAccount(page);
    await login(page);
    await seeded;
    assert.equal((await accountPreferences()).units?.measurement, 'imperial');
});

test('4. a change in one tab updates the open map in another tab without a reload', async () => {
    const { context, page: tabA } = await newPage();
    await login(tabA);
    await openPreferences(tabA);
    await tabA.click('[role="tab"]:has-text("Map")');

    const tabB = await context.newPage();
    await tabB.goto(`${URL_}/r/${USER}/${DS}`);
    await tabB.waitForSelector(`#explorer >> text=${path.basename(RASTER)}`, { timeout: 20000 });
    await tabB.click('text=Map');
    await tabB.waitForSelector('.ol-viewport canvas', { timeout: 30000 });
    const flight = tabB.locator('button[aria-label="Show drone flight path"]');
    await flight.waitFor({ timeout: 15000 });
    const before = await flight.getAttribute('aria-pressed');

    await tabA.bringToFront();
    await tabA.click('label[for="pref-flight-path"]');
    await tabB.waitForFunction(
        ({ was }) => document.querySelector('button[aria-label="Show drone flight path"]')?.getAttribute('aria-pressed') !== was,
        { was: before }, { timeout: 10000 });
    assert.notEqual(await flight.getAttribute('aria-pressed'), before);
    // The map was not reloaded
    assert.ok(await tabB.locator('.ol-viewport canvas').count());
});

// A custom tile server for the basemap scenarios: every tile is one transparent pixel
const TILE_HOST = 'https://tiles.e2e.test';
const TILE_URL = `${TILE_HOST}/{z}/{x}/{y}.png`;
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const serveTiles = context => context.route(`${TILE_HOST}/**`,
    route => route.fulfill({ status: 200, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: PIXEL }));
// A tile of the map, not the one tile the editor loads to check the source
const isMapTile = request => request.url().startsWith(TILE_HOST) && !request.url().endsWith('/0/0/0.png');
const SAVES_CUSTOM = '"basemap":"custom"';

async function openDatasetMap(page) {
    await page.goto(`${URL_}/r/${USER}/${DS}`);
    await page.waitForSelector(`#explorer >> text=${path.basename(RASTER)}`, { timeout: 20000 });
    await page.click('text=Map');
    await page.waitForSelector('.ol-viewport canvas', { timeout: 30000 });
}

test('5. Custom in the Map tab sets up the custom basemap; the open map draws it; Clear goes back to the default', async () => {
    await resetAccount();
    const { context, page: tabA } = await newPage();
    await serveTiles(context);
    await login(tabA);

    const tabB = await context.newPage();
    await openDatasetMap(tabB);

    await tabA.bringToFront();
    await openPreferences(tabA);
    assert.equal(await tabA.locator('#preferencesDialog .p-dialog-title').textContent(), 'User preferences');
    await tabA.click('[role="tab"]:has-text("Map")');
    await tabA.click('#pref-basemap');
    await tabA.click('li[role="option"]:has-text("Custom")');
    await tabA.waitForSelector('#pref-custom-basemap-url');
    // Custom waits for a source: the account and the map keep the basemap they had
    assert.notEqual((await accountPreferences()).map?.basemap, 'custom');

    await tabA.fill('#pref-custom-basemap-url', TILE_URL);
    const saved = savedToAccount(tabA, SAVES_CUSTOM);
    const drawn = tabB.waitForRequest(isMapTile, { timeout: 15000 });
    await tabA.click('#preferencesDialog button:has-text("Apply")');
    await saved;
    const map = (await accountPreferences()).map;
    assert.equal(map.basemap, 'custom');
    assert.equal(map.customBasemap.url, TILE_URL);
    // The map open in the other tab draws the custom tiles
    await drawn;

    const cleared = savedToAccount(tabA);
    await tabA.click('#preferencesDialog button:has-text("Clear")');
    await cleared;
    await tabA.waitForSelector('#pref-custom-basemap-url', { state: 'detached' });
    assert.match(await tabA.locator('#pref-basemap').textContent(), /Satellite/);
});

test('6. the map settings of a map set up the same custom basemap', async () => {
    await resetAccount();
    const { context, page } = await newPage();
    await serveTiles(context);
    await login(page);
    await openDatasetMap(page);
    await page.click('.ol-settings button');
    await page.click('#map-settings-dialog-basemap');
    await page.click('li[role="option"]:has-text("Custom")');
    await page.fill('#map-settings-dialog-custom-url', TILE_URL);
    const saved = savedToAccount(page, SAVES_CUSTOM);
    const drawn = page.waitForRequest(isMapTile, { timeout: 15000 });
    await page.click('#map-settings button:has-text("Apply")');
    await saved;
    await drawn;
    const map = (await accountPreferences()).map;
    assert.equal(map.basemap, 'custom');
    assert.equal(map.customBasemap.url, TILE_URL);
});

test('7. the dataset names of the datasets map follow the account', async () => {
    await resetAccount();
    await api('PATCH', '/users/preferences', { datasets: { table: { sortColumn: 'name', sortDirection: 'asc', itemsPerPage: 10, view: 'map' } } }, true);
    const { page } = await newPage();
    await login(page);
    await openPreferences(page);
    await page.click('[role="tab"]:has-text("Map")');
    const saved = savedToAccount(page);
    await page.click('label[for="pref-dataset-names"]');
    await saved;
    assert.equal((await accountPreferences()).map?.showDatasetNames, true);
    await page.click('#preferencesDialog button:has-text("Close")');

    await page.goto(`${URL_}/r/${USER}`);
    const names = page.locator('button[aria-label="Show the names of the datasets"]');
    await names.waitFor({ timeout: 30000 });
    assert.equal(await names.getAttribute('aria-pressed'), 'true');
});
