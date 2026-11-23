/**
 * The measurements of the dataset map saved as a view: a view that reads the map's file gets them saved first; a view
 * that reads another file gets them copied into it when the user says so.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildEntryState } from '@/libs/views/viewState';

const m = vi.hoisted(() => ({ copy: vi.fn(), error: vi.fn() }));
vi.mock('@/libs/map/measurementStorage', async importOriginal => ({ ...await importOriginal(), copyMeasurements: (...a) => m.copy(...a) }));
vi.mock('@/composables/useNotify', () => ({ useNotify: () => ({ error: m.error }) }));

const { useViewMeasurements } = await import('./useViewMeasurements');

const ONE = buildEntryState({ path: 'odm/ortho.tif', hash: 'h' }, [], { baseIsGeoraster: true });
const TWO = buildEntryState({ path: 'odm/ortho.tif', hash: 'h' }, ['odm/dsm.tif'], { baseIsGeoraster: true });
const FOLDER = { path: 'odm/measurements.geojson' };

let choose;
let measurements;
let onFileWritten;
const make = () => useViewMeasurements({ dataset: {}, choose, measurements, onFileWritten });

beforeEach(() => {
    Object.values(m).forEach(fn => fn.mockReset());
    vi.spyOn(console, 'error').mockImplementation(() => {});
    choose = vi.fn();
    onFileWritten = vi.fn();
    let dirty = true;
    measurements = { isDirty: vi.fn(() => dirty), save: vi.fn(async () => { dirty = false; }), owner: () => FOLDER, count: () => 3 };
    m.copy.mockResolvedValue(3);
});

describe('a view that reads the file the map saves in', () => {
    it('offers the unsaved measurements a Save that includes them, and goes on after it', async () => {
        choose.mockResolvedValue('confirm');
        expect(await make().include(TWO)).toBe(true);
        expect(choose).toHaveBeenCalledWith(expect.objectContaining({ confirmText: 'Save and include', secondaryText: 'Save the view only' }));
        expect(measurements.save).toHaveBeenCalledOnce();
        expect(m.copy).not.toHaveBeenCalled();
    });

    it('asks nothing when they are saved, and stops on Cancel', async () => {
        measurements.isDirty.mockReturnValue(false);
        expect(await make().include(TWO)).toBe(true);
        expect(choose).not.toHaveBeenCalled();
        measurements.isDirty.mockReturnValue(true);
        choose.mockResolvedValue('cancel');
        expect(await make().include(TWO)).toBe(false);
    });
});

describe('a view that reads another file', () => {
    it('asks to save and copy them, names both files, and copies them into the view file after the save', async () => {
        choose.mockResolvedValue('confirm');
        expect(await make().include(ONE)).toBe(true);
        const [question] = choose.mock.calls[0];
        expect(question).toMatchObject({ title: 'Measurements on the map', confirmText: 'Save and copy', secondaryText: 'Save the view only' });
        expect(question.message).toContain('<strong>odm/ortho_measurements.geojson</strong>');
        expect(question.message).toContain('3 measurements in <strong>odm/measurements.geojson</strong>');
        expect(question.message).toContain('Save them and copy them');
        expect(measurements.save).toHaveBeenCalledOnce();
        expect(m.copy).toHaveBeenCalledWith({}, FOLDER, { path: 'odm/ortho.tif' });
        expect(measurements.save.mock.invocationCallOrder[0]).toBeLessThan(m.copy.mock.invocationCallOrder[0]);
        expect(onFileWritten).toHaveBeenCalledWith('odm/ortho_measurements.geojson');
    });

    it('escapes the paths, which the dialog shows as HTML', async () => {
        measurements.owner = () => ({ path: 'a<b>/measurements.geojson' });
        choose.mockResolvedValue('cancel');
        await make().include(buildEntryState({ path: 'a<b>/x.tif', hash: '' }, [], { baseIsGeoraster: true }));
        expect(choose.mock.calls[0][0].message).toContain('a&lt;b&gt;/x_measurements.geojson');
        expect(choose.mock.calls[0][0].message).not.toContain('<b>');
    });

    it('copies saved measurements too, with no save, and says it of one measurement', async () => {
        measurements.isDirty.mockReturnValue(false);
        measurements.count = () => 1;
        choose.mockResolvedValue('confirm');
        expect(await make().include(ONE)).toBe(true);
        expect(measurements.save).not.toHaveBeenCalled();
        expect(m.copy).toHaveBeenCalledOnce();
        expect(choose.mock.calls[0][0].message).toContain('its measurement in <strong>odm/measurements.geojson</strong>. Save it and copy it');
    });

    it('saves the view alone on Save the view only, nothing on Cancel', async () => {
        choose.mockResolvedValue('secondary');
        expect(await make().include(ONE)).toBe(true);
        choose.mockResolvedValue('cancel');
        expect(await make().include(ONE)).toBe(false);
        expect(measurements.save).not.toHaveBeenCalled();
        expect(m.copy).not.toHaveBeenCalled();
    });

    it('stops when the save did not save or the copy failed, and says why the copy failed', async () => {
        measurements.save.mockImplementation(async () => {});
        choose.mockResolvedValue('confirm');
        expect(await make().include(ONE)).toBe(false);
        expect(m.copy).not.toHaveBeenCalled();
        measurements.isDirty.mockReturnValue(false);
        m.copy.mockRejectedValue(new Error('The file cannot be written'));
        expect(await make().include(ONE)).toBe(false);
        expect(m.error).toHaveBeenCalledWith('The file cannot be written', { summary: 'Cannot copy the measurements' });
    });

    it('asks the plain question when the map has no measurement', async () => {
        measurements.count = () => 0;
        choose.mockResolvedValue('secondary');
        expect(await make().include(ONE)).toBe(true);
        expect(choose.mock.calls[0][0].confirmText).toBe('Save and include');
    });
});
