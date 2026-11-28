/**
 * What a new report starts with: the files, the view, the name and the texts, from what the editor was opened with, the
 * newest report of the dataset and what the dataset has.
 */
import { describe, it, expect } from 'vitest';
import { defaultState } from '@/libs/views/viewState';
import { DEFAULT_TEMPLATE } from './reportSettings';
import { defaultBaseFile, freeName, newestReport, prefillReport } from './reportPrefill';

const COMPACT = { ...DEFAULT_TEMPLATE, id: 'compact', defaultSections: ['cover', 'tables'] };
const ORTHO = { path: 'odm/odm_orthophoto.tif', hash: 'h1', georaster: true };
const DSM = { path: 'odm/dsm.tif', hash: 'h2', georaster: true };
const ZONES = { path: 'zones.geojson', hash: 'h3', georaster: false };
const SITE = { uid: 'v_site0000', name: 'Site' };
const NORTH = { uid: 'v_north000', name: 'North' };

const last = (extra = {}) => ({
    version: 1, name: 'Old', templateId: 'compact', title: 'Old title', subtitle: 'Old subtitle', preparedBy: 'Acme', preparedFor: 'City', notes: 'n',
    sources: [{ file: 'b/measurements.geojson', label: 'B' }, { file: 'gone/measurements.geojson', label: 'G' }],
    filter: { groups: [], categories: ['defect'], severities: [], statuses: [], kinds: [], owners: [] },
    cover: { viewId: NORTH.uid }, sections: [{ kind: 'tables', enabled: true }, { kind: 'cover', enabled: false }], units: 'metric', ...extra
});

const input = (extra = {}) => ({
    initial: {}, lastReport: null, views: [SITE, NORTH], measurementFiles: ['a/measurements.geojson', 'b/measurements.geojson'],
    baseFiles: [DSM, ORTHO, ZONES], templates: [DEFAULT_TEMPLATE, COMPACT], user: 'jdoe', datasetName: 'Quarry', reportNames: [],
    dateText: '23 Nov 2026', ...extra
});

describe('the files', () => {
    it('are the ones the map gave, else those of the last report that are still there, else the only one of the dataset', () => {
        expect(prefillReport(input({ initial: { sources: ['a/measurements.geojson'] }, lastReport: last() })).fields.sources)
            .toEqual([{ file: 'a/measurements.geojson', label: 'A' }]);
        expect(prefillReport(input({ lastReport: last() })).fields.sources).toEqual([{ file: 'b/measurements.geojson', label: 'A' }]);
        expect(prefillReport(input({ measurementFiles: ['a/measurements.geojson'] })).fields.sources).toEqual([{ file: 'a/measurements.geojson', label: 'A' }]);
        expect(prefillReport(input()).fields.sources).toEqual([]);
    });
});

describe('the view', () => {
    const state = defaultState({ path: 'odm/dsm.tif', hash: 'h2' }, { baseIsGeoraster: true });

    it('is the saved view the map gave, or the map state as a new view with a free name', () => {
        expect(prefillReport(input({ initial: { view: { uid: SITE.uid } } })).view).toEqual({ kind: 'saved', uid: SITE.uid });
        expect(prefillReport(input({ initial: { view: { state, name: 'Site' } } })).view).toEqual({ kind: 'fromMap', state, name: 'Site (2)' });
        expect(prefillReport(input({ initial: { view: { state, name: '' } } })).view).toMatchObject({ name: 'dsm.tif' });
    });

    it('is the last report\'s saved view, else the only saved view, else none to choose among several', () => {
        expect(prefillReport(input({ lastReport: last() })).view).toEqual({ kind: 'saved', uid: NORTH.uid });
        expect(prefillReport(input({ lastReport: last({ cover: { viewId: 'v_gone0000' } }), views: [SITE] })).view).toEqual({ kind: 'saved', uid: SITE.uid });
        expect(prefillReport(input({ lastReport: last({ cover: { viewId: 'v_gone0000' } }) })).view).toBeNull();
    });

    it('is a new view of the orthophoto, else the first georaster, else the first file, when there is no saved view', () => {
        expect(prefillReport(input({ views: [] })).view).toEqual({ kind: 'fromFile', path: ORTHO.path, name: 'odm_orthophoto.tif' });
        expect(defaultBaseFile([ZONES, DSM])).toBe(DSM);
        expect(defaultBaseFile([ZONES])).toBe(ZONES);
        expect(prefillReport(input({ views: [], baseFiles: [] })).view).toBeNull();
    });

    it('ignores a saved view the map gave that cannot be used', () => {
        expect(prefillReport(input({ initial: { view: { uid: 'v_gone0000' } }, views: [SITE] })).view).toEqual({ kind: 'saved', uid: SITE.uid });
    });
});

describe('the texts', () => {
    it('name the report after its saved view and the date, the cover after the dataset and the view, prepared by the user', () => {
        const { fields } = prefillReport(input({ initial: { view: { uid: SITE.uid } }, reportNames: ['Site, 23 Nov 2026'] }));
        expect(fields).toMatchObject({ name: 'Site, 23 Nov 2026 (2)', title: 'Quarry', subtitle: 'Site', preparedBy: 'jdoe', preparedFor: '', units: null });
        expect(prefillReport(input({ views: [] })).fields).toMatchObject({ name: 'Quarry, 23 Nov 2026', subtitle: '' });
    });

    it('take the prepared by and for, the units, the template and its sections of the last report, never its notes or filter', () => {
        const { fields } = prefillReport(input({ lastReport: last() }));
        expect(fields).toMatchObject({ preparedBy: 'Acme', preparedFor: 'City', units: 'metric', templateId: 'compact', title: 'Quarry', subtitle: 'North' });
        expect(fields.sections).toEqual([{ kind: 'tables', enabled: true }, { kind: 'cover', enabled: false }]);
        expect(fields).not.toHaveProperty('notes');
        expect(fields).not.toHaveProperty('filter');
    });

    it('take the first template and its sections when the last report\'s template was deleted', () => {
        const { fields } = prefillReport(input({ lastReport: last({ templateId: 'gone' }) }));
        expect(fields.templateId).toBe('standard');
        expect(fields.sections.every(s => s.enabled)).toBe(true);
    });
});

describe('newestReport', () => {
    it('is the one changed last, or made last when never changed, and skips one of a newer version', () => {
        const a = { data: { createdAt: '2026-11-01T00:00:00Z', modifiedAt: '2026-11-10T00:00:00Z' } };
        const b = { data: { createdAt: '2026-11-05T00:00:00Z' } };
        const c = { data: { createdAt: '2026-11-30T00:00:00Z' }, newerVersion: true };
        expect(newestReport([b, a, c])).toBe(a);
        expect(newestReport([])).toBeNull();
    });
});

describe('freeName', () => {
    it('numbers a name that is taken and keeps it within 100 characters', () => {
        expect(freeName('Site', [])).toBe('Site');
        expect(freeName('Site', ['Site', 'Site (2)'])).toBe('Site (3)');
        const long = 'x'.repeat(100);
        expect(freeName(long, [long])).toBe(`${'x'.repeat(96)} (2)`);
    });
});
