/**
 * The "Report" button of the map: the editor opens with the measurement file as source and the map's view as cover,
 * after the unsaved measurements were offered a Save; a map with no saved measurements opens it with no source.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ddb from 'ddb';
import { defaultState, newLayer } from '@/libs/views/viewState';
import { coverOfMap, useMapReport } from './useMapReport';

const T = ddb.entry.type;
const raster = (path, hash = 'h') => ({ entry: { path, type: T.GEORASTER, hash } });
const viewOf = (...paths) => {
    const state = defaultState({ path: paths[0], hash: 'h1' }, { baseIsGeoraster: true });
    state.layers = paths.map(p => newLayer(p, { hash: 'h1' }));
    return state;
};

describe('coverOfMap', () => {
    it('is a copy of the view the map shows, with its position', () => {
        const view = viewOf('ortho.tif');
        view.view = { center: [1, 2], zoom: 5 };
        const cover = coverOfMap(view, []);
        expect(cover).toEqual({ viewState: view });
        expect(cover.viewState).not.toBe(view);
    });

    it('is made of the georasters of the files of the dataset map, the one drawn last (on top) first', () => {
        const files = [raster('a/dsm.tif', 'h2'), { entry: { path: 'a/notes.md', type: T.MARKDOWN } }, raster('a/ortho.tif', 'h1')];
        const { viewState } = coverOfMap(null, files);
        expect(viewState.base).toEqual({ path: 'a/ortho.tif', hash: 'h1' });
        expect(viewState.layers.map(l => l.path)).toEqual(['a/ortho.tif', 'a/dsm.tif']);
    });

    it('is none for a dataset map that has no georaster', () => {
        expect(coverOfMap(undefined, [{ entry: { path: 'a/cloud.laz', type: T.POINTCLOUD } }])).toBeNull();
        expect(coverOfMap(undefined, [])).toBeNull();
    });
});

describe('useMapReport', () => {
    let actions;
    let choose;
    let measurements;
    let view;
    const make = () => useMapReport({ actions, choose, view: () => view, files: () => [raster('ortho.tif')], measurements });
    beforeEach(() => {
        actions = { create: vi.fn(async () => ({ uid: 'r_aaaaaaaa' })) };
        choose = vi.fn(async () => 'confirm');
        view = viewOf('ortho.tif');
        measurements = { isDirty: vi.fn(() => false), hasSaved: vi.fn(() => true), filePath: vi.fn(() => 'ortho_measurements.geojson'), save: vi.fn(async () => {}) };
    });

    it('opens the editor with the measurement file of the map as the source and the view as the cover', async () => {
        await make().startReport();
        expect(actions.create).toHaveBeenCalledWith({ sources: ['ortho_measurements.geojson'], cover: { viewState: view } });
        expect(choose).not.toHaveBeenCalled();
    });

    it('opens it with no source when the map has no saved measurements: the editor asks for one', async () => {
        measurements.hasSaved.mockReturnValue(false);
        await make().startReport();
        expect(actions.create).toHaveBeenCalledWith({ sources: [], cover: { viewState: view } });
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
