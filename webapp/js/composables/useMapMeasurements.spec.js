/**
 * The map's measurements are a working copy of their file: the file is read once per target
 * (a change of the file list does not add them again), Save makes the file match the map and
 * tells the file list, and a new target replaces the measurements on the map.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref, shallowRef } from 'vue';
import ddb from 'ddb';
import MeasureControls from '@/libs/map/controls/measureControl';
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

function start() {
    controls = new MeasureControls({});
    events = { written: [], removed: [] };
    flashes = [];
    return useMapMeasurements({
        measureControls: shallowRef(controls),
        files: () => files.value,
        dataset: () => dataset,
        canWrite: () => true,
        canDelete: () => true,
        currentUnitPref: ref('metric'),
        showAlert: () => vi.fn(),
        showFlash: () => (message, color) => flashes.push({ message, color }),
        onFileWritten: () => path => events.written.push(path),
        onFileRemoved: () => path => events.removed.push(path)
    });
}

const onMap = () => controls.source.getFeatures().map(f => f.get('name')).sort();

beforeEach(() => {
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
});
