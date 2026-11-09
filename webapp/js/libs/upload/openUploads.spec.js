/** The rule that matches a file selected again to an open upload (FR-UPL-04, §7.1): source name, size, last-modified. */
import { describe, it, expect } from 'vitest';
import { matchesOpenUpload, matchOpenUploads, storedPercent } from './openUploads';

const open = (extra = {}) => ({
    fileId: 'id-1', path: 'ortho/Lamb (2).tif', totalFileSize: 2580000000, totalChunks: 40,
    sourceFileName: 'Lamb.tif', lastModified: 1731000000123, received: [0, 1, 2, 3], ...extra
});
const file = (extra = {}) => ({ name: 'Lamb.tif', size: 2580000000, lastModified: 1731000000123, ...extra });

describe('matchesOpenUpload', () => {
    it('matches by the source file name, not the stored path (Keep both renamed it)', () => {
        expect(matchesOpenUpload(open(), file())).toBe(true);
    });

    it.each([
        ['another name', { name: 'Other.tif' }],
        ['another size', { size: 2580000001 }],
        ['another last-modified time', { lastModified: 1731000000124 }]
    ])('does not match %s', (_label, change) => {
        expect(matchesOpenUpload(open(), file(change))).toBe(false);
    });

    it('does not match an upload that stored no source name or time (made before they were kept)', () => {
        expect(matchesOpenUpload(open({ sourceFileName: null, lastModified: null }), file())).toBe(false);
    });
});

describe('matchOpenUploads', () => {
    it('splits the selection into the files that resume an upload and the rest, each upload used once', () => {
        const a = open();
        const b = open({ fileId: 'id-2', sourceFileName: 'B.tif', totalFileSize: 10 });
        const sameTwice = [file(), file()];
        const other = file({ name: 'C.tif' });

        const { resumed, rest } = matchOpenUploads([a, b], [...sameTwice, other]);

        expect(resumed.map(r => r.open.fileId)).toEqual(['id-1']);
        expect(resumed[0].file).toBe(sameTwice[0]);
        expect(rest).toEqual([sameTwice[1], other]);
    });
});

describe('storedPercent', () => {
    it('is the whole percentage of the chunks that the server stores', () => {
        expect(storedPercent(open())).toBe(10);
        expect(storedPercent(open({ received: [], totalChunks: 3 }))).toBe(0);
        expect(storedPercent(open({ received: [0, 1], totalChunks: 3 }))).toBe(66);
    });
});
