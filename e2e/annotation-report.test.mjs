/**
 * Annotation reports, end to end: drives the real Hub in Chromium against a running Registry (the report editor, the
 * live page, the PDF, the Photos tab of an annotation, the viewer links, the organization Report settings).
 * Not part of `npm test` (needs a server). Same environment as smoke.test.mjs (HUB_URL, HUB_USER, HUB_PASS,
 * HUB_TEST_DATA, HUB_CHROME, HUB_HEADED), with these prerequisites:
 *
 * - the Registry runs a libddb that has DDBFindCoverage (the Photos tab needs it);
 * - the organization member management is on (AppSettings:EnableOrganizationMemberManagement), for the member checks;
 * - the machine has the poppler tools (pdfinfo, pdftotext), which read the PDF; the PDF checks skip without them.
 *
 *   HUB_URL=http://localhost:7420 node --test --test-concurrency=1 e2e/annotation-report.test.mjs
 *
 * HUB_SHOTS=<dir> also saves a screenshot of each surface it visits. It creates (then deletes) its own datasets and
 * users, and puts the organization report settings back as it found them.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { URL_, USER, PASS, DATA, HEADLESS, form, chromeExecutable, appReady } from './support/hub.mjs';

const RUN = Date.now().toString(36);
const DS = `rep-${RUN}`;
const DS_PUBLIC = `repub-${RUN}`;
const DS_PERF = `reperf-${RUN}`;
// The map of a dataset keeps its measurements in the file of the first folder it shows: this one has just its own file
const DS_MAP = `repmap-${RUN}`;
const DS_MAP2 = `repmap2-${RUN}`;
const DS_3D = `rep3d-${RUN}`;
// A dataset with no saved view: a new report saves one of its map file
const DS_NOVIEW = `repnov-${RUN}`;
const READER = `rdr${RUN}`;
const MEMBER = `mem${RUN}`;
const OUTSIDER_PASS = 'password123';
const SHOTS = process.env.HUB_SHOTS || '';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'annotation-report-'));
const IMAGES = Array.from({ length: 18 }, (_, i) => `DJI_00${18 + i}.JPG`);

const hasPoppler = (() => { try { execFileSync('pdfinfo', ['-v'], { stdio: 'ignore' }); return true; } catch { return false; } })();
const pdfOnly = { skip: hasPoppler ? false : 'pdfinfo / pdftotext (poppler) are not installed' };

let browser;
let token;
const tokens = {};
const contexts = [];

/** The Registry API as a user (the token of `as`, the admin's by default). */
async function call(method, endpoint, body, as = null) {
    const headers = { Authorization: `Bearer ${as ?? token}` };
    if (body && !(body instanceof FormData)) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(body); }
    const res = await fetch(`${URL_}${endpoint}`, { method, body, headers });
    const text = await res.text();
    if (!res.ok) { const e = new Error(`${method} ${endpoint} -> ${res.status} ${text}`); e.status = res.status; throw e; }
    try { return JSON.parse(text); } catch { return text; }
}
const tokenOf = async (user, pass) => (await call('POST', '/users/authenticate', form({ username: user, password: pass }), 'none')).token;
const upload = (ds, filePath, content) => call('POST', `/orgs/${USER}/ds/${ds}/obj`, form({ path: filePath, file: new Blob([content]) }));
const json = (ds, filePath, doc) => upload(ds, filePath, JSON.stringify(doc));
const listDir = async (ds, dir = '') => (await call('POST', `/orgs/${USER}/ds/${ds}/list`, form({ path: dir }))).map(e => e.path);
async function download(ds, filePath) {
    const res = await fetch(`${URL_}/orgs/${USER}/ds/${ds}/download?path=${encodeURIComponent(filePath)}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`download ${filePath} -> ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
}
const meta = async (ds, key) => (await call('GET', `/orgs/${USER}/ds/${ds}/meta/get/${key}`)).map(e => e.data);

// ---- Fixtures -----------------------------------------------------------------------------------------------------

const square = (lon, lat, d) => ({ type: 'Polygon', coordinates: [[[lon - d, lat - d], [lon + d, lat - d], [lon + d, lat + d], [lon - d, lat + d], [lon - d, lat - d]]] });
const CRS = { type: 'name', properties: { name: 'EPSG:4326' } };
/** A 2.0 file: no id, no ref. Its features are not in the order of their createdAt (the area is the newest). */
const legacyDocument = () => ({
    type: 'FeatureCollection', crs: CRS, metadata: { version: '2.0', application: 'DroneDB Registry' },
    features: [
        { type: 'Feature', geometry: square(-91.99406, 46.84259, 0.00004), properties: { measurementType: 'area', name: 'Pile north', createdAt: '2026-11-01T10:20:00.000Z' } },
        { type: 'Feature', geometry: { type: 'LineString', coordinates: [[-91.9944, 46.84268], [-91.9941, 46.8428]] }, properties: { measurementType: 'length', name: 'Crack', createdAt: '2026-11-01T10:00:00.000Z' } },
        { type: 'Feature', geometry: { type: 'Point', coordinates: [-91.99346, 46.8427] }, properties: { measurementType: 'point', name: 'Marker', createdAt: '2026-11-01T10:10:00.000Z' } }
    ]
});
/** A 3.0 file with ids and refs 1, 2 and 12, and the fields of an inspection. */
const numberedDocument = (extra = {}) => ({
    type: 'FeatureCollection', crs: CRS, metadata: { version: '3.0', application: 'DroneDB Registry', lastRef: 12 },
    features: [
        { type: 'Feature', id: 'item-one', geometry: square(-91.99406, 46.84259, 0.00004), properties: {
            id: 'item-one', ref: '1', measurementType: 'area', name: 'Pile north', createdAt: '2026-11-01T10:00:00.000Z', category: 'defect', severity: 'high', status: 'open',
            description: 'A **cracked** pile', photos: [{ path: 'images/DJI_0027.JPG', source: 'coverage', pixel: [1866, 1142], caption: 'North view' }] } },
        { type: 'Feature', id: 'item-point', geometry: { type: 'Point', coordinates: [-91.99346, 46.8427] }, properties: {
            id: 'item-point', ref: '2', measurementType: 'point', name: 'Marker', createdAt: '2026-11-01T10:10:00.000Z', category: 'observation', status: 'in-progress' } },
        { type: 'Feature', id: 'item-twelve', geometry: { type: 'LineString', coordinates: [[-91.9944, 46.84268], [-91.9941, 46.8428]] }, properties: {
            id: 'item-twelve', ref: '12', measurementType: 'length', name: 'Crack', createdAt: '2026-11-01T10:20:00.000Z', category: 'defect', severity: 'low', status: 'resolved' } }
    ],
    ...extra
});
/** The saved view a report takes as its cover: the first image on a basemap, over the flight. */
const coverView = () => {
    const lon = -91.9942, lat = 46.8427;
    const x = lon * 20037508.34 / 180;
    const y = Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) * 6378137;
    return { uid: 'v_cover001', name: 'Site cover', v: 1, base: { path: 'images/DJI_0018.JPG', hash: '' }, layers: [], split: { enabled: false, positions: [] },
        view: { center: [x, y], zoom: 18, rotation: 0 }, display: { basemap: null }, analysis: { target: null }, createdBy: USER, createdAt: '2026-11-01T10:00:00Z', updatedBy: USER, updatedAt: '2026-11-01T10:00:00Z' };
};
const reportBody = (uid, name, file, extra = {}) => ({
    uid, version: 1, name, templateId: 'standard', title: `${name} title`, subtitle: '', preparedBy: 'E2E', preparedFor: '', notes: '', sources: [{ file, label: 'A' }],
    filter: { groups: [], categories: [], severities: [], statuses: [], kinds: [], owners: [] }, cover: { viewId: 'v_cover001' },
    sections: ['cover', 'summary', 'overview', 'tables', 'items', 'notes'].map(kind => ({ kind, enabled: true })), units: null,
    createdBy: USER, createdAt: '2026-11-01T10:00:00Z', modifiedAt: '2026-11-01T10:00:00Z', ...extra
});
const addMeta = (ds, key, data) => call('POST', `/orgs/${USER}/ds/${ds}/meta/add`, form({ key, data: JSON.stringify(data), path: '' }));
const addReport = (ds, uid, name, file, extra) => addMeta(ds, 'reports', reportBody(uid, name, file, extra));
const reportUrl = (ds, uid) => `${URL_}/r/${USER}/${ds}/reports/${uid}`;
/**
 * Makes a file of the dataset three days old on the disk of the Registry (HUB_STORAGE is its storage folder); false when
 * it cannot. The dataset folder is the one that holds the marker file createDataset wrote.
 */
