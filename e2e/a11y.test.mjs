/**
 * Dialog focus, end to end (FR-XC-02, FR-XC-03, FR-XC-19; ADM-03, ACC-10, ORG-01, ORG-06, MAP-03):
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
    return { page, errors };
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

test('1. Preferences opened with the keyboard from the user menu takes the focus and keeps it (ACC-10)', async () => {
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

test('2. Preferences opened with the mouse takes the focus and keeps it (ACC-10)', async () => {
    const { page } = await newPage();
    await login(page);
    await page.click('button[aria-controls="user_menu"]');
    await page.click('#user_menu >> text=Preferences');
    await page.waitForSelector('#preferencesDialog #pref-measurement-units', { timeout: 15000 });
    await page.waitForTimeout(400);
    await assertTrapped(page, '#preferencesDialog');
});

test('3. Manage Roles opened with Enter takes the focus and keeps it (ADM-03)', async () => {
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

test('4. Create Organization gives the focus back to its button when it closes (ORG-06)', async () => {
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

test('5. a dataset opens with Tab and Enter, and Shift+F10 opens its menu (ORG-01)', async () => {
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

test('6. Map Settings: Escape with the basemap list open closes only the list, a second Escape the dialog (FR-XC-19, MAP-03)', async () => {
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
