/**
 * The phone and tablet layout and the dialog sizes, end to end (AC-031, AC-001; FR-XC-20; FR-EXP-17, FR-EXP-29,
 * FR-ORG-19, FR-ORG-20, FR-SHR-06, FR-UPL-08): drives the real Hub in Chromium against a running Registry. Not part
 * of `npm test` (needs a server); same environment and conventions as smoke.test.mjs:
 *
 *   HUB_URL=http://localhost:5100 node --test e2e/phone-tablet-layout.test.mjs
 *
 * AC-031: at 390x844 and 820x1180 no page scrolls horizontally and no toolbar control overlaps another control. It
 * creates (then deletes) a throw-away dataset in HUB_USER's organisation, with files from HUB_TEST_DATA, and a
 * private one named 'Bulk dataset 24' for the lock of FR-ORG-20.
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
const DS = `layout-${SUFFIX}`;
const PRIVATE_DS = `bulk-24-${SUFFIX}`;
const RASTER_FILE = path.join(DATA, 'ortho', 'brighton-beach-cog.tif');
const RASTER = path.basename(RASTER_FILE);
const VIEWPORTS = [{ width: 390, height: 844 }, { width: 820, height: 1180 }];

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

async function newPage(viewport, { touch = false } = {}) {
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

async function openDataset(page, ds = DS) {
    await page.goto(`${URL_}/r/${USER}/${ds}`);
    await appReady(page);
}

/** Opens the dataset on its Files tab (a phone starts on the Browser tab). */
async function openFiles(page) {
    await openDataset(page);
    const filesTab = page.getByRole('tab', { name: 'Files' });
    if (await filesTab.count()) await filesTab.click();
    await page.waitForSelector('.hub-toolbar', { state: 'visible', timeout: 20000 });
}

/** Whether the page scrolls sideways: the document is wider than the window */
const scrollsHorizontally = page => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

/** The rectangles of the visible controls of the toolbar that overlap another one */
const overlappingControls = (page, scope) => page.evaluate(selector => {
    const controls = [...document.querySelectorAll(`${selector} button, ${selector} a, ${selector} input`)]
        .map(el => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 0 && r.height > 0);
    const overlaps = [];
    for (let i = 0; i < controls.length; i++) {
        for (let j = i + 1; j < controls.length; j++) {
            const a = controls[i], b = controls[j];
            if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
            const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
            const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
            if (w > 2 && h > 2) overlaps.push(`${a.el.getAttribute('aria-label') || a.el.textContent.trim()} / ${b.el.getAttribute('aria-label') || b.el.textContent.trim()}`);
        }
    }
    return overlaps;
}, scope);

const inViewport = (page, locator) => locator.evaluate(el => {
    const r = el.getBoundingClientRect();
    return r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight && r.right <= window.innerWidth;
});

before(async () => {
    token = (await api('POST', '/users/authenticate', form({ username: USER, password: PASS }))).token;
    await api('POST', `/orgs/${USER}/ds`, form({ slug: DS, name: DS }));
    await api('POST', `/orgs/${USER}/ds/${DS}/obj`, form({ path: RASTER, file: new Blob([fs.readFileSync(RASTER_FILE)]) }));
    await api('POST', `/orgs/${USER}/ds`, form({ slug: PRIVATE_DS, name: 'Bulk dataset 24' }));
    browser = await chromium.launch({ headless: !process.env.HUB_HEADED, executablePath: chromeExecutable() });
});

after(async () => {
    for (const c of contexts) await c.close().catch(() => {});
    await browser?.close();
    for (const ds of [DS, PRIVATE_DS]) {
        try { await api('DELETE', `/orgs/${USER}/ds/${ds}`); } catch { /* best effort */ }
    }
});

for (const viewport of VIEWPORTS) {
    const at = `${viewport.width}x${viewport.height}`;

    test(`AC-031 at ${at}: the organization page and the dataset page do not scroll sideways, no toolbar control overlaps another`, async () => {
        const { page, errors } = await newPage(viewport, { touch: true });
        await page.goto(`${URL_}/r/${USER}`);
        await appReady(page);
        await page.waitForSelector('.ds-table tbody tr', { timeout: 20000 });
        assert.equal(await scrollsHorizontally(page), false, 'the organization page scrolls sideways');

        await openFiles(page);
        assert.equal(await scrollsHorizontally(page), false, 'the dataset page scrolls sideways');
        assert.deepEqual(await overlappingControls(page, '.hub-toolbar'), []);
        assert.deepEqual(errors, []);
    });

    test(`FR-EXP-17 at ${at}: selecting the orthophoto shows every value fully, and Open is inside the window`, async () => {
        const { page } = await newPage(viewport, { touch: true });
        await openFiles(page);
        await page.locator('.hub-toolbar button[aria-label="List"]').click();
        await page.waitForSelector('#table-view', { timeout: 15000 });
        await page.click(`#table-view tr:has-text("${RASTER}")`);
        await page.waitForSelector('.detail-panel .props-datatable, .detail-side', { timeout: 15000 });
        const clipped = await page.evaluate(() => [...document.querySelectorAll('.detail-panel .props-datatable td')]
            .filter(td => td.scrollWidth > td.clientWidth + 1).map(td => td.textContent.trim().slice(0, 40)));
        assert.deepEqual(clipped, [], 'a value cell clips its text');
        const open = page.locator('.detail-panel button').filter({ hasText: /^\s*Open/ }).first();
        assert.ok(await inViewport(page, open), 'the Open button is outside the window');
        assert.equal(await scrollsHorizontally(page), false);
    });
}

