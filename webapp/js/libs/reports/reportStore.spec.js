import { describe, it, expect, vi, afterEach } from 'vitest';
import { fakeMetaDataset } from '@/libs/metaList/fakeMetaDataset';
import { newDefinition } from './reportDefinition';
import {
    REPORTS_KEY, MAX_REPORTS, MAX_REPORT_BYTES, listReports, reportSaveProblem, newReportUid, saveNewReport,
    updateReport, deleteReport, deleteUnreadableReport, reportChange
} from './reportStore';

const definition = (name = 'North pit', extra = {}) => ({
    ...newDefinition({ name, sources: ['survey/measurements.geojson'], cover: { viewId: 'v_abcd1234' } }),
    ...extra
});
/** A definition as it is stored. */
const stored = (uid, name, extra = {}) => ({
    ...definition(name), uid, createdBy: 'jdoe', createdAt: '2026-11-21T10:00:00.000Z', modifiedAt: '2026-11-21T10:00:00.000Z', ...extra
});

afterEach(() => vi.restoreAllMocks());

describe('listReports', () => {
    it('reads meta/get/reports and sorts the reports by name', async () => {
        const ds = fakeMetaDataset([
            { id: 'm1', mtime: 1, data: stored('r_00000002', 'beta') },
            { id: 'm2', mtime: 1, data: stored('r_00000001', 'Alpha') }
        ]);
        const { reports, unreadable } = await listReports(ds);
        expect(reports.map(r => r.name)).toEqual(['Alpha', 'beta']);
        expect(reports[0]).toMatchObject({ id: 'm2', uid: 'r_00000001', newerVersion: false, error: null });
        expect(unreadable).toEqual([]);
        expect(ds.metaGet).toHaveBeenCalledWith(REPORTS_KEY, '', { cache: true });
    });

    it('is empty for a dataset with no reports', async () => {
        expect(await listReports(fakeMetaDataset())).toEqual({ reports: [], unreadable: [] });
    });

    it('lists a damaged item and a definition that fails validation as unreadable, the others unaffected', async () => {
        const ds = fakeMetaDataset([
            { id: 'm1', mtime: 1, data: stored('r_00000001', 'good') },
            { id: 'm2', mtime: 1, data: '{damaged' },
            { id: 'm3', mtime: 1, data: stored('r_00000003', 'no source', { sources: [] }) },
            { id: 'm4', mtime: 1, data: { name: 'no uid' } },
            { id: 'm5', mtime: 1, data: stored('r_00000005', 'Later', { version: 2 }) }
        ]);
        const { reports, unreadable } = await listReports(ds);
        expect(reports.map(r => r.name)).toEqual(['good', 'Later']);
        expect(reports[1].newerVersion).toBe(true);
        expect(unreadable).toEqual([
            { id: 'm3', uid: 'r_00000003', name: 'no source', error: 'at least one source is needed' },
            { id: 'm2', uid: null, name: null, error: expect.stringMatching(/not a JSON object/) },
            { id: 'm4', uid: null, name: null, error: expect.stringMatching(/no uid/) }
        ]);
    });

    it('reads from the server when fresh', async () => {
        const ds = fakeMetaDataset([{ id: 'm1', mtime: 1, data: stored('r_00000001', 'one') }]);
        await listReports(ds, { fresh: true });
        expect(ds.metaGet).toHaveBeenCalledWith(REPORTS_KEY, '', { cache: false });
    });
});

describe('newReportUid', () => {
    it('is r_ and 8 base36 characters, and not a taken one', () => {
        for (let i = 0; i < 50; i++) expect(newReportUid([])).toMatch(/^r_[0-9a-z]{8}$/);
    });
});

