/**
 * Bitmaps at the displayed size, end to end (FR-XC-32, FR-EXP-41, FR-EXP-43, FR-VWR-35, FR-MAP-31): drives the real Hub in
 * Chromium against a running Registry. Not part of `npm test` (needs a server and a dataset with photos); same
 * environment and conventions as smoke.test.mjs:
 *
 *   HUB_URL=http://localhost:5100 HUB_DATASET=admin/brighton-beach node --test e2e/hidpi-bitmaps.test.mjs
 *
 * HUB_DATASET is a dataset whose root holds photos; HUB_VIDEO (dataset/path of a video, optional) is the clip of the lightbox test.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const URL_ = process.env.HUB_URL || 'http://localhost:5100';
const USER = process.env.HUB_USER || 'admin';
const PASS = process.env.HUB_PASS || 'password123';
const DATASET = process.env.HUB_DATASET || 'admin/brighton-beach';
const VIDEO = process.env.HUB_VIDEO || '';

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

async function newPage(viewport, deviceScaleFactor = 1) {
    const context = await browser.newContext({ viewport, deviceScaleFactor });
    contexts.push(context);
    // The size that the Hub asks the server for, in the order of the requests
    const page = await context.newPage();
    page.thumbRequests = [];
    page.on('request', r => {
        const size = /\/thumb\?.*[?&]size=(\d+)/.exec(r.url());
        if (size) page.thumbRequests.push(Number(size[1]));
    });
    await page.goto(`${URL_}/login`);
    await appReady(page);
    await page.fill('input[type=text], input[placeholder*="sername"]', USER);
    await page.fill('input[type=password]', PASS);
    await Promise.all([page.waitForURL(/\/r(\/|$)/, { timeout: 30000 }), page.click('button:has-text("Login")')]);
    await page.evaluate(() => localStorage.removeItem('explorerTileSize'));
    return page;
}

before(async () => { browser = await chromium.launch({ executablePath: chromeExecutable() }); });
after(async () => { for (const c of contexts) await c.close(); await browser?.close(); });

test('3840x2160: the grid starts at M and L makes the tiles 256 px or more, without overlapping rows (FR-EXP-43)', async () => {
    const page = await newPage({ width: 3840, height: 2160 });
    await page.goto(`${URL_}/r/${DATASET}`);
    await page.waitForSelector('#explorer .thumbnail .container', { timeout: 30000 });
    const side = () => page.evaluate(() => Math.round(document.querySelector('#explorer .thumbnail .container').getBoundingClientRect().width));
    assert.equal(await side(), 192);
    await page.click('[data-tool="tile-size-l"]');
    await page.waitForFunction(() => document.querySelector('#explorer .thumbnail .container').getBoundingClientRect().width >= 256);
    assert.ok(await side() >= 256);
    const overlap = await page.evaluate(() => {
        const tiles = [...document.querySelectorAll('#explorer .thumbnail')].map(t => t.getBoundingClientRect());
        return tiles.some((a, i) => tiles.some((b, j) => j > i && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom));
    });
    assert.equal(overlap, false);
});

test('1920x1080 at device scale factor 2: the expanded table and the grid ask for twice the pixels (FR-EXP-41, FR-XC-32)', async () => {
    const page = await newPage({ width: 1920, height: 1080 }, 2);
    await page.goto(`${URL_}/r/${DATASET}`);
    await page.waitForSelector('#explorer .thumbnail .container', { timeout: 30000 });
    // The grid tile is 128 CSS px: 256 px at ratio 2
    assert.ok(page.thumbRequests.length > 0 && page.thumbRequests.every(s => s >= 256), `the grid asked for ${page.thumbRequests}`);
    await page.click('[data-tool="view-list"]');
    await page.waitForSelector('img.thumb-preview', { timeout: 30000 });
    await page.waitForFunction(() => [...document.querySelectorAll('img.thumb-preview')].some(i => i.complete && i.naturalHeight > 0));
    const natural = await page.evaluate(() => Math.min(...[...document.querySelectorAll('img.thumb-preview')].filter(i => i.naturalHeight > 0).map(i => i.naturalHeight)));
    assert.ok(natural >= 96, `an image of the table is ${natural} px high`);
});

test('3840x2160: the video of the lightbox fills the free area (FR-VWR-35)', { skip: !VIDEO }, async () => {
    const page = await newPage({ width: 3840, height: 2160 });
    const [org, ds, ...rest] = VIDEO.split('/');
    await page.goto(`${URL_}/r/${org}/${ds}`);
    await page.getByText(rest[rest.length - 1], { exact: true }).dblclick();
    await page.waitForSelector('.video-lightbox-player', { timeout: 30000 });
    const fit = await page.evaluate(() => {
        const v = document.querySelector('.video-lightbox-player').getBoundingClientRect();
        const c = document.querySelector('.video-lightbox-content').getBoundingClientRect();
        return { dw: c.width - v.width, dh: c.height - v.height };
    });
    // The player is 40 px or less from the content area (a padding of 16 px on each side) in width or in height
    assert.ok(Math.min(fit.dw, fit.dh) <= 40, JSON.stringify(fit));
});
