/**
 * The delete confirmation of explorer files: the title, the items, the folder
 * warning and the total size ("Calculating size…" until a folder's size has been read).
 */
import { describe, it, expect } from 'vitest';
import ddb from 'ddb';
import { deleteFilesConfirmation, confirmRescanEntries, CONFIRM_RESCAN } from './confirmations';

const T = ddb.entry.type;
const item = (path, type, size = 0) => ({ path: `ddb://h/o/d/${path}`, label: path, entry: { path, type, size } });

describe('deleteFilesConfirmation', () => {
    it('is titled "Delete 2 items" for x and newdir, lists them, warns about the folders, with Cancel / Delete', () => {
        const q = deleteFilesConfirmation([item('x', T.DIRECTORY), item('newdir', T.DIRECTORY)], { size: 4 * 1048576 });
        expect(q).toMatchObject({ title: 'Delete 2 items', confirmText: 'Delete', cancelText: 'Cancel', danger: true, requireText: '' });
        expect(q.message).toContain('<strong>x</strong> and everything inside it');
        expect(q.message).toContain('<strong>newdir</strong> and everything inside it');
        expect(q.message).toContain('Total size: 4 MB');
    });

    it('says "Calculating size…" while the size of a folder is being read, then the total', () => {
        const files = [item('newdir', T.DIRECTORY)];
        expect(deleteFilesConfirmation(files).message).toContain('Calculating size…');
        expect(deleteFilesConfirmation(files, { size: null }).message).not.toContain('Total size');
        expect(deleteFilesConfirmation(files, { size: 2048 }).message).toContain('Total size: 2 KB');
        expect(deleteFilesConfirmation(files, { size: 2048 }).message).not.toContain('Calculating');
    });

    it('says when the size could not be read, and still asks', () => {
        const q = deleteFilesConfirmation([item('newdir', T.DIRECTORY)], { failed: true });
        expect(q.message).toContain('The size could not be calculated.');
        expect(q).toMatchObject({ confirmText: 'Delete', danger: true });
    });

    it('gives the size of files at once, with no folder warning, and names one item in the title', () => {
        const q = deleteFilesConfirmation([item('a.jpg', T.IMAGE, 1536)]);
        expect(q.title).toBe('Delete file “a.jpg”');
        expect(q.message).toContain('Total size: 1.5 KB');
        expect(q.message).not.toContain('everything inside it');
        expect(deleteFilesConfirmation([item('newdir', T.DIRECTORY)], { size: 1 }).title).toBe('Delete folder “newdir”');
    });

    it('escapes the names', () => {
        const q = deleteFilesConfirmation([item('<img src=x>.jpg', T.IMAGE, 1)]);
        expect(q.message).toContain('&lt;img src=x&gt;.jpg');
        expect(q.message).not.toContain('<img');
    });
});

describe('confirmRescanEntries', () => {
    it('names the items, says the metadata is read again and the buildable files are rebuilt, and is not a danger question', () => {
        const q = confirmRescanEntries([item('a.jpg', T.IMAGE, 1), item('ortho.tif', T.GEORASTER, 2)]);
        expect(q).toMatchObject({ title: 'Rescan 2 items', confirmText: 'Rescan', danger: false });
        expect(q.message).toContain('<strong>a.jpg</strong>');
        expect(q.message).toContain('<strong>ortho.tif</strong>');
        expect(q.message).toContain('update their metadata');
        expect(q.message).toContain('rebuild the ones that can be built');
        expect(q.message).not.toContain('everything inside');
    });

    it('says that a folder is rescanned with everything inside it', () => {
        const q = confirmRescanEntries([item('newdir', T.DIRECTORY)]);
        expect(q.title).toBe('Rescan 1 item');
        expect(q.message).toContain('and everything inside the folder?');
        expect(confirmRescanEntries([item('a', T.DIRECTORY), item('b', T.DIRECTORY)]).message)
            .toContain('and everything inside the folders?');
    });

    it('lists the first names and counts the rest', () => {
        const q = confirmRescanEntries(Array.from({ length: 8 }, (_, i) => item(`f${i}.jpg`, T.IMAGE, 1)));
        expect(q.title).toBe('Rescan 8 items');
        expect(q.message).toContain('and 3 more');
        expect(q.message).not.toContain('f7.jpg');
    });

    it('escapes the names', () => {
        const q = confirmRescanEntries([item('<img src=x>.jpg', T.IMAGE, 1)]);
        expect(q.message).toContain('&lt;img src=x&gt;.jpg');
        expect(q.message).not.toContain('<img');
    });

    it('shares its wording with the rescan of the dataset', () => {
        const metadata = 'update their metadata (GPS coordinates, timestamps, thumbnails, etc.)';
        const overwritten = 'Existing metadata will be overwritten with newly extracted values';
        for (const message of [CONFIRM_RESCAN.message, confirmRescanEntries([item('a.jpg', T.IMAGE, 1)]).message]) {
            expect(message).toContain(metadata);
            expect(message).toContain(overwritten);
        }
        expect(CONFIRM_RESCAN.danger).toBe(true);
    });
});
