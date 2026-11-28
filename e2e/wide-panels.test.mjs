/**
 * Side panels, analysis panels and tool windows on wide screens, end to end: drives the real Hub in Chromium against a running Registry. Not part of `npm test`
 * (needs a server); same environment and conventions as wide-layout.test.mjs:
 *
 *   HUB_URL=http://localhost:5100 HUB_DATASET=admin/brighton-beach node --test e2e/wide-panels.test.mjs
 *
 * HUB_DATASET is a dataset the user can write, with images/ holding a JPG (DJI_0020.JPG), the task log checks need one
 * finished task in it, and the map checks use HUB_RASTER (default dsm.tif of the dataset). A check that finds no data to
 * measure is skipped, not passed.
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
const RASTER = process.env.HUB_RASTER || 'dsm.tif';
const VIEWPORTS = [{ width: 1920, height: 1080 }, { width: 3840, height: 2160 }];

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

async function newPage(viewport) {
    const context = await browser.newContext({ viewport });
    contexts.push(context);
    const page = await context.newPage();
    await page.goto(`${URL_}/login`);
    await appReady(page);
    await page.fill('input[type=text], input[placeholder*="sername"]', USER);
    await page.fill('input[type=password]', PASS);
    await Promise.all([page.waitForURL(/\/r(\/|$)/, { timeout: 30000 }), page.click('button:has-text("Login")')]);
    return page;
}

const widthOf = (page, selector) => page.evaluate(sel => document.querySelector(sel)?.getBoundingClientRect().width ?? null, selector);

before(async () => { browser = await chromium.launch({ executablePath: chromeExecutable() }); });
after(async () => { for (const c of contexts) await c.close(); await browser?.close(); });

for (const viewport of VIEWPORTS) {
    const at = `${viewport.width}x${viewport.height}`;

    test(`${at}: the tree has the width of its token and the detail panel is wide`, async () => {
        const page = await newPage(viewport);
        // A folder has no URL of its own: open the dataset and enter images/ when its photos are not at the root
        await page.goto(`${URL_}/r/${DATASET}`);
        await appReady(page);
        await page.waitForSelector('.sidebar', { timeout: 30000 });
        if (!(await page.locator('#explorer :text("DJI_0020.JPG")').count())) await page.locator('#explorer :text-is("images")').first().dblclick();
        await page.locator('#explorer [data-path$="DJI_0020.JPG"], #explorer :text("DJI_0020.JPG")').first().click();
        await page.waitForSelector('.detail-side', { timeout: 30000 });
        const tree = await widthOf(page, '.sidebar');
        const detail = await widthOf(page, '.detail-side');
        if (viewport.width >= 3840) {
            assert.ok(tree <= 360, `the tree is ${tree} px wide`);
            assert.ok(detail >= 700, `the detail panel is ${detail} px wide`);
        } else {
            // at 1920 the tree is the computed value of --ddb-panel-tree-width: clamp(15rem, 18vw, 22.5rem) = 345.6 px
            assert.ok(Math.abs(tree - 345.6) <= 8, `the tree is ${tree} px wide`); // the splitter's 4 px gutter
        }
    });

    test(`${at}: Run Photogrammetry has one scroll area, the options list takes the height`, async () => {
        const page = await newPage(viewport);
        await page.goto(`${URL_}/r/${DATASET}`);
        await appReady(page);
        await page.click('[role="tab"]:has-text("Tasks")');
        await page.click('button:has-text("Run Photogrammetry")');
        await page.waitForSelector('#photogrammetry .odm-options-content', { timeout: 30000 });
        await page.click('#photogrammetry button:has-text("Expand All")');
        const r = await page.evaluate(() => {
            const dialog = document.getElementById('photogrammetry');
            const content = dialog.querySelector('.p-dialog-content');
            const list = dialog.querySelector('.odm-options-content');
            return { scroll: content.scrollHeight, client: content.clientHeight, list: list.getBoundingClientRect().height, dialog: dialog.getBoundingClientRect().height };
        });
        assert.equal(r.scroll, r.client, 'the content of the window scrolls');
        assert.ok(r.list >= r.dialog * 0.6, `the list is ${r.list} px of ${r.dialog}`);
    });

    test(`${at}: the task log is 80rem wide and high, fills the screen when maximized and scrolls sideways with Wrap lines off`, async (t) => {
        const page = await newPage(viewport);
        await page.goto(`${URL_}/r/${DATASET}`);
        await appReady(page);
        await page.click('[role="tab"]:has-text("Tasks")');
        const logButton = page.locator('button[aria-label*="log" i]').first();
        await logButton.waitFor({ timeout: 10000 }).catch(() => {}); // the task list loads after the tab opens
        if (!(await logButton.count())) return t.skip('no task with a log in the dataset');
        await logButton.click();
        await page.waitForSelector('#task-log .task-log');
        // The window grows into its size (a scale transition): measure when its width has stopped changing
        await page.evaluate(async () => {
            const log = document.querySelector('#task-log .task-log');
            let before = -1;
            for (let i = 0; i < 40 && log.getBoundingClientRect().width !== before; i++) {
                before = log.getBoundingClientRect().width;
                await new Promise(r => setTimeout(r, 150));
            }
        });
        // Fill the log, so that the box has the height it is allowed (a short log is a short box), then count what it holds
        await page.evaluate(() => {
            document.querySelector('#task-log .task-log').textContent = Array.from({ length: 300 }, (_, i) => `line ${i}`).join('\n');
        });
        const m = await page.evaluate(() => {
            const log = document.querySelector('#task-log .task-log');
            const style = getComputedStyle(log);
            const fontSize = parseFloat(style.fontSize);
            const lineHeight = parseFloat(style.lineHeight) || fontSize * 1.2; // 'normal' is not a number
            const inner = log.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
            return { width: log.getBoundingClientRect().width, lines: inner / lineHeight };
        });
        // The window of a log is 80rem (1280 px) at both widths, not the whole screen; the log is that less the padding
        assert.equal(await widthOf(page, '#task-log'), 1280);
        assert.ok(m.width >= 1200 && m.width < 1280, `the log is ${m.width} px wide`);
        if (viewport.width >= 3840) assert.ok(m.lines >= 60, `the log holds ${m.lines} lines`);
        // The long log scrolls in its box: the window is as high as it may be (90% of the screen), its content does
        // not scroll, and the footer is under the log, not over its last lines
        const fit = await page.evaluate(() => {
            const dialog = document.querySelector('#task-log');
            const content = dialog.querySelector('.p-dialog-content');
            const log = dialog.querySelector('.task-log');
            return {
                dialog: dialog.getBoundingClientRect().height,
                contentScrolls: content.scrollHeight > content.clientHeight,
                logScrolls: log.scrollHeight > log.clientHeight,
                gap: dialog.querySelector('.window-footer').getBoundingClientRect().top - log.getBoundingClientRect().bottom
            };
        });
        assert.ok(Math.abs(fit.dialog - viewport.height * 0.9) <= 1, `the window is ${fit.dialog} px high`);
        assert.equal(fit.contentScrolls, false, 'the content of the window scrolls');
        assert.equal(fit.logScrolls, true);
        assert.ok(fit.gap >= 0, `the footer covers ${-fit.gap} px of the log`);

        // Maximized with a log of three lines: the window is the screen, the footer is at its bottom and the log
        // takes the height between the header and the footer
        await page.evaluate(() => { document.querySelector('#task-log .task-log').textContent = 'one\ntwo\nthree'; });
        await page.click('#task-log .p-dialog-maximize-button');
        const box = selector => page.evaluate(sel => { const r = document.querySelector(sel).getBoundingClientRect(); return { top: r.top, bottom: r.bottom, width: r.width, height: r.height }; }, selector);
        await page.waitForFunction(w => document.querySelector('#task-log').getBoundingClientRect().width === w, viewport.width);
        const [dialog, header, log, footer] = [await box('#task-log'), await box('#task-log .p-dialog-header'), await box('#task-log .task-log'), await box('#task-log .window-footer')];
        assert.equal(dialog.height, viewport.height);
        // (the border of the window is between its footer and the edge of the screen)
        const atBottom = f => viewport.height - f.bottom >= 0 && viewport.height - f.bottom <= 2;
        assert.ok(atBottom(footer), `the footer ends at ${footer.bottom} px of ${viewport.height}`);
        // (the margin of the log, 1em, is above and below it)
        assert.ok(log.top - header.bottom >= 0 && log.top - header.bottom <= 20, `the log starts ${log.top - header.bottom} px under the header`);
        assert.ok(footer.top - log.bottom >= 0 && footer.top - log.bottom <= 20, `the log ends ${footer.top - log.bottom} px above the footer`);
        assert.ok(log.height >= viewport.height - 200, `the log is ${log.height} px high`);
        // A long log scrolls inside the log, and the footer stays where it is
        await page.evaluate(() => {
            document.querySelector('#task-log .task-log').textContent = Array.from({ length: 2000 }, (_, i) => `line ${i}`).join('\n');
        });
        const long = await page.evaluate(() => {
            const l = document.querySelector('#task-log .task-log');
            const c = document.querySelector('#task-log .p-dialog-content');
            return { logScrolls: l.scrollHeight > l.clientHeight, contentScrolls: c.scrollHeight > c.clientHeight, height: l.getBoundingClientRect().height };
        });
        assert.deepEqual(long, { logScrolls: true, contentScrolls: false, height: log.height });
        assert.ok(atBottom(await box('#task-log .window-footer')), 'the footer has moved');
        await page.click('#task-log .p-dialog-maximize-button');
        await page.waitForFunction(() => document.querySelector('#task-log').getBoundingClientRect().width === 1280);
        await page.evaluate(() => { document.querySelector('#task-log .task-log').textContent = 'x'.repeat(1000); });
        await page.click('#task-log label:has-text("Wrap lines")');
        const scrolls = await page.evaluate(() => { const l = document.querySelector('#task-log .task-log'); return l.scrollWidth > l.clientWidth; });
        assert.equal(scrolls, true, 'a line of 1000 characters does not scroll sideways');
    });

    test(`${at}: the analysis panel is 400 px wide or more at 4K, the chart text is 12 px, the Expand window is wide`, async (t) => {
        const page = await newPage(viewport);
        await page.goto(`${URL_}/r/${DATASET}/view/${Buffer.from(RASTER, 'utf8').toString('base64')}/map`);
        await appReady(page);
        await page.waitForSelector('.ol-viewport canvas', { timeout: 60000 });
        await page.click('[data-testid="raster-analysis-toolbar-btn"]'); // the panel opens from the toolbar, not on load
        await page.waitForSelector('.analysis-panel', { timeout: 60000 });
        const panel = await widthOf(page, '.analysis-panel');
        if (viewport.width >= 3840) assert.ok(panel >= 400, `the panel is ${panel} px wide`);
        else assert.ok(Math.abs(panel - 345.6) <= 2, `the panel is ${panel} px wide`); // 18vw
        const label = page.locator('.raster-profile-chart .label').first();
        if (!(await label.count())) return t.skip('no profile is drawn on the raster; the panel width above is all this run measured');
        assert.ok(await label.evaluate(e => parseFloat(getComputedStyle(e).fontSize)) >= 12);
        await page.click('button[aria-label="Expand the chart"]');
        await page.waitForSelector('#raster-profile-expanded .profile-svg');
        const wide = await widthOf(page, '#raster-profile-expanded .profile-svg');
        assert.ok(wide > 1000, `the larger chart is ${wide} px wide`);
    });
}
