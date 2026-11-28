/**
 * Dialog focus, end to end, and the report surfaces
 * (the live page, the editor, the PDF progress, the organization Report settings; tests 7 to 11):
 * drives the real Hub in Chromium against a running Registry. Not part of `npm test` (needs a
 * server); same environment and conventions as smoke.test.mjs:
 *
 *   HUB_URL=http://localhost:5100 node --test e2e/a11y.test.mjs
 *
 * It creates (then deletes) a throw-away dataset in HUB_USER's organisation for the dataset
 * list scenario.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const URL_ = process.env.HUB_URL || 'http://localhost:5100';
const USER = process.env.HUB_USER || 'admin';
const PASS = process.env.HUB_PASS || 'password123';
const DS = `a11y-${Date.now().toString(36)}`;

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

async function api(method, endpoint, body) {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await fetch(`${URL_}${endpoint}`, { method, body, headers });
    if (!res.ok) throw new Error(`${method} ${endpoint} -> ${res.status} ${await res.text()}`);
    return res.headers.get('content-type')?.includes('json') ? res.json() : res.text();
}
const form = obj => { const f = new FormData(); for (const [k, v] of Object.entries(obj)) f.append(k, v); return f; };

async function newPage() {
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    contexts.push(context);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e));
    return { page, errors, context };
}
const appReady = page => page.waitForFunction(() => document.getElementById('main-loading')?.style.display === 'none', null, { timeout: 30000 });

async function login(page) {
    await page.goto(`${URL_}/login`);
    await appReady(page);
    await page.fill('input[type=text], input[placeholder*="sername"]', USER);
    await page.fill('input[type=password]', PASS);
    await Promise.all([page.waitForURL(/\/r(\/|$)/, { timeout: 30000 }), page.click('button:has-text("Login")')]);
}

/** Whether the focus is inside `selector` (a dialog). */
const focusInside = (page, selector) => page.evaluate(s => !!document.activeElement?.closest(s), selector);

/** The focus is in the dialog, and stays there over `tabs` presses of Tab. */
async function assertTrapped(page, selector, tabs = 12) {
    assert.ok(await focusInside(page, selector), `focus is inside ${selector} when it opens`);
    for (let i = 0; i < tabs; i++) {
        await page.keyboard.press('Tab');
        assert.ok(await focusInside(page, selector), `focus is inside ${selector} after Tab ${i + 1}`);
    }
}

before(async () => {
    token = (await api('POST', '/users/authenticate', form({ username: USER, password: PASS }))).token;
    await api('POST', `/orgs/${USER}/ds`, form({ slug: DS, name: DS }));
    browser = await chromium.launch({ headless: !process.env.HUB_HEADED, executablePath: chromeExecutable() });
});

after(async () => {
    for (const c of contexts) await c.close().catch(() => {});
    await browser?.close();
    try { await api('DELETE', `/orgs/${USER}/ds/${DS}`); } catch { /* best effort */ }
});

test('1. Preferences opened with the keyboard from the user menu takes the focus and keeps it', async () => {
    const { page } = await newPage();
    await login(page);
    await page.focus('button[aria-controls="user_menu"]');
    await page.keyboard.press('Enter');
    await page.waitForSelector('#user_menu', { state: 'visible' });
    for (let i = 0; i < 12; i++) {
        const focused = await page.evaluate(() => document.querySelector('#user_menu [data-p-focused="true"]')?.textContent || '');
        if (/Preferences/.test(focused)) break;
        await page.keyboard.press('ArrowDown');
    }
    await page.keyboard.press('Enter');
    await page.waitForSelector('#preferencesDialog #pref-measurement-units', { timeout: 15000 });
    await page.waitForTimeout(400);
    await assertTrapped(page, '#preferencesDialog');
    await page.keyboard.press('Escape');
    await page.waitForSelector('#preferencesDialog', { state: 'detached' });
    assert.ok(await page.evaluate(() => document.activeElement?.matches('button[aria-controls="user_menu"]')), 'focus is back on the user menu button');
});

test('2. Preferences opened with the mouse takes the focus and keeps it', async () => {
    const { page } = await newPage();
    await login(page);
    await page.click('button[aria-controls="user_menu"]');
    await page.click('#user_menu >> text=Preferences');
    await page.waitForSelector('#preferencesDialog #pref-measurement-units', { timeout: 15000 });
    await page.waitForTimeout(400);
    await assertTrapped(page, '#preferencesDialog');
});

