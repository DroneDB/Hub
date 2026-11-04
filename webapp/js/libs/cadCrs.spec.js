/**
 * "Set Coordinate System" for CAD drawings (libs/cadCrs.js, the Tools menu item
 * and the dialog's request).
 */
import { describe, it, expect, vi } from 'vitest';
import ddb from 'ddb';
import { isCadDrawing, crsRequest } from './cadCrs';

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

describe('SetCrsDialog', () => {
    // No @vue/test-utils here: bind the options to a plain object, as Vue binds `this`
    async function dialog(entry, setCadCrs = vi.fn(async (path) => ({ path: path.replace(/\.\w+$/, '.prj') }))) {
        const options = (await import('@/features/dataset/dialogs/SetCrsDialog.vue')).default;
        const ctx = { file: { entry }, dataset: { setCadCrs }, $emit: vi.fn() };
        Object.assign(ctx, options.data.call(ctx));
        for (const [name, fn] of Object.entries(options.computed))
            Object.defineProperty(ctx, name, { get: fn.bind(ctx) });
        for (const [name, fn] of Object.entries(options.methods)) ctx[name] = fn.bind(ctx);
        return ctx;
    }

    it('starts from the drawing\'s current setting', async () => {
        const fromPrj = await dialog({ type: T.VECTOR, path: 'site/plan.dwg',
            properties: { vector: { crs: { source: 'prj', label: 'EPSG:32632' } } } });
        expect(fromPrj.mode).toBe('system');
        expect(fromPrj.crs).toBe('EPSG:32632');
        expect(fromPrj.prjName).toBe('plan.prj');

        const local = await dialog({ type: T.VECTOR, path: 'plan.dxf',
            properties: { vector: { crs: { source: 'prj', label: 'local' } } } });
        expect(local.mode).toBe('local');
        expect(local.canApply).toBe(true);
    });

    it('sends the request and reports the .prj', async () => {
        const d = await dialog({ type: T.VECTOR, path: 'site/plan.dwg', properties: {} });
        expect(d.canApply).toBe(false);
        d.crs = '2193';
        await d.apply();
        expect(d.dataset.setCadCrs).toHaveBeenCalledWith('site/plan.dwg', 'EPSG:2193');
        expect(d.$emit).toHaveBeenCalledWith('close', 'set', { prjPath: 'site/plan.prj' });
    });

    it('shows the server\'s error and stays open', async () => {
        const d = await dialog({ type: T.VECTOR, path: 'plan.dwg', properties: {} },
            vi.fn(async () => { throw new Error('Not a coordinate system: nope'); }));
        d.crs = 'nope';
        await d.apply();
        expect(d.errorMessage).toBe('Not a coordinate system: nope');
        expect(d.$emit).not.toHaveBeenCalled();
        expect(d.saving).toBe(false);
    });
});
