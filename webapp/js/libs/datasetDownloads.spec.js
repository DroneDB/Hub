import { describe, it, expect, vi, beforeEach } from 'vitest';

const flags = vi.hoisted(() => ({ anonymousBulkDisabled: false, signedIn: false }));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: { isLoggedIn: () => flags.signedIn, features: { get: () => flags.anonymousBulkDisabled, value: () => null } } }));
vi.mock('@/libs/notify', () => ({ notify: { info: vi.fn(), error: vi.fn() } }));
const { notify } = await import('@/libs/notify');
const { shouldDownloadAsync, downloadFromDataset, notifyDownloadError, needsConfirm, confirmMessage, isBulkBlocked, isArchiveDownload } = await import('./datasetDownloads');
const { describeSelection } = await import('./dataset/selection');

const ddb = (await import('ddb')).default;
const file = size => ({ entry: { size, type: ddb.entry.type.GENERIC } });
const folder = () => ({ entry: { type: ddb.entry.type.DIRECTORY } });

describe('shouldDownloadAsync', () => {
    it('archives the whole dataset and selections of unknown size', () => {
        expect(shouldDownloadAsync([], 100)).toBe(true);
        expect(shouldDownloadAsync([file(1), { entry: {} }], 100)).toBe(true);
        expect(shouldDownloadAsync([folder()], 100)).toBe(true);
        expect(shouldDownloadAsync([{ entry: { size: 500 } }], 100)).toBe(true);
    });

    it('streams one file whatever its size, so it is not wrapped in a ZIP', () => {
        expect(shouldDownloadAsync([file(1e12)], 100)).toBe(false);
    });

    it('streams small selections and anything when no threshold is configured', () => {
        expect(shouldDownloadAsync([file(10), file(20)], 100)).toBe(false);
        expect(shouldDownloadAsync([file(1e12), file(1)], 0)).toBe(false);
        expect(shouldDownloadAsync([file(60), file(60)], 100)).toBe(true);
    });
});

describe('downloadFromDataset', () => {
    beforeEach(() => vi.clearAllMocks());

    it('streams for anonymous users even over the threshold', async () => {
        const dataset = { downloadWithCheck: vi.fn(() => Promise.resolve()) };
        await downloadFromDataset({ dataset, paths: ['a'], files: [file(500)], signedIn: false, thresholdBytes: 100, runTask: vi.fn() });
        expect(dataset.downloadWithCheck).toHaveBeenCalledWith(['a']);
    });

    it('runs the archive task for signed-in users over the threshold', async () => {
        const dataset = { downloadWithCheck: vi.fn(), taskResultUrl: id => `/r/${id}` };
        const runTask = vi.fn(() => Promise.resolve({ taskId: 't1' }));
        await downloadFromDataset({ dataset, paths: ['a', 'b'], files: [file(300), file(300)], signedIn: true, thresholdBytes: 100, runTask });
        expect(runTask).toHaveBeenCalledWith(dataset, 'bulk-download', { params: { paths: ['a', 'b'] }, notify: false });
        expect(dataset.downloadWithCheck).not.toHaveBeenCalled();
        expect(notify.info).toHaveBeenCalled();
    });

    it('streams one large file for signed-in users instead of archiving it', async () => {
        const dataset = { downloadWithCheck: vi.fn(() => Promise.resolve()) };
        const runTask = vi.fn();
        await downloadFromDataset({ dataset, paths: ['m.tar.gz'], files: [file(500)], signedIn: true, thresholdBytes: 100, runTask });
        expect(dataset.downloadWithCheck).toHaveBeenCalledWith(['m.tar.gz']);
        expect(runTask).not.toHaveBeenCalled();
        expect(notify.info).not.toHaveBeenCalled();
    });
});

describe('notifyDownloadError', () => {
    it('explains the download limit', () => {
        notifyDownloadError({ status: 429, message: 'x' });
        expect(notify.error).toHaveBeenCalledWith(expect.stringContaining('Download limit reached'), { summary: 'Download Limit' });
    });
});