test('3. Manage Roles opened with Enter takes the focus and keeps it', async () => {
    const { page } = await newPage();
    await login(page);
    await page.goto(`${URL_}/admin/users`);
    await appReady(page);
    await page.focus('button:has-text("Manage Roles")');
    await page.keyboard.press('Enter');
    await page.waitForSelector('#roleManagementDialog', { timeout: 15000 });
    await page.waitForTimeout(400);
    await assertTrapped(page, '#roleManagementDialog');
});

test('4. Create Organization gives the focus back to its button when it closes', async () => {
    const { page } = await newPage();
    await login(page);
    await page.goto(`${URL_}/r`);
    await appReady(page);
    const button = 'button:visible:has-text("Create Organization")';
    await page.focus(button);
    await page.keyboard.press('Enter');
    await page.waitForSelector('.p-dialog', { timeout: 15000 });
    await page.waitForTimeout(400);
    assert.ok(await focusInside(page, '.p-dialog'), 'focus is inside the dialog');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.p-dialog', { state: 'detached' });
    assert.ok(await page.evaluate(() => /Create Organization/.test(document.activeElement?.textContent || '')), 'focus is back on Create Organization');
});

test('5. a dataset opens with Tab and Enter, and Shift+F10 opens its menu', async () => {
    const { page, errors } = await newPage();
    await login(page);
    await page.goto(`${URL_}/r/${USER}`);
    await appReady(page);
    const link = `a.ds-name[href$="/${DS}"]`;
    await page.waitForSelector(link, { timeout: 15000 });
    await page.focus(link);
    await page.keyboard.press('Shift+F10');
    await page.waitForSelector('.p-contextmenu:visible', { timeout: 5000 });
    await page.keyboard.press('Escape');
    await page.focus(link);
    await Promise.all([page.waitForURL(new RegExp(`/r/${USER}/${DS}$`), { timeout: 15000 }), page.keyboard.press('Enter')]);
    assert.deepEqual(errors, []);
});

test('6. Map Settings: Escape with the basemap list open closes only the list, a second Escape the dialog', async () => {
    const { page, errors } = await newPage();
    await login(page);
    await page.goto(`${URL_}/r/${USER}/${DS}`);
    await appReady(page);
    await page.click('.tab-buttons-strip >> text=Map');
    await page.click('button[aria-label="Map Settings"]', { timeout: 30000 });
    await page.waitForSelector('#map-settings', { timeout: 15000 });
    await page.click('#map-settings-dialog-basemap');
    await page.waitForSelector('#map-settings-dialog-basemap[aria-expanded="true"]', { timeout: 5000 });
    await page.keyboard.press('Escape');
    await page.waitForSelector('#map-settings-dialog-basemap[aria-expanded="false"]', { timeout: 5000 });
    assert.equal(await page.locator('#map-settings').count(), 1, 'the dialog stays open');
    await page.keyboard.press('Escape');
    await page.waitForSelector('#map-settings', { state: 'detached', timeout: 10000 });
    assert.deepEqual(errors, []);
});

// ---- Annotation reports: the live page, the editor, the PDF progress and the Report settings dialogs -----------------

const REPORT_UID = 'r_a11yrept';
const REPORT_NAME = 'A11y report';
let reportReady = false;