function ageFile(ds, filePath) {
    const root = process.env.HUB_STORAGE;
    if (!root) return false;
    const orgDir = path.join(root, 'datasets', USER);
    const folder = (fs.existsSync(orgDir) ? fs.readdirSync(orgDir) : []).find(guid => fs.existsSync(path.join(orgDir, guid, `${ds}.marker`)));
    const file = folder && path.join(orgDir, folder, filePath);
    if (!file || !fs.existsSync(file)) return false;
    const old = new Date(Date.now() - 3 * 86400000);
    fs.utimesSync(file, old, old);
    return true;
}
const readFile = name => fs.readFileSync(path.join(DATA, 'images', name));

/** `marker`: a file the e2e can find the dataset folder of on the disk of the Registry by (it would be a file on show of the map: the map datasets have none). */
async function createDataset(slug, { images = IMAGES, isPublic = false, marker = true, view = true } = {}) {
    await call('POST', `/orgs/${USER}/ds`, form({ slug, name: slug }));
    for (const name of images) await upload(slug, `images/${name}`, readFile(name));
    if (marker) await upload(slug, `${slug}.marker`, 'e2e');
    if (view) await addMeta(slug, 'views', coverView());
    if (isPublic) await call('POST', `/orgs/${USER}/ds/${slug}/meta/set`, form({ key: 'visibility', data: '2', path: '' }));
}

// ---- Browser ------------------------------------------------------------------------------------------------------

/** The browser state (cookies, storage) of each user once signed in: the Registry limits the sign-ins of a minute. */
const sessions = new Map();

async function newPage({ signedIn = true, as = USER, pass = PASS, viewport = { width: 1400, height: 1000 } } = {}) {
    if (signedIn && !sessions.has(as)) {
        const login = await browser.newContext();
        await signInAs(await login.newPage(), as, pass);
        sessions.set(as, await login.storageState());
        await login.close();
    }
    const context = await browser.newContext({ viewport, acceptDownloads: true, ...(signedIn ? { storageState: sessions.get(as) } : {}) });
    contexts.push(context);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    // A failure of the page itself, not a network failure of a basemap tile that the sandbox may not reach
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|tile|Tile/.test(m.text())) errors.push(m.text()); });
    return { page, errors, context };
}
async function signInAs(page, user, pass) {
    await page.goto(`${URL_}/login`);
    await appReady(page);
    await page.fill('input[type=text], input[placeholder*="sername"]', user);
    await page.fill('input[type=password]', pass);
    await Promise.all([page.waitForURL(/\/r(\/|$)/, { timeout: 30000 }), page.click('button:has-text("Login")')]);
}
async function shot(page, name) { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false }); } }

/** Opens a report and waits until its page shows (the bar has its name). */
async function openReport(page, ds, uid, name) {
    await page.goto(reportUrl(ds, uid));
    await appReady(page);
    await page.waitForSelector(`h1:has-text("${name}")`, { timeout: 30000 });
}
const documentText = page => page.locator('.report-document').innerText();

/** Downloads the PDF of the open report into the temp folder. */
async function downloadPdf(page, file = `report-${Date.now()}.pdf`) {
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), page.click('[data-testid="report-download-pdf"]')]);
    const target = path.join(TMP, file);
    await download.saveAs(target);
    return { target, name: download.suggestedFilename() };
}
const pdfInfo = file => Object.fromEntries(execFileSync('pdfinfo', [file], { encoding: 'utf8' }).split('\n').filter(Boolean).map(l => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1).trim()]));
const pdfText = file => execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' });

const ORG_SETTINGS = `/orgs/${USER}/report-settings`;
let originalSettings;

