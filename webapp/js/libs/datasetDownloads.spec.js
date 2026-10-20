import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/libs/notify', () => ({ notify: { info: vi.fn(), error: vi.fn() } }));
const { notify } = await import('@/libs/notify');
const { shouldDownloadAsync, downloadFromDataset, notifyDownloadError } = await import('./datasetDownloads');

const file = size => ({ entry: { size } });

describe('shouldDownloadAsync', () => {
    it('archives the whole dataset and selections of unknown size', () => {
        expect(shouldDownloadAsync([], 100)).toBe(true);
        expect(shouldDownloadAsync([file(1), { entry: {} }], 100)).toBe(true);
    });

    it('streams small selections and anything when no threshold is configured', () => {
        expect(shouldDownloadAsync([file(10), file(20)], 100)).toBe(false);
        expect(shouldDownloadAsync([file(1e12)], 0)).toBe(false);
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
        await downloadFromDataset({ dataset, paths: ['a'], files: [file(500)], signedIn: true, thresholdBytes: 100, runTask });
        expect(runTask).toHaveBeenCalledWith(dataset, 'bulk-download', { params: { paths: ['a'] }, notify: false });
        expect(dataset.downloadWithCheck).not.toHaveBeenCalled();
        expect(notify.info).toHaveBeenCalled();
    });
});

describe('notifyDownloadError', () => {
    it('explains the download limit', () => {
        notifyDownloadError({ status: 429, message: 'x' });
        expect(notify.error).toHaveBeenCalledWith(expect.stringContaining('Download limit reached'), { summary: 'Download Limit' });
    });
});
