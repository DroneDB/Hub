/**
 * The explorer's actions, end to end (FR-XC-14, FR-XC-20, FR-XC-22; EXP-02, EXP-11, MAP-09):
 * drives the real Hub in Chromium against a running Registry. Not part of `npm test` (needs a
 * server); same environment and conventions as smoke.test.mjs:
 *
 *   HUB_URL=http://localhost:5100 node --test e2e/explorer-actions.test.mjs
 *
 * It creates (then deletes) a throw-away dataset in HUB_USER's organisation, with files from
 * HUB_TEST_DATA.
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
const DS = `actions-${Date.now().toString(36)}`;
const FILES = {
    raster: path.join(DATA, 'ortho', 'brighton-beach-cog.tif'),
    photo: path.join(DATA, 'images', 'DJI_0018.JPG'),
    markdown: path.join(DATA, 'README.md')
};
const RASTER = path.basename(FILES.raster);
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

async function newPage(viewport = { width: 1400, height: 900 }, { touch = false } = {}) {
    const context = await browser.newContext({ viewport, isMobile: touch, hasTouch: touch });
    contexts.push(context);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${URL_}/login`);
    await appReady(page);
    await page.fill('input[type=text], input[placeholder*="sername"]', USER);
    await page.fill('input[type=password]', PASS);
    await Promise.all([page.waitForURL(/\/r(\/|$)/, { timeout: 30000 }), page.click('button:has-text("Login")')]);
    return { page, errors };
}

/** Opens the dataset on its Files tab (a phone starts on the Browser tab). */
async function openFiles(page) {
    await page.goto(`${URL_}/r/${USER}/${DS}`);
    await appReady(page);
    const filesTab = page.getByRole('tab', { name: 'Files' });
    if (await filesTab.count()) await filesTab.click();
    await page.waitForSelector('.hub-toolbar', { state: 'visible', timeout: 20000 });
}

/** Whether a tap at the centre of the element of `selector` lands on it (nothing covers it). */
const reachable = (page, selector) => page.evaluate(s => {
    const el = document.querySelector(s);
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && el.contains(hit);
}, selector);

const LIST = '.hub-toolbar button[aria-label="List"]';
const GRID = '.hub-toolbar button[aria-label="Grid"]';
const MORE = '.hub-toolbar button[aria-label="More"]';

before(async () => {
    token = (await api('POST', '/users/authenticate', form({ username: USER, password: PASS }))).token;
    await api('POST', `/orgs/${USER}/ds`, form({ slug: DS, name: DS }));
    for (const p of Object.values(FILES)) {
        await api('POST', `/orgs/${USER}/ds/${DS}/obj`, form({ path: path.basename(p), file: new Blob([fs.readFileSync(p)]) }));
    }
    browser = await chromium.launch({ headless: !process.env.HUB_HEADED, executablePath: chromeExecutable() });
});

after(async () => {
    for (const c of contexts) await c.close().catch(() => {});
    await browser?.close();
    try { await api('DELETE', `/orgs/${USER}/ds/${DS}`); } catch { /* best effort */ }
});

for (const [width, height] of [[390, 844], [820, 1180]]) {
    test(`EXP-02 at ${width}x${height}: with a row selected, the view toggle and More are on top and work`, async () => {
        const { page, errors } = await newPage({ width, height }, { touch: true });
        await openFiles(page);
        await page.click(LIST);
        await page.waitForSelector('#table-view', { timeout: 15000 });
        await page.click(`#table-view tr:has-text("${RASTER}")`);
        await page.waitForSelector('#table-view tr.row-selected', { timeout: 10000 });

        // The toolbar is one row: nothing of it is hidden under the table header or drawn over the rows
        for (const selector of [LIST, GRID, MORE]) assert.ok(await reachable(page, selector), `${selector} is not covered`);

        // The toggle toggles the view
        await page.click(GRID);
        await page.waitForSelector('#explorer', { timeout: 15000 });
        assert.equal(await page.getAttribute(GRID, 'aria-pressed'), 'true');

        // Refresh runs from More on a phone (and from wherever it is on a tablet)
        const refreshInMore = width < 576 || !(await page.locator('.hub-toolbar button[aria-label="Refresh"]').count());
        if (refreshInMore) {
            await page.click(MORE);
            const item = page.locator('.p-menu [role="menuitem"]:has-text("Refresh")');
            await item.waitFor({ state: 'visible', timeout: 10000 });
            await Promise.all([
                page.waitForRequest(r => r.url().includes(`/orgs/${USER}/ds/${DS}`), { timeout: 15000 }),
                item.click()
            ]);
        } else {
            assert.ok(await reachable(page, '.hub-toolbar button[aria-label="Refresh"]'));
        }
        assert.deepEqual(errors, []);
    });
}