before(async () => {
    token = await tokenOf(USER, PASS);
    originalSettings = await call('GET', ORG_SETTINGS);
    await createDataset(DS);
    await createDataset(DS_MAP, { marker: false });
    await createDataset(DS_MAP2, { images: ['DJI_0018.JPG'], marker: false });
    await createDataset(DS_PUBLIC, { images: ['DJI_0018.JPG'], isPublic: true });
    await json(DS, 'legacy/measurements.geojson', legacyDocument());
    await json(DS_MAP, 'measurements.geojson', legacyDocument());
    await json(DS_MAP2, 'measurements.geojson', legacyDocument());
    await json(DS, 'numbered/measurements.geojson', numberedDocument());
    await json(DS_PUBLIC, 'numbered/measurements.geojson', numberedDocument());
    await addReport(DS, 'r_aaaaaaaa', 'Inspection A', 'numbered/measurements.geojson');
    await addReport(DS_PUBLIC, 'r_pubpubpu', 'Public report', 'numbered/measurements.geojson');
    for (const u of [READER, MEMBER]) await call('POST', '/users', { userName: u, password: OUTSIDER_PASS, email: `${u}@example.com`, roles: [] });
    // permission 0 = read only, 1 = read and write (neither is an organization administrator)
    await call('POST', `/orgs/${USER}/members`, { userName: READER, permissions: 0 });
    await call('POST', `/orgs/${USER}/members`, { userName: MEMBER, permissions: 1 });
    tokens[READER] = await tokenOf(READER, OUTSIDER_PASS);
    tokens[MEMBER] = await tokenOf(MEMBER, OUTSIDER_PASS);
    // The software GL is what the point cloud viewer draws with when the machine has no GPU
    browser = await chromium.launch({ headless: HEADLESS, executablePath: chromeExecutable(), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
});

after(async () => {
    for (const c of contexts) await c.close().catch(() => {});
    await browser?.close();
    // The settings of the organization as they were (a failed test may have left a template changed)
    try { await call('PUT', ORG_SETTINGS, { ...originalSettings, version: (await call('GET', ORG_SETTINGS)).version }); } catch { /* best effort */ }
    for (const ds of [DS, DS_MAP, DS_MAP2, DS_3D, DS_PUBLIC, DS_PERF, DS_NOVIEW]) { try { await call('DELETE', `/orgs/${USER}/ds/${ds}`); } catch { /* best effort */ } }
    for (const u of [READER, MEMBER]) { try { await call('DELETE', `/users/${u}`); } catch { /* best effort */ } }
    fs.rmSync(TMP, { recursive: true, force: true });
});

// ---- Tests --------------------------------------------------------------------------------------------------------

test('a new report on a 2.0 file numbers its items in the order they were made, and the live page shows the numbers, the links and the QR code at once', async () => {
    const { page, errors } = await newPage();
    await page.goto(`${URL_}/r/${USER}/${DS}`);
    await appReady(page);
    await page.click('[data-testid="group-action"]:has-text("New report")');
    await page.waitForSelector('#report-name');
    // Filled in from the newest report of the dataset: its file and its view
    await page.waitForSelector('.p-multiselect:has(#report-sources) :text("numbered/measurements.geojson")');
    await page.waitForSelector('.p-select:has(#report-view) :text("Site cover")');
    await page.fill('#report-name', 'Numbered by the report');
    // This one reads the 2.0 file instead
    await page.click('.p-multiselect:has(#report-sources)');
    await page.click('.p-multiselect-overlay [role=option]:has-text("legacy/measurements.geojson")');
    await page.click('.p-multiselect-overlay [role=option]:has-text("numbered/measurements.geojson")');
    await page.keyboard.press('Escape');
    await shot(page, 'report-editor');
    await Promise.all([page.waitForURL(/\/reports\/r_[a-z0-9]+$/, { timeout: 30000 }), page.click('.p-dialog button:has-text("Create report")')]);
    await page.waitForSelector('h1:has-text("Numbered by the report")');
    await page.waitForSelector('.report-document table', { timeout: 30000 });

    // The file is now 3.0, the refs follow createdAt (the crack, then the marker, then the pile), nothing else moved
    const saved = JSON.parse((await download(DS, 'legacy/measurements.geojson')).toString('utf8'));
    assert.equal(saved.metadata.version, '3.0');
    assert.equal(saved.metadata.lastRef, 3);
    const refOf = name => saved.features.find(f => f.properties.name === name).properties.ref;
    assert.deepEqual([refOf('Crack'), refOf('Marker'), refOf('Pile north')], ['1', '2', '3']);
    for (const f of saved.features) assert.match(f.properties.id, /^[0-9a-f]{64}$/);
    const original = legacyDocument().features;
    saved.features.forEach((f, i) => {
        assert.deepEqual(f.geometry, original[i].geometry);
        assert.equal(f.properties.name, original[i].properties.name);
        assert.equal(f.properties.createdAt, original[i].properties.createdAt);
    });

    // The page that opens after the save already shows the numbers: no item is "—", each one has its anchor
    const text = await documentText(page);
    assert.doesNotMatch(text, /Overview map of 3 items: —/, 'the overview names the items by their refs');
    const rows = await page.locator('.report-document table tbody tr').allInnerTexts();
    assert.ok(rows.length >= 3, `the tables list the 3 items (${rows.length} rows)`);
    for (const ref of ['1', '2', '3']) assert.ok(rows.some(r => r.split('\t')[0].trim() === ref), `a row has the ref ${ref}`);
    assert.ok(await page.locator('.report-document a[href*="#item-"]').count() >= 3, 'each item has an anchor');
    assert.ok(await page.locator('.report-document svg, .report-document canvas, .report-document img[alt*="QR" i]').count() >= 1, 'the QR code is drawn');
    assert.deepEqual(errors, []);
});

test('the Report button of the map opens the editor filled in: Create report makes the report of the map\'s file on the saved view', async () => {
    const { page, errors } = await newPage();
    await page.goto(`${URL_}/r/${USER}/${DS_MAP}`);
    await appReady(page);
    await page.click('.tab-buttons-strip >> text=Map');
    await page.click('[data-testid="report-toolbar-btn"]', { timeout: 30000 });
    await page.waitForSelector('#report-name');
    await page.waitForSelector('.p-select:has(#report-view) :text("Site cover")');
    // The optional fields are behind More options, which shows what they hold
    assert.equal(await page.locator('#report-title').isVisible(), false, 'More options is closed');
    assert.match(await page.locator('[data-testid="options-summary"]').innerText(), /template/);
    await shot(page, 'report-editor-from-map');
    await Promise.all([page.waitForURL(/\/reports\/r_[a-z0-9]+$/, { timeout: 30000 }), page.click('.p-dialog button:has-text("Create report")')]);
    const uid = page.url().split('/').pop();
    const report = (await meta(DS_MAP, 'reports')).find(r => r.uid === uid);
    assert.deepEqual(report.sources, [{ file: 'measurements.geojson', label: 'A' }]);
    assert.deepEqual(report.cover, { viewId: 'v_cover001' });
    assert.match(report.name, /^Site cover – /);
    assert.equal(report.title, DS_MAP);
    assert.deepEqual(errors, []);
});

test('a new report in a dataset with no saved view saves a view of its map file with it, which the Views group then lists', async () => {
    await createDataset(DS_NOVIEW, { images: [], view: false });
    await json(DS_NOVIEW, 'measurements.geojson', legacyDocument());
    await json(DS_NOVIEW, 'zones.geojson', { type: 'FeatureCollection', crs: CRS, features: [{ type: 'Feature', geometry: square(-91.9942, 46.8427, 0.0003), properties: { name: 'Zone' } }] });
    const { page, errors } = await newPage();
    await page.goto(`${URL_}/r/${USER}/${DS_NOVIEW}`);
    await appReady(page);
    // A writer sees the Views group with no view, and how to make one
    await page.waitForSelector('.saved-views [data-testid="group-empty"]');
    await page.click('[data-testid="group-action"]:has-text("New report")');
    await page.waitForSelector('#report-view-name');
    assert.equal(await page.inputValue('#report-view-name'), 'zones.geojson');
    await page.fill('#report-view-name', 'Zones');
    await shot(page, 'report-editor-new-view');
    await Promise.all([page.waitForURL(/\/reports\/r_[a-z0-9]+$/, { timeout: 30000 }), page.click('.p-dialog button:has-text("Create report")')]);
    // The report opens on the view it saved
    await page.waitForSelector('.report-document table', { timeout: 30000 });
    const views = await meta(DS_NOVIEW, 'views');
    assert.equal(views.length, 1, 'one view was saved');
    assert.equal(views[0].name, 'Zones');
    assert.equal(views[0].base.path, 'zones.geojson');
    const uid = page.url().split('/').pop();
    const report = (await meta(DS_NOVIEW, 'reports')).find(r => r.uid === uid);
    assert.deepEqual(report.cover, { viewId: views[0].uid });
    assert.deepEqual(report.sources, [{ file: 'measurements.geojson', label: 'A' }]);
    await page.goto(`${URL_}/r/${USER}/${DS_NOVIEW}`);
    await appReady(page);
    await page.waitForSelector('.saved-views button:has-text("Zones")');
    assert.deepEqual(errors, []);
});

test('a public report opens for an anonymous user, a private one asks to sign in', async () => {
    const { page } = await newPage({ signedIn: false });
    await openReport(page, DS_PUBLIC, 'r_pubpubpu', 'Public report');
    assert.match(await documentText(page), /Pile north/);
    const anonymous = page.locator('[data-testid="report-download-pdf"]');
    assert.equal(await anonymous.count(), 1, 'an anonymous reader can download the PDF');

    await page.goto(reportUrl(DS, 'r_aaaaaaaa'));
    await appReady(page);
    await page.waitForFunction(() => /sign in|log ?in/i.test(document.body.innerText), null, { timeout: 30000 });
    assert.equal(await page.locator('.report-document').count(), 0, 'no report content for a private dataset');
    assert.doesNotMatch(await page.locator('body').innerText(), /Pile north/);
    await shot(page, 'report-private-anonymous');
});

test('a reader without write access sees neither Publish PDF, Edit nor Delete', async () => {
    const anonymous = await newPage({ signedIn: false });
    await openReport(anonymous.page, DS_PUBLIC, 'r_pubpubpu', 'Public report');
    const reader = await newPage({ as: READER, pass: OUTSIDER_PASS });
    await openReport(reader.page, DS, 'r_aaaaaaaa', 'Inspection A');
    const writer = await newPage();
    await openReport(writer.page, DS, 'r_aaaaaaaa', 'Inspection A');
    for (const [who, p] of [['an anonymous reader', anonymous.page], ['a read-only member', reader.page]]) {
        assert.equal(await p.locator('[data-testid="report-download-pdf"]').count(), 1, `${who} can download`);
        for (const id of ['report-publish-pdf', 'report-edit', 'report-delete']) assert.equal(await p.locator(`[data-testid="${id}"]`).count(), 0, `${who} has no ${id}`);
    }
    for (const id of ['report-download-pdf', 'report-publish-pdf', 'report-edit', 'report-delete']) assert.equal(await writer.page.locator(`[data-testid="${id}"]`).count(), 1, `the writer has ${id}`);
});

// ---- The page ------------------------------------------------------------------------------------------------------

test('a source that another session changed shows what it holds now when the report is opened again in the browser', async t => {
    // The browser's HTTP cache keeps a file it read for a share of its age (no ETag, no Cache-Control): a file that was
    // saved a day ago is fresh for hours. With HUB_STORAGE (the storage folder of the Registry under test) the file is
    // made three days old first, which is what an inspection file usually is.
    await json(DS, 'age/measurements.geojson', numberedDocument());
    const aged = ageFile(DS, 'age/measurements.geojson');
    if (!aged) t.diagnostic('HUB_STORAGE is not set: the file is as old as the test, which hides a read served from the HTTP cache');
    await addReport(DS, 'r_agedaged', 'Aged source', 'age/measurements.geojson');
    const { page, context } = await newPage();
    await openReport(page, DS, 'r_agedaged', 'Aged source');
    assert.match(await documentText(page), /Pile north[\s\S]*Open/, 'the first read shows the status open');
    const doc = numberedDocument();
    doc.features[0].properties.status = 'resolved';
    doc.features[0].properties.name = 'Pile north (checked)';
    await call('POST', `/orgs/${USER}/ds/${DS}/obj`, form({ path: 'age/measurements.geojson', overwrite: 'true', file: new Blob([JSON.stringify(doc)]) }));
    // The report opens again from the dataset page, in a new tab of the same browser (the HTTP cache is shared)
    await page.click(`a[href="/r/${USER}/${DS}"]`);
    await page.waitForURL(new RegExp(`/r/${USER}/${DS}/?$`), { timeout: 15000 });
    const [again] = await Promise.all([context.waitForEvent('page'), page.dblclick('[aria-label="Reports"] button:has-text("Aged source")')]);
    await again.waitForSelector('h1:has-text("Aged source")');
    await again.waitForSelector('.report-document table');
    await again.waitForTimeout(500);
    assert.match(await documentText(again), /Pile north \(checked\)/, 'the page shows what the file holds now');
});

test('a filter of the report keeps the items that do not pass out of the tables, the item pages and the overview', async () => {
    await addReport(DS, 'r_openonly', 'Open only', 'numbered/measurements.geojson', { filter: { groups: [], categories: [], severities: [], statuses: ['open'], kinds: [], owners: [] } });
    const { page } = await newPage();
    await openReport(page, DS, 'r_openonly', 'Open only');
    await page.waitForSelector('.report-document table');
    const text = await documentText(page);
    assert.match(text, /Pile north/);
    assert.doesNotMatch(text, /Marker/, 'the item in progress is out');
    assert.doesNotMatch(text, /Crack/, 'the resolved item is out');
    assert.match(await page.locator('figcaption').first().innerText(), /1 item: 1$/, 'the overview names the one item');
});

test('two sources keep their own labels in front of the refs, the first source first', async () => {
    await json(DS, 'second/measurements.geojson', numberedDocument());
    await addReport(DS, 'r_twosrc01', 'Two sources', 'numbered/measurements.geojson', {
        sources: [{ file: 'numbered/measurements.geojson', label: 'A' }, { file: 'second/measurements.geojson', label: 'B' }]
    });
    const { page } = await newPage();
    await openReport(page, DS, 'r_twosrc01', 'Two sources');
    await page.waitForSelector('.report-document table');
    const text = await documentText(page);
    for (const ref of ['A-1', 'A-2', 'A-12', 'B-1', 'B-2', 'B-12']) assert.ok(text.includes(ref), `the page shows ${ref}`);
    assert.ok(text.indexOf('A-1') < text.indexOf('B-1'), 'A-1 is before B-1');
    assert.match(await page.locator('figcaption').first().innerText(), /A-1.*A-2.*A-12.*B-1/, 'the overview callouts are named in the same order');
});

test('the dataset info does not carry the report definitions', async () => {
    const info = await call('GET', `/orgs/${USER}/ds/${DS}`);
    const entry = Array.isArray(info) ? info[0] : info;
    const metadata = entry.properties?.meta ?? {};
    assert.equal(Object.hasOwn(metadata, 'reports'), false, 'no reports key in the dataset meta of the info');
    assert.equal(Object.hasOwn(metadata, 'views'), false, 'no views key either');
    assert.equal((await meta(DS, 'reports')).length > 0, true, 'the definitions are still there for the meta endpoint');
});

// ---- The PDF -------------------------------------------------------------------------------------------------------

/** The org template on the screen of the next test: Letter landscape, restored by `restore`. */
async function useTemplateLayout(paper, orientation) {
    const current = await call('GET', ORG_SETTINGS);
    const templates = current.templates.map((t, i) => (i === 0 ? { ...t, paper, orientation } : t));
    await call('PUT', ORG_SETTINGS, { templates, schema: current.schema, version: current.version });
    return async () => { const now = await call('GET', ORG_SETTINGS); await call('PUT', ORG_SETTINGS, { templates: current.templates, schema: current.schema, version: now.version }); };
}

test('the PDF of the report has the paper and orientation of the template, a contents page, n / total footers, selectable text, and the order and values of the page', pdfOnly, async () => {
    const restore = await useTemplateLayout('Letter', 'landscape');
    try {
        const { page, errors } = await newPage();
        await openReport(page, DS, 'r_aaaaaaaa', 'Inspection A');
        await page.waitForSelector('.report-document table');
        const started = Date.now();
        const { target, name } = await downloadPdf(page, 'letter.pdf');
        console.log(`# PDF of the 3-item report: ${Date.now() - started} ms, ${fs.statSync(target).size} bytes`);
        assert.match(name, /^inspection-a-\d{4}-\d{2}-\d{2}\.pdf$/);
        const info = pdfInfo(target);
        assert.match(info['Page size'], /^792(\.0+)? x 612(\.0+)? pts \(letter\)/, `Letter landscape, got ${info['Page size']}`);
        const pages = Number(info.Pages);
        assert.ok(pages >= 4, `a cover, a contents page and the sections (${pages} pages)`);

        const all = pdfText(target);
        const perPage = all.split('\f').filter(p => p.trim());
        const contents = perPage.findIndex(p => /Contents/.test(p));
        assert.ok(contents >= 1 && contents <= 2, `the contents page follows the cover (page ${contents + 1})`);
        perPage.forEach((text, i) => {
            const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
            assert.match(lines.at(-1), new RegExp(`^${i + 1} ?/ ?${perPage.length}$`), `page ${i + 1} ends with its n / total footer`);
        });

        // Page and PDF: the same items in the same order with the same values
        const live = await documentText(page);
        const order = ['1 Pile north', '2 Marker', '12 Crack'];
        for (const [who, text] of [['page', live], ['PDF', all]]) {
            const at = order.map(o => text.lastIndexOf(o));
            assert.ok(at.every(i => i >= 0), `the ${who} has the three item headings ${at}`);
            assert.deepEqual([...at].sort((a, b) => a - b), at, `the ${who} lists the items in the order of their refs`);
        }
        for (const value of ['Defect', 'High', 'Open', 'Resolved', 'In progress', 'Observation']) {
            assert.ok(live.includes(value) && all.includes(value), `the value ${value} is on the page and in the PDF`);
        }
        const area = /(\d+[.,]\d+) m²/.exec(live)?.[0];
        assert.ok(area && all.includes(area), `the area ${area} is on the page and in the PDF`);
        assert.ok(all.includes('A cracked pile'), 'the markdown of the description is text');
        assert.deepEqual(errors, []);
    } finally { await restore(); }
});

test('cancelling the PDF while it is made downloads nothing and gives the buttons back', async () => {
    const { page, context } = await newPage();
    // The photos of the report arrive slowly, so that Cancel comes while the PDF is made
    await context.route('**/thumb*', async route => { await new Promise(r => setTimeout(r, 4000)); await route.continue().catch(() => {}); });
    await openReport(page, DS, 'r_aaaaaaaa', 'Inspection A');
    await page.waitForSelector('.report-document table');
    let downloaded = false;
    page.on('download', () => { downloaded = true; });
    await page.click('[data-testid="report-download-pdf"]');
    await page.waitForSelector('#reportPdfProgress', { timeout: 10000 });
    await shot(page, 'pdf-progress');
    await page.click('#reportPdfProgress button:has-text("Cancel")');
    await page.waitForSelector('#reportPdfProgress', { state: 'detached', timeout: 5000 });
    await page.waitForTimeout(6000);
    assert.equal(downloaded, false, 'no file was downloaded');
    assert.equal(await page.locator('[data-testid="report-download-pdf"]').isDisabled(), false, 'Download PDF is back');
    assert.equal(await page.locator('[data-testid="report-publish-pdf"]').isDisabled(), false, 'Publish PDF is back');
});

test('Publish PDF asks Replace or Cancel when the file of the day is there, before the PDF is made', pdfOnly, async () => {
    const today = new Date();
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const published = `reports/inspection-a-${date}.pdf`;
    const hashOf = async () => { try { return createHash('sha256').update(await download(DS, published)).digest('hex'); } catch { return null; } };
    const { page } = await newPage();
    await openReport(page, DS, 'r_aaaaaaaa', 'Inspection A');
    await page.waitForSelector('.report-document table');
    // The writes of the page: the PDF is the same bytes every time in one page session (it is dated when the page loaded), so the writes are counted
    const writes = [];
    page.on('response', r => { if (/\/obj$/.test(r.url()) && r.request().method() === 'POST') writes.push(r.status()); });
    const publish = async () => { await page.click('[data-testid="report-publish-pdf"]'); };
    await publish();
    await page.waitForSelector('text=PDF published', { timeout: 60000 });
    const first = await hashOf();
    assert.ok(first, `${published} is in the dataset`);
    assert.deepEqual(writes, [201], 'the first publish writes the file');

    await page.waitForTimeout(1500);
    await publish();
    const dialog = page.locator('.p-dialog:has(button:has-text("Replace"))');
    await dialog.waitFor({ timeout: 15000 });
    assert.equal(await page.locator('#reportPdfProgress').count(), 0, 'the question comes before the PDF is made');
    await shot(page, 'publish-replace');
    await dialog.locator('button:has-text("Cancel")').click();
    await dialog.waitFor({ state: 'detached' });
    await page.waitForTimeout(1500);
    assert.equal(await hashOf(), first, 'Cancel leaves the published file as it was');
    assert.deepEqual(writes, [201], 'Cancel writes nothing');

    await publish();
    await dialog.waitFor({ timeout: 15000 });
    await dialog.locator('button:has-text("Replace")').click();
    for (let i = 0; i < 60 && writes.length < 2; i++) await page.waitForTimeout(500);
    assert.deepEqual(writes, [201, 201], 'Replace writes the file over the old one (a write that does not replace is a 409)');
    const bytes = await download(DS, published);
    assert.match(bytes.subarray(0, 5).toString('latin1'), /^%PDF-/);
});

// ---- The Photos tab ------------------------------------------------------------------------------------------------

/** Opens the properties of an annotation of the map of the dataset (the measurements of the root file) on its Photos tab. */
async function openPhotosTab(page, name, ds = DS_MAP) {
    await page.goto(`${URL_}/r/${USER}/${ds}`);
    await appReady(page);
    await page.click('.tab-buttons-strip >> text=Map');
    await page.click('button[aria-label="Measurement List"]', { timeout: 30000 });
    const row = page.locator('.p-dialog li, .p-dialog tr, .p-dialog [role=listitem], .p-dialog div').filter({ hasText: name }).last();
    await row.waitFor({ timeout: 30000 });
    await row.hover();
    await page.locator('.p-dialog button:has(.fa-pencil)').first().click();
    await page.click('button[id$="tab_photos"]');
}

test('the Photos tab lists the photos that cover the annotation, best first, with the approximate location of the annotation in each', async () => {
    const { page, errors } = await newPage();
    await openPhotosTab(page, 'Pile north');
    await page.waitForSelector('[data-testid="location-marker"]', { timeout: 30000 });
    const shown = await page.locator('.p-dialog img[alt^="Pile north - "]').evaluateAll(imgs => imgs.map(i => i.alt.replace('Pile north - ', '')));
    const coverage = await call('POST', `/orgs/${USER}/ds/${DS_MAP}/coverage`, { geometry: legacyDocument().features[0].geometry, limit: 20 });
    assert.ok(coverage.length >= 3, `several images cover the pile (${coverage.length})`);
    assert.deepEqual(shown, coverage.slice(0, shown.length).map(c => path.basename(c.path)), 'the photos are the ones the dataset ranks, in its order');
    const withPixel = coverage.slice(0, shown.length).filter(c => c.pixel).length;
    assert.equal(await page.locator('.p-dialog [data-testid="location-marker"]').count(), withPixel, 'a marker on each photo that has a pixel');
    assert.equal(await page.locator('.p-dialog [aria-label="Approximate location"]').first().getAttribute('title'), 'Approximate location');
    assert.match(await page.locator('.p-dialog').innerText(), /Best match/);
    await shot(page, 'photos-tab');
    assert.deepEqual(errors, []);
});

test('two uploaded photos are written next to the measurement file as annotations/<id>-1 and -2', async () => {
    const { page } = await newPage();
    await openPhotosTab(page, 'Crack');
    await page.setInputFiles('input[aria-label="Upload photos"]', [path.join(DATA, 'images', 'DJI_0019.JPG'), path.join(DATA, 'images', 'DJI_0020.JPG')]);
    let files = [];
    for (let i = 0; i < 40 && files.length < 2; i++) {
        await page.waitForTimeout(500);
        files = (await listDir(DS_MAP, 'annotations').catch(() => [])).filter(f => /^annotations\/[0-9a-f]{64}-[12]\.jpe?g$/i.test(f));
    }
    assert.equal(files.length, 2, `two photos in annotations/ (${files})`);
    const ids = new Set(files.map(f => f.split('/')[1].split('-')[0]));
    assert.equal(ids.size, 1, 'both belong to the one annotation');
    assert.deepEqual(files.map(f => /-(\d)\./.exec(f)[1]).sort(), ['1', '2']);
});

test('the file list shows the photos uploaded from the Photos tab without a refresh', async () => {
    // The files are written when they are uploaded and stay whatever the dialog does after: the list and the tree must say so
    const { page } = await newPage();
    await openPhotosTab(page, 'Marker', DS_MAP2);
    await page.setInputFiles('input[aria-label="Upload photos"]', [path.join(DATA, 'images', 'DJI_0021.JPG')]);
    let files = [];
    for (let i = 0; i < 40 && !files.length; i++) {
        await page.waitForTimeout(500);
        files = (await listDir(DS_MAP2, 'annotations').catch(() => [])).filter(f => /^annotations\/[0-9a-f]{64}-1\.jpe?g$/i.test(f));
    }
    assert.ok(files.length >= 1, 'the photo is in annotations/');
    await page.click('.p-dialog button:has-text("Cancel")');
    await page.waitForSelector('.p-dialog', { state: 'detached' });
    await page.click('.tab-buttons-strip >> text=Files');
    await page.waitForTimeout(1000);
    assert.ok(await page.getByText('annotations', { exact: true }).count() > 0, 'the folder of the photos is in the file list without a refresh');
});

// ---- Links to the viewer ---------------------------------------------------------------------------------------------

test('Open in viewer opens the map on the item, an item that was deleted says so in the viewer and on the page', async () => {
    // The measurements of the folder of the photos: the cover view of the report saves its measurements there
    const file = 'images/measurements.geojson';
    await json(DS, file, numberedDocument());
    await addReport(DS, 'r_gonegone', 'Gone items', file);
    const { page, context, errors } = await newPage();
    await openReport(page, DS, 'r_gonegone', 'Gone items');
    await page.waitForSelector('.report-document table');
    await page.waitForSelector('.report-document a:has-text("Open in viewer")', { timeout: 15000 });
    const links = await page.locator('.report-document a:has-text("Open in viewer")').evaluateAll(as => as.map(a => a.href));
    assert.ok(links.length >= 3, `an Open in viewer link for each item (${links.length})`);
    console.log('# viewer links', links.slice(0, 2));
    const [viewer] = await Promise.all([context.waitForEvent('page'), page.locator('.report-document a:has-text("Open in viewer")').first().click()]);
    await viewer.waitForLoadState();
    await appReady(viewer);
    await viewer.waitForSelector('.ol-viewport, canvas', { timeout: 30000 });
    await viewer.waitForTimeout(4000);
    assert.doesNotMatch(await viewer.locator('body').innerText(), /no longer exists/, 'the item is there');
    await shot(viewer, 'open-in-viewer');
    assert.ok(!/[?&]item=/.test(new URL(viewer.url()).search), 'the item key is taken off the address once read');

    // The item goes: the viewer says so, the page says so
    const doc = numberedDocument();
    doc.features = doc.features.filter(f => f.id !== 'item-one');
    await call('POST', `/orgs/${USER}/ds/${DS}/obj`, form({ path: file, overwrite: 'true', file: new Blob([JSON.stringify(doc)]) }));
    const gone = links[0].includes('item=') ? links[0] : null;
    assert.ok(gone, 'the viewer link carries ?item=');
    const { page: second } = await newPage();
    await second.goto(gone);
    await appReady(second);
    await second.waitForFunction(() => /no longer exists/i.test(document.body.innerText), null, { timeout: 30000 });
    await second.goto(`${reportUrl(DS, 'r_gonegone')}#item-item-one`);
    await appReady(second);
    await second.waitForSelector('[data-testid="item-missing"]', { timeout: 30000 });
    assert.match(await second.locator('[data-testid="item-missing"]').innerText(), /This item is no longer in this report/);
    assert.deepEqual(errors, []);
});

// ---- Organization report settings --------------------------------------------------------------------------------------

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const statusOf = async (method, endpoint, body, as) => { try { await call(method, endpoint, body, as); return 200; } catch (e) { return e.status ?? 0; } };

test('a member who is not an administrator reads the Report settings and cannot change them; the defaults are there for an org without settings', async () => {
    assert.ok(originalSettings.templates.some(t => t.id === 'standard'), 'the Standard template is there');
    assert.deepEqual(originalSettings.schema.categories.map(c => c.id).slice(0, 2), ['general', 'defect'], 'the default schema');
    const current = await call('GET', ORG_SETTINGS, null, tokens[MEMBER]);
    assert.equal(await statusOf('PUT', ORG_SETTINGS, current, tokens[MEMBER]), 403, 'the PUT is refused for a member');
    assert.equal(await statusOf('PUT', ORG_SETTINGS, current, tokens[READER]), 403, 'and for a read-only member');

    const { page, errors } = await newPage({ as: MEMBER, pass: OUTSIDER_PASS });
    await page.goto(`${URL_}/r`);
    await appReady(page);
    await page.locator('button:has-text("Report settings"), [aria-label="Report settings"]').first().click();
    await page.waitForSelector('#report-template-name');
    await page.waitForTimeout(800);
    await shot(page, 'report-settings-member');
    const editable = await page.locator('.p-dialog input:not([type=file]):not([disabled]):not([readonly]), .p-dialog textarea:not([disabled]):not([readonly])').count();
    assert.equal(editable, 0, 'every field of the dialog is read-only for a member');
    assert.equal(await page.locator('.p-dialog button:has-text("Save")').count() === 0 || await page.locator('.p-dialog button:has-text("Save")').first().isDisabled(), true, 'no Save for a member');
    assert.deepEqual(errors, []);
});

test('the administrator saves the settings with the version they read; a stale version is a conflict; a logo needs a stored template', async () => {
    const current = await call('GET', ORG_SETTINGS);
    const saved = await call('PUT', ORG_SETTINGS, { templates: current.templates, schema: current.schema, version: current.version });
    assert.equal(saved.version, current.version + 1);
    assert.equal(await statusOf('PUT', ORG_SETTINGS, { templates: current.templates, schema: current.schema, version: current.version }), 409, 'the version of the first read is stale');
    // A template that is only in an open dialog has no logo yet
    assert.equal(await statusOf('PUT', `${ORG_SETTINGS}/templates/never-saved/logo`, form({ file: new Blob([PNG], { type: 'image/png' }) })), 404);
    // A stored template takes a logo, and the logo is not for anonymous users (nor in the public branding folder)
    const fresh = await call('GET', ORG_SETTINGS);
    const logo = await call('PUT', `${ORG_SETTINGS}/templates/standard/logo`, form({ file: new Blob([PNG], { type: 'image/png' }) }));
    assert.ok(logo.version > fresh.version - 1 && logo.logo, 'the logo is stored');
    try {
        const anonymous = path => fetch(`${URL_}${path}`).then(r => r.status);
        const imageAt = path => fetch(`${URL_}${path}`).then(r => r.ok && /^image\//.test(r.headers.get('content-type') ?? ''));
        assert.notEqual(await anonymous(`/orgs/${USER}/report-settings/templates/standard/logo`), 200, 'the org logo needs a sign-in');
        assert.notEqual(await anonymous(`/orgs/${USER}/ds/${DS}/report-settings/logo/standard`), 200, 'the dataset logo of a private dataset needs a sign-in');
        assert.equal(await imageAt('/branding/report-logo-standard.png'), false, 'it is not in the public branding folder');
        const res = await fetch(`${URL_}/orgs/${USER}/ds/${DS}/report-settings/logo/standard`, { headers: { Authorization: `Bearer ${token}` } });
        assert.equal(res.status, 200);
        assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
        assert.match(res.headers.get('content-type'), /^image\/png/);
        // The stored template saves with its logo untouched (no 409 after the upload)
        const after = await call('GET', ORG_SETTINGS);
        await call('PUT', ORG_SETTINGS, { templates: after.templates, schema: after.schema, version: after.version });
    } finally {
        await call('DELETE', `${ORG_SETTINGS}/templates/standard/logo`).catch(() => {});
    }
});

test('a template that is deleted falls back to the first one with a notice, a section switched off in the template stays on in existing reports', async () => {
    const original = await call('GET', ORG_SETTINGS);
    const extra = { ...original.templates[0], id: 'extra-tpl', name: 'Extra template', defaultSections: ['cover', 'summary'] };
    let current = await call('PUT', ORG_SETTINGS, { templates: [...original.templates, extra], schema: original.schema, version: original.version });
    await addReport(DS, 'r_tplgone8', 'Template report', 'numbered/measurements.geojson', { templateId: 'extra-tpl' });
    try {
        // The administrator drops the sections of the first template and deletes the template of the report
        const first = { ...original.templates[0], defaultSections: ['cover'] };
        await call('PUT', ORG_SETTINGS, { templates: [first], schema: original.schema, version: current.version });
        const { page } = await newPage();
        await openReport(page, DS, 'r_tplgone8', 'Template report');
        await page.waitForSelector('.report-document table');
        assert.match(await page.locator('.report-notice').first().innerText(), /extra-tpl.*no longer exists/i, 'the page says the template is gone');
        assert.match(await documentText(page), /Summary/, 'the existing report keeps its sections');
        assert.match(await documentText(page), /Tables/);
    } finally {
        const now = await call('GET', ORG_SETTINGS);
        await call('PUT', ORG_SETTINGS, { templates: original.templates, schema: original.schema, version: now.version });
    }
});

// ---- Speed ---------------------------------------------------------------------------------------------------------

/** A file of `count` small areas in a grid around the flight, all numbered. */
const gridDocument = count => {
    const features = Array.from({ length: count }, (_, i) => {
        const lon = -91.9946 + (i % 10) * 0.00012;
        const lat = 46.8424 + Math.floor(i / 10) * 0.00012;
        const id = `grid-${String(i + 1).padStart(3, '0')}`;
        return { type: 'Feature', id, geometry: square(lon, lat, 0.00003), properties: {
            id, ref: String(i + 1), measurementType: 'area', name: `Area ${i + 1}`, createdAt: new Date(Date.UTC(2026, 10, 1, 10, i)).toISOString(), category: 'general', status: 'open' } };
    });
    return { type: 'FeatureCollection', crs: CRS, metadata: { version: '3.0', application: 'DroneDB Registry', lastRef: count }, features };
};
const median = list => [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)];

test('a 50-item report shows its first section within 2 s, and an item snapshot of a 20-item report renders in a median of 2 s or less', async () => {
    await createDataset(DS_PERF, { images: ['DJI_0018.JPG'], marker: false });
    await json(DS_PERF, 'p20/measurements.geojson', gridDocument(20));
    await json(DS_PERF, 'p50/measurements.geojson', gridDocument(50));
    await addReport(DS_PERF, 'r_perf0020', 'Perf 20', 'p20/measurements.geojson');
    await addReport(DS_PERF, 'r_perf0050', 'Perf 50', 'p50/measurements.geojson');
    const { page } = await newPage({ viewport: { width: 1400, height: 1000 } });

    // First section of 50 items: from the navigation to the cover title on the page
    const started = Date.now();
    await page.goto(reportUrl(DS_PERF, 'r_perf0050'));
    await appReady(page);
    await page.waitForSelector('.report-document h2, .report-document h3, .report-document table', { timeout: 30000 });
    const firstSection = Date.now() - started;
    console.log(`# first section of a 50-item report in ${firstSection} ms`);
    await page.waitForSelector('.report-document table');
    console.log(`# tables of a 50-item report in ${Date.now() - started} ms`);

    // The snapshots of the 20 items: each one is timed from the moment it is brought into view
    await page.goto(reportUrl(DS_PERF, 'r_perf0020'));
    await appReady(page);
    await page.waitForSelector('.report-document table');
    const figures = page.locator('.report-document figure');
    const count = await figures.count();
    const times = [];
    for (let i = 0; i < count; i++) {
        const figure = figures.nth(i);
        const t0 = Date.now();
        await figure.scrollIntoViewIfNeeded();
        await figure.locator('img').waitFor({ timeout: 30000 }).catch(() => {});
        times.push(Date.now() - t0);
    }
    console.log(`# ${count} figures of a 20-item report, ms each: ${times.join(' ')}; median ${median(times)} ms`);
    assert.ok(firstSection <= 2000, `the first section of a 50-item report shows in ${firstSection} ms (2000 ms)`);
    assert.ok(count >= 20, `a map for each item (${count})`);
    assert.ok(median(times) <= 2000, `the median snapshot takes ${median(times)} ms (2000 ms)`);
});

// ---- Basemaps that do not allow the export ---------------------------------------------------------------------------------

/** A tile server of the machine: one pixel of PNG for every tile, with or without the CORS headers. */
async function tileServer({ cors }) {
    const http = await import('node:http');
    const server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'image/png', ...(cors ? { 'Access-Control-Allow-Origin': '*' } : {}) });
        res.end(PNG);
    });
    await new Promise(resolve => server.listen(0, resolve));
    return { url: `http://localhost:${server.address().port}/{z}/{x}/{y}.png`, close: () => new Promise(resolve => server.close(resolve)) };
}

