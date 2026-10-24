import { describe, it, expect } from 'vitest';
import ddb from 'ddb';
import { sortFileRows, nextSort } from './fileSort';

const T = ddb.entry.type;
const row = (label, type, extra = {}) => ({ label, entry: { type, path: label, ...extra } });

describe('sortFileRows', () => {
    const files = [
        row('b.jpg', T.IMAGE, { size: 10, mtime: 5 }),
        row('Z', T.DIRECTORY),
        row('a.tif', T.GEORASTER, { size: 30, mtime: 1 }),
        row('A', T.DIRECTORY)
    ];

    it('lists folders first, then orders by the column', () => {
        expect(sortFileRows(files, 'name', 'asc').map(f => f.label)).toEqual(['A', 'Z', 'a.tif', 'b.jpg']);
        expect(sortFileRows(files, 'size', 'asc').map(f => f.label).slice(2)).toEqual(['b.jpg', 'a.tif']);
        expect(sortFileRows(files, 'modified', 'asc').map(f => f.label).slice(2)).toEqual(['a.tif', 'b.jpg']);
    });

    it('reverses the files but keeps the folders on top', () => {
        expect(sortFileRows(files, 'name', 'desc').map(f => f.label)).toEqual(['Z', 'A', 'b.jpg', 'a.tif']);
    });

    it('does not change the list it is given', () => {
        const copy = [...files];
        sortFileRows(files, 'size', 'desc');
        expect(files).toEqual(copy);
    });
});

describe('nextSort', () => {
    it('flips the direction of the sorted column and starts another one ascending', () => {
        expect(nextSort('name', 'asc', 'name')).toEqual({ column: 'name', direction: 'desc' });
        expect(nextSort('name', 'desc', 'name')).toEqual({ column: 'name', direction: 'asc' });
        expect(nextSort('name', 'desc', 'size')).toEqual({ column: 'size', direction: 'asc' });
    });
});