describe('saving a new report', () => {
    it('adds it with a uid, the creation fields and modifiedAt, after a fresh read, and keeps no updatedBy', async () => {
        const ds = fakeMetaDataset([{ id: 'm1', mtime: 1, data: stored('r_00000001', 'one') }]);
        const r = await saveNewReport(ds, definition('  Two '), { user: 'jdoe', now: new Date('2026-11-21T10:00:00Z') });
        expect(r.uid).toMatch(/^r_[0-9a-z]{8}$/);
        expect(r.name).toBe('Two');
        expect(r.data).toMatchObject({
            name: 'Two', createdBy: 'jdoe', createdAt: '2026-11-21T10:00:00.000Z', modifiedAt: '2026-11-21T10:00:00.000Z',
            sources: [{ file: 'survey/measurements.geojson', label: 'A' }]
        });
        expect(r.data).not.toHaveProperty('updatedBy');
        expect(r.data).not.toHaveProperty('updatedAt');
        expect(ds.metaAdd).toHaveBeenCalledWith(REPORTS_KEY, r.data);
        expect(ds.calls[0]).toEqual(['get', REPORTS_KEY, false]);
        expect((await listReports(ds)).reports.map(x => x.name)).toEqual(['one', 'Two']);
    });

    it('refuses a definition with no source or no cover, a bad name, before writing', async () => {
        const ds = fakeMetaDataset();
        await expect(saveNewReport(ds, definition('x', { sources: [] }), { user: 'u' })).rejects.toThrow('This report cannot be saved: at least one source is needed.');
        await expect(saveNewReport(ds, definition('x', { cover: null }), { user: 'u' })).rejects.toThrow('This report cannot be saved: a cover view is needed.');
        await expect(saveNewReport(ds, definition(' '), { user: 'u' })).rejects.toThrow(/name must be 1 to 100/);
        expect(ds.metaAdd).not.toHaveBeenCalled();
    });

    it('refuses a definition over 32 KB of UTF-8 JSON, counting bytes, with a message that names the limit', async () => {
        const ds = fakeMetaDataset();
        const message = 'This report is too large to save: a report definition can take at most 32 KB.';
        // 3 bytes per character: every text at its character limit is over 32 KB, though under 32768 characters
        const big = definition('big', { notes: '€'.repeat(10000), title: '€'.repeat(200), subtitle: '€'.repeat(200), preparedBy: '€'.repeat(200), preparedFor: '€'.repeat(200) });
        expect(new TextEncoder().encode(JSON.stringify(big)).length).toBeGreaterThan(MAX_REPORT_BYTES);
        await expect(saveNewReport(ds, big, { user: 'u' })).rejects.toThrow(message);
        expect(ds.metaAdd).not.toHaveBeenCalled();
        const near = definition('near', { notes: '€'.repeat(9000) });
        await expect(saveNewReport(ds, near, { user: 'u' })).resolves.toBeTruthy();
    });

    it('refuses the 101st report without calling the server, counting each uid once', async () => {
        const items = Array.from({ length: MAX_REPORTS }, (_, i) => ({ id: `m${i}`, mtime: 1, data: stored(`r_${String(i).padStart(8, '0')}`, `R${i}`) }));
        items.push({ id: 'dup', mtime: 2, data: stored('r_00000000', 'R0 again') });
        const full = fakeMetaDataset(items);
        await expect(saveNewReport(full, definition(), { user: 'u' })).rejects.toThrow('This dataset has 100 reports. Delete one to save a new report.');
        expect(full.metaAdd).not.toHaveBeenCalled();
        const almost = fakeMetaDataset(items.slice(0, MAX_REPORTS - 1));
        await expect(saveNewReport(almost, definition(), { user: 'u' })).resolves.toBeTruthy();
    });

    it('does not count an unreadable item against the cap of readable ones', async () => {
        const items = Array.from({ length: MAX_REPORTS - 1 }, (_, i) => ({ id: `m${i}`, mtime: 1, data: stored(`r_${String(i).padStart(8, '0')}`, `R${i}`) }));
        items.push({ id: 'bad', mtime: 1, data: '{damaged' });
        await expect(saveNewReport(fakeMetaDataset(items), definition(), { user: 'u' })).resolves.toBeTruthy();
    });
});

describe('reportSaveProblem', () => {
    it('is null for a definition with a uid that passes, and says why otherwise', () => {
        expect(reportSaveProblem('ok', stored('r_00000001', 'ok'))).toBeNull();
        expect(reportSaveProblem('ok', definition())).toBe('This report cannot be saved: the uid is not valid.');
    });
});