/** A report whose cover view names the custom basemap of the browser (the one the page reads from the preferences). */
async function reportOnCustomBasemap(uid, name) {
    const view = { ...coverView(), uid: `v_${uid.slice(2)}`, name: `${name} view`, display: { basemap: 'custom' } };
    await addMeta(DS, 'views', view);
    await addReport(DS, uid, name, 'numbered/measurements.geojson', { cover: { viewId: view.uid } });
}

/** Opens the report as a user whose account names `url` as the custom basemap (the Hub reads it from the account when it signs in). */
async function snapshotNotes(url, uid, name) {
    await call('PATCH', '/users/preferences', { map: { customBasemap: { sourceType: 'xyz', url, layerName: '', tileSize: 256, attribution: '' } } });
    const { page } = await newPage();
    await openReport(page, DS, uid, name);
    await page.waitForSelector('.report-document table');
    await page.locator('figure').first().scrollIntoViewIfNeeded();
    await page.waitForSelector('.report-document figure img', { timeout: 30000 });
    await page.waitForTimeout(500);
    return { page, text: await documentText(page) };
}

test('a basemap that sends no CORS headers is left out of the snapshot with a note, one that does is drawn without it', async () => {
    await reportOnCustomBasemap('r_nocors01', 'No CORS basemap');
    await reportOnCustomBasemap('r_withcors', 'CORS basemap');
    const closed = await tileServer({ cors: false });
    const open = await tileServer({ cors: true });
    const before = await call('GET', '/users/preferences');
    try {
        const blocked = await snapshotNotes(closed.url, 'r_nocors01', 'No CORS basemap');
        assert.match(blocked.text, /Basemap not shown: provider does not allow export/, 'the note is under the snapshot');
        await shot(blocked.page, 'snapshot-no-cors');
        const allowed = await snapshotNotes(open.url, 'r_withcors', 'CORS basemap');
        assert.doesNotMatch(allowed.text, /Basemap not shown/, 'a provider that allows it needs no note');
    } finally {
        await call('PATCH', '/users/preferences', { map: { customBasemap: before.map?.customBasemap ?? null } }).catch(() => {});
        await closed.close(); await open.close();
    }
});

