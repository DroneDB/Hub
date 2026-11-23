/**
 * The measurement list of the map, end to end: rows are selected (click, Ctrl, Shift, check boxes, Select all, the
 * keyboard), and the selection is moved to a group (Move to, or dragged onto a group), made into a new group, deleted,
 * shown on the map and exported; the properties dialog of a measurement makes a new group for it when it is saved; a Save
 * keeps the groups after a reload.
 * Not part of `npm test` (needs a server). Same environment as smoke.test.mjs (HUB_URL, HUB_USER, HUB_PASS,
 * HUB_TEST_DATA, HUB_CHROME, HUB_HEADED):
 *
 *   HUB_URL=http://localhost:7431 node --test --test-concurrency=1 e2e/measurement-list.test.mjs
 *
 * HUB_SHOTS=<dir> also saves a screenshot of the list. It creates (then deletes) its own dataset.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { URL_, USER, DATA, HEADLESS, b64, form, chromeExecutable, appReady, createRegistryApi, signIn } from './support/hub.mjs';

const DS = `mlist-${Date.now().toString(36)}`;
const SHOTS = process.env.HUB_SHOTS || '';
const registry = createRegistryApi();

// ---- Fixture: a DEM with its sidecar of measurements in two groups, and markers enough to scroll -----------------

const LON = 9.3, LAT = 45.82;
const square = (lon, lat, d) => ({ type: 'Polygon', coordinates: [[[lon - d, lat - d], [lon + d, lat - d], [lon + d, lat + d], [lon - d, lat + d], [lon - d, lat - d]]] });
const feature = (id, measurementType, name, geometry, extra = {}) => ({
    type: 'Feature', id, geometry, properties: { id, measurementType, name, createdAt: '2026-11-01T10:00:00.000Z', ...extra }
});
const MARKERS = 20;
const measurementsDocument = () => ({
    type: 'FeatureCollection', crs: { type: 'name', properties: { name: 'EPSG:4326' } },
    metadata: {
        version: '3.0', application: 'DroneDB Registry',
        views: { map: { groups: [{ id: 'g-piles', name: 'Piles', color: '#d33', visible: true }, { id: 'g-roads', name: 'Roads', color: '#3a3', visible: true }] } }
    },
    features: [
        feature('north', 'area', 'North pad', square(LON, LAT + 0.01, 0.002), { groupId: 'g-piles' }),
        feature('south', 'area', 'South pad', square(LON, LAT - 0.01, 0.002), { groupId: 'g-piles' }),
        feature('road', 'length', 'Road 1', { type: 'LineString', coordinates: [[LON - 0.02, LAT], [LON + 0.02, LAT]] }, { groupId: 'g-roads' }),
        feature('fence', 'length', 'Fence', { type: 'LineString', coordinates: [[LON - 0.01, LAT + 0.02], [LON + 0.01, LAT + 0.02]] }),
        ...Array.from({ length: MARKERS }, (_, i) => feature(`m${i + 1}`, 'point', `Marker ${i + 1}`, { type: 'Point', coordinates: [LON + 0.001 * i, LAT - 0.02] }))
    ]
});

let browser;
let page;
const errors = [];

const dialog = () => page.locator('.p-dialog:has(#measurement-list), .p-dialog:has-text("Measurements")').first();
const row = name => page.locator(`.p-dialog .measurement-row:has(.measurement-name:text-is("${name}"))`);
const groupBlock = id => page.locator(`[data-testid="measurement-group-${id}"]`);
const groupCount = id => groupBlock(id).locator('.group-row .group-count').first().textContent();
const selectedNames = () => page.locator('.p-dialog .measurement-row--selected .measurement-name').allTextContents();
const countText = () => page.locator('[data-testid="measurement-selection-count"]').textContent();
/** Clears the selection of the list, when it has one. */
async function clearSelection() {
    const clear = page.locator('[data-testid="measurement-selection-clear"]');
    if (await clear.count()) await clear.click();
}

/** The Hub's notice of a new version blocks the page on a fresh Registry: it is answered first. */
async function dismissNotices() {
    const ok = page.locator('.p-dialog:has-text("updated") button:has-text("OK")');
    try { await ok.first().click({ timeout: 3000 }); } catch { /* no notice */ }
}

async function openMap() {
    await page.goto(`${URL_}/r/${USER}/${DS}/view/${b64('dem.tif')}/map`);
    await appReady(page);
    await dismissNotices();
    await page.waitForSelector('.ol-viewport canvas', { timeout: 30000 });
    // The sidecar is read: its labels are on the map
    await page.waitForSelector('.ol-tooltip-static', { state: 'attached', timeout: 30000 });
}

async function openList() {
    await page.click('button[title^="Measurement List"]');
    await page.waitForSelector('[data-testid="measurement-tree"]', { timeout: 10000 });
}

