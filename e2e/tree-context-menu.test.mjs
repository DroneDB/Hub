/**
 * The context menu of the folder tree of the dataset page, end to end: a right click on a file or a
 * folder of the tree selects it and opens the full menu of that item (the one the file list shows),
 * the menu follows the item clicked each time it opens, and a file picked in the tree is the
 * selection the page header acts on (Download, Share/Embed).
 *
 * Drives the real Hub in Chromium against a running Registry. Not part of `npm test` (needs a
 * server); same environment and conventions as smoke.test.mjs:
 *
 *   HUB_URL=http://localhost:5100 node --test e2e/tree-context-menu.test.mjs
 *
 * It creates (then deletes) a throw-away dataset in HUB_USER's organisation, with files from
 * HUB_TEST_DATA.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { URL_, USER, DATA, HEADLESS, form, chromeExecutable, createRegistryApi, appReady, signIn } from './support/hub.mjs';

const DS = `tree-menu-${Date.now().toString(36)}`;
const PHOTO = 'DJI_0018.JPG';
const NOTES = 'notes.md';
const FOLDER = 'out';
// A photo and a text file in a folder, and a text file next to the folder
const UPLOADS = [
    [`${FOLDER}/${PHOTO}`, path.join(DATA, 'images', PHOTO)],
    [`${FOLDER}/${NOTES}`, path.join(DATA, 'README.md')],
    ['README.md', path.join(DATA, 'README.md')]
];

const registry = createRegistryApi();
// One signed-in browser context for the suite: each test opens its own page in it
let browser, context;

before(async () => {
    await registry.signIn();
    await registry.call('POST', `/orgs/${USER}/ds`, form({ slug: DS, name: DS }));
    for (const [dest, source] of UPLOADS) {
        await registry.call('POST', `/orgs/${USER}/ds/${DS}/obj`, form({ path: dest, file: new Blob([fs.readFileSync(source)]) }));
    }
    browser = await chromium.launch({ headless: HEADLESS, executablePath: chromeExecutable() });
    context = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
    const page = await context.newPage();
    await signIn(page);
    await page.close();
});

after(async () => {
    await context?.close().catch(() => {});
    await browser?.close();
    try { await registry.call('DELETE', `/orgs/${USER}/ds/${DS}`); } catch { /* best effort */ }
});

const treeItem = (page, name) => page.locator('.sidebar .tree-view [role="treeitem"]').filter({ has: page.locator(`.text:text-is("${name}")`) });
const listed = page => page.locator('#explorer .thumbnail');
const listedSelected = page => page.locator('#explorer .thumbnail.selected');