// ---- 3D capture --------------------------------------------------------------------------------------------------------

test('a 3D distance captured for the report is written as annotations/<id>-3d.webp and the item page of the report shows it', async t => {
    await createDataset(DS_3D, { images: ['DJI_0018.JPG'], marker: false });
    await upload(DS_3D, 'pc/brighton-beach.laz', fs.readFileSync(path.join(DATA, 'point-clouds', 'brighton-beach.laz')));
    let built = false;
    for (let i = 0; i < 120 && !built; i++) {
        const entry = (await call('POST', `/orgs/${USER}/ds/${DS_3D}/list`, form({ path: 'pc' }))).find(e => e.path === 'pc/brighton-beach.laz');
        built = !!entry?.artifacts?.some(a => a.role === 'pointcloud.copc');
        if (!built) await new Promise(r => setTimeout(r, 1000));
    }
    if (!built) return t.skip('the point cloud was not built within 2 minutes on this Registry');

    const { page, errors } = await newPage({ viewport: { width: 1400, height: 900 } });
    await page.goto(`${URL_}/r/${USER}/${DS_3D}/view/${Buffer.from('pc/brighton-beach.laz').toString('base64')}/pointcloud`);
    await appReady(page);
    await page.waitForSelector('canvas', { timeout: 30000 });
    await page.waitForTimeout(10000);
    await page.click('text=Distance');
    await page.mouse.click(600, 520);
    await page.waitForTimeout(500);
    await page.mouse.move(700, 540);
    await page.mouse.click(760, 560);
    await page.waitForTimeout(500);
    await page.mouse.click(760, 560, { button: 'right' });
    await page.waitForTimeout(1500);
    // A double click on a marker of a finished measure opens its properties
    await page.mouse.dblclick(600, 520);
    await page.click('button:has-text("Capture for report")', { timeout: 15000 });
    await page.waitForSelector('text=Captured', { timeout: 60000 });
    await shot(page, 'capture-3d-dialog');
    await page.click('.p-dialog button:has-text("Save")');
    await page.waitForSelector('.p-dialog', { state: 'detached' });
    await page.click('button[aria-label="Save measurements"]');
    await page.waitForTimeout(3000);

    const folder = (await listDir(DS_3D, 'pc')).filter(f => f.startsWith('pc/annotations/'));
    const capture = (await listDir(DS_3D, 'pc/annotations').catch(() => [])).find(f => /\/[0-9a-f-]{36,64}-3d\.webp$/.test(f));
    assert.ok(capture, `a -3d.webp capture was written next to the measurements (${folder})`);
    const saved = (await listDir(DS_3D, 'pc')).find(f => /_measurements\.geojson$|measurements\.geojson$/.test(f));
    assert.ok(saved, 'the measurements were saved');
    const doc = JSON.parse((await download(DS_3D, saved)).toString('utf8'));
    const item = doc.features.find(f => f.properties.snapshot);
    assert.ok(item, 'the item keeps its capture');
    assert.equal(item.properties.snapshot.path, capture, 'the item points at the file');

    await addReport(DS_3D, 'r_capture3', 'Capture report', saved);
    await openReport(page, DS_3D, 'r_capture3', 'Capture report');
    await page.waitForSelector('.report-document table');
    await page.locator('figure').last().scrollIntoViewIfNeeded();
    await page.waitForSelector('.report-document img[src*="-3d.webp"]', { timeout: 30000 });
    await shot(page, 'report-3d-capture');
    assert.deepEqual(errors.filter(e => !/WebGL|GL_|swiftshader|GPU/i.test(e)), []);
});

