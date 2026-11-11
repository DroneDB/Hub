/**
 * The map's measurements are a working copy of their file: the file is read once per target
 * (a change of the file list does not add them again), Save makes the file match the map and
 * tells the file list, and a new target replaces the measurements on the map.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref, shallowRef } from 'vue';
import ddb from 'ddb';
import MeasureControls from '@/libs/map/controls/measureControl';
import * as csv from '@/libs/csv';
import { PREF, removePref } from '@/libs/preferences';
import { useMapMeasurements } from './useMapMeasurements';

const T = ddb.entry.type;
const lengthFeature = id => ({
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[10, 45], [10.001, 45]] },
    properties: { name: id, measurementType: 'length', createdAt: '2026-10-30T10:00:00.000Z' }
});
const fileOf = (...ids) => JSON.stringify({ type: 'FeatureCollection', features: ids.map(lengthFeature) });

let stored;
let dataset;
let files;
let controls;
let events;
let flashes;
let alerts;
let unitPref;

function start({ canWrite = true, analysisTarget = () => null } = {}) {
    controls = new MeasureControls({});
    events = { written: [], removed: [] };
    flashes = [];
    alerts = [];
    unitPref = ref('metric');
    return useMapMeasurements({
        measureControls: shallowRef(controls),
        files: () => files.value,
        dataset: () => dataset,
        canWrite: () => canWrite,
        canDelete: () => true,
        currentUnitPref: unitPref,
        showAlert: () => title => alerts.push(title),
        showFlash: () => (message, color) => flashes.push({ message, color }),
        onFileWritten: () => path => events.written.push(path),
        onFileRemoved: () => path => events.removed.push(path),
        analysisTarget
    });
}

const onMap = () => controls.source.getFeatures().map(f => f.get('name')).sort();

beforeEach(() => {
    // A change of units is stored as the user's preference: each test starts from the default
    removePref(PREF.MEASURE_UNIT);
    stored = { 'a/ortho_measurements.geojson': fileOf('m1', 'm2') };
    dataset = {
        getFileContents: vi.fn(async path => {
            if (!(path in stored)) throw Object.assign(new Error('Not found'), { status: 404 });
            return stored[path];
        }),
        writeObj: vi.fn(async (path, blob) => { stored[path] = await blob.text(); }),
        deleteObj: vi.fn(async path => { delete stored[path]; })
    };
    files = ref([{ entry: { path: 'a/ortho.tif', type: T.GEORASTER } }]);
});

describe('useMapMeasurements', () => {
    it('reads the file once per target: a change of the file list does not add the measurements again', async () => {
        const m = start();
        await m.loadSavedMeasurements();
        files.value = [...files.value, { entry: { path: 'a/ortho_measurements.geojson', type: T.VECTOR } }];
        await m.loadSavedMeasurements();
        expect(onMap()).toEqual(['m1', 'm2']);
        expect(dataset.getFileContents).toHaveBeenCalledTimes(1);
        expect(m.hasSavedMeasurements.value).toBe(true);
    });

    it('a save writes the file and tells the file list', async () => {
        delete stored['a/ortho_measurements.geojson'];
        const m = start();
        await m.loadSavedMeasurements();
        controls.importFromGeoJSON(JSON.parse(fileOf('n1')));
        await m.saveMeasurements();
        expect(events.written).toEqual(['a/ortho_measurements.geojson']);
        expect(JSON.parse(stored['a/ortho_measurements.geojson']).features).toHaveLength(1);
        expect(m.hasSavedMeasurements.value).toBe(true);
        expect(controls.isDirty()).toBe(false);
    });

    it('a save with the last measurement deleted removes the file and tells the file list', async () => {
        const m = start();
        await m.loadSavedMeasurements();
        controls.source.getFeatures().forEach(f => controls.deleteMeasurement(f));
        await m.saveMeasurements();
        expect(stored).not.toHaveProperty('a/ortho_measurements.geojson');
        expect(events.removed).toEqual(['a/ortho_measurements.geojson']);
        expect(m.hasSavedMeasurements.value).toBe(false);
    });

    it('a save after deleting one measurement keeps the others only', async () => {
        const m = start();
        await m.loadSavedMeasurements();
        controls.deleteMeasurement(controls.source.getFeatures().find(f => f.get('name') === 'm1'));
        await m.saveMeasurements();
        expect(JSON.parse(stored['a/ortho_measurements.geojson']).features.map(f => f.properties.name)).toEqual(['m2']);
    });

    it('Delete saved removes the file and tells the file list', async () => {
        const m = start();
        await m.loadSavedMeasurements();
        await m.deleteSavedMeasurements();
        expect(stored).not.toHaveProperty('a/ortho_measurements.geojson');
        expect(events.removed).toEqual(['a/ortho_measurements.geojson']);
        expect(onMap()).toEqual([]);
    });

    it('a new target replaces the measurements on the map, quietly when nothing was unsaved', async () => {
        stored['b/measurements.geojson'] = fileOf('b1');
        const m = start();
        await m.loadSavedMeasurements();
        files.value = [{ entry: { path: 'b/notes.txt', type: T.GENERIC } }];
        await m.loadSavedMeasurements();
        expect(onMap()).toEqual(['b1']);
        expect(flashes).toEqual([]);
    });

    describe('with an analysis target', () => {
        let target;
        beforeEach(() => {
            target = null;
            stored['a/dtm_measurements.geojson'] = fileOf('t1');
            files.value = [
                { entry: { path: 'a/ortho.tif', type: T.GEORASTER } },
                { entry: { path: 'a/dtm.tif', type: T.GEORASTER } }
            ];
        });
        // The target is an external of the feature, read on every load
        const startOnTarget = () => start({ analysisTarget: () => target });

        it('are the measurements of the target, not of the first georaster', async () => {
            target = files.value[1].entry;
            const m = startOnTarget();
            await m.loadSavedMeasurements();
            expect(onMap()).toEqual(['t1']);
            expect(m.measurementsRasterPath()).toBe('a/dtm.tif');
        });

        it('stay the default ones without a target', async () => {
            const m = startOnTarget();
            await m.loadSavedMeasurements();
            expect(onMap()).toEqual(['m1', 'm2']);
            expect(m.measurementsRasterPath()).toBe('a/ortho.tif');
            expect(m.defaultMeasurementEntry().path).toBe('a/ortho.tif');
        });

        it('move to the file of a new target, with the warning for what was unsaved', async () => {
            const m = startOnTarget();
            await m.loadSavedMeasurements();
            controls.importFromGeoJSON(JSON.parse(fileOf('n1')));
            target = files.value[1].entry;
            await m.loadSavedMeasurements();
            expect(onMap()).toEqual(['t1']);
            expect(flashes).toEqual([{ message: 'Unsaved measurement changes for "ortho_measurements.geojson" discarded', color: 'warning' }]);
        });

        it('save to the file of the target', async () => {
            target = files.value[1].entry;
            const m = startOnTarget();
            await m.loadSavedMeasurements();
            controls.importFromGeoJSON(JSON.parse(fileOf('n1')));
            await m.saveMeasurements();
            expect(events.written).toEqual(['a/dtm_measurements.geojson']);
            expect(JSON.parse(stored['a/dtm_measurements.geojson']).features.map(f => f.properties.name)).toContain('n1');
            expect(JSON.parse(stored['a/ortho_measurements.geojson']).features).toHaveLength(2);
        });

        it('stay where they are for a target that is not a georaster (a thermal photo drawn as a raster)', async () => {
            const photo = { path: 'a/thermal.tif', type: T.GEOIMAGE };
            files.value = [files.value[0], { entry: photo }];
            target = photo;
            const m = startOnTarget();
            await m.loadSavedMeasurements();
            expect(onMap()).toEqual(['m1', 'm2']);
            expect(m.measurementsRasterPath()).toBe('a/ortho.tif');
        });

        it('answer for a target about to be chosen the file they would move to, as they do once it is chosen', () => {
            const photo = { path: 'a/thermal.tif', type: T.GEOIMAGE };
            const m = startOnTarget();
            expect(m.measurementEntryFor(files.value[1].entry).path).toBe('a/dtm.tif');
            expect(m.measurementEntryFor(photo).path).toBe('a/ortho.tif');
            expect(m.measurementEntryFor(null).path).toBe('a/ortho.tif');
            target = files.value[1].entry;
            expect(m.measurementsRasterPath()).toBe(m.measurementEntryFor(target).path);
        });
    });

    describe('next to a point cloud (the file the 3D viewer saves to)', () => {
        const fromViewer = { type: 'Feature', geometry: { type: 'LineString', coordinates: [[10, 45, 100], [10.001, 45, 101]] },
            properties: { name: 'v1', measurementType: 'distance', localCoordinates: [[0, 0, 0], [1, 0, 1]] } };
        beforeEach(() => {
            stored = { 'a/cloud_measurements.geojson': JSON.stringify({ type: 'FeatureCollection', features: [lengthFeature('m1'), fromViewer] }) };
            files.value = [{ entry: { path: 'a/cloud.laz', type: T.POINTCLOUD } }];
        });
        const inFile = () => JSON.parse(stored['a/cloud_measurements.geojson']).features.map(f => f.properties.name);

        it('shows only the map\'s measurements and saves without touching the 3D viewer\'s', async () => {
            const m = start();
            await m.loadSavedMeasurements();
            expect(onMap()).toEqual(['m1']);
            controls.importFromGeoJSON(JSON.parse(fileOf('m2')));
            await m.saveMeasurements();
            expect(inFile()).toEqual(['m1', 'm2', 'v1']);
        });

        it('Delete saved keeps the file for the 3D viewer and tells the file list it changed', async () => {
            const m = start();
            await m.loadSavedMeasurements();
            await m.deleteSavedMeasurements();
            expect(inFile()).toEqual(['v1']);
            expect(events).toEqual({ written: ['a/cloud_measurements.geojson'], removed: [] });
            expect(m.hasSavedMeasurements.value).toBe(false);
            expect(onMap()).toEqual([]);
        });
    });

    it('a new target drops unsaved measurements with a notice', async () => {
        const m = start();
        await m.loadSavedMeasurements();
        controls.importFromGeoJSON(JSON.parse(fileOf('draft')));
        files.value = [{ entry: { path: 'b/notes.txt', type: T.GENERIC } }];
        await m.loadSavedMeasurements();
        expect(onMap()).toEqual([]);
        expect(flashes).toEqual([{ message: 'Unsaved measurement changes for "ortho_measurements.geojson" discarded', color: 'warning' }]);
    });

    it('exports the measurements as CSV with their group names, in the units shown', async () => {
        const saved = vi.spyOn(csv, 'downloadCsv').mockImplementation(() => {});
        try {
            const m = start();
            await m.loadSavedMeasurements();
            m.createGroup({ name: 'Site A' });
            controls.setMeasurementGroupId(controls.source.getFeatures()[0], m.measurementGroups.value[0].id);
            m.exportMeasurementsToCsv();
            const [text, filename] = saved.mock.calls[0];
            const rows = text.trim().split('\r\n');
            expect(filename).toMatch(/^measurements_\d+\.csv$/);
            expect(rows).toHaveLength(3);
            expect(rows.slice(1).map(r => r.split(',').slice(0, 3).join(','))).toEqual(['Site A,m1,length', ',m2,length']);
        } finally {
            saved.mockRestore();
        }
    });

    it('a CSV export with nothing on the map warns instead of saving an empty file', async () => {
        const saved = vi.spyOn(csv, 'downloadCsv').mockImplementation(() => {});
        try {
            delete stored['a/ortho_measurements.geojson'];
            const m = start();
            await m.loadSavedMeasurements();
            m.exportMeasurementsToCsv();
            expect(saved).not.toHaveBeenCalled();
            expect(alerts).toEqual(['Warning']);
        } finally {
            saved.mockRestore();
        }
    });

    describe('a change of units with measurements on the map', () => {
        const label = () => controls.source.getFeatures().map(f => f.get('tooltipText'));

        it('saves them in the new units for a user who can write', async () => {
            const m = start();
            await m.loadSavedMeasurements();
            m.handleUnitsChanged('imperial');
            expect(m.changeUnitsDialogOpen.value).toBe(true);
            await m.handleChangeUnitsDialogClose('confirm');
            expect(label().every(t => t.endsWith(' ft'))).toBe(true);
            const saved = JSON.parse(stored['a/ortho_measurements.geojson']);
            expect(saved.features.map(f => f.properties.unit)).toEqual(['ft', 'ft']);
            expect(alerts).toEqual([]);
        });

        it('only shows them in the new units for a user who cannot write: no save, no permission alert', async () => {
            const m = start({ canWrite: false });
            await m.loadSavedMeasurements();
            m.handleUnitsChanged('imperial');
            await m.handleChangeUnitsDialogClose('confirm');
            expect(label().every(t => t.endsWith(' ft'))).toBe(true);
            expect(unitPref.value).toBe('imperial');
            expect(dataset.writeObj).not.toHaveBeenCalled();
            expect(alerts).toEqual([]);
        });
    });
});
