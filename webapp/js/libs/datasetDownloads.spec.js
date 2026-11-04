import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/libs/notify', () => ({ notify: { info: vi.fn(), error: vi.fn() } }));
const { notify } = await import('@/libs/notify');
const { shouldDownloadAsync, downloadFromDataset, notifyDownloadError } = await import('./datasetDownloads');

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
