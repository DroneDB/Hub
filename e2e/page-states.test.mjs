/**
 * Page states (FR-XC-13, D-048), end to end: a primary resource that cannot be shown gives the one
 * ResourceState page state (not found, no access, sign in) instead of a redirect, a modal or a
 * broken page. Drives the real Hub in Chromium against a running Registry. Not part of `npm test`
 * (needs a server); same environment and conventions as smoke.test.mjs:
 *
 *   HUB_URL=http://localhost:5100 node --test e2e/page-states.test.mjs
 *
 * It creates a throw-away private dataset in the organisation of HUB_USER and a throw-away user
 * who is not a member of it, and deletes both at the end.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const URL_ = process.env.HUB_URL || 'http://localhost:5100';
const USER = process.env.HUB_USER || 'admin';
const PASS = process.env.HUB_PASS || 'password123';
const DS = `states-${Date.now().toString(36)}`;
// User names are lowercase letters and digits
const OTHER = `states${Date.now().toString(36)}`;
const OTHER_PASS = 'a-long-passw0rd';
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

async function api(method, endpoint, body, asJson = false) {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    if (asJson) headers['Content-Type'] = 'application/json';
    const res = await fetch(`${URL_}${endpoint}`, { method, body: asJson ? JSON.stringify(body) : body, headers });
    if (!res.ok) throw new Error(`${method} ${endpoint} -> ${res.status} ${await res.text()}`);
    return res.headers.get('content-type')?.includes('json') ? res.json() : res.text();
}
const form = obj => { const f = new FormData(); for (const [k, v] of Object.entries(obj)) f.append(k, v); return f; };
const appReady = page => page.waitForFunction(() => document.getElementById('main-loading')?.style.display === 'none', null, { timeout: 30000 });

/** A new browser context: anonymous, or signed in as `user`. */
async function newPage(user = null, password = null) {
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    contexts.push(context);
    const page = await context.newPage();
    if (user) {
        await page.goto(`${URL_}/login`);
        await appReady(page);
        await page.fill('input[type=text], input[placeholder*="sername"]', user);
        await page.fill('input[type=password]', password);
        await Promise.all([page.waitForURL(/\/r(\/|$)/, { timeout: 30000 }), page.click('button:has-text("Login")')]);
    }
    return page;
}

/** Opens `url` and waits for the page state; returns its h1. */
async function stateAt(page, url) {
    await page.goto(`${URL_}${url}`);
    await appReady(page);
    const state = page.locator('.resource-state');
    await state.waitFor({ timeout: 15000 });
    return state.locator('h1').innerText();
}

before(async () => {
    token = (await api('POST', '/users/authenticate', form({ username: USER, password: PASS }))).token;
    // Private (visibility 0): an anonymous visitor gets 401, a signed-in non-member 403
    await api('POST', `/orgs/${USER}/ds`, form({ slug: DS, name: DS, visibility: 0 }));
    await api('POST', '/users', { userName: OTHER, password: OTHER_PASS, email: '', roles: [] }, true);
    browser = await chromium.launch({ headless: !process.env.HUB_HEADED, executablePath: chromeExecutable() });
});

after(async () => {
    for (const c of contexts) await c.close().catch(() => { });
    await browser?.close();
    try { await api('DELETE', `/orgs/${USER}/ds/${DS}`); } catch { /* best effort */ }
    try { await api('DELETE', `/users/${OTHER}`); } catch { /* best effort */ }
});

test('a missing dataset shows the not found state, with no modal', async () => {
    const page = await newPage(USER, PASS);
    assert.equal(await stateAt(page, `/r/${USER}/does-not-exist-${DS}`), 'Dataset not found');
    assert.equal(await page.locator('.p-dialog').count(), 0);
    assert.equal(await page.title(), 'Dataset not found - DroneDB');
});

test('a private dataset as anonymous shows the sign-in state and stays on its address (D-048)', async () => {
    const page = await newPage();
    const url = `/r/${USER}/${DS}`;
    assert.equal(await stateAt(page, url), 'Sign in to open this dataset');
    assert.equal(new URL(page.url()).pathname, url);
    const signIn = page.locator('.resource-state a', { hasText: 'Sign in' });
    assert.equal(new URL(await signIn.getAttribute('href'), URL_).searchParams.get('redirect'), url);
    // No Organizations for a visitor without a session (the Registry lists them to users only)
    assert.equal(await page.locator('.resource-state a', { hasText: 'Go to Organizations' }).count(), 0);
});

test('a viewer of a missing file shows the not found state and the way back to the dataset', async () => {
    const page = await newPage(USER, PASS);
    const h1 = await stateAt(page, `/r/${USER}/${DS}/view/${b64('missing.md')}/markdown`);
    assert.equal(h1, 'File not found');
    const back = page.locator('.resource-state a', { hasText: 'Back to the dataset' });
    assert.equal(await back.getAttribute('href'), `/r/${USER}/${DS}`);
    assert.equal(await page.locator('.viewer-bar a[aria-label="Back to the dataset"]').count(), 1);
});

test('a viewer link whose path cannot be read says the link is not valid (FR-VWR-23)', async () => {
    const page = await newPage(USER, PASS);
    assert.equal(await stateAt(page, `/r/${USER}/${DS}/view/%25%25%25garbage/markdown`), 'This link is not valid');
});

test('an unknown address shows the not found state, with one h1 in the main landmark', async () => {
    const page = await newPage(USER, PASS);
    assert.equal(await stateAt(page, '/nope'), 'Page not found');
    assert.equal(await page.locator('main#main h1').count(), 1);
    assert.equal(await page.locator('h1').count(), 1);
    assert.equal(await page.locator('a[href*="github.com"]').count(), 0);
    // The first Tab stop skips to the page
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), 'Skip to main content');
});

test('the organizations as anonymous show the sign-in state, with no Create', async () => {
    const page = await newPage();
    assert.equal(await stateAt(page, '/r'), 'Sign in to open this page');
    assert.equal(new URL(page.url()).pathname, '/r');
    assert.equal(await page.locator('text=Create Organization').count(), 0);
    assert.equal(await page.locator('.org-card').count(), 0);
});

test('an organization as a non-member shows the no access state, with no Create or Import (FR-ACC-02)', async () => {
    const page = await newPage(OTHER, OTHER_PASS);
    assert.equal(await stateAt(page, `/r/${USER}`), 'You do not have access to this organization');
    assert.equal(await page.locator('button:has-text("Create Dataset"), button[aria-label="Import dataset"]').count(), 0);
    assert.equal(await page.locator('.resource-state a', { hasText: 'Go to my datasets' }).getAttribute('href'), `/r/${OTHER}`);
});

test('a private dataset as a non-member shows the no access state, and the header offers nothing on it (FR-ACC-18)', async () => {
    const page = await newPage(OTHER, OTHER_PASS);
    assert.equal(await stateAt(page, `/r/${USER}/${DS}`), 'You do not have access to this dataset');
    assert.equal(await page.locator('#header [aria-label="Settings"], #header [aria-label="Download"]').count(), 0);
});
