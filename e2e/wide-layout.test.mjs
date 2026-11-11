/**
 * Maximum widths on wide screens, end to end (AC-038, AC-001; FR-XC-33; FR-ORG-24, FR-EXP-39, FR-ADM-27, FR-ADM-28,
 * FR-NAV-10, FR-EXP-42, FR-ACC-23, FR-UPL-22, FR-ORG-26): drives the real Hub in Chromium against a running Registry.
 * Not part of `npm test` (needs a server); same environment and conventions as smoke.test.mjs:
 *
 *   HUB_URL=http://localhost:5100 node --test e2e/wide-layout.test.mjs
 *
 * At 1920x1080 and 3840x2160 (device scale factor 1) no page scrolls horizontally and the list, table and form
 * pages keep the width of --ddb-page-max-width (100rem, 1600 px). HUB_USER must be an administrator.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const URL_ = process.env.HUB_URL || 'http://localhost:5100';
const USER = process.env.HUB_USER || 'admin';
const PASS = process.env.HUB_PASS || 'password123';
const VIEWPORTS = [{ width: 1920, height: 1080 }, { width: 3840, height: 2160 }];
// The widest a row may be, from the left of its name to the right of its buttons (FR-ORG-24, FR-ADM-27)
const ROW_MAX_PX = 1700;

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
const contexts = [];
const appReady = page => page.waitForFunction(() => document.getElementById('main-loading')?.style.display === 'none', null, { timeout: 30000 });

async function newPage(viewport, { signedIn = true } = {}) {
    const context = await browser.newContext({ viewport });
    contexts.push(context);
    const page = await context.newPage();
    await page.goto(`${URL_}/login`);
    await appReady(page);
    if (!signedIn) return page;
    await page.fill('input[type=text], input[placeholder*="sername"]', USER);
    await page.fill('input[type=password]', PASS);
    await Promise.all([page.waitForURL(/\/r(\/|$)/, { timeout: 30000 }), page.click('button:has-text("Login")')]);
    return page;
}

/** What the width checks read: horizontal scroll, the widest text lines and the size of a selector's box */
const measure = (page, selector) => page.evaluate(sel => {
    const el = sel ? document.querySelector(sel) : null;
    const box = el?.getBoundingClientRect();
    // A box that scrolls itself spans the screen (its scroll bar is at the edge); its content is what the side padding leaves
    const style = el && getComputedStyle(el);
    const content = box && style ? box.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) : null;
    return {
        content,
        hScroll: document.documentElement.scrollWidth > innerWidth + 1,
        box: box && { left: box.left, right: box.right, width: box.width, top: box.top },
        windowHeight: innerHeight
    };
}, selector);

before(async () => { browser = await chromium.launch({ executablePath: chromeExecutable() }); });
after(async () => { for (const c of contexts) await c.close(); await browser?.close(); });

for (const viewport of VIEWPORTS) {
    const at = `${viewport.width}x${viewport.height}`;

    test(`${at}: the pages do not scroll horizontally and the lists keep one column (FR-ORG-24, FR-ADM-27, FR-ADM-28)`, async () => {
        const page = await newPage(viewport);
        for (const [route, selector] of [['/r', '#organizations'], [`/r/${USER}`, '#datasets'], ['/admin/users', '#users table'], ['/admin/tasks', '.admin-tasks-page table'], ['/admin/config', '.config-scroll-container']]) {
            await page.goto(`${URL_}${route}`);
            await appReady(page);
            await page.waitForSelector(selector, { timeout: 30000 });
            const m = await measure(page, selector);
            assert.equal(m.hScroll, false, `${route} scrolls horizontally`);
            assert.ok(m.content <= ROW_MAX_PX, `${route}: ${selector} is ${m.content} px wide`);
        }
    });

    test(`${at}: the login card is in the upper part of the screen (FR-NAV-10)`, async () => {
        const page = await newPage(viewport, { signedIn: false });
        const m = await measure(page, '#login .p-card');
        assert.ok(m.box.top >= m.windowHeight * 0.15 && m.box.top <= m.windowHeight * 0.4, `the card starts at ${m.box.top} of ${m.windowHeight}`);
    });

    test(`${at}: the upload drop zone has a border and is not at the header (FR-NAV-10)`, async () => {
        const page = await newPage(viewport);
        await page.goto(`${URL_}/upload`);
        await appReady(page);
        await page.waitForSelector('.droparea', { timeout: 30000 });
        const zone = await page.evaluate(() => {
            const e = document.querySelector('.droparea');
            return { border: getComputedStyle(e).borderTopStyle, top: e.getBoundingClientRect().top, height: e.getBoundingClientRect().height, windowHeight: innerHeight };
        });
        assert.equal(zone.border, 'dashed');
        assert.ok(zone.top >= 16 + 40, `the zone starts at ${zone.top}`);
        assert.ok(zone.height >= zone.windowHeight * 0.5 - 1, `the zone is ${zone.height} px high`);
    });

    test(`${at}: the Preferences window shows all its tabs and is a form dialog (FR-ACC-23)`, async () => {
        const page = await newPage(viewport);
        await page.goto(`${URL_}/account`);
        await appReady(page);
        await page.click('button[aria-label*="menu" i], [aria-label="User menu"]');
        await page.click('text=Preferences');
        await page.waitForSelector('#preferencesDialog');
        const r = await page.evaluate(() => {
            const dialog = document.getElementById('preferencesDialog').getBoundingClientRect();
            const list = document.querySelector('#preferencesDialog .p-tablist-viewport').getBoundingClientRect();
            const tabs = [...document.querySelectorAll('#preferencesDialog .p-tab')].map(t => t.getBoundingClientRect());
            return { width: dialog.width, inView: tabs.every(t => t.left >= list.left - 1 && t.right <= list.right + 1), tabs: tabs.length, next: !!document.querySelector('#preferencesDialog .p-tablist-next-button') };
        });
        assert.ok(r.width <= 760, `the window is ${r.width} px wide`);
        assert.equal(r.inView, true);
        assert.equal(r.next, false);
    });
}