// FR-EXP-27: one set of rules for the header and the menus
describe('the download question', () => {
    const named = (name, size, type = ddb.entry.type.IMAGE) => ({ label: name, entry: { path: name, size, type } });
    const MB = 1048576;

    it('is asked for several items, a folder or the whole dataset, never for one file', () => {
        expect(needsConfirm([named('a.jpg', 1)])).toBe(false);
        expect(needsConfirm([named('a.jpg', 1), named('b.jpg', 1)])).toBe(true);
        expect(needsConfirm([folder()])).toBe(true);
        expect(needsConfirm([])).toBe(true);
        // An item without its entry is counted as an archive, the cautious side
        expect(isArchiveDownload([{ path: 'x' }])).toBe(true);
    });

    it('says the count and the total size, as a ZIP', () => {
        expect(confirmMessage(describeSelection([named('a.jpg', 3 * MB), named('b.jpg', 6.3 * MB)]))).toBe('Download 2 files (9.3 MB) as a ZIP?');
    });

    it('says the whole dataset with its count and size, from its root entry', () => {
        const none = describeSelection([]);
        // The root entry counts every entry, folders included: they are items, not files
        expect(confirmMessage(none, { count: 16, size: 42050000 })).toBe('Download all 16 items (40.1 MB) as a ZIP?');
        expect(confirmMessage(none, { count: 1, size: 1024 })).toBe('Download all 1 item (1 KB) as a ZIP?');
        expect(confirmMessage(none, { size: 1024 })).toBe('Download the entire dataset (1 KB) as a ZIP?');
        expect(confirmMessage(none)).toBe('Download the entire dataset as a ZIP?');
    });

    it('says that a folder goes with everything inside it, with "Calculating size…" until its size is read', () => {
        const newdir = describeSelection([{ label: 'newdir', entry: { path: 'newdir', type: ddb.entry.type.DIRECTORY, size: 0 } }]);
        expect(confirmMessage(newdir)).toBe('Download the folder <strong>newdir</strong> and everything inside it as a ZIP? Calculating size…');
        expect(confirmMessage(newdir, {}, { size: 12 * MB })).toBe('Download the folder <strong>newdir</strong> and everything inside it (12 MB) as a ZIP?');
        expect(confirmMessage(newdir, {}, { size: 0 })).toBe('Download the folder <strong>newdir</strong> and everything inside it (0 B) as a ZIP?');
        const mixed = describeSelection([folder(), named('a.jpg', MB)]);
        expect(confirmMessage(mixed)).toBe('Download 2 items as a ZIP? A folder goes with everything inside it. Calculating size…');
        expect(confirmMessage(mixed, {}, { size: 2.5 * MB })).toBe('Download 2 items (2.5 MB) as a ZIP? A folder goes with everything inside it.');
        expect(confirmMessage(mixed, {}, { failed: true })).toBe('Download 2 items as a ZIP? A folder goes with everything inside it. The size could not be calculated.');
        expect(confirmMessage(describeSelection([{ label: '<b>x</b>', entry: { type: ddb.entry.type.DIRECTORY, size: 0 } }]))).toContain('&lt;b&gt;x&lt;/b&gt;');
    });

    it('is refused to an anonymous visitor only for an archive, and only when the Registry says so', () => {
        flags.anonymousBulkDisabled = true;
        expect(isBulkBlocked([named('a', 1), named('b', 1)], { signedIn: false })).toBe(true);
        expect(isBulkBlocked([], { signedIn: false })).toBe(true);
        expect(isBulkBlocked([named('a', 1)], { signedIn: false })).toBe(false);
        expect(isBulkBlocked([named('a', 1), named('b', 1)], { signedIn: true })).toBe(false);
        flags.anonymousBulkDisabled = false;
        expect(isBulkBlocked([], { signedIn: false })).toBe(false);
    });
});
