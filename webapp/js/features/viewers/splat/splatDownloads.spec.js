import { describe, it, expect, vi, afterEach } from 'vitest';
import ddb from 'ddb';
import { SPLAT_DOWNLOADS, splatDownloadsOf, runSplatDownload, startFileDownload } from './splatDownloads';
import { buildStandardContextMenu, splatDownloadItems } from '@/libs/contextMenuItems';

const LOD = { role: 'gsplat.lod', url: 'https://registry.example/orgs/o/ds/d/build/abc/gsplat/model.rad?x=1', mediaType: 'application/octet-stream' };
const SPZ = { role: 'gsplat.spz', url: 'https://registry.example/orgs/o/ds/d/build/abc/gsplat/model.spz', mediaType: 'application/octet-stream' };
const BOUNDS = { role: 'gsplat.bounds', url: 'https://registry.example/orgs/o/ds/d/build/abc/gsplat/bounds.json' };

const NOT_BUILT = { path: 'flights/site.ply', type: ddb.entry.type.GAUSSIAN_SPLAT };
const BUILT = { path: 'flights/site.ply', type: ddb.entry.type.GAUSSIAN_SPLAT, artifacts: [LOD, BOUNDS] };
const LEGACY = { path: 'flights/site.spz', type: ddb.entry.type.GAUSSIAN_SPLAT, artifacts: [SPZ] };

const ids = list => list.map(d => d.id);

describe('the downloads of a splat by state', () => {
    it('offers the original alone for a splat that was never built', () => {
        expect(ids(splatDownloadsOf(NOT_BUILT))).toEqual(['original']);
        expect(ids(splatDownloadsOf({ path: 'a.ply', artifacts: [] }))).toEqual(['original']);
    });

    it('offers the original and the level-of-detail .rad for a built splat', () => {
        const list = splatDownloadsOf(BUILT);
        expect(ids(list)).toEqual(['original', 'lod']);
        expect(list.map(d => d.label)).toEqual(['Download original', 'Download level-of-detail (.rad)']);
        expect(list[1]).toMatchObject({ kind: 'artifact', filename: 'site.rad', url: '/orgs/o/ds/d/build/abc/gsplat/model.rad?x=1' });
    });

    it('offers the original and the .spz for a splat whose build predates the level of detail', () => {
        const list = splatDownloadsOf(LEGACY);
        expect(ids(list)).toEqual(['original', 'spz']);
        expect(list[1]).toMatchObject({ label: 'Download .spz', filename: 'site.spz', url: '/orgs/o/ds/d/build/abc/gsplat/model.spz' });
    });

    it('never offers the bounds file, which is no download', () => {
        expect(ids(splatDownloadsOf({ path: 'a.ply', artifacts: [BOUNDS] }))).toEqual(['original']);
    });

    it('offers no artifact while a build runs or the entry says its build is not complete', () => {
        expect(ids(splatDownloadsOf(BUILT, { building: true }))).toEqual(['original']);
        expect(ids(splatDownloadsOf({ ...BUILT, buildStatus: 'building' }))).toEqual(['original']);
        expect(ids(splatDownloadsOf({ ...BUILT, buildStatus: 'failed' }))).toEqual(['original']);
    });

    it('offers nothing for no entry', () => {
        expect(splatDownloadsOf(null)).toEqual([]);
        expect(splatDownloadsOf(undefined)).toEqual([]);
    });

    it('is built from one list, so another download is one more row', () => {
        expect(SPLAT_DOWNLOADS.map(d => d.id)).toEqual(['original', 'lod', 'spz']);
        expect(SPLAT_DOWNLOADS.filter(d => d.kind === 'artifact').every(d => d.role && d.extension)).toBe(true);
    });
});

describe('running a download', () => {
    afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); });

    it('hands the original to the caller, which owns that flow', () => {
        const downloadOriginal = vi.fn(() => 'started');
        expect(runSplatDownload(splatDownloadsOf(BUILT)[0], downloadOriginal)).toBe('started');
        expect(downloadOriginal).toHaveBeenCalledOnce();
    });

    it('saves an artifact through a link with its url and file name, and leaves no link behind', () => {
        const clicked = [];
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() { clicked.push([this.getAttribute('href'), this.download]); });
        const downloadOriginal = vi.fn();
        runSplatDownload(splatDownloadsOf(BUILT)[1], downloadOriginal);
        expect(downloadOriginal).not.toHaveBeenCalled();
        expect(clicked).toEqual([['/orgs/o/ds/d/build/abc/gsplat/model.rad?x=1', 'site.rad']]);
        expect(document.querySelector('a')).toBeNull();
        startFileDownload('/x', 'y.bin');
        expect(clicked.at(-1)).toEqual(['/x', 'y.bin']);
    });
});

describe('the context menu', () => {
    const file = entry => ({ entry, path: entry.path });
    const context = (files, emit = vi.fn()) => ({ getSelectedEntries: () => files, canWrite: true, dataset: null, emit });
    const visible = items => items.filter(i => i.isVisible()).map(i => i.label);

    it('shows the downloads of a single selected splat by its state', () => {
        expect(visible(splatDownloadItems(context([file(NOT_BUILT)])))).toEqual(['Download original']);
        expect(visible(splatDownloadItems(context([file(BUILT)])))).toEqual(['Download original', 'Download level-of-detail (.rad)']);
        expect(visible(splatDownloadItems(context([file(LEGACY)])))).toEqual(['Download original', 'Download .spz']);
    });

    it('shows nothing for another type or for a selection of several', () => {
        expect(visible(splatDownloadItems(context([file({ ...BUILT, type: 4 })])))).toEqual([]);
        expect(visible(splatDownloadItems(context([file(BUILT), file(BUILT)])))).toEqual([]);
        expect(visible(splatDownloadItems(context([])))).toEqual([]);
    });

    it('downloads the original through the browser flow and an artifact directly', () => {
        const clicked = [];
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() { clicked.push(this.download); });
        const emit = vi.fn();
        const selected = file(BUILT);
        const [original, lod] = splatDownloadItems(context([selected], emit));
        original.click();
        expect(emit).toHaveBeenCalledWith('downloadItems', [selected]);
        expect(clicked).toEqual([]);
        lod.click();
        expect(clicked).toEqual(['site.rad']);
        expect(emit).toHaveBeenCalledTimes(1);
    });

    it('is part of the standard menu, under Tools', () => {
        const tools = buildStandardContextMenu(context([file(BUILT)])).find(i => i.label === 'Tools');
        expect(tools.items.filter(i => i.label?.startsWith('Download') && i.isVisible()).map(i => i.label)).toContain('Download level-of-detail (.rad)');
    });
});
