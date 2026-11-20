/**
 * Notices and disabled states, end to end (U-310: FR-XC-09, FR-XC-10, FR-XC-22, FR-XC-23, FR-EXP-16, FR-ACC-19,
 * FR-UPL-11): drives the real Hub in Chromium against a running Registry. Not part of `npm test` (needs a server);
 * same environment and conventions as smoke.test.mjs:
 *
 *   HUB_URL=http://localhost:5100 node --test e2e/notices-disabled.test.mjs
 *
 * It creates (then deletes) a throw-away dataset in HUB_USER's organisation, with files from HUB_TEST_DATA. The import
 * test runs only with HUB_IMPORT_ARCHIVE_URL (an archive the Registry may download, e.g. model-gltf.zip on a host it
 * reaches); the dataset it imports is deleted afterwards.
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
const ARCHIVE_URL = process.env.HUB_IMPORT_ARCHIVE_URL;
const STAMP = Date.now().toString(36);
const DS = `notices-${STAMP}`;
const IMPORTED = `imported-${STAMP}`;
const FILES = {
    raster: path.join(DATA, 'ortho', 'brighton-beach-cog.tif'),
    photo: path.join(DATA, 'images', 'DJI_0018.JPG'),
    markdown: path.join(DATA, 'README.md'),
    model: path.join(DATA, '3d', 'model.glb')
};
const RASTER = path.basename(FILES.raster);
const PHOTO = path.basename(FILES.photo);
const MARKDOWN = path.basename(FILES.markdown);
const MODEL = path.basename(FILES.model);
const FOLDER = 'target';
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

/** Opens the dataset on its Files tab, in the grid view. */
async function openFiles(page) {
    await page.goto(`${URL_}/r/${USER}/${DS}`);
    await appReady(page);
    const filesTab = page.getByRole('tab', { name: 'Files' });
    if (await filesTab.count()) await filesTab.click();
    await page.waitForSelector('.hub-toolbar', { state: 'visible', timeout: 20000 });
    const grid = page.locator('.hub-toolbar button[aria-label="Grid"]');
    if (await grid.count() && await grid.getAttribute('aria-pressed') !== 'true') await grid.click();
    await page.waitForSelector('#explorer .thumbnail', { timeout: 20000 });
}

const tile = (page, name) => page.locator(`#explorer .thumbnail:has-text("${name}")`).first();
const toast = (page, text) => page.locator('.p-toast-message', { hasText: text }).first();

/** Whether two boxes overlap by more than a pixel. */
const intersects = (a, b) => Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1
    && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1;

/** The entries at the root of the dataset, by the API. */
const rootPaths = async () => (await api('POST', `/orgs/${USER}/ds/${DS}/list`, form({}))).map(e => e.path);

before(async () => {
    token = (await api('POST', '/users/authenticate', form({ username: USER, password: PASS }))).token;
    await api('POST', `/orgs/${USER}/ds`, form({ slug: DS, name: DS }));
    for (const p of Object.values(FILES)) {
        if (!fs.existsSync(p)) continue;
        await api('POST', `/orgs/${USER}/ds/${DS}/obj`, form({ path: path.basename(p), file: new Blob([fs.readFileSync(p)]) }));
    }
    // A folder: a path without a file
    await api('POST', `/orgs/${USER}/ds/${DS}/obj`, form({ path: FOLDER }));
    browser = await chromium.launch({ headless: !process.env.HUB_HEADED, executablePath: chromeExecutable() });
});

after(async () => {
    for (const c of contexts) await c.close().catch(() => {});
    await browser?.close();
    for (const ds of [DS, IMPORTED]) {
        try { await api('DELETE', `/orgs/${USER}/ds/${ds}`); } catch { /* best effort: the import may not have run */ }
    }
});

test('FR-XC-10: opening a dataset without optional files, and its map viewer, logs no console error', async () => {
    const { page, errors, consoleErrors } = await newPage();
    await openFiles(page);
    await tile(page, RASTER).waitFor({ timeout: 20000 });
    // The listing, the thumbnails and the optional reads (views, measurements, cameras) are done
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});

    await page.goto(`${URL_}/r/${USER}/${DS}/view/${b64(RASTER)}/map`);
    await appReady(page);
    await page.waitForSelector('.map-container', { timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});

    assert.deepEqual(errors, []);
    assert.deepEqual(consoleErrors, [], 'the console has error entries');
});

test('FR-XC-22: the keyboard reaches a disabled action, which says why it is disabled', async () => {
    const { page, errors } = await newPage();
    await openFiles(page);
    // Nothing selected: Delete is disabled, and stays a tab stop
    const del = page.locator('.hub-toolbar button[aria-label="Delete"]');
    await del.waitFor({ timeout: 10000 });
    assert.equal(await del.getAttribute('aria-disabled'), 'true');

    let reached = false;
    for (let i = 0; i < 60 && !reached; i++) {
        await page.keyboard.press('Tab');
        reached = await del.evaluate(el => el === document.activeElement);
    }
    assert.ok(reached, 'Tab does not reach the disabled Delete');

    // Its description (what a screen reader reads after the name) and its tooltip give the reason
    const reason = await del.evaluate(el => document.getElementById(el.getAttribute('aria-describedby') ?? '')?.textContent?.trim());
    assert.equal(reason, 'Select the files to delete');
    assert.match(await del.getAttribute('title') ?? '', /Select the files to delete/);

    // Enter on it does nothing: no question opens
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('[role="dialog"]:has-text("Delete")').count(), 0);
    assert.deepEqual(errors, []);
});

