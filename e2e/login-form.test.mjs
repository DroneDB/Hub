/**
 * The sign-in form (FR-ACC-04, FR-ACC-05, FR-ACC-06, FR-ACC-07, FR-XC-11), end to end: drives the real
 * Hub in Chromium against a running Registry. Not part of `npm test` (needs a server); same
 * environment and conventions as smoke.test.mjs:
 *
 *   HUB_URL=http://localhost:5100 node --test e2e/login-form.test.mjs
 *
 * It uses a user name that does not exist: nobody is signed in and nothing changes on the server.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const URL_ = process.env.HUB_URL || 'http://localhost:5100';

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

let browser;
const appReady = page => page.waitForFunction(() => document.getElementById('main-loading')?.style.display === 'none', null, { timeout: 30000 });

async function openLogin() {
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await context.newPage();
    await page.goto(`${URL_}/login`);
    await appReady(page);
    await page.waitForSelector('form input[name="username"]');
    return { context, page };
}

before(async () => { browser = await chromium.launch({ headless: true, executablePath: chromeExecutable() }); });
after(async () => { await browser?.close(); });

test('Login is a form with the autocomplete values, and the focus starts in Username', async () => {
    const { context, page } = await openLogin();
    try {
        assert.equal(await page.getAttribute('form input[name="username"]', 'autocomplete'), 'username');
        assert.equal(await page.getAttribute('form input[name="password"]', 'autocomplete'), 'current-password');
        assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('name')), 'username');
    } finally { await context.close(); }
});

test('Enter four times sends one sign-in request', async () => {
    const { context, page } = await openLogin();
    try {
        let requests = 0;
        await page.route('**/users/authenticate', async route => {
            requests++;
            await new Promise(resolve => setTimeout(resolve, 1500));
            await route.continue();
        });
        await page.fill('input[name="username"]', 'nobody-here');
        await page.fill('input[name="password"]', 'not-the-password');
        for (let i = 0; i < 4; i++) await page.press('input[name="password"]', 'Enter');
        await page.waitForSelector('[role="alert"]');
        assert.equal(requests, 1);
    } finally { await context.close(); }
});

test('an empty submit sends no request, marks both fields and focuses Username', async () => {
    const { context, page } = await openLogin();
    try {
        let requests = 0;
        await page.route('**/users/authenticate', route => { requests++; return route.continue(); });
        await page.click('button[type="submit"]');
        await page.waitForSelector('#login-username-error');
        assert.equal(await page.textContent('#login-username-error'), 'Enter your username.');
        assert.equal(await page.textContent('#login-password-error'), 'Enter your password.');
        assert.equal(await page.getAttribute('input[name="username"]', 'aria-invalid'), 'true');
        assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('name')), 'username');
        assert.equal(requests, 0);
    } finally { await context.close(); }
});

test('a refused sign-in says so in plain words, in the card, and typing clears it', async () => {
    const { context, page } = await openLogin();
    try {
        await page.fill('input[name="username"]', 'nobody-here');
        await page.fill('input[name="password"]', 'not-the-password');
        await page.click('button[type="submit"]');
        await page.waitForSelector('.p-card [role="alert"]');
        assert.equal((await page.textContent('.p-card [role="alert"]')).trim(), 'Incorrect username or password.');
        await page.fill('input[name="password"]', 'other');
        await page.waitForSelector('.p-card [role="alert"]', { state: 'detached' });
    } finally { await context.close(); }
});

test('the show-password toggle is reached by Tab, Space shows and hides the text, and the focus stays on it', async () => {
    const { context, page } = await openLogin();
    try {
        await page.focus('input[name="password"]');
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Show password');
        await page.evaluate(() => { window.__toggle = document.activeElement; });
        await page.keyboard.press('Space');
        assert.equal(await page.getAttribute('input[name="password"]', 'type'), 'text');
        assert.equal(await page.getAttribute('button[aria-label="Show password"]', 'aria-pressed'), 'true');
        assert.equal(await page.evaluate(() => document.activeElement === window.__toggle), true);
        await page.keyboard.press('Space');
        assert.equal(await page.getAttribute('input[name="password"]', 'type'), 'password');
        assert.equal(await page.getAttribute('button[aria-label="Show password"]', 'aria-pressed'), 'false');
        assert.equal(await page.evaluate(() => document.activeElement === window.__toggle), true);
    } finally { await context.close(); }
});
