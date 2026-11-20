/**
 * The summary of a selection (FR-EXP-32) and the size of a selection with folders (FR-EXP-08).
 * The expected texts are written out, not computed by the code under test.
 */
import { describe, it, expect, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import ddb from 'ddb';
import { describeSelection, selectionSize, LISTED_NAMES, CALCULATING, SEARCH_CONCURRENCY } from './selection';

const T = ddb.entry.type;
const item = (path, type, size = 0) => ({ path: `ddb://h/o/d/${path}`, label: path.split('/').pop(), entry: { path, type, size } });
const MB = 1048576;

describe('describeSelection', () => {
    it('counts the items, adds the sizes of the files and names the types', () => {
        const s = describeSelection([item('a.jpg', T.GEOIMAGE, 3 * MB), item('b.jpg', T.GEOIMAGE, 3 * MB), item('c.tif', T.GEORASTER, 3 * MB)]);
        expect(s).toMatchObject({ count: 3, files: 3, folders: 0, hasFolder: false, size: 9 * MB, sizeText: '9 MB', countText: '3 items' });
        expect(s.summary).toBe('3 items selected — 9 MB');
        expect(s.types).toEqual([{ name: 'GeoImage', count: 2 }, { name: 'GeoRaster', count: 1 }]);
        expect(s.typesText).toBe('GeoImage (2), GeoRaster (1)');
        expect(s.typesSummary).toBe('Multiple types');
    });

    it('says "All of type" when there is one type, and writes one item in the singular', () => {
        const s = describeSelection([item('a.jpg', T.IMAGE, 1536)]);
        expect(s.typesSummary).toBe('All of type Image');
        expect(s.summary).toBe('1 item selected — 1.5 KB');
    });

    it('does not count the size of a folder (its entry says 0) and says there is one', () => {
        const s = describeSelection([item('newdir', T.DIRECTORY, 0), item('a.jpg', T.IMAGE, 2048)]);
        expect(s).toMatchObject({ count: 2, files: 1, folders: 1, hasFolder: true, size: 2048, sizeText: '2 KB' });
        expect(s.typesText).toBe('Folder (1), Image (1)');
    });

    it('lists the first names and how many more', () => {
        const items = Array.from({ length: LISTED_NAMES + 3 }, (_, i) => item(`dir/f${i}.jpg`, T.IMAGE, 1));
        const s = describeSelection(items);
        expect(s.names).toEqual(['f0.jpg', 'f1.jpg', 'f2.jpg', 'f3.jpg', 'f4.jpg']);
        expect(s.more).toBe(3);
        expect(describeSelection(items.slice(0, 2))).toMatchObject({ names: ['f0.jpg', 'f1.jpg'], more: 0 });
    });

    it('describes an empty selection', () => {
        expect(describeSelection([])).toMatchObject({ count: 0, size: 0, summary: '0 items selected', typesSummary: '', names: [], more: 0 });
        expect(describeSelection()).toMatchObject({ count: 0 });
    });

    it('has a text for a size that is being read', () => {
        expect(CALCULATING).toBe('Calculating size…');
    });
});

describe('selectionSize', () => {
    const search = (byPath) => vi.fn(async (query, { path }) => byPath[path] ?? []);

    it('adds the files selected and one recursive search of each selected folder', async () => {
        const dataset = { search: search({ newdir: [{ path: 'newdir/a', type: T.IMAGE, size: 100 }, { path: 'newdir/sub', type: T.DIRECTORY, size: 0 }, { path: 'newdir/sub/b', type: T.IMAGE, size: 50 }] }) };
        const total = await selectionSize(dataset, [item('newdir', T.DIRECTORY), item('x.jpg', T.IMAGE, 1000)]);
        expect(total).toBe(1150);
        expect(dataset.search).toHaveBeenCalledTimes(1);
        expect(dataset.search).toHaveBeenCalledWith('*', { path: 'newdir', recursive: true, signal: undefined });
    });

    it('counts a file or a folder inside a selected folder once', async () => {
        const dataset = { search: search({ top: [{ path: 'top/in.jpg', type: T.IMAGE, size: 7 }, { path: 'top/in/deep.jpg', type: T.IMAGE, size: 3 }] }) };
        const total = await selectionSize(dataset, [item('top', T.DIRECTORY), item('top/in', T.DIRECTORY), item('top/in.jpg', T.IMAGE, 7), item('other.jpg', T.IMAGE, 5)]);
        expect(total).toBe(15);
        expect(dataset.search).toHaveBeenCalledTimes(1);
    });

    it('asks nothing when no folder is selected, and passes the signal on', async () => {
        const dataset = { search: search({}) };
        expect(await selectionSize(dataset, [item('a.jpg', T.IMAGE, 4), item('b.jpg', T.IMAGE, 6)])).toBe(10);
        expect(dataset.search).not.toHaveBeenCalled();
        const signal = new AbortController().signal;
        await selectionSize(dataset, [item('d', T.DIRECTORY)], { signal });
        expect(dataset.search).toHaveBeenCalledWith('*', { path: 'd', recursive: true, signal });
    });

    it('does not hide a failed search', async () => {
        const dataset = { search: vi.fn(() => Promise.reject(new Error('offline'))) };
        await expect(selectionSize(dataset, [item('d', T.DIRECTORY)])).rejects.toThrow('offline');
    });

    // Searches that the test ends one by one; `running` counts those not ended yet
    function deferredSearches() {
        const pending = [];
        let running = 0;
        let peak = 0;
        const search = vi.fn((query, { path }) => new Promise((resolve, reject) => {
            running++;
            peak = Math.max(peak, running);
            pending.push({
                path,
                end: () => { running--; resolve([{ path: `${path}/f.jpg`, type: T.IMAGE, size: 10 }, { path: `${path}/sub`, type: T.DIRECTORY, size: 0 }]); },
                fail: error => { running--; reject(error); }
            });
        }));
        return { search, pending, running: () => running, peak: () => peak };
    }
    const folders = n => Array.from({ length: n }, (_, i) => item(`d${i}`, T.DIRECTORY));

    it('runs at most 4 folder searches at a time, and searches every folder once', async () => {
        expect(SEARCH_CONCURRENCY).toBe(4);
        const s = deferredSearches();
        const total = selectionSize({ search: s.search }, [...folders(10), item('x.jpg', T.IMAGE, 1)]);
        await flushPromises();
        expect(s.running()).toBe(4);
        while (s.pending.length) {
            s.pending.shift().end();
            await flushPromises();
            expect(s.running()).toBeLessThanOrEqual(4);
        }
        expect(await total).toBe(101);
        expect(s.peak()).toBe(4);
        expect(s.search).toHaveBeenCalledTimes(10);
        expect(s.search.mock.calls.map(c => c[1].path)).toEqual(['d0', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8', 'd9']);
    });

    it('still counts a nested folder once, with the searches capped', async () => {
        const s = deferredSearches();
        const total = selectionSize({ search: s.search }, [...folders(6), item('d0/in', T.DIRECTORY), item('d1/in.jpg', T.IMAGE, 7)]);
        await flushPromises();
        while (s.pending.length) {
            s.pending.shift().end();
            await flushPromises();
        }
        expect(await total).toBe(60);
        expect(s.search).toHaveBeenCalledTimes(6);
    });

    it('starts no further search once aborted', async () => {
        const s = deferredSearches();
        const reading = new AbortController();
        const total = selectionSize({ search: s.search }, folders(10), { signal: reading.signal });
        const settled = total.catch(e => e);
        await flushPromises();
        expect(s.search).toHaveBeenCalledTimes(4);
        reading.abort();
        s.pending.shift().end();
        await flushPromises();
        expect(await settled).toBeInstanceOf(Error);
        while (s.pending.length) s.pending.shift().end();
        await flushPromises();
        expect(s.search).toHaveBeenCalledTimes(4);
    });

    it('starts no further search once one fails', async () => {
        const s = deferredSearches();
        const total = selectionSize({ search: s.search }, folders(10));
        const settled = total.catch(e => e);
        await flushPromises();
        s.pending.shift().fail(new Error('offline'));
        await flushPromises();
        expect((await settled).message).toBe('offline');
        while (s.pending.length) {
            s.pending.shift().end();
            await flushPromises();
        }
        expect(s.search).toHaveBeenCalledTimes(4);
    });
});
