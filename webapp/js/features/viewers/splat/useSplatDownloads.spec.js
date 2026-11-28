import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSplatDownloads } from './useSplatDownloads';
import { splatDownloadsOf } from './splatDownloads';
import { notify } from '@/libs/notify';

const runHeavyTask = vi.fn();
vi.mock('@/composables/useHeavyTask', () => ({ useHeavyTask: () => ({ runHeavyTask }) }));
vi.mock('@/libs/notify', () => ({ notify: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const entry = { path: 'site.ply', type: 15, artifacts: [{ role: 'gsplat.lod', url: '/x' }] };
const dataset = { buildArtifactUrl: vi.fn((p, r) => `/a?p=${p}&r=${r}`), checkDownloadSlot: vi.fn(async () => {}) };
const rows = () => Object.fromEntries(splatDownloadsOf(entry, { canExport: true }).map(d => [d.id, d]));

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});

describe('useSplatDownloads', () => {
    it('runs the export with the page task runner', async () => {
        runHeavyTask.mockResolvedValue({ taskId: 't' });
        const { download } = useSplatDownloads(() => dataset);
        await download(rows().spzExport, entry, vi.fn());
        expect(runHeavyTask).toHaveBeenCalledWith(dataset, 'splat-spz-export', expect.objectContaining({ path: 'site.ply', force: true }));
        expect(notify.error).not.toHaveBeenCalled();
    });

    it('does not start a second conversion of the same splat while the first runs, and allows one after it ends', async () => {
        let finish;
        runHeavyTask.mockImplementationOnce(() => new Promise(resolve => { finish = () => resolve({ taskId: 't' }); }));
        const { download } = useSplatDownloads(() => dataset);
        const first = download(rows().spzExport, entry, vi.fn());
        await download(rows().spzExport, entry, vi.fn());
        expect(runHeavyTask).toHaveBeenCalledOnce();
        expect(notify.warn).toHaveBeenCalledOnce();
        finish();
        await first;
        runHeavyTask.mockResolvedValueOnce({ taskId: 't2' });
        await download(rows().spzExport, entry, vi.fn());
        expect(runHeavyTask).toHaveBeenCalledTimes(2);
    });

    it('shows a failed export and allows another try', async () => {
        runHeavyTask.mockRejectedValueOnce(new Error('is not built yet'));
        const { download } = useSplatDownloads(() => dataset);
        await download(rows().spzExport, entry, vi.fn());
        expect(notify.error).toHaveBeenCalledWith(expect.objectContaining({ message: 'is not built yet' }), expect.anything());
        runHeavyTask.mockResolvedValueOnce({ taskId: 't' });
        await download(rows().spzExport, entry, vi.fn());
        expect(runHeavyTask).toHaveBeenCalledTimes(2);
    });

    it('shows the failure of the original download too', async () => {
        const { download } = useSplatDownloads(() => dataset);
        await download(rows().original, entry, async () => { throw Object.assign(new Error('limit'), { status: 429 }); });
        expect(notify.error).toHaveBeenCalled();
    });

    it('downloads an artifact without a task', async () => {
        const { download } = useSplatDownloads(() => dataset);
        await download(rows().lod, entry, vi.fn());
        expect(runHeavyTask).not.toHaveBeenCalled();
        expect(dataset.checkDownloadSlot).toHaveBeenCalledWith('/a?p=site.ply&r=gsplat.lod');
    });
});
