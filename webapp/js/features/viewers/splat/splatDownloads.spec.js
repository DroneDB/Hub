import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { taskToolOffered } from '@/libs/tasks/taskTools';
import { notify } from '@/libs/notify';
import ddb from 'ddb';
import { SPLAT_DOWNLOADS, splatDownloadsOf, runSplatDownload, startFileDownload, canExportSpz } from './splatDownloads';
import { buildStandardContextMenu, splatDownloadItems } from '@/libs/contextMenuItems';

const LOD = { role: 'gsplat.lod', url: 'https://registry.example/orgs/o/ds/d/build/abc/gsplat/model.rad?x=1', mediaType: 'application/octet-stream' };
const SPZ = { role: 'gsplat.spz', url: 'https://registry.example/orgs/o/ds/d/build/abc/gsplat/model.spz', mediaType: 'application/octet-stream' };
const BOUNDS = { role: 'gsplat.bounds', url: 'https://registry.example/orgs/o/ds/d/build/abc/gsplat/bounds.json' };

const NOT_BUILT = { path: 'flights/site.ply', type: ddb.entry.type.GAUSSIAN_SPLAT };
const BUILT = { path: 'flights/site.ply', type: ddb.entry.type.GAUSSIAN_SPLAT, artifacts: [LOD, BOUNDS] };
const LEGACY = { path: 'flights/site.spz', type: ddb.entry.type.GAUSSIAN_SPLAT, artifacts: [SPZ] };