/** A report on the throw-away dataset: one image (the cover view's base), a numbered measurement file, a saved view and the definition. */
async function ensureReport() {
    if (reportReady) return;
    const square = (lon, lat, d) => ({ type: 'Polygon', coordinates: [[[lon - d, lat - d], [lon + d, lat - d], [lon + d, lat + d], [lon - d, lat + d], [lon - d, lat - d]]] });
    const document = {
        type: 'FeatureCollection', crs: { type: 'name', properties: { name: 'EPSG:4326' } }, metadata: { version: '3.0', application: 'DroneDB Registry', lastRef: 2 },
        features: [
            { type: 'Feature', id: 'a11y-one', geometry: square(-91.99406, 46.84259, 0.00004), properties: { id: 'a11y-one', ref: '1', measurementType: 'area', name: 'Pile north', createdAt: '2026-11-01T10:00:00.000Z', category: 'defect', severity: 'high', status: 'open', description: 'A **cracked** pile' } },
            { type: 'Feature', id: 'a11y-two', geometry: { type: 'Point', coordinates: [-91.99346, 46.8427] }, properties: { id: 'a11y-two', ref: '2', measurementType: 'point', name: 'Marker', createdAt: '2026-11-01T10:10:00.000Z', status: 'resolved' } }
        ]
    };
    const view = { uid: 'v_a11ycove', name: 'Cover', v: 1, base: { path: 'DJI_0018.JPG', hash: '' }, layers: [], split: { enabled: false, positions: [] },
        view: { center: [-10240747.5, 5916436.4], zoom: 18, rotation: 0 }, display: { basemap: null }, analysis: { target: null }, createdBy: USER, createdAt: '2026-11-01T10:00:00Z', updatedBy: USER, updatedAt: '2026-11-01T10:00:00Z' };
    const definition = {
        uid: REPORT_UID, version: 1, name: REPORT_NAME, templateId: 'standard', title: 'Accessibility report', subtitle: '', preparedBy: '', preparedFor: '', notes: '',
        sources: [{ file: 'measurements.geojson', label: 'A' }], filter: { groups: [], categories: [], severities: [], statuses: [], kinds: [], owners: [] }, cover: { viewId: view.uid },
        sections: ['cover', 'summary', 'overview', 'tables', 'items', 'notes'].map(kind => ({ kind, enabled: true })), units: null,
        createdBy: USER, createdAt: '2026-11-01T10:00:00Z', modifiedAt: '2026-11-01T10:00:00Z'
    };
    const image = fs.readFileSync(path.join(process.env.HUB_TEST_DATA || '/mnt/data/repos/test_data', 'images', 'DJI_0018.JPG'));
    await api('POST', `/orgs/${USER}/ds/${DS}/obj`, form({ path: 'DJI_0018.JPG', file: new Blob([image]) }));
    await api('POST', `/orgs/${USER}/ds/${DS}/obj`, form({ path: 'measurements.geojson', file: new Blob([JSON.stringify(document)]) }));
    for (const [key, data] of [['views', view], ['reports', definition]]) await api('POST', `/orgs/${USER}/ds/${DS}/meta/add`, form({ key, data: JSON.stringify(data), path: '' }));
    reportReady = true;
}

let adminSession;
/** A signed-in page for the report tests: the sign-in is made once (the Registry limits the sign-ins of a minute). */
async function reportPage({ viewport } = {}) {
    if (!adminSession) {
        const first = await newPage();
        await login(first.page);
        adminSession = await first.context.storageState();
    }
    const context = await browser.newContext({ viewport: viewport ?? { width: 1400, height: 900 }, storageState: adminSession });
    contexts.push(context);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e));
    return { page, errors, context };
}

async function openReportPage(page) {
    await ensureReport();
    await page.goto(`${URL_}/r/${USER}/${DS}/reports/${REPORT_UID}`);
    await appReady(page);
    await page.waitForSelector(`h1:has-text("${REPORT_NAME}")`, { timeout: 30000 });
    await page.waitForSelector('.report-document table', { timeout: 30000 });
}

test('7. the live page of a report has one h1, named regions, tables with a caption and headers, images with alt text, and chips that say their value', async () => {
    const { page, errors } = await reportPage();
    await openReportPage(page);
    // The figures (the snapshots) come when they are in view: bring them all in
    for (const figure of await page.locator('.report-document figure').all()) await figure.scrollIntoViewIfNeeded();
    await page.waitForSelector('.report-document figure img', { timeout: 30000 });
    await page.waitForTimeout(1500);
    const facts = await page.evaluate(() => ({
        h1: document.querySelectorAll('h1').length,
        article: !!document.querySelector('article[aria-label]'),
        imagesWithoutAlt: [...document.querySelectorAll('.report-document img')].filter(i => !i.getAttribute('alt')?.trim()).length,
        tables: [...document.querySelectorAll('.report-document table')].map(t => ({ caption: !!t.querySelector('caption')?.textContent.trim(), headers: t.querySelectorAll('th[scope], thead th').length })),
        levels: [...document.querySelectorAll('.report-document h2, .report-document h3')].map(h => Number(h.tagName[1])),
        statuses: [...document.querySelectorAll('.report-document .p-tag, .report-document .p-chip, .report-document [class*=chip]')].map(c => c.textContent.trim())
    }));
    assert.equal(facts.h1, 1, 'one h1: the name of the report');
    assert.ok(facts.article, 'the document is a named article');
    assert.equal(facts.imagesWithoutAlt, 0, 'every image has alt text');
    assert.ok(facts.tables.length > 0 && facts.tables.every(t => t.caption && t.headers > 0), `every table has a caption and column headers (${JSON.stringify(facts.tables)})`);
    assert.ok(facts.levels.every((l, i) => i === 0 || l - facts.levels[i - 1] <= 1), `no heading level is skipped (${facts.levels})`);
    assert.ok(facts.statuses.every(s => s.length > 0), 'a chip is never a colour alone');
    assert.deepEqual(errors, []);
});