// ---- Totals of 2D and 3D items, and 3D items that are not georeferenced ----------------------------------------------

/** A square of `side` metres (a small one: its area is about side squared). */
const metreSquare = (lon, lat, side) => {
    const dLat = side / 111320 / 2;
    const dLon = dLat / Math.cos((lat * Math.PI) / 180);
    return { type: 'Polygon', coordinates: [[[lon - dLon, lat - dLat], [lon + dLon, lat - dLat], [lon + dLon, lat + dLat], [lon - dLon, lat + dLat], [lon - dLon, lat - dLat]]] };
};
const cloudItem = (id, ref, type, geometry, props) => ({ type: 'Feature', id, geometry, properties: { id, ref, measurementType: type, createdAt: `2026-11-01T10:0${ref}:00.000Z`, localCoordinates: [[1, 2, 3]], ...props } });

test('2D and 3D areas have a row each and one total, a 3D height is not a length and a 3D angle has its own table', async () => {
    const doc = {
        type: 'FeatureCollection', crs: CRS, metadata: { version: '3.0', application: 'DroneDB Registry', lastRef: 4, views: { pointCloud: { pointCloudFile: 'cloud.laz' } } },
        features: [
            { type: 'Feature', id: 'a2d', geometry: metreSquare(-91.9942, 46.8427, 10), properties: { id: 'a2d', ref: '1', measurementType: 'area', name: 'Yard', createdAt: '2026-11-01T10:01:00.000Z' } },
            cloudItem('a3d', '2', 'area', metreSquare(-91.9940, 46.8427, 7), { name: 'Roof', area: 50, unit: 'm²' }),
            cloudItem('h3d', '3', 'height', { type: 'LineString', coordinates: [[-91.9941, 46.8426, 0], [-91.9941, 46.8426, 8]] }, { name: 'Pole', distance: 8, unit: 'm' }),
            cloudItem('g3d', '4', 'angle', { type: 'Point', coordinates: [-91.9941, 46.8426, 0] }, { name: 'Slope', angle: 32.5, unit: 'degrees' })
        ]
    };
    await json(DS, 'totals/measurements.geojson', doc);
    await addReport(DS, 'r_totals01', 'Totals', 'totals/measurements.geojson');
    const { page } = await newPage();
    await openReport(page, DS, 'r_totals01', 'Totals');
    await page.waitForSelector('.report-document table');
    const tables = await page.locator('.report-document table').evaluateAll(ts => ts.map(t => ({ caption: t.querySelector('caption')?.textContent.trim(), rows: [...t.querySelectorAll('tbody tr')].map(r => r.innerText.replace(/\s+/g, ' ').trim()) })));
    const byCaption = name => tables.find(t => t.caption?.includes(name));
    const areas = byCaption('Areas');
    assert.equal(areas.rows.length, 2, 'two rows in the Areas table');
    assert.ok(areas.rows.some(r => /Yard.*2D/.test(r)) && areas.rows.some(r => /Roof.*3D/.test(r)), `one row tagged 2D and one tagged 3D (${areas.rows})`);
    assert.ok(byCaption('Lengths').rows.some(r => /Pole/.test(r)), 'the height is in the Lengths table');
    assert.ok(byCaption('3D measurements').rows.some(r => /Slope/.test(r)), 'the angle is in the 3D measurements table');
    const summary = await page.locator('.report-document').innerText();
    const total = /Area\s+(\d+)[.,]?\d*\s*m²/.exec(summary);
    assert.ok(total && Math.abs(Number(total[1]) - 150) <= 2, `the area total is 150 m² (${total?.[0]})`);
    assert.doesNotMatch(summary, /Length\s+\d/, 'the height does not add to a length total');
});

