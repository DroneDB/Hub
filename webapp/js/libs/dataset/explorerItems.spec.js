import { describe, it, expect } from 'vitest';
import ddb from 'ddb';
import { itemFor, sortItems, isInFolder, entriesInView } from './explorerItems';

const T = ddb.entry.type;
const dataset = { remoteUri: p => `ddb://h/o/d/${p}` };

describe('explorer items', () => {
    it('describe an entry for the file list and the tree', () => {
        const item = itemFor(dataset, { path: 'a/b.jpg', type: T.IMAGE }, { empty: true });
        expect(item).toMatchObject({ label: 'b.jpg', path: 'ddb://h/o/d/a/b.jpg', isExpandable: false, selected: false, empty: true });
    });

    it('sort folders first, then by name', () => {
        const items = [{ path: 'b', type: T.GENERIC }, { path: 'z', type: T.DIRECTORY }, { path: 'A', type: T.GENERIC }]
            .map(e => itemFor(dataset, e));
        expect(sortItems(items).map(i => i.label)).toEqual(['z', 'A', 'b']);
    });

    it('know which folder an entry is in', () => {
        expect(isInFolder('a.jpg', null)).toBe(true);
        expect(isInFolder('a.jpg', '')).toBe(true);
        expect(isInFolder('f/a.jpg', 'f')).toBe(true);
        expect(isInFolder('f/g/a.jpg', 'f')).toBe(false);
    });

    it('show an upload as the current folder sees it', () => {
        const up = [
            { path: 'f/a.jpg', type: T.IMAGE }, { path: 'f/sub/b.jpg', type: T.IMAGE, mtime: 5 },
            { path: 'f/sub/c.jpg', type: T.IMAGE }, { path: 'other/d.jpg', type: T.IMAGE }
        ];
        expect(entriesInView(up, 'f')).toEqual([up[0], { path: 'f/sub', type: T.DIRECTORY, size: 0, mtime: 5 }]);
        expect(entriesInView(up, null).map(e => e.path)).toEqual(['f', 'other']);
    });
});