test('8. the live page has no horizontal scroll at 360 px, a table scrolls inside its own region', async () => {
    const { page } = await reportPage({ viewport: { width: 360, height: 800 } });
    await openReportPage(page);
    await page.waitForTimeout(1000);
    const overflow = await page.evaluate(() => ({ page: document.documentElement.scrollWidth - document.documentElement.clientWidth, body: document.body.scrollWidth - window.innerWidth }));
    assert.ok(overflow.page <= 0 && overflow.body <= 0, `the page does not scroll sideways (${JSON.stringify(overflow)})`);
});

test('9. Edit opens the report editor with the focus inside, Tab stays in it, Escape closes it and the focus goes back to Edit', async () => {
    const { page } = await reportPage();
    await openReportPage(page);
    await page.focus('[data-testid="report-edit"]');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.p-dialog #report-name', { timeout: 15000 });
    await page.waitForTimeout(400);
    await assertTrapped(page, '.p-dialog', 30);
    await page.keyboard.press('Escape');
    await page.waitForSelector('.p-dialog', { state: 'detached' });
    assert.ok(await page.evaluate(() => document.activeElement?.matches('[data-testid="report-edit"]')), 'focus is back on Edit');
});

test('10. the PDF progress dialog takes the focus, Escape cancels it, and the focus goes back to Download PDF', async () => {
    const { page, context } = await reportPage();
    // Slow thumbnails and tiles: the dialog is on screen long enough to be looked at
    await context.route('**/thumb*', async route => { await new Promise(r => setTimeout(r, 4000)); await route.continue().catch(() => {}); });
    await openReportPage(page);
    await page.focus('[data-testid="report-download-pdf"]');
    await page.keyboard.press('Enter');
    await page.waitForSelector('#reportPdfProgress', { timeout: 10000 });
    assert.ok(await focusInside(page, '#reportPdfProgress'), 'focus is in the progress dialog');
    assert.equal(await page.locator('#reportPdfProgress [role=status]').count(), 1, 'the progress is announced');
    await page.keyboard.press('Escape');
    await page.waitForSelector('#reportPdfProgress', { state: 'detached', timeout: 5000 });
    // The button is enabled again once the cancelled PDF has ended: the focus comes back then
    await page.waitForFunction(() => document.activeElement?.matches('[data-testid="report-download-pdf"]'), null, { timeout: 8000 }).catch(() => {});
    const active = await page.evaluate(() => `${document.activeElement?.tagName}.${document.activeElement?.className}`.slice(0, 80));
    assert.ok(await page.evaluate(() => document.activeElement?.matches('[data-testid="report-download-pdf"]')), `focus is back on Download PDF (it is on ${active})`);
});

test('11. Report settings opened with the keyboard takes the focus and keeps it, its two tabs are tabs, Escape closes it', async () => {
    const { page } = await reportPage();
    await page.goto(`${URL_}/r`);
    await appReady(page);
    const button = page.locator('button:has-text("Report settings"), [aria-label="Report settings"]').first();
    await button.waitFor();
    await button.focus();
    await page.keyboard.press('Enter');
    await page.waitForSelector('.p-dialog #report-template-name', { timeout: 15000 });
    await page.waitForTimeout(400);
    await assertTrapped(page, '.p-dialog', 40);
    const tabs = await page.locator('.p-dialog [role=tab]').allInnerTexts();
    assert.deepEqual(tabs.map(t => t.trim()), ['Templates', 'Annotation schema']);
    for (const field of await page.locator('.p-dialog input[id^="report-template-"]:not([type=file])').all()) {
        const id = await field.getAttribute('id');
        assert.ok(await page.locator(`.p-dialog label[for="${id}"]`).count() > 0 || await field.getAttribute('aria-label'), `the field ${id} has a label`);
    }
    await page.keyboard.press('Escape');
    await page.waitForSelector('.p-dialog', { state: 'detached' });
});