test('a 3D item of a point cloud with no coordinate system is on no map and says it is not georeferenced', async () => {
    const doc = {
        type: 'FeatureCollection', metadata: { version: '3.0', application: 'DroneDB Registry', lastRef: 1, views: { pointCloud: { pointCloudFile: 'cloud.laz' } } },
        features: [cloudItem('n3d', '1', 'distance', { type: 'LineString', coordinates: [[0, 0, 0], [5, 0, 0]] }, { name: 'Local crack', distance: 5, unit: 'm' })]
    };
    await json(DS, 'nocrs/measurements.geojson', doc);
    await addReport(DS, 'r_nocrs001', 'No CRS', 'nocrs/measurements.geojson');
    const { page } = await newPage();
    await openReport(page, DS, 'r_nocrs001', 'No CRS');
    await page.waitForSelector('.report-document table');
    assert.match(await documentText(page), /Not georeferenced/);
    const figures = await page.locator('.report-document figure').allInnerTexts();
    assert.ok(!figures.some(f => /Map of item 1/.test(f)), `no 2D map for the item (${figures})`);
    assert.doesNotMatch(await page.locator('figcaption').first().innerText().catch(() => ''), /Overview map of 1 item/, 'the overview has no item to draw');
});

// ---- The toolbar rail of the map ---------------------------------------------------------------------------------------

