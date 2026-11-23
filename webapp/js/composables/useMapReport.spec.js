/**
 * The "Report" button of the map: the editor opens with the measurement file as source and the map's view, after the
 * unsaved measurements were offered a Save; a map with no saved measurements opens it with no source. A saved view
 * shown as it was saved is the report's view; any other state on show is given to be saved as a new view.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { defaultState, newLayer } from '@/libs/views/viewState';
import { viewOfMap, useMapReport } from './useMapReport';

const viewOf = (...paths) => {
    const state = defaultState({ path: paths[0], hash: 'h1' }, { baseIsGeoraster: true });
    state.layers = paths.map(p => newLayer(p, { hash: 'h1' }));
    return state;
};

describe('viewOfMap', () => {
    it('is the saved view on show when it has no unsaved change', () => {
        expect(viewOfMap(viewOf('ortho.tif'), { uid: 'v_aaaaaaaa', name: 'Site', dirty: false })).toEqual({ uid: 'v_aaaaaaaa' });
    });

    it('is a copy of the state on show, with its name, for a saved view with changes or a new view of a file', () => {
        const view = viewOf('ortho.tif');
        view.view = { center: [1, 2], zoom: 5, rotation: 0 };
        const changed = viewOfMap(view, { uid: 'v_aaaaaaaa', name: 'Site', dirty: true });
        expect(changed).toEqual({ state: view, name: 'Site' });
        expect(changed.state).not.toBe(view);
        expect(viewOfMap(view, { uid: '', name: 'ortho.tif', dirty: false })).toEqual({ state: view, name: 'ortho.tif' });
    });

    it('is the state of the dataset map with no name (the editor names it after its base file), and none without a state', () => {
        const view = viewOf('a/ortho.tif', 'a/dsm.tif');
        expect(viewOfMap(view, null)).toEqual({ state: view, name: '' });
        expect(viewOfMap(null, null)).toBeNull();
    });
});

describe('useMapReport', () => {
    let actions;
    let choose;
    let measurements;
    let view;
    let info;
    const make = () => useMapReport({ actions, choose, state: () => view, viewInfo: () => info, measurements });
    beforeEach(() => {
        actions = { create: vi.fn(async () => ({ uid: 'r_aaaaaaaa' })) };
        choose = vi.fn(async () => 'confirm');
        view = viewOf('ortho.tif');
        info = { uid: 'v_aaaaaaaa', name: 'Site', dirty: false };
        measurements = { isDirty: vi.fn(() => false), hasSaved: vi.fn(() => true), filePath: vi.fn(() => 'ortho_measurements.geojson'), save: vi.fn(async () => {}) };
    });

    it('opens the editor with the measurement file of the map as the source and its saved view', async () => {
        await make().startReport();
        expect(actions.create).toHaveBeenCalledWith({ sources: ['ortho_measurements.geojson'], view: { uid: 'v_aaaaaaaa' } });
        expect(choose).not.toHaveBeenCalled();
    });

    it('gives the state on show, to save as a new view, when the saved view has unsaved changes', async () => {
        info.dirty = true;
        await make().startReport();
        expect(actions.create).toHaveBeenCalledWith({ sources: ['ortho_measurements.geojson'], view: { state: view, name: 'Site' } });
    });

    it('opens it with no source when the map has no saved measurements: the editor proposes one', async () => {
        measurements.hasSaved.mockReturnValue(false);
        await make().startReport();
        expect(actions.create).toHaveBeenCalledWith({ sources: [], view: { uid: 'v_aaaaaaaa' } });
    });

    it('offers unsaved measurements a Save first, and goes on once they are saved', async () => {
        measurements.isDirty.mockReturnValueOnce(true).mockReturnValue(false);
        await make().startReport();
        expect(choose).toHaveBeenCalledWith(expect.objectContaining({ title: 'Unsaved measurements', confirmText: 'Save and continue', secondaryText: 'Continue without saving' }));
        expect(measurements.save).toHaveBeenCalledOnce();
        expect(actions.create).toHaveBeenCalledOnce();
    });

    it('waits when the save did not save (its alert says why)', async () => {
        measurements.isDirty.mockReturnValue(true);
        await make().startReport();
        expect(measurements.save).toHaveBeenCalledOnce();
        expect(actions.create).not.toHaveBeenCalled();
    });

    it('goes on without saving when the user says so, and does nothing when the user cancels', async () => {
        measurements.isDirty.mockReturnValue(true);
        choose.mockResolvedValue('secondary');
        await make().startReport();
        expect(measurements.save).not.toHaveBeenCalled();
        expect(actions.create).toHaveBeenCalledOnce();
        actions.create.mockClear();
        choose.mockResolvedValue('cancel');
        await make().startReport();
        expect(actions.create).not.toHaveBeenCalled();
    });

    it('does nothing for a map with no dataset', async () => {
        actions = null;
        await make().startReport();
        expect(choose).not.toHaveBeenCalled();
    });
});