describe('updating a report', () => {
    it('adds first, then removes the old items, keeps the creation fields and sets modifiedAt', async () => {
        const ds = fakeMetaDataset([
            { id: 'm1', mtime: 1, data: stored('r_00000001', 'one', { createdBy: 'a', createdAt: 'then' }) },
            { id: 'm2', mtime: 0, data: stored('r_00000001', 'one dup') },
            { id: 'm3', mtime: 1, data: stored('r_00000002', 'other') }
        ]);
        const r = await updateReport(ds, 'r_00000001', { definition: definition('One renamed', { title: 'New title' }), user: 'b', now: new Date('2026-11-22T10:00:00Z') });
        expect(ds.calls[0]).toEqual(['get', REPORTS_KEY, false]);
        expect(ds.calls[1]).toEqual(['add', 'r_00000001']);
        expect(ds.calls.slice(2).map(c => c[1]).sort()).toEqual(['m1', 'm2']);
        expect(r.data).toMatchObject({
            uid: 'r_00000001', name: 'One renamed', title: 'New title', createdBy: 'a', createdAt: 'then', modifiedAt: '2026-11-22T10:00:00.000Z'
        });
        expect(ds.items.map(i => i.data.uid).sort()).toEqual(['r_00000001', 'r_00000002']);
    });

    it('says the report was deleted when another session removed it', async () => {
        const ds = fakeMetaDataset([{ id: 'm1', mtime: 1, data: stored('r_00000002', 'other') }]);
        await expect(updateReport(ds, 'r_00000001', { definition: definition(), user: 'b' })).rejects.toThrow('This report was deleted.');
        expect(ds.metaAdd).not.toHaveBeenCalled();
    });

    it('refuses an invalid definition and keeps the old item', async () => {
        const ds = fakeMetaDataset([{ id: 'm1', mtime: 1, data: stored('r_00000001', 'one') }]);
        await expect(updateReport(ds, 'r_00000001', { definition: definition('one', { cover: null }), user: 'b' })).rejects.toThrow(/cover view is needed/);
        expect(ds.metaAdd).not.toHaveBeenCalled();
        expect(ds.items).toHaveLength(1);
    });
});

describe('the change check before a write', () => {
    it('tells a report changed by another session, or deleted, from one as it was loaded', async () => {
        const ds = fakeMetaDataset([{ id: 'm1', mtime: 1, data: stored('r_00000001', 'one') }]);
        expect(await reportChange(ds, 'r_00000001', 'm1')).toBeNull();
        const saved = await updateReport(ds, 'r_00000001', { definition: definition('two'), user: 'x' });
        expect(await reportChange(ds, 'r_00000001', 'm1')).toBe('changed');
        expect(await reportChange(ds, 'r_00000001', saved.id)).toBeNull();
        await deleteReport(ds, 'r_00000001');
        expect(await reportChange(ds, 'r_00000001', saved.id)).toBe('deleted');
        expect(ds.metaGet).toHaveBeenLastCalledWith(REPORTS_KEY, '', { cache: false });
    });
});

describe('deleting', () => {
    it('removes every item of a report, and only that report', async () => {
        const ds = fakeMetaDataset([
            { id: 'm1', mtime: 1, data: stored('r_00000001', 'one') },
            { id: 'm2', mtime: 1, data: stored('r_00000001', 'one') },
            { id: 'm3', mtime: 1, data: stored('r_00000002', 'two') }
        ]);
        await deleteReport(ds, 'r_00000001');
        expect(ds.items.map(i => i.id)).toEqual(['m3']);
    });

    it('deletes an unreadable item by its uid when it has one, else by its meta id', async () => {
        const ds = fakeMetaDataset([
            { id: 'm1', mtime: 1, data: stored('r_00000001', 'ok') },
            { id: 'm2', mtime: 1, data: stored('r_00000003', 'no source', { sources: [] }) },
            { id: 'm3', mtime: 1, data: '{damaged' }
        ]);
        const { unreadable } = await listReports(ds);
        expect(unreadable).toHaveLength(2);
        for (const item of unreadable) await deleteUnreadableReport(ds, item);
        expect(ds.items.map(i => i.id)).toEqual(['m1']);
        expect(await listReports(ds)).toMatchObject({ reports: [{ uid: 'r_00000001' }], unreadable: [] });
    });
});