for (const [width, height] of [[1280, 720], [600, 400]]) {
    test(`the toolbar rail of the map reaches its last button by wheel and by Tab in a ${width} x ${height} window, with nothing cut off at the sides`, async () => {
        const { page } = await newPage({ viewport: { width, height } });
        await page.goto(`${URL_}/r/${USER}/${DS_MAP}`);
        await appReady(page);
        await page.click('.tab-buttons-strip >> text=Map');
        const last = page.locator('button[aria-label="Delete Saved Measurements"]');
        await last.waitFor({ state: 'attached', timeout: 30000 });
        await page.waitForTimeout(1500);
        // A small window folds the measuring tools behind one button
        const fold = page.locator('button[aria-label="Measure"]');
        if (await fold.isVisible()) { await fold.click(); await page.waitForTimeout(500); }
        const rect = () => last.evaluate(b => { const r = b.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: window.innerHeight, width: window.innerWidth }; });
        const reachable = async () => { const r = await rect(); return r.top >= 0 && r.bottom <= r.height; };
        // By wheel over the rail
        const home = page.locator('button[aria-label="Reset View"]');
        const box = await home.boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        for (let i = 0; i < 6 && !(await reachable()); i++) await page.mouse.wheel(0, 400);
        await page.waitForTimeout(300);
        assert.ok(await reachable(), `the last button is in the window after the wheel (${JSON.stringify(await rect())})`);
        await shot(page, `map-rail-${width}x${height}-scrolled`);
        // Nothing of the rail is cut off at the sides
        const railX = box.x;
        const sides = await page.evaluate(x => [...document.querySelectorAll('button[aria-label]')].filter(b => b.offsetParent && Math.abs(b.getBoundingClientRect().left - x) < 2 && b.getBoundingClientRect().top > 100)
            .map(b => { const r = b.getBoundingClientRect(); return { label: b.getAttribute('aria-label'), left: r.left, right: r.right }; }), railX);
        assert.ok(sides.length >= 4, `the rail has its buttons (${sides.length})`);
        assert.ok(sides.every(s => s.left >= 0 && s.right <= width), `no rail button is cut off at the sides (${JSON.stringify(sides.filter(s => s.left < 0 || s.right > width))})`);
        // By keyboard: from the list button, Tab to the last one
        await page.locator('button[aria-label="Measurement List"]').focus();
        for (let i = 0; i < 12; i++) {
            if (await last.evaluate(b => b === document.activeElement)) break;
            await page.keyboard.press('Tab');
        }
        assert.ok(await last.evaluate(b => b === document.activeElement), 'Tab reaches the last button');
        assert.ok(await reachable(), 'and it is in the window');
        await shot(page, `map-rail-${width}x${height}-tab`);
    });
}
