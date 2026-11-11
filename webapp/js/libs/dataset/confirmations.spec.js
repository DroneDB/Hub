/**
 * The delete confirmation of explorer files (FR-EXP-08, D-011): the title, the items, the folder
 * warning and the total size ("Calculating size…" until a folder's size has been read).
 */
import { describe, it, expect } from 'vitest';
import ddb from 'ddb';
import { deleteFilesConfirmation } from './confirmations';

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
