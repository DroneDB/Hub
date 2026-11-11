/**
 * "Set Coordinate System" for CAD drawings (libs/cadCrs.js, the Tools menu item
 * and the dialog's request).
 */
import { describe, it, expect, vi } from 'vitest';
import ddb from 'ddb';
import { isCadDrawing, crsRequest, crsProblem } from './cadCrs';

vi.mock('@/libs/build/buildManager', () => ({ default: {}, BUILD_STATES: {} }));
vi.mock('@/libs/tasks/taskMonitor', () => ({ default: {} }));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: {} }));

const T = ddb.entry.type;

describe('isCadDrawing', () => {
    it('is true for DXF and DWG vectors only', () => {
        expect(isCadDrawing({ type: T.VECTOR, path: 'site/plan.DWG' })).toBe(true);
        expect(isCadDrawing({ type: T.VECTOR, path: 'plan.dxf' })).toBe(true);
        expect(isCadDrawing({ type: T.VECTOR, path: 'roads.geojson' })).toBe(false);
        expect(isCadDrawing({ type: T.GENERIC, path: 'plan.dwg' })).toBe(false);
        expect(isCadDrawing(null)).toBe(false);
    });
});

describe('crsRequest', () => {
    it('reads a bare number as an EPSG code and keeps anything else', () => {
        expect(crsRequest('system', ' 32632 ')).toBe('EPSG:32632');
        expect(crsRequest('system', 'EPSG:2193')).toBe('EPSG:2193');
        expect(crsRequest('system', 'PROJCS["x"]')).toBe('PROJCS["x"]');
        expect(crsRequest('system', '  ')).toBe('');
        expect(crsRequest('local', 'EPSG:2193')).toBe('local');
    });
});

describe('Tools › Set Coordinate System', () => {
    it('shows for one CAD drawing when the user can write', async () => {
        const { setCoordinateSystemItem } = await import('./contextMenuItems');
        const emit = vi.fn();
        const drawing = { entry: { type: T.VECTOR, path: 'plan.dwg' } };
        const ctx = (sel, canWrite = true) => ({ getSelectedEntries: () => sel, canWrite, dataset: null, emit });

        expect(setCoordinateSystemItem(ctx([drawing])).isVisible()).toBe(true);
        expect(setCoordinateSystemItem(ctx([drawing], false)).isVisible()).toBe(false);
        expect(setCoordinateSystemItem(ctx([drawing, drawing])).isVisible()).toBe(false);
        expect(setCoordinateSystemItem(ctx([{ entry: { type: T.VECTOR, path: 'a.shp' } }])).isVisible()).toBe(false);

        setCoordinateSystemItem(ctx([drawing])).click();
        expect(emit).toHaveBeenCalledWith('setCrs', drawing);
    });
});

// FR-PRC-31: the form of the value, checked before Apply; the server says whether it exists
describe('crsProblem', () => {
    it.each(['EPSG:32632', 'epsg:2193', 'PROJCS["WGS 84 / UTM zone 32N",GEOGCS["WGS 84"]]', 'GEOGCS["WGS 84"]', 'PROJCRS["x"]', 'GEOGCRS["x"]', 'COMPD_CS["x"]', 'COMPD["x"]'])(
        'accepts %s', value => {
            expect(crsProblem(value)).toBeNull();
        });

    it('accepts a bare number once crsRequest has read it as an EPSG code', () => {
        expect(crsProblem(crsRequest('system', '32632'))).toBeNull();
        expect(crsProblem(crsRequest('system', ' 99999999 '))).toBeNull();
    });

    it.each(['abc', 'EPSG:', 'EPSG:abc', '32632x', 'PROJ["x"]', 'UTM 32N'])('refuses %s, saying what is expected', value => {
        expect(crsProblem(crsRequest('system', value))).toBe('Enter an EPSG code (such as 32632 or EPSG:32632) or a WKT definition (starting with PROJCS or GEOGCS).');
    });

    it('asks for a value when there is none', () => {
        expect(crsProblem(crsRequest('system', '   '))).toBe('Enter a coordinate system.');
        expect(crsProblem('')).toBe('Enter a coordinate system.');
        expect(crsProblem(undefined)).toBe('Enter a coordinate system.');
    });
});
