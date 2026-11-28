/**
 * What the end-to-end suites share to drive the real Hub in Chromium against a running Registry: the environment
 * (HUB_URL, HUB_USER, HUB_PASS, HUB_TEST_DATA, HUB_CHROME, HUB_HEADED; see smoke.test.mjs), the Chromium to start,
 * the Registry API with the session token, and the sign-in on the Hub's own login form.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

export const URL_ = process.env.HUB_URL || 'http://localhost:5100';
export const USER = process.env.HUB_USER || 'admin';
export const PASS = process.env.HUB_PASS || 'password123';
export const DATA = process.env.HUB_TEST_DATA || '/mnt/data/repos/test_data';
export const HEADLESS = !process.env.HUB_HEADED;

/** The base64 of a dataset path, as the viewer routes take it (/r/:org/:ds/view/:encodedPath/...). */
export const b64 = s => Buffer.from(s, 'utf8').toString('base64');

/** A multipart form of the given fields. */
export const form = obj => { const f = new FormData(); for (const [k, v] of Object.entries(obj)) f.append(k, v); return f; };

/** Playwright ships no browser build for some distributions: fall back to one already downloaded. */
export function chromeExecutable() {
    if (process.env.HUB_CHROME) return process.env.HUB_CHROME;
    try { if (fs.existsSync(chromium.executablePath())) return undefined; } catch { /* not resolvable */ }
    const windows = process.platform === 'win32';
    const cache = windows
        ? path.join(process.env.LOCALAPPDATA || '', 'ms-playwright')
        : path.join(process.env.HOME || '', '.cache', 'ms-playwright');
    const build = d => Number(d.slice('chromium-'.length));
    // Newest build first (chromium-1200 after chromium-999)
    const candidates = fs.existsSync(cache)
        ? fs.readdirSync(cache).filter(d => /^chromium-\d+$/.test(d)).sort((a, b) => build(b) - build(a))
        : [];
    for (const d of candidates) {
        const exe = windows ? path.join(cache, d, 'chrome-win64', 'chrome.exe') : path.join(cache, d, 'chrome-linux64', 'chrome');
        if (fs.existsSync(exe)) return exe;
    }
    return undefined;
}

/** The Registry API as HUB_USER: `await registry.signIn()` once, then `registry.call(method, endpoint, body)`. */
export function createRegistryApi() {
    let token = null;
    async function call(method, endpoint, body) {
        const res = await fetch(`${URL_}${endpoint}`, { method, body, headers: token ? { Authorization: `Bearer ${token}` } : {} });
        if (!res.ok) throw new Error(`${method} ${endpoint} -> ${res.status} ${await res.text()}`);
        return res.headers.get('content-type')?.includes('json') ? res.json() : res.text();
    }
    return {
        call,
        async signIn() { token = (await call('POST', '/users/authenticate', form({ username: USER, password: PASS }))).token; }
    };
}

/** Resolves when the Hub has started (its loading screen is hidden). */
export const appReady = page =>
    page.waitForFunction(() => document.getElementById('main-loading')?.style.display === 'none', null, { timeout: 30000 });

/** Signs in on the page's own login form. */
export async function signIn(page) {
    await page.goto(`${URL_}/login`);
    await appReady(page);
    await page.fill('input[type=text], input[placeholder*="sername"]', USER);
    await page.fill('input[type=password]', PASS);
    await Promise.all([page.waitForURL(/\/r(\/|$)/, { timeout: 30000 }), page.click('button:has-text("Login")')]);
}