test('EXP-11: a right click on the empty grid clears the selection and shows the folder menu', async () => {
    const { page, errors } = await newPage();
    await openFiles(page);
    if (await page.locator(GRID).getAttribute('aria-pressed') !== 'true') await page.click(GRID);
    await page.waitForSelector(`#explorer .thumbnail:has-text("${RASTER}")`, { timeout: 15000 });
    await page.click(`#explorer .thumbnail:has-text("${RASTER}")`);
    await page.waitForSelector('#explorer .thumbnail.selected', { timeout: 10000 });

    // Three files leave the bottom of the grid empty
    const box = await page.locator('#explorer').boundingBox();
    await page.mouse.click(box.x + box.width - 20, box.y + box.height - 20, { button: 'right' });
    const menu = page.locator('.p-contextmenu');
    await menu.waitFor({ state: 'visible', timeout: 10000 });
    const labels = await menu.locator('.p-contextmenu-item-label').allTextContents();
    assert.ok(labels.includes('New folder'), `the folder menu: ${labels.join(', ')}`);
    assert.ok(labels.includes('Refresh'));
    assert.ok(!labels.includes('Rename') && !labels.includes('Delete'), `no file actions: ${labels.join(', ')}`);
    assert.equal(await page.locator('#explorer .thumbnail.selected').count(), 0);
    await page.keyboard.press('Escape');
    assert.deepEqual(errors, []);
});

test('MAP-09: the map viewer refuses a file that is not a map, with a way back', async () => {
    const { page } = await newPage();
    await page.goto(`${URL_}/r/${USER}/${DS}/view/${b64('README.md')}/map`);
    await appReady(page);
    await page.waitForSelector('text=README.md cannot be opened as a map', { timeout: 20000 });
    await page.waitForSelector('text=Back to the dataset', { timeout: 5000 });
});

test('FR-XC-22: the keyboard reaches a disabled toolbar action and its reason', async () => {
    const { page } = await newPage();
    await openFiles(page);
    // Nothing selected: Rename does not apply
    await page.focus('.hub-toolbar button[aria-label="Upload"]');
    let found = null;
    for (let i = 0; i < 12 && !found; i++) {
        await page.keyboard.press('Tab');
        found = await page.evaluate(() => {
            const el = document.activeElement;
            if (el?.getAttribute('aria-label') !== 'Rename') return null;
            const reason = document.getElementById(el.getAttribute('aria-describedby') || '');
            return { disabled: el.getAttribute('aria-disabled'), reason: reason?.textContent, title: el.getAttribute('title') };
        });
    }
    assert.deepEqual(found, { disabled: 'true', reason: 'Select one file to rename', title: 'Rename: Select one file to rename' });
});

// FR-EXP-04, FR-EXP-05, FR-EXP-15 (written, not run in the unit's own check: needs a running Registry and a browser)
test('EXP-04: renaming a file to the name of a sibling shows an inline error, and the dialog stays open', async () => {
    const { page, errors } = await newPage();
    await openFiles(page);
    await page.waitForSelector(`#explorer .thumbnail:has-text("README.md"), #explorer tr:has-text("README.md")`, { timeout: 15000 });
    await page.click(`#explorer .thumbnail:has-text("README.md"), #explorer tr:has-text("README.md")`);
    await page.click('.hub-toolbar button[aria-label="Rename"]');
    const field = page.locator('#rename-name');
    await field.waitFor({ state: 'visible', timeout: 10000 });
    await field.fill(RASTER);
    await page.keyboard.press('Enter');
    const message = page.locator('#rename-name-error');
    await message.waitFor({ state: 'visible', timeout: 10000 });
    assert.equal(await message.textContent(), `A file or folder named '${RASTER}' already exists in this folder`);
    assert.equal(await field.getAttribute('aria-invalid'), 'true');
    assert.equal(await field.inputValue(), RASTER);
    assert.deepEqual(errors, []);
});

test('EXP-15/EXP-05: the New folder field is neutral, refuses a / and a name that exists, and keeps the typed text', async () => {
    const { page } = await newPage();
    await openFiles(page);
    await page.click('.hub-toolbar button[aria-label="New folder"]');
    const field = page.locator('#new-folder-name');
    await field.waitFor({ state: 'visible', timeout: 10000 });
    assert.equal(await page.locator('#new-folder-name-error').count(), 0, 'no error before typing');
    await field.fill('x/y');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#new-folder-name-error').textContent(), 'Folder names cannot contain /');
    await field.fill('README.md');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#new-folder-name-error').textContent(), "A file or folder named 'README.md' already exists in this folder");
    assert.equal(await field.inputValue(), 'README.md');
});