test('FR-EXP-29 at 390x844: five tabs with a label each, no splitter handle at the left edge', async () => {
    const { page } = await newPage({ width: 390, height: 844 }, { touch: true });
    await openDataset(page);
    for (const name of ['Browser', 'Files', 'Properties', 'Map', 'Tasks']) {
        const tab = page.getByRole('tab', { name });
        assert.ok(await tab.isVisible(), `the ${name} tab is not visible`);
        // the label is shown (not visually hidden), and the tab is inside the window
        const label = tab.locator('.tab-label');
        assert.ok((await label.boundingBox()).width > 8, `the ${name} label is hidden`);
        assert.ok(await inViewport(page, tab), `the ${name} tab is cut off`);
    }
    // the tabs are a bottom navigation: under the page
    const tabsTop = (await page.getByRole('tab', { name: 'Files' }).boundingBox()).y;
    assert.ok(tabsTop > 844 / 2, 'the tabs are not at the bottom');
    // the splitter stays (the second pane is never rendered again when the window changes), its handle hidden
    assert.equal(await page.locator('.panel-gutter:visible, .p-splitter-gutter:visible').count(), 0, 'the splitter handle is shown');
    const atLeftEdge = await page.evaluate(() => [...document.querySelectorAll('[class*="gutter"]')]
        .filter(el => Math.round(el.getBoundingClientRect().left) === 0 && el.getBoundingClientRect().width > 0).length);
    assert.equal(atLeftEdge, 0);
});

test('FR-ORG-20 at 390x844: the lock is on the line of the dataset name', async () => {
    const { page } = await newPage({ width: 390, height: 844 }, { touch: true });
    await page.goto(`${URL_}/r/${USER}`);
    await appReady(page);
    const line = page.locator('.ds-name-line', { hasText: 'Bulk dataset 24' }).first();
    await line.waitFor({ state: 'visible', timeout: 20000 });
    const lock = line.locator('i.fa-lock');
    const name = line.locator('a.ds-name');
    const lockBox = await lock.boundingBox();
    const nameBox = await name.boundingBox();
    // the lock is before the name and level with the first line of the name
    assert.ok(lockBox.x < nameBox.x, 'the lock is not before the name');
    assert.ok(Math.abs(lockBox.y - nameBox.y) < nameBox.height, 'the lock is on another line than the name');
});

test('FR-ORG-19: the Create dataset dialog keeps its width while a name is typed', async () => {
    const { page } = await newPage({ width: 1400, height: 900 });
    await page.goto(`${URL_}/r/${USER}`);
    await appReady(page);
    await page.click('button:has-text("Create Dataset")');
    const dialog = page.locator('#datasetDialog');
    await dialog.waitFor({ state: 'visible', timeout: 10000 });
    const width = async () => Math.round((await dialog.boundingBox()).width);
    const before = await width();
    await dialog.locator('#dataset-dialog-dataset-name').fill('Bulk dataset 24');
    await page.waitForTimeout(200);
    assert.equal(await width(), before);
    await dialog.locator('#dataset-dialog-dataset-name').fill(`A new and rather longer dataset name, ${SUFFIX}`);
    await page.waitForTimeout(200);
    assert.equal(await width(), before);
});

for (const viewport of [{ width: 1400, height: 900 }, { width: 390, height: 844 }]) {
    test(`FR-UPL-08 at ${viewport.width}x${viewport.height}: after Verify the Dataset Name and the Import button are in the window`, async () => {
        const { page } = await newPage(viewport, { touch: viewport.width < 576 });
        await page.goto(`${URL_}/r/${USER}`);
        await appReady(page);
        await page.click('button[aria-label="Import dataset"]');
        const dialog = page.locator('#importDatasetDialog');
        await dialog.waitFor({ state: 'visible', timeout: 10000 });
        // this registry, with the credentials of the test user
        await dialog.locator('#import-dataset-dialog-registry-url').fill(`${URL_}/r/${USER}/${DS}`);
        await dialog.locator('#import-dataset-dialog-registry-url').blur();
        await dialog.getByRole('button', { name: 'Credentials (optional)' }).click();
        await dialog.locator('#import-dataset-dialog-username').fill(USER);
        await dialog.locator('#import-dataset-dialog-password').fill(PASS);
        await dialog.getByRole('button', { name: 'Verify' }).click();
        await dialog.getByText('Source reachable').waitFor({ state: 'visible', timeout: 30000 });
        assert.ok(await inViewport(page, dialog.locator('#import-dataset-dialog-dataset-name')), 'the Dataset Name is outside the window');
        assert.ok(await inViewport(page, dialog.getByRole('button', { name: 'Import', exact: true })), 'the Import button is outside the window');
        assert.ok(await dialog.locator('#import-dataset-dialog-dataset-name').evaluate(el => el === document.activeElement), 'the Dataset Name has no focus');
    });
}

test('FR-SHR-06: the Share dialog names the file and keeps its width between share types', async () => {
    const { page } = await newPage({ width: 1400, height: 900 });
    await openFiles(page);
    await page.locator('.hub-toolbar button[aria-label="List"]').click();
    await page.waitForSelector('#table-view', { timeout: 15000 });
    await page.click(`#table-view tr:has-text("${RASTER}")`);
    await page.locator('.detail-panel').getByRole('button', { name: /Share/ }).first().click();
    const dialog = page.locator('#share-embed');
    await dialog.waitFor({ state: 'visible', timeout: 10000 });
    assert.equal((await dialog.locator('.p-dialog-title').textContent()).trim(), `Share ${RASTER}`);
    const width = async () => Math.round((await dialog.boundingBox()).width);
    const linkWidth = await width();
    await dialog.locator('#share-mode').click();
    await page.getByRole('option', { name: /Tiles|OGC/ }).first().click();
    await page.waitForTimeout(300);
    assert.equal(await width(), linkWidth);
});
