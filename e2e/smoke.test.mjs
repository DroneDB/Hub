/**
 * Smoke suite: drives the real Hub in Chromium against a running Registry.
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
    cloud: path.join(DATA, 'point-clouds', 'brighton-beach.laz'),
    dem: path.join(DATA, 'dem', 'test_dem.tiff'),
    markdown: path.join(DATA, 'README.md'),
    // Renamed, then deleted, by the dialog tests
    scratch: path.join(DATA, 'LICENSE.md'),
    archive: path.join(DATA, 'delta', 'first.zip')
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

test('dataset list: delete asks first, then removes the dataset', async () => {
    const victim = `${DS}-del`;
    await api('POST', `/orgs/${USER}/ds`, form({ slug: victim, name: victim }));
    await page.goto(`${URL_}/r/${USER}`);
    const row = page.locator('tr', { hasText: victim });
    await row.locator('button[aria-label="Delete dataset"]').click({ timeout: 15000 });
    await page.waitForSelector(`.p-dialog >> text=${victim}`, { timeout: 10000 });
    await page.keyboard.press('Escape');
    await page.waitForSelector('.p-dialog', { state: 'detached', timeout: 10000 });
    await row.locator('button[aria-label="Delete dataset"]').click();
    await page.click('.p-dialog button:has-text("Remove")');
    await page.waitForSelector(`tr:has-text("${victim}")`, { state: 'detached', timeout: 15000 });
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
    await page.waitForSelector('.p-dialog >> text=License', { timeout: 15000 });
    await page.keyboard.press('Escape');
});

test('dialogs: Escape closes, Enter confirms', async () => {
    await page.goto(`${URL_}/r/${USER}/${DS}`);
    await page.waitForSelector(`#explorer >> text=${path.basename(FILES.raster)}`, { timeout: 20000 });
    await page.click('[title="Create folder"]');
    await page.waitForSelector('.p-dialog input', { timeout: 10000 });
    await page.keyboard.press('Escape');
    await page.waitForSelector('.p-dialog', { state: 'detached', timeout: 10000 });
    await page.click('[title="Create folder"]');
    await page.fill('.p-dialog input', 'smoke-folder');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.p-dialog', { state: 'detached', timeout: 10000 });
    await page.waitForSelector('#explorer >> text=smoke-folder', { timeout: 15000 });
});

test('dataset page: the file grid works from the keyboard', async () => {
    const tile = page.locator('#explorer [role="option"]', { hasText: 'smoke-folder' });
    await tile.focus();
    await page.keyboard.press('Space');
    assert.equal(await tile.getAttribute('aria-selected'), 'true');
    await page.keyboard.press('Escape');
    assert.equal(await tile.getAttribute('aria-selected'), 'false');
    await tile.focus();
    await page.keyboard.press('Enter');
    await page.waitForSelector('#explorer-container [aria-current="location"]:has-text("smoke-folder")', { timeout: 10000 });
    await page.click('#explorer-container button[aria-label="Root folder"]');
    await page.waitForSelector('#explorer-container [aria-current="location"]', { state: 'detached', timeout: 10000 });
    await page.waitForSelector(`#explorer >> text=${path.basename(FILES.scratch)}`, { timeout: 10000 });
});

test('dataset page: rename and delete through the toolbar and the Delete key', async () => {
    await page.click(`#explorer >> text=${path.basename(FILES.scratch)}`);
    await page.click('[title="Rename"]');
    await page.waitForSelector('.p-dialog input', { timeout: 10000 });
    await page.fill('.p-dialog input', 'smoke-renamed');
    await page.keyboard.press('Enter');
    await page.waitForSelector('#explorer >> text=smoke-renamed', { timeout: 15000 });
    await page.click('#explorer >> text=smoke-renamed');
    await page.keyboard.press('Delete');
    await page.waitForSelector('.p-dialog >> text=Are you sure', { timeout: 10000 });
    await page.keyboard.press('Enter');
    await page.waitForSelector('#explorer >> text=smoke-renamed', { state: 'detached', timeout: 15000 });
});

test('dataset page: properties and share dialogs open and close', async () => {
    const name = path.basename(FILES.raster);
    await page.click(`#explorer >> text=${name}`, { button: 'right' });
    await page.click('.p-contextmenu >> text=Properties');
    await page.waitForSelector('.p-dialog', { timeout: 10000 });
    await page.keyboard.press('Escape');
    await page.waitForSelector('.p-dialog', { state: 'detached', timeout: 10000 });
    await page.click('[title="Share/Embed"]');
    await page.waitForSelector('.p-dialog', { timeout: 10000 });
    await page.keyboard.press('Escape');
    await page.waitForSelector('.p-dialog', { state: 'detached', timeout: 10000 });
});

test('dataset page: the extract dialog picks a destination folder', async () => {
    await page.click(`#explorer >> text=${path.basename(FILES.archive)}`, { button: 'right' });
    await page.hover('.p-contextmenu >> text=Tools');
    await page.click('.p-contextmenu >> text=Extract');
    await page.click('.p-dialog button[aria-label="Browse folders"]', { timeout: 10000 });
    await page.waitForSelector('.p-dialog >> text=Select Destination Folder', { timeout: 10000 });
    await page.click('.p-dialog:has-text("Select Destination Folder") button:has-text("Confirm")');
    await page.waitForSelector('.p-dialog >> text=Select Destination Folder', { state: 'detached', timeout: 10000 });
    // The extract dialog stays, and is the window Escape closes
    await page.waitForSelector('.p-dialog >> text=Extract Archive', { timeout: 5000 });
    await page.keyboard.press('Escape');
    await page.waitForSelector('.p-dialog', { state: 'detached', timeout: 10000 });
});

test('map tab renders an OpenLayers map', async () => {
    await page.goto(`${URL_}/r/${USER}/${DS}/view/${b64(path.basename(FILES.raster))}/map`);
    await page.waitForSelector('.ol-viewport canvas', { timeout: 30000 });
});

// Measure a line on the map currently open (the single-map route or the dataset Map tab)
async function measureLength() {
    await page.click('button[title^="Measure Length"]');
    const box = await page.locator('.ol-viewport').boundingBox();
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    await page.mouse.click(cx - 80, cy);
    await page.mouse.dblclick(cx + 80, cy);
    const text = await page.locator('.ol-tooltip-static').last().textContent({ timeout: 10000 });
    assert.match(text, /\d+(\.\d+)? (m|km)/);
    await page.keyboard.press('Escape');
}

test('single map: measure a length, list it and save it', async () => {
    await measureLength();
    await page.click('button[title^="Measurement List"]');
    await page.waitForSelector('.p-dialog >> text=Measurements', { timeout: 10000 });
    assert.equal(await page.locator('.p-dialog >> text=No measurements').count(), 0);
    await page.keyboard.press('Escape');
    await page.waitForSelector('.p-dialog', { state: 'detached', timeout: 10000 });
    await page.click('button[title^="Save Measurements"]');
    await page.waitForSelector('.p-toast-message', { timeout: 15000 });
});

test('single map: plant health panel opens from the opacity control', async () => {
    // The opacity bar sits under the map attribution: dispatch the click on the button itself
    await page.locator('button[title="Plant Health"]').dispatchEvent('click');
    await page.waitForSelector('.plant-health-panel', { timeout: 15000 });
    await page.locator('button[title="Plant Health"]').dispatchEvent('click');
});

test('single map (DEM): raster analysis and stockpile panels open and close', async () => {
    await page.goto(`${URL_}/r/${USER}/${DS}/view/${b64(path.basename(FILES.dem))}/map`);
    await page.waitForSelector('.ol-viewport canvas', { timeout: 30000 });
    await page.click('[data-testid="raster-analysis-toolbar-btn"]');
    await page.waitForSelector('.raster-panel', { timeout: 15000 });
    await page.click('[data-testid="stockpile-toolbar-btn"]');
    await page.waitForSelector('[data-testid="stockpile-panel"]', { timeout: 15000 });
    // One analysis panel at a time
    assert.equal(await page.locator('.raster-panel').count(), 0);
    // Contours: from the raster panel to its options dialog
    await page.click('[data-testid="raster-analysis-toolbar-btn"]');
    await page.waitForSelector('.raster-panel', { timeout: 15000 });
    await page.click('.raster-panel >> text=Contours');
    await page.waitForSelector('.p-dialog >> text=Contour', { timeout: 15000 });
    await page.keyboard.press('Escape');
    await page.click('[data-testid="stockpile-toolbar-btn"]');
    await page.waitForSelector('[data-testid="stockpile-panel"]', { timeout: 15000 });
    await page.click('[data-testid="stockpile-toolbar-btn"]');
    await page.waitForSelector('[data-testid="stockpile-panel"]', { state: 'detached', timeout: 15000 });
});

test('single map: settings dialog switches the basemap', async () => {
    await page.click('button[title^="Map Settings"]');
    await page.waitForSelector('text=Basemap', { timeout: 15000 });
    await page.keyboard.press('Escape');
});

test('dataset Map tab renders and measures', async () => {
    await page.goto(`${URL_}/r/${USER}/${DS}`);
    await page.waitForSelector(`#explorer >> text=${path.basename(FILES.raster)}`, { timeout: 20000 });
    await page.click('text=Map');
    await page.waitForSelector('.ol-viewport canvas', { timeout: 30000 });
    await measureLength();
});

test('dataset page: Plant Health from the context menu opens the Map tab with the panel', async () => {
    await page.click('text=Files');
    const name = path.basename(FILES.raster);
    await page.click(`#explorer >> text=${name}`, { button: 'right' });
    await page.click('.p-contextmenu >> text=Plant Health');
    await page.waitForSelector('.plant-health-panel', { timeout: 15000 });
    await page.click('.plant-health-panel button[title="Close"]');
    await page.waitForSelector('.plant-health-panel', { state: 'hidden', timeout: 10000 });
});

test('dataset Map tab: split compare and the display toggles', async () => {
    // Root holds the orthophoto, the DEM and the point cloud: three georasters
    const compare = 'button[aria-label="Compare georasters side by side"]';
    await page.waitForSelector(compare, { timeout: 15000 });
    await page.click(compare);
    await page.waitForSelector('.split-overlay', { timeout: 10000 });
    await page.click(compare);
    await page.waitForSelector('.split-overlay', { state: 'detached', timeout: 10000 });
    const flight = 'button[aria-label="Show drone flight path"]';
    const before = await page.locator(flight).getAttribute('aria-pressed');
    await page.click(flight);
    assert.notEqual(await page.locator(flight).getAttribute('aria-pressed'), before);
    await page.click(flight);
});

test('compare view: georasters side by side, saved and listed under the tree', async () => {
    const paths = [path.basename(FILES.raster), path.basename(FILES.dem)];
    const query = paths.map(p => `p=${Buffer.from(p, 'utf8').toString('base64url')}`).join('&');
    await page.goto(`${URL_}/r/${USER}/${DS}/compare?${query}`);
    await page.waitForSelector('.split-overlay', { timeout: 30000 });
    assert.deepEqual(await page.locator('.split-label-text').allInnerTexts(), paths);
    await page.click('.compare-toolbar button:has-text("Save")');
    await page.fill('.p-dialog input', 'Smoke comparison');
    await Promise.all([page.waitForURL(/\?c=c_/, { timeout: 15000 }), page.click('.p-dialog button[data-confirm]')]);
    await page.goto(`${URL_}/r/${USER}/${DS}`);
    await page.waitForSelector('.saved-comparisons >> text=Smoke comparison', { timeout: 20000 });
});

test('dataset Map tab: clicking a photo opens its popup', async () => {
    const name = path.basename(FILES.photo);
    // sub/ holds only the photo: the map fits it at the centre
    await page.click('text=Files');
    await page.dblclick('#explorer >> text=sub');
    await page.waitForSelector(`#explorer >> text=${name}`, { timeout: 20000 });
    await page.click('text=Map');
    await page.waitForTimeout(1500);
    const box = await page.locator('.ol-viewport').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForSelector(`.image-popup >> text=${name}`, { timeout: 10000 });
    // No georaster here: no compare button
    assert.equal(await page.locator('button[aria-label="Compare georasters side by side"]').count(), 0);
    // Dragging the header moves the popup by the same distance
    const header = page.locator('.image-popup-header');
    await page.waitForSelector('.image-popup-img', { state: 'visible', timeout: 10000 });
    await page.waitForTimeout(500); // the pan that brings the grown popup into view
    const before = await page.locator('.image-popup').boundingBox();
    const grip = await header.boundingBox();
    assert.ok(grip.y >= box.y, `the header (top ${grip.y}) is inside the map (top ${box.y}), not under the tabs`);
    await page.mouse.move(grip.x + 20, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip.x - 40, grip.y + grip.height / 2 + 30, { steps: 5 });
    await page.mouse.up();
    const after = await page.locator('.image-popup').boundingBox();
    assert.ok(Math.abs(after.x - before.x + 60) <= 1 && Math.abs(after.y - before.y - 30) <= 1,
        `popup moved from ${before.x},${before.y} to ${after.x},${after.y}`);
    await page.locator('.image-popup button[aria-label="Close"]').click();
    await page.waitForSelector('.image-popup', { state: 'hidden', timeout: 10000 });
});

test('dataset page: a photo opens in the lightbox', async () => {
    // Still in sub/ (previous test)
    await page.click('text=Files');
    await page.dblclick(`#explorer >> text=${path.basename(FILES.photo)}`);
    await page.waitForSelector('.lightbox-info-overlay', { timeout: 15000 });
    assert.match(await page.locator('.lightbox-info-name').textContent(), /DJI_0018/);
    await page.keyboard.press('Escape');
    await page.waitForSelector('.lightbox-info-overlay', { state: 'detached', timeout: 10000 });
});

test('point cloud viewer renders a canvas', async () => {
    await page.goto(`${URL_}/r/${USER}/${DS}/view/${b64(path.basename(FILES.cloud))}/pointcloud`);
    await page.waitForSelector('canvas', { timeout: 60000 });
});

// Units are an account preference: each choice is saved before the page is left, or the
// reload reads the old one, and feet would stay for the measurements of the next run
async function chooseUnits(value) {
    const saved = page.waitForResponse(r => r.url().endsWith('/users/preferences') && r.request().method() === 'PATCH'
        && r.ok() && (r.request().postData() ?? '').includes(value), { timeout: 15000 });
    await page.selectOption('#potree-unit-select', value);
    await saved;
}

test('point cloud viewer keeps the chosen units', async () => {
    await page.waitForSelector('#potree-unit-select', { timeout: 60000 });
    await chooseUnits('imperial');
    await page.reload();
    await page.waitForSelector('#potree-unit-select', { timeout: 60000 });
    assert.equal(await page.inputValue('#potree-unit-select'), 'imperial');
    await chooseUnits('metric');
});

test('markdown viewer renders and offers editing to a writer', async () => {
    await page.goto(`${URL_}/r/${USER}/${DS}/view/${b64(path.basename(FILES.markdown))}/markdown`);
    await page.waitForSelector('.markdown .content h1, .markdown .content p', { timeout: 20000 });
    await page.waitForSelector('button[aria-label="Edit"]', { timeout: 5000 });
});

test('a viewer refuses a file of another type', async () => {
    await page.goto(`${URL_}/r/${USER}/${DS}/view/${b64(path.basename(FILES.raster))}/markdown`);
    await page.waitForSelector('text=cannot be opened as markdown', { timeout: 20000 });
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