vi.mock('@/libs/notify', () => ({ notify: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/libs/tasks/taskTools', () => ({ taskToolOffered: vi.fn(() => true) }));

const EXPORTABLE = { canExport: true };
const ids = list => list.map(d => d.id);

describe('the downloads of a splat by state', () => {
    it('offers the original alone for a splat that was never built', () => {
        expect(ids(splatDownloadsOf(NOT_BUILT, EXPORTABLE))).toEqual(['original']);
        expect(ids(splatDownloadsOf({ path: 'a.ply', artifacts: [] }, EXPORTABLE))).toEqual(['original']);
    });

    it('offers the original, the level-of-detail .rad and the .spz for other tools for a built splat', () => {
        const list = splatDownloadsOf(BUILT, EXPORTABLE);
        expect(ids(list)).toEqual(['original', 'lod', 'spzExport']);
        expect(list.map(d => d.label)).toEqual(['Download original', 'Download level-of-detail (.rad)', 'Download .spz (for other tools)']);
        expect(list[1]).toMatchObject({ kind: 'artifact', role: 'gsplat.lod', filename: 'site.rad' });
        expect(list[2]).toMatchObject({ kind: 'export', role: 'gsplat.export', toolId: 'splat-spz-export', filename: 'site.spz' });
    });

    it('does not offer the .spz for other tools unless the server has the task', () => {
        expect(ids(splatDownloadsOf(BUILT))).toEqual(['original', 'lod']);
        expect(ids(splatDownloadsOf(BUILT, { canExport: false }))).toEqual(['original', 'lod']);
    });

    it('offers the original and the .spz for a splat whose build predates the level of detail, which cannot be exported', () => {
        const list = splatDownloadsOf(LEGACY, EXPORTABLE);
        expect(ids(list)).toEqual(['original', 'spz']);
        expect(list[1]).toMatchObject({ label: 'Download .spz', kind: 'artifact', role: 'gsplat.spz', filename: 'site.spz' });
    });

    it('never offers the bounds file, which is no download', () => {
        expect(ids(splatDownloadsOf({ path: 'a.ply', artifacts: [BOUNDS] }, EXPORTABLE))).toEqual(['original']);
    });

    it('offers no artifact while a build runs or the entry says its build is not complete', () => {
        expect(ids(splatDownloadsOf(BUILT, { building: true, canExport: true }))).toEqual(['original']);
        expect(ids(splatDownloadsOf({ ...BUILT, buildStatus: 'building' }, EXPORTABLE))).toEqual(['original']);
        expect(ids(splatDownloadsOf({ ...BUILT, buildStatus: 'failed' }, EXPORTABLE))).toEqual(['original']);
    });

    it('offers nothing for no entry', () => {
        expect(splatDownloadsOf(null)).toEqual([]);
        expect(splatDownloadsOf(undefined)).toEqual([]);
    });

    it('is built from one list, so another download is one more row', () => {
        expect(SPLAT_DOWNLOADS.map(d => d.id)).toEqual(['original', 'lod', 'spz', 'spzExport']);
        expect(SPLAT_DOWNLOADS.filter(d => d.kind !== 'original').every(d => d.role && d.extension)).toBe(true);
        expect(SPLAT_DOWNLOADS.filter(d => d.kind === 'export').every(d => d.toolId)).toBe(true);
    });
});

describe('which source formats can be exported as .spz', () => {
    it.each(['a.ply', 'a.splat', 'a.spz', 'dir/a.compressed.ply', 'A.PLY'])('exports %s', path => {
        expect(canExportSpz(path)).toBe(true);
    });

    it.each(['a.ksplat', 'a.sog', 'a.rad', 'dir/A.KSPLAT'])('does not export %s', path => {
        expect(canExportSpz(path)).toBe(false);
    });

    it('hides the export of a built splat of a format that is not converted', () => {
        for (const path of ['flights/site.ksplat', 'flights/site.sog', 'flights/site.rad']) {
            expect(ids(splatDownloadsOf({ ...BUILT, path }, EXPORTABLE))).toEqual(['original', 'lod']);
        }
        expect(ids(splatDownloadsOf({ ...BUILT, path: 'flights/site.splat' }, EXPORTABLE))).toEqual(['original', 'lod', 'spzExport']);
    });
});

describe('running a download', () => {
    const entry = { path: 'flights/site.ply' };
    let clicked;
    const dataset = {
        buildArtifactUrl: vi.fn((path, role) => `/api/build-artifact?path=${path}&role=${role}`),
        checkDownloadSlot: vi.fn(async () => {})
    };
    const rows = () => Object.fromEntries(splatDownloadsOf(BUILT, EXPORTABLE).map(d => [d.id, d]));

    beforeEach(() => {
        clicked = [];
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() { clicked.push([this.getAttribute('href'), this.download]); });
        dataset.buildArtifactUrl.mockClear();
        dataset.checkDownloadSlot.mockClear();
        notify.info.mockClear();
    });
    afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); });

    it('hands the original to the caller, which owns that flow', async () => {
        const downloadOriginal = vi.fn(() => 'started');
        expect(await runSplatDownload(rows().original, { downloadOriginal })).toBe('started');
        expect(downloadOriginal).toHaveBeenCalledOnce();
    });

    it('saves an artifact from the build-artifact endpoint by role, after the download-limit check, and leaves no link behind', async () => {
        const downloadOriginal = vi.fn();
        await runSplatDownload(rows().lod, { downloadOriginal, dataset, entry, runTask: vi.fn() });
        expect(downloadOriginal).not.toHaveBeenCalled();
        expect(dataset.buildArtifactUrl).toHaveBeenCalledWith('flights/site.ply', 'gsplat.lod');
        expect(dataset.checkDownloadSlot).toHaveBeenCalledWith('/api/build-artifact?path=flights/site.ply&role=gsplat.lod');
        expect(clicked).toEqual([['/api/build-artifact?path=flights/site.ply&role=gsplat.lod', 'site.rad']]);
        expect(document.querySelector('a')).toBeNull();
        startFileDownload('/x', 'y.bin');
        expect(clicked.at(-1)).toEqual(['/x', 'y.bin']);
    });

    it('does not start the download when the download limit is reached', async () => {
        dataset.checkDownloadSlot.mockRejectedValueOnce(Object.assign(new Error('limit'), { status: 429 }));
        await expect(runSplatDownload(rows().lod, { downloadOriginal: vi.fn(), dataset, entry, runTask: vi.fn() })).rejects.toMatchObject({ status: 429 });
        expect(clicked).toEqual([]);
    });

    it('runs the export task again each time and downloads the file when it is done', async () => {
        const order = [];
        const runTask = vi.fn(async () => { order.push('task'); return { taskId: 't1' }; });
        dataset.checkDownloadSlot.mockImplementationOnce(async () => { order.push('slot'); });
        await runSplatDownload(rows().spzExport, { downloadOriginal: vi.fn(), dataset, entry, runTask });
        expect(runTask).toHaveBeenCalledWith(dataset, 'splat-spz-export', { path: 'flights/site.ply', params: {}, force: true, notify: false });
        expect(order).toEqual(['task', 'slot']);
        expect(notify.info).toHaveBeenCalledOnce();
        expect(clicked).toEqual([['/api/build-artifact?path=flights/site.ply&role=gsplat.export', 'site.spz']]);
    });

    it('downloads nothing when the export task fails', async () => {
        const runTask = vi.fn(async () => { throw new Error('is not built yet'); });
        await expect(runSplatDownload(rows().spzExport, { downloadOriginal: vi.fn(), dataset, entry, runTask })).rejects.toThrow('is not built yet');
        expect(dataset.checkDownloadSlot).not.toHaveBeenCalled();
        expect(clicked).toEqual([]);
    });
});