/** The dataset page with the folder of the tree expanded (its files are tree items). */
async function openDataset() {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${URL_}/r/${USER}/${DS}`);
    await appReady(page);
    await treeItem(page, FOLDER).waitFor({ state: 'visible', timeout: 20000 });
    // The grid view: the tests read the tiles of the list
    const grid = page.locator('.hub-toolbar button[aria-label="Grid"]');
    if (await grid.getAttribute('aria-pressed') !== 'true') await grid.click();
    await treeItem(page, FOLDER).locator('.fa-caret-right').click();
    await treeItem(page, PHOTO).waitFor({ state: 'visible', timeout: 15000 });
    return { page, errors };
}

/** Right clicks the tree item `name` and gives the labels of the menu that opens. */
async function menuOf(page, name) {
    await treeItem(page, name).click({ button: 'right' });
    const menu = page.locator('.p-contextmenu');
    await menu.waitFor({ state: 'visible', timeout: 10000 });
    return (await menu.locator('.p-contextmenu-item-label').allTextContents()).map(s => s.trim());
}

const assertHas = (labels, wanted, what) => {
    for (const label of wanted) assert.ok(labels.includes(label), `${what} has ${label}: ${labels.join(', ')}`);
};

test('a right click on a file of the tree selects it and opens the menu of that file', async () => {
    const { page, errors } = await openDataset();

    const labels = await menuOf(page, NOTES);
    assertHas(labels, ['Rename', 'Share/Embed', 'Download', 'Copy', 'Cut', 'Tools', 'Properties', 'Delete'], 'the menu of a file');
    assert.ok(!labels.includes('Upload') && !labels.includes('Refresh'), `not the menu of the folder: ${labels.join(', ')}`);
    assert.equal(await treeItem(page, NOTES).getAttribute('aria-selected'), 'true');

    // The file list shows the file, selected: the page header acts on it
    await page.keyboard.press('Escape');
    assert.equal(await listed(page).count(), 1);
    assert.equal(await listedSelected(page).count(), 1);
    const download = page.getByRole('button', { name: 'Download', exact: true });
    await download.waitFor({ state: 'visible', timeout: 10000 });
    const [file] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), download.click()]);
    assert.equal(file.suggestedFilename(), NOTES);
    assert.deepEqual(errors, []);
});

test('the menu of the tree follows the item that is right clicked', async () => {
    const { page, errors } = await openDataset();

    // A photo sets the dataset thumbnail, a text file does not
    assert.ok((await menuOf(page, PHOTO)).includes('Set as Dataset Thumbnail'));
    await page.keyboard.press('Escape');
    const notes = await menuOf(page, NOTES);
    assert.ok(!notes.includes('Set as Dataset Thumbnail'), `the menu of the text file: ${notes.join(', ')}`);
    assert.equal(await treeItem(page, NOTES).getAttribute('aria-selected'), 'true');
    assert.equal(await treeItem(page, PHOTO).getAttribute('aria-selected'), 'false');
    await page.keyboard.press('Escape');

    // A folder: its own actions, and the list shows what it holds with nothing selected
    const folder = await menuOf(page, FOLDER);
    assertHas(folder, ['Open', 'Rename', 'Share/Embed', 'Download', 'Copy', 'Cut', 'Properties', 'Delete'], 'the menu of a folder');
    await page.keyboard.press('Escape');
    assert.equal(await listed(page).count(), 2);
    assert.equal(await listedSelected(page).count(), 0);

    // The dataset itself is not a file: nothing to copy, cut or delete
    const root = await menuOf(page, DS);
    assert.ok(!root.includes('Delete') && !root.includes('Cut') && !root.includes('Copy'), `the menu of the dataset: ${root.join(', ')}`);
    assert.deepEqual(errors, []);
});

test('a right click outside the selection of the tree selects the item clicked, one inside it keeps the selection', async () => {
    const { page, errors } = await openDataset();
    await treeItem(page, PHOTO).click();
    await treeItem(page, NOTES).click({ modifiers: ['ControlOrMeta'] });

    // Inside the selection: the menu of both files (no Rename, which takes one)
    const both = await menuOf(page, PHOTO);
    assert.ok(both.includes('Delete') && !both.includes('Rename'), `the menu of two files: ${both.join(', ')}`);
    assert.equal(await treeItem(page, NOTES).getAttribute('aria-selected'), 'true');
    await page.keyboard.press('Escape');

    // Outside it: that item alone
    const other = await menuOf(page, 'README.md');
    assert.ok(other.includes('Rename'), `the menu of one file: ${other.join(', ')}`);
    assert.equal(await treeItem(page, 'README.md').getAttribute('aria-selected'), 'true');
    assert.equal(await treeItem(page, PHOTO).getAttribute('aria-selected'), 'false');
    assert.equal(await treeItem(page, NOTES).getAttribute('aria-selected'), 'false');
    assert.deepEqual(errors, []);
});

/** Picks `label` in the context menu that is open. */
const pick = (page, label) => page.locator('.p-contextmenu .p-contextmenu-item-link').filter({ hasText: label }).first().click();
const listedNames = async page => (await page.locator('#explorer .thumbnail .thumbnail-label').allTextContents()).map(s => s.trim()).sort();
const upload = (dest, source) => registry.call('POST', `/orgs/${USER}/ds/${DS}/obj`, form({ path: dest, file: new Blob([fs.readFileSync(source)]) }));

test('the actions of the tree menu run on the item of the tree, and the list follows what is left', async () => {
    // A folder of its own, which this test deletes
    const text = path.join(DATA, 'README.md');
    await upload('scratch/a.md', text);
    await upload('scratch/b.md', text);
    const { page, errors } = await openDataset();
    await treeItem(page, 'scratch').locator('.fa-caret-right').click();
    await treeItem(page, 'a.md').waitFor({ state: 'visible', timeout: 15000 });

    // Properties of a folder: the folder's, while the list keeps showing what it holds
    await menuOf(page, 'scratch');
    await pick(page, 'Properties');
    const properties = page.locator('.p-dialog').filter({ hasText: 'Properties' });
    await properties.waitFor({ state: 'visible', timeout: 10000 });
    assert.match(await properties.textContent(), /Folder/);
    assert.match(await properties.textContent(), /scratch/);
    assert.deepEqual(await listedNames(page), ['a.md', 'b.md']);
    await page.keyboard.press('Escape');
    await properties.waitFor({ state: 'hidden', timeout: 10000 });

    // Delete of a file picked in the tree: the list showed it alone, and shows the rest of its folder afterwards
    await menuOf(page, 'a.md');
    await pick(page, 'Delete');
    await page.locator('.p-dialog button').filter({ hasText: /^Delete$/ }).click();
    await treeItem(page, 'a.md').waitFor({ state: 'detached', timeout: 15000 });
    await page.waitForFunction(() => document.querySelectorAll('#explorer .thumbnail').length === 1, null, { timeout: 10000 });
    assert.deepEqual(await listedNames(page), ['b.md']);
    assert.equal(await page.locator('.folder-empty').count(), 0, 'not the empty state of a folder that has a file');

    // Delete of the folder on show: the list shows the folder that held it
    await menuOf(page, 'scratch');
    await pick(page, 'Delete');
    await page.locator('.p-dialog button').filter({ hasText: /^Delete$/ }).click();
    await treeItem(page, 'scratch').waitFor({ state: 'detached', timeout: 15000 });
    await page.waitForFunction(() => document.querySelectorAll('#explorer .thumbnail').length === 2, null, { timeout: 10000 });
    assert.deepEqual(await listedNames(page), ['README.md', FOLDER].sort());
    assert.deepEqual(errors, []);
});

test('Download of the dataset itself in the tree asks for the whole dataset', async () => {
    const { page, errors } = await openDataset();
    await menuOf(page, DS);
    await pick(page, 'Download');
    const question = page.locator('.p-dialog').filter({ hasText: 'as a ZIP?' });
    await question.waitFor({ state: 'visible', timeout: 10000 });
    assert.match(await question.textContent(), /Download all \d+ items \(.+\) as a ZIP\?/);
    await question.locator('button').filter({ hasText: /^Cancel$/ }).click();
    assert.deepEqual(errors, []);
});