test('FR-EXP-16: Ctrl+X dims the tile', async () => {
    const { page, errors } = await newPage();
    await openFiles(page);
    await tile(page, PHOTO).click();
    await page.keyboard.press('Control+x');

    await page.waitForSelector(`#explorer .thumbnail.cut:has-text("${PHOTO}")`, { timeout: 5000 });
    assert.equal(await tile(page, PHOTO).evaluate(el => getComputedStyle(el).opacity), '0.5');
    // Only the cut file
    assert.equal(await tile(page, RASTER).evaluate(el => el.classList.contains('cut')), false);
    assert.deepEqual(errors, []);
});

test('FR-EXP-16, FR-XC-23: a drag move offers Undo, and Undo brings the file back', async () => {
    const { page, errors } = await newPage();
    await openFiles(page);
    await tile(page, MARKDOWN).dragTo(tile(page, FOLDER));

    const moved = toast(page, 'File moved successfully');
    await moved.waitFor({ timeout: 15000 });
    assert.ok(!(await rootPaths()).includes(MARKDOWN), 'the file is still at the root after the move');
    await tile(page, MARKDOWN).waitFor({ state: 'detached', timeout: 10000 });

    await moved.locator('button.toast-action', { hasText: 'Undo' }).click();
    await toast(page, 'The move was undone').waitFor({ timeout: 15000 });
    await tile(page, MARKDOWN).waitFor({ timeout: 10000 });
    assert.ok((await rootPaths()).includes(MARKDOWN), 'the file is not back at the root');
    assert.deepEqual(errors, []);
});

test('FR-XC-09: a toast raised in the 3D viewer does not cover Home or the toolbar', { skip: !fs.existsSync(FILES.model) }, async () => {
    // A new context: the one-time hint of the 3D controls is a toast raised as the viewer opens
    const { page, errors } = await newPage();
    await page.goto(`${URL_}/r/${USER}/${DS}/view/${b64(MODEL)}/unified`);
    await appReady(page);
    const home = page.locator('.viewer-nav button[aria-label="Home"]');
    await home.waitFor({ state: 'visible', timeout: 90000 });
    const hint = toast(page, '3D view controls');
    await hint.waitFor({ state: 'visible', timeout: 30000 });

    const box = await hint.boundingBox();
    assert.ok(!intersects(box, await home.boundingBox()), 'the toast covers Home');
    assert.ok(!intersects(box, await page.locator('.viewer-nav').boundingBox()), 'the toast covers the view controls');
    const toolbar = page.locator('#unified-viewer .toolbar-buttons');
    if (await toolbar.count() && await toolbar.isVisible()) {
        assert.ok(!intersects(box, await toolbar.boundingBox()), 'the toast covers the bottom toolbar');
    }
    assert.deepEqual(errors, []);
});

test('FR-ACC-19: signing out in one page signs the other page of the browser out', async () => {
    const { page: a, context } = await newPage();
    const b = await context.newPage();
    await b.goto(`${URL_}/r/${USER}`);
    await appReady(b);
    await b.waitForSelector('header button[aria-controls="user_menu"]', { timeout: 15000 });

    // Logout in A, from the user menu
    await a.goto(`${URL_}/r/${USER}`);
    await appReady(a);
    await a.click('header button[aria-controls="user_menu"]');
    await a.locator('#user_menu [role="menuitem"]', { hasText: 'Logout' }).click();

    // B shows Sign In, and says why, with the way back in
    await b.waitForSelector('header button[aria-label="Sign In"]', { timeout: 10000 });
    const notice = toast(b, 'You signed out in another tab.');
    await notice.waitFor({ timeout: 10000 });
    assert.equal(await notice.locator('button.toast-action').textContent(), 'Sign in');
});

test('FR-UPL-11: an archive import that runs in the background ends with a toast', { skip: !ARCHIVE_URL }, async () => {
    const { page, errors } = await newPage();
    await page.goto(`${URL_}/r/${USER}`);
    await appReady(page);
    await page.click('button[aria-label="Import dataset"]');
    const dialog = page.locator('#importDatasetDialog');
    await dialog.waitFor({ timeout: 10000 });

    await dialog.locator('.p-select').first().click();
    await page.getByRole('option', { name: /archive/i }).first().click();
    await dialog.locator('#import-dataset-field-url').fill(ARCHIVE_URL);
    await dialog.getByRole('button', { name: 'Verify' }).click();
    await dialog.locator('#import-dataset-dialog-dataset-name').waitFor({ timeout: 30000 });
    await dialog.locator('#import-dataset-dialog-dataset-name').fill(IMPORTED);
    await dialog.locator('#import-dataset-dialog-slug').fill(IMPORTED);

    await dialog.getByRole('button', { name: 'Import', exact: true }).click();
    await dialog.getByRole('button', { name: 'Run in background' }).click();
    await dialog.waitFor({ state: 'detached', timeout: 10000 });

    // The import ends on its own; its toast comes within 10 s of the end (a small archive: within 10 s of the start)
    const ended = page.locator('.p-toast-message', { hasText: /Import complete|Import failed/ }).first();
    await ended.waitFor({ timeout: 10000 });
    assert.match(await ended.textContent() ?? '', /Import complete/);
    assert.deepEqual(errors, []);
});