describe('the context menu', () => {
    const file = entry => ({ entry, path: entry.path });
    const context = (files, emit = vi.fn()) => ({ getSelectedEntries: () => files, canWrite: true, dataset: null, emit });
    const visible = items => items.filter(i => i.isVisible()).map(i => i.label);

    it('shows the downloads of a single selected splat by its state', () => {
        expect(visible(splatDownloadItems(context([file(NOT_BUILT)])))).toEqual(['Download original']);
        expect(visible(splatDownloadItems(context([file(BUILT)])))).toEqual(['Download original', 'Download level-of-detail (.rad)', 'Download .spz (for other tools)']);
        expect(visible(splatDownloadItems(context([file(LEGACY)])))).toEqual(['Download original', 'Download .spz']);
    });

    it('hides the .spz for other tools for a source that is not converted and when the server lacks the task', () => {
        expect(visible(splatDownloadItems(context([file({ ...BUILT, path: 'flights/site.ksplat' })])))).toEqual(['Download original', 'Download level-of-detail (.rad)']);
        taskToolOffered.mockReturnValue(false);
        try {
            expect(visible(splatDownloadItems(context([file(BUILT)])))).toEqual(['Download original', 'Download level-of-detail (.rad)']);
        } finally {
            taskToolOffered.mockReturnValue(true);
        }
    });

    it('shows nothing for another type or for a selection of several', () => {
        expect(visible(splatDownloadItems(context([file({ ...BUILT, type: 4 })])))).toEqual([]);
        expect(visible(splatDownloadItems(context([file(BUILT), file(BUILT)])))).toEqual([]);
        expect(visible(splatDownloadItems(context([])))).toEqual([]);
    });

    it('downloads the original through the browser flow and the others through the page', () => {
        const emit = vi.fn();
        const selected = file(BUILT);
        const [original, lod, , spzExport] = splatDownloadItems(context([selected], emit));
        original.click();
        expect(emit).toHaveBeenLastCalledWith('downloadItems', [selected]);
        lod.click();
        expect(emit).toHaveBeenLastCalledWith('downloadSplat', selected, 'lod');
        spzExport.click();
        expect(emit).toHaveBeenLastCalledWith('downloadSplat', selected, 'spzExport');
        expect(emit).toHaveBeenCalledTimes(3);
    });

    it('is part of the standard menu, under Tools', () => {
        const tools = buildStandardContextMenu(context([file(BUILT)])).find(i => i.label === 'Tools');
        const labels = tools.items.filter(i => i.label?.startsWith('Download') && i.isVisible()).map(i => i.label);
        expect(labels).toContain('Download level-of-detail (.rad)');
        expect(labels).toContain('Download .spz (for other tools)');
    });
});