before(async () => {
    await registry.signIn();
    await registry.call('POST', `/orgs/${USER}/ds`, form({ slug: DS, name: DS }));
    const upload = (file, content) => registry.call('POST', `/orgs/${USER}/ds/${DS}/obj`, form({ path: file, file: new Blob([content]) }));
    await upload('dem.tif', fs.readFileSync(path.join(DATA, 'dem', 'test_dem.tiff')));
    await upload('dem_measurements.geojson', JSON.stringify(measurementsDocument()));
    browser = await chromium.launch({ headless: HEADLESS, executablePath: chromeExecutable() });
    const context = await browser.newContext({ viewport: { width: 1400, height: 1000 }, acceptDownloads: true });
    page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|tile|Tile/.test(m.text())) errors.push(m.text()); });
    await signIn(page);
    await dismissNotices();
    await openMap();
});

after(async () => {
    if (browser) await browser.close();
    try { await registry.call('DELETE', `/orgs/${USER}/ds/${DS}`); } catch { /* best effort */ }
});

test('Select all selects every row and sums what they measure', async () => {
    await openList();
    assert.equal(await page.locator('.p-dialog .measurement-row').count(), 4 + MARKERS);
    await page.check('[data-testid="measurement-select-all"]');
    assert.equal(await countText(), `${4 + MARKERS} measurements selected`);
    const totals = await page.locator('[data-testid="measurement-selection-totals"]').textContent();
    assert.match(totals, /2 lines [\d.,]+ (m|km) · 2 areas [\d.,]+ (m²|ha)/);
    if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await dialog().screenshot({ path: path.join(SHOTS, 'measurement-list-selection.png') }); }
    await clearSelection();
    assert.equal(await page.locator('[data-testid="measurement-selection-bar"]').count(), 0);
});

test('a click, a Shift click and a Ctrl click select as in the file list; Move to moves them', async () => {
    await row('Fence').click();
    await row('Marker 2').click({ modifiers: ['Shift'] });
    assert.deepEqual(await selectedNames(), ['Fence', 'Marker 1', 'Marker 2']);
    await row('Marker 1').click({ modifiers: ['ControlOrMeta'] });
    assert.deepEqual(await selectedNames(), ['Fence', 'Marker 2']);
    await page.click('[data-testid="measurement-move-to"]');
    await page.click('[data-testid="measurement-move-to-g-roads"]');
    assert.equal(await groupCount('g-roads'), '(3)');
    // The moved rows stay selected, now in Roads
    assert.deepEqual(await selectedNames(), ['Fence', 'Marker 2']);
});

test('a row dragged onto a group moves there; a selected row takes the selection with it', async () => {
    await clearSelection();
    await row('North pad').dragTo(groupBlock('g-roads').locator('.group-row'));
    assert.equal(await groupCount('g-roads'), '(4)');
    assert.equal(await groupCount('g-piles'), '(1)');
    await row('Marker 3').click();
    await row('Marker 4').click({ modifiers: ['ControlOrMeta'] });
    await row('Marker 3').dragTo(groupBlock('g-piles').locator('.group-row'));
    assert.equal(await groupCount('g-piles'), '(3)');
    // Out of a group, onto Ungrouped
    await clearSelection();
    await row('North pad').dragTo(groupBlock('ungrouped').locator('.group-row'));
    assert.equal(await groupCount('g-roads'), '(3)');
});

test('New group makes a group of the selected rows', async () => {
    await clearSelection();
    await row('Marker 5').click();
    await row('Marker 6').click({ modifiers: ['ControlOrMeta'] });
    assert.equal((await page.locator('[data-testid="measurement-new-group"]').textContent()).trim(), 'New group from 2 measurements');
    await page.click('[data-testid="measurement-new-group"]');
    assert.equal((await page.locator('[data-testid="measurement-group-holds"]').textContent()).trim(), 'The group holds the 2 selected measurements.');
    await page.fill('#mg-name', 'Checked');
    await page.click('.p-dialog:has(#mg-name) button:has-text("Create")');
    await page.waitForSelector('#mg-name', { state: 'detached' });
    const checked = page.locator('.group-block:has(.group-name:text-is("Checked"))');
    assert.equal(await checked.locator('.group-count').textContent(), '(2)');
});

test('the keyboard: Ctrl+A, Delete asks, Escape clears the selection and then closes the list', async () => {
    await clearSelection();
    await page.focus('[data-testid="measurement-tree"]');
    await page.keyboard.press('ArrowDown');
    assert.equal((await selectedNames()).length, 1);
    await page.keyboard.press('ControlOrMeta+a');
    assert.equal(await countText(), `${4 + MARKERS} measurements selected`);
    await page.keyboard.press('Delete');
    await page.waitForSelector(`.p-dialog:has-text("Delete ${4 + MARKERS} items")`, { timeout: 5000 });
    await page.click(`.p-dialog:has-text("Delete ${4 + MARKERS} items") button:has-text("Cancel")`);
    assert.equal(await page.locator('.p-dialog .measurement-row').count(), 4 + MARKERS);
    await page.focus('[data-testid="measurement-tree"]');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('[data-testid="measurement-selection-bar"]').count(), 0);
    assert.equal(await page.locator('[data-testid="measurement-tree"]').count(), 1);
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-testid="measurement-tree"]', { state: 'detached', timeout: 5000 });
});

test('search, then delete the rows it found', async () => {
    await openList();
    await page.fill('[data-testid="measurement-search"] input', 'Marker 1');
    // Marker 1 and Marker 10..19
    assert.equal(await page.locator('.p-dialog .measurement-row').count(), 11);
    await page.check('[data-testid="measurement-select-all"]');
    await page.click('[data-testid="measurement-delete-selected"]');
    await page.click('.p-dialog:has-text("Delete 11 items") button:has-text("Delete")');
    await page.fill('[data-testid="measurement-search"] input', '');
    assert.equal(await page.locator('.p-dialog .measurement-row').count(), 4 + MARKERS - 11);
});

test('Export downloads only the selected rows', async () => {
    await row('Fence').click();
    await row('Road 1').click({ modifiers: ['ControlOrMeta'] });
    await page.click('[data-testid="measurement-export"]');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-testid="measurement-export-csv"]')]);
    const text = fs.readFileSync(await download.path(), 'utf8').trim().split(/\r?\n/);
    assert.equal(text.length, 3);
    assert.match(text[1] + text[2], /Fence/);
    assert.match(text[1] + text[2], /Road 1/);
});

test('Show on map closes the list and shows the selection', async () => {
    await clearSelection();
    await row('South pad').click();
    await page.click('[data-testid="measurement-show-on-map"]');
    await page.waitForSelector('[data-testid="measurement-tree"]', { state: 'detached', timeout: 5000 });
    if (SHOTS) {
        // The map flies to the selection: the picture is of where it ends
        await page.waitForTimeout(1500);
        await page.screenshot({ path: path.join(SHOTS, 'measurement-show-on-map.png') });
    }
});

test('New group of the properties dialog makes the group when the measurement is saved, not when it is cancelled', async () => {
    const groupNamed = name => page.locator(`.group-block:has(.group-name:text-is("${name}"))`);
    const properties = '.p-dialog:has(#mp-name)';
    async function closeList() {
        await page.keyboard.press('Escape');
        await page.waitForSelector('[data-testid="measurement-tree"]', { state: 'detached', timeout: 5000 });
    }
    async function editWithNewGroup(name) {
        await openList();
        await row('Marker 7').locator('.btn-edit').click();
        await page.waitForSelector(properties, { timeout: 5000 });
        await page.click('[data-testid="mp-new-group"]');
        await page.fill('#mg-name', name);
        await page.keyboard.press('Enter');
        await page.waitForSelector('#mg-name', { state: 'detached' });
        assert.equal((await page.locator(`${properties} #mp-group`).textContent()).trim(), `${name} (new)`);
    }
    await editWithNewGroup('Surveyed');
    await page.click(`${properties} button:has-text("Cancel")`);
    await page.waitForSelector(properties, { state: 'detached' });
    await openList();
    assert.equal(await groupNamed('Surveyed').count(), 0);
    await closeList();
    await editWithNewGroup('Surveyed');
    if (SHOTS) await page.locator(properties).screenshot({ path: path.join(SHOTS, 'measurement-properties-new-group.png') });
    await page.click(`${properties} button:has-text("Save")`);
    await page.waitForSelector(properties, { state: 'detached' });
    await openList();
    assert.equal(await groupNamed('Surveyed').locator('.group-count').textContent(), '(1)');
    await closeList();
});

test('a Save keeps the groups and the moves after a reload', async () => {
    await page.click('button[title^="Save Measurements"]');
    await page.waitForSelector('.p-toast-message', { timeout: 15000 });
    await openMap();
    await openList();
    assert.equal(await page.locator('.p-dialog .measurement-row').count(), 4 + MARKERS - 11);
    assert.equal(await groupCount('g-roads'), '(3)');
    assert.equal(await groupCount('g-piles'), '(3)');
    const checked = page.locator('.group-block:has(.group-name:text-is("Checked"))');
    assert.equal(await checked.locator('.group-count').textContent(), '(2)');
    const surveyed = page.locator('.group-block:has(.group-name:text-is("Surveyed"))');
    assert.equal(await surveyed.locator('.group-count').textContent(), '(1)');
    assert.deepEqual(errors, []);
});
