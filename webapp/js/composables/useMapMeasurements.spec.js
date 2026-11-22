/**
 * The map's measurements are a working copy of their file: the file is read once per owner
 * (a change of the file list does not add them again), Save makes the file match the map and
 * tells the file list, and a new owner replaces the measurements on the map, after a question
 * about the unsaved ones. The owner is the one file on show, else the folder.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ref, shallowRef, defineComponent, h, effectScope } from 'vue';
import { mount } from '@vue/test-utils';
import ddb from 'ddb';
import Feature from 'ol/Feature';
import { LineString } from 'ol/geom';
import MeasureControls from '@/libs/map/controls/measureControl';
import * as csv from '@/libs/csv';
import { notify } from '@/libs/notify';
import { PREF, removePref } from '@/libs/preferences';
import { DEFAULT_SCHEMA } from '@/libs/reports/reportSettings';
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
let choose;

/** `answer`: what the user answers to the question about unsaved measurements ('confirm': Save, 'secondary': Discard, 'cancel': keep editing). */
function start({ canWrite = true, answer = 'confirm' } = {}) {
    choose = vi.fn(async () => answer);
    controls = new MeasureControls({});
    events = { written: [], removed: [], loaded: 0 };
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
        onMeasurementsLoaded: () => () => events.loaded++,
        choose: () => choose
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
        deleteObj: vi.fn(async path => { delete stored[path]; }),
        // The organization's annotation schema (the default one when the Registry has stored none)
        registry: { getRequest: vi.fn(async () => ({ templates: [], schema: DEFAULT_SCHEMA })) },
        baseApi: '/orgs/o/ds/d'
    };
    files = ref([{ entry: { path: 'a/ortho.tif', type: T.GEORASTER } }]);
});

describe('useMapMeasurements', () => {
    it('tells the map when the measurements of the owner on show were read and are on the map, once per read', async () => {
        const m = start();
        await m.loadSavedMeasurements();
        expect(events.loaded).toBe(1);
        expect(onMap()).toEqual(['m1', 'm2']);
        // The same owner is not read again
        await m.loadSavedMeasurements();
        expect(events.loaded).toBe(1);
        // A file that is not there is read all the same: the map has nothing to show for it
        files.value = [{ entry: { path: 'b/other.tif', type: T.GEORASTER } }];
        await m.loadSavedMeasurements();
        expect(events.loaded).toBe(2);
    });

    it('does not tell the map when the file could not be read', async () => {
        dataset.getFileContents.mockRejectedValue(Object.assign(new Error('boom'), { status: 500 }));
        const m = start();
        await m.loadSavedMeasurements();
        expect(events.loaded).toBe(0);
    });

    it('reads the file once per owner: a change of the file list does not add the measurements again', async () => {
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

    it('a new owner replaces the measurements on the map, quietly when nothing was unsaved', async () => {
        stored['b/notes_measurements.geojson'] = fileOf('b1');
        const m = start();
        await m.loadSavedMeasurements();
        files.value = [{ entry: { path: 'b/notes.txt', type: T.GENERIC } }];
        await m.loadSavedMeasurements();
        expect(onMap()).toEqual(['b1']);
        expect(flashes).toEqual([]);
        expect(choose).not.toHaveBeenCalled();
    });

    describe('after a read of the file that failed', () => {
        const FILE = 'a/ortho_measurements.geojson';
        let refused;
        beforeEach(() => {
            refused = vi.spyOn(notify, 'warn').mockImplementation(() => {});
            vi.spyOn(console, 'error').mockImplementation(() => {});
            // The first read of the file fails (a 500), the next ones are the file
            const read = dataset.getFileContents;
            dataset.getFileContents = vi.fn()
                .mockRejectedValueOnce(Object.assign(new Error('Server Error'), { status: 500 }))
                .mockImplementation(read);
        });
        afterEach(() => vi.restoreAllMocks());

        it('refuses a save, and writes nothing, until the file is read again', async () => {
            const m = start();
            await m.loadSavedMeasurements();
            controls.importFromGeoJSON(JSON.parse(fileOf('n1')));

            await m.saveMeasurements();

            expect(dataset.writeObj).not.toHaveBeenCalled();
            expect(JSON.parse(stored[FILE]).features).toHaveLength(2);
            expect(refused).toHaveBeenCalledTimes(1);
            expect(refused.mock.calls[0][1].action.label).toBe('Reload');
            expect(events.written).toEqual([]);
        });

        it('refuses the save that follows a change of units too', async () => {
            const m = start();
            await m.loadSavedMeasurements();
            controls.importFromGeoJSON(JSON.parse(fileOf('n1')));
            m.changeUnitsTargetUnit = 'imperial';

            await m.handleChangeUnitsDialogClose('confirm');

            expect(dataset.writeObj).not.toHaveBeenCalled();
            expect(refused).toHaveBeenCalledTimes(1);
        });

        it('keeps what the file held with what is drawn after Reload, and saves both', async () => {
            const m = start();
            await m.loadSavedMeasurements();
            await m.saveMeasurements();
            expect(dataset.writeObj).not.toHaveBeenCalled();

            // The Reload of the notice: the file is read again, the map shows it
            await refused.mock.calls[0][1].action.run();
            expect(onMap()).toEqual(['m1', 'm2']);
            controls.importFromGeoJSON(JSON.parse(fileOf('n1')));
            await m.saveMeasurements();

            expect(JSON.parse(stored[FILE]).features.map(f => f.properties.name).sort()).toEqual(['m1', 'm2', 'n1']);
            expect(refused).toHaveBeenCalledTimes(1);
        });

        it('warns of what Reload discards', async () => {
            const m = start();
            await m.loadSavedMeasurements();
            controls.importFromGeoJSON(JSON.parse(fileOf('n1')));
            await m.saveMeasurements();

            await refused.mock.calls[0][1].action.run();

            expect(flashes).toEqual([{ message: 'Unsaved measurement changes for "ortho_measurements.geojson" discarded', color: 'warning' }]);
            expect(onMap()).toEqual(['m1', 'm2']);
        });

        it('reads the file again once when two notices are clicked, whether one after the other or together', async () => {
            const m = start();
            await m.loadSavedMeasurements();
            controls.importFromGeoJSON(JSON.parse(fileOf('n1')));
            await m.saveMeasurements();
            await m.saveMeasurements();
            expect(refused).toHaveBeenCalledTimes(2);
            const [first, second] = refused.mock.calls.map(call => call[1].action.run);

            first();
            second();
            await vi.waitFor(() => expect(onMap()).toEqual(['m1', 'm2']));
            // A notice clicked after the read worked does nothing either
            first();
            await Promise.resolve();

            expect(dataset.getFileContents).toHaveBeenCalledTimes(2);
            expect(onMap()).toEqual(['m1', 'm2']);
        });

        it('does nothing when the notice of an earlier owner is clicked after the map moved to another one', async () => {
            stored['b/notes_measurements.geojson'] = fileOf('b1');
            const m = start();
            await m.loadSavedMeasurements();
            await m.saveMeasurements();
            files.value = [{ entry: { path: 'b/notes.txt', type: T.GENERIC } }];
            await m.loadSavedMeasurements();
            expect(onMap()).toEqual(['b1']);
            const reads = dataset.getFileContents.mock.calls.length;

            refused.mock.calls[0][1].action.run();
            await Promise.resolve();

            expect(dataset.getFileContents).toHaveBeenCalledTimes(reads);
            expect(onMap()).toEqual(['b1']);
        });

        it('does nothing when the notice is clicked after the map was left', async () => {
            let m;
            controls = new MeasureControls({});
            const host = mount(defineComponent({
                setup() {
                    m = useMapMeasurements({
                        measureControls: shallowRef(controls), files: () => files.value, dataset: () => dataset, canWrite: () => true, canDelete: () => true,
                        currentUnitPref: ref('metric'), showAlert: () => () => {}, showFlash: () => () => {}, onFileWritten: () => () => {}, onFileRemoved: () => () => {}
                    });
                    return () => h('div');
                }
            }));
            await m.loadSavedMeasurements();
            await m.saveMeasurements();
            host.unmount();

            refused.mock.calls[0][1].action.run();
            await Promise.resolve();

            expect(dataset.getFileContents).toHaveBeenCalledTimes(1);
        });

        it('lets Delete saved through: the user chose to remove the file', async () => {
            const m = start();
            await m.loadSavedMeasurements();

            await m.deleteSavedMeasurements();

            expect(stored).not.toHaveProperty(FILE);
        });
    });

    it('refuses a save while the file is still being read', async () => {
        const refused = vi.spyOn(notify, 'warn').mockImplementation(() => {});
        let release;
        const read = dataset.getFileContents;
        dataset.getFileContents = vi.fn()
            .mockImplementationOnce(path => new Promise(resolve => { release = () => resolve(read(path)); }))
            .mockImplementation(read);
        const m = start();
        const loading = m.loadSavedMeasurements();
        await vi.waitFor(() => expect(release).toBeTypeOf('function'));
        controls.importFromGeoJSON(JSON.parse(fileOf('n1')));

        await m.saveMeasurements();
        expect(dataset.writeObj).not.toHaveBeenCalled();
        expect(refused.mock.calls[0][1].action).toBeUndefined();

        release();
        await loading;
        await m.saveMeasurements();
        expect(dataset.writeObj).toHaveBeenCalledTimes(1);
        vi.restoreAllMocks();
    });

    it('drops the answer of a read that another read of the same file overtook (a Reload while it was going)', async () => {
        const read = dataset.getFileContents;
        let release;
        dataset.getFileContents = vi.fn()
            .mockImplementationOnce(() => new Promise(resolve => { release = () => resolve(JSON.stringify({ type: 'FeatureCollection', features: [lengthFeature('stale')] })); }))
            .mockImplementation(read);
        const m = start();
        const first = m.loadSavedMeasurements();
        await vi.waitFor(() => expect(release).toBeTypeOf('function'));

        await m.loadSavedMeasurements({ reload: true });
        release();
        await first;

        expect(onMap()).toEqual(['m1', 'm2']);
    });

    describe('the file the measurements belong to', () => {
        const raster = path => ({ entry: { path, type: T.GEORASTER } });
        const pathOnMap = async files_ => {
            files.value = files_;
            const m = start();
            await m.loadSavedMeasurements();
            return { m, path: m.measurementsFilePath.value };
        };

        it('is the sidecar of the one file on show, whatever its type', async () => {
            for (const [entry, sidecar] of [
                [{ path: 'a/ortho.tif', type: T.GEORASTER }, 'a/ortho_measurements.geojson'],
                [{ path: 'a/cloud.laz', type: T.POINTCLOUD }, 'a/cloud_measurements.geojson'],
                [{ path: 'a/photo.jpg', type: T.GEOIMAGE }, 'a/photo_measurements.geojson'],
                [{ path: 'top.tif', type: T.GEORASTER }, 'top_measurements.geojson']
            ]) {
                const { m, path } = await pathOnMap([{ entry }]);
                expect(path).toBe(sidecar);
                expect(m.measurementOwnerEntry().path).toBe(entry.path);
            }
        });

        it('is the file of the folder for the children of a folder, however many rasters they hold', async () => {
            const { path } = await pathOnMap([raster('a/ortho.tif'), raster('a/dtm.tif'), { entry: { path: 'a/notes.txt', type: T.GENERIC } }]);
            expect(path).toBe('a/measurements.geojson');
        });

        it('is the file of the folder of the first file for several files, and the root file in the root', async () => {
            expect((await pathOnMap([raster('a/ortho.tif'), raster('b/dtm.tif')])).path).toBe('a/measurements.geojson');
            expect((await pathOnMap([raster('ortho.tif'), raster('dtm.tif')])).path).toBe('measurements.geojson');
        });

        it('is the file of the folder for a view with layers: its base and a layer that cannot be drawn yet', async () => {
            const layer = { entry: null, placeholder: { path: 'a/building.tif', kind: 'building', text: 'Building' } };
            expect((await pathOnMap([raster('a/ortho.tif'), raster('a/dtm.tif')])).path).toBe('a/measurements.geojson');
            expect((await pathOnMap([raster('a/ortho.tif'), layer])).path).toBe('a/measurements.geojson');
        });

        it('is the sidecar of a single layer that cannot be drawn yet', async () => {
            const layer = { entry: null, placeholder: { path: 'a/building.tif', kind: 'building', text: 'Building' } };
            expect((await pathOnMap([layer])).path).toBe('a/building_measurements.geojson');
        });

        it('does not count the folders of a listing nor the measurements files in it (a save adds one, and must not move the file)', async () => {
            const listing = [
                raster('a/ortho.tif'),
                { entry: { path: 'a/sub', type: T.DIRECTORY } },
                { entry: { path: 'a/ortho_measurements.geojson', type: T.VECTOR } },
                { entry: { path: 'a/measurements.geojson', type: T.VECTOR } }
            ];
            expect((await pathOnMap(listing)).path).toBe('a/ortho_measurements.geojson');
        });

        it('keeps the file after a save that adds the sidecar to the listing', async () => {
            delete stored['a/ortho_measurements.geojson'];
            const m = start();
            await m.loadSavedMeasurements();
            controls.importFromGeoJSON(JSON.parse(fileOf('n1')));
            await m.saveMeasurements();
            files.value = [...files.value, { entry: { path: 'a/ortho_measurements.geojson', type: T.VECTOR } }];
            await m.loadSavedMeasurements();
            expect(m.measurementsFilePath.value).toBe('a/ortho_measurements.geojson');
            expect(onMap()).toEqual(['n1']);
            expect(choose).not.toHaveBeenCalled();
        });

        it('shows the file of the folder when a single file becomes a folder, and the sidecar when it is a single file again', async () => {
            stored['a/measurements.geojson'] = fileOf('f1');
            const m = start();
            await m.loadSavedMeasurements();
            expect(onMap()).toEqual(['m1', 'm2']);

            files.value = [raster('a/ortho.tif'), raster('a/dtm.tif')];
            await m.loadSavedMeasurements();
            expect(onMap()).toEqual(['f1']);
            expect(m.activeMeasurementEntry.value.path).toBe('a/measurements.geojson');

            files.value = [raster('a/ortho.tif')];
            await m.loadSavedMeasurements();
            expect(onMap()).toEqual(['m1', 'm2']);
        });

        it('saves to the file of the folder for several files, and leaves the sidecars alone', async () => {
            files.value = [raster('a/ortho.tif'), raster('a/dtm.tif')];
            const m = start();
            await m.loadSavedMeasurements();
            controls.importFromGeoJSON(JSON.parse(fileOf('n1')));
            await m.saveMeasurements();
            expect(events.written).toEqual(['a/measurements.geojson']);
            expect(JSON.parse(stored['a/measurements.geojson']).features.map(f => f.properties.name)).toEqual(['n1']);
            expect(JSON.parse(stored['a/ortho_measurements.geojson']).features).toHaveLength(2);
        });
    });

    describe('when the owner changes with unsaved measurements', () => {
        const SIDECAR = 'a/ortho_measurements.geojson';
        const raster = path => ({ entry: { path, type: T.GEORASTER } });
        const toFolder = () => { files.value = [raster('a/ortho.tif'), raster('a/dtm.tif')]; };

        beforeEach(() => { stored['a/measurements.geojson'] = fileOf('f1'); });

        async function draft(options) {
            const m = start(options);
            await m.loadSavedMeasurements();
            controls.importFromGeoJSON(JSON.parse(fileOf('n1')));
            expect(controls.isDirty()).toBe(true);
            return m;
        }

        it('asks to Save them to the file they were made in before showing the other one, naming both', async () => {
            const m = await draft();
            toFolder();
            await m.loadSavedMeasurements();
            expect(choose).toHaveBeenCalledTimes(1);
            const question = choose.mock.calls[0][0];
            expect(question.message).toBe(`Save the measurements to <strong>${SIDECAR}</strong> before showing <strong>a/measurements.geojson</strong>?`);
            expect(question).toMatchObject({ confirmText: 'Save', secondaryText: 'Discard', secondaryDanger: true, cancelText: 'Keep editing' });
        });

        it('Save writes what is on the map to the previous file, then shows the new one', async () => {
            const m = await draft({ answer: 'confirm' });
            toFolder();
            await m.loadSavedMeasurements();
            expect(JSON.parse(stored[SIDECAR]).features.map(f => f.properties.name).sort()).toEqual(['m1', 'm2', 'n1']);
            expect(events.written).toEqual([SIDECAR]);
            expect(onMap()).toEqual(['f1']);
            expect(m.measurementsFilePath.value).toBe('a/measurements.geojson');
            expect(controls.isDirty()).toBe(false);
            expect(flashes.map(f => f.color)).toEqual(['positive']);
        });

        it('Discard shows the new file and writes nothing', async () => {
            const m = await draft({ answer: 'secondary' });
            toFolder();
            await m.loadSavedMeasurements();
            expect(dataset.writeObj).not.toHaveBeenCalled();
            expect(JSON.parse(stored[SIDECAR]).features).toHaveLength(2);
            expect(onMap()).toEqual(['f1']);
            expect(controls.isDirty()).toBe(false);
        });

        it('Keep editing (or a dismissed question) keeps the map, its edits and its own file; their Save then shows the new file', async () => {
            const m = await draft({ answer: 'cancel' });
            toFolder();
            await m.loadSavedMeasurements();
            expect(dataset.writeObj).not.toHaveBeenCalled();
            expect(onMap()).toEqual(['m1', 'm2', 'n1']);
            expect(m.measurementsFilePath.value).toBe(SIDECAR);
            expect(controls.isDirty()).toBe(true);

            await m.saveMeasurements();
            expect(JSON.parse(stored[SIDECAR]).features.map(f => f.properties.name).sort()).toEqual(['m1', 'm2', 'n1']);
            expect(m.measurementsFilePath.value).toBe('a/measurements.geojson');
            expect(onMap()).toEqual(['f1']);
            expect(choose).toHaveBeenCalledTimes(1);
        });

        it('asks nothing when nothing is unsaved, and none of the old notice is shown', async () => {
            const m = start();
            await m.loadSavedMeasurements();
            toFolder();
            await m.loadSavedMeasurements();
            expect(choose).not.toHaveBeenCalled();
            expect(flashes).toEqual([]);
            expect(onMap()).toEqual(['f1']);
        });

        it('asks once for a change that comes while the question is open, and shows what is on show when it is answered', async () => {
            const m = await draft();
            let answer;
            choose.mockImplementation(() => new Promise(resolve => { answer = resolve; }));
            toFolder();
            const first = m.loadSavedMeasurements();
            await vi.waitFor(() => expect(answer).toBeTypeOf('function'));
            // The user picks a single file meanwhile: no second question, and the map is not touched yet
            files.value = [raster('a/dtm.tif')];
            await m.loadSavedMeasurements();
            expect(choose).toHaveBeenCalledTimes(1);
            expect(onMap()).toContain('n1');

            answer('confirm');
            await first;
            expect(JSON.parse(stored[SIDECAR]).features.map(f => f.properties.name)).toContain('n1');
            expect(m.measurementsFilePath.value).toBe('a/dtm_measurements.geojson');
            expect(onMap()).toEqual([]);
        });

        it('keeps the map and its own file when the Save fails, with the alert that says so', async () => {
            const m = await draft({ answer: 'confirm' });
            vi.spyOn(console, 'error').mockImplementation(() => {});
            dataset.writeObj.mockRejectedValueOnce(new Error('disk full'));
            toFolder();
            await m.loadSavedMeasurements();
            vi.restoreAllMocks();
            expect(alerts).toEqual(['Error']);
            expect(onMap()).toEqual(['m1', 'm2', 'n1']);
            expect(m.measurementsFilePath.value).toBe(SIDECAR);
            expect(controls.isDirty()).toBe(true);
        });

        it('drops them with the old notice, without a question, for a user who cannot write', async () => {
            const m = await draft({ canWrite: false });
            toFolder();
            await m.loadSavedMeasurements();
            expect(choose).not.toHaveBeenCalled();
            expect(flashes).toEqual([{ message: 'Unsaved measurement changes for "ortho_measurements.geojson" discarded', color: 'warning' }]);
            expect(onMap()).toEqual(['f1']);
        });

        it('drops them with the old notice, without a question, when the file was not read (a save would be refused)', async () => {
            vi.spyOn(console, 'error').mockImplementation(() => {});
            const read = dataset.getFileContents;
            dataset.getFileContents = vi.fn().mockRejectedValueOnce(Object.assign(new Error('Server Error'), { status: 500 })).mockImplementation(read);
            const m = await draft();
            toFolder();
            await m.loadSavedMeasurements();
            vi.restoreAllMocks();
            expect(choose).not.toHaveBeenCalled();
            expect(flashes).toHaveLength(1);
            expect(onMap()).toEqual(['f1']);
        });
    });

    describe('the measurements that are not in their file', () => {
        let scope;
        afterEach(() => scope?.stop());

        function startWithControls() {
            const holder = shallowRef(null);
            scope = effectScope();
            const m = scope.run(() => useMapMeasurements({
                measureControls: holder, files: () => files.value, dataset: () => dataset, canWrite: () => true, canDelete: () => true,
                currentUnitPref: ref('metric'), showAlert: () => () => {}, showFlash: () => () => {}, choose: () => async () => 'confirm'
            }));
            m.createMeasureControls({ openDialog: () => {} });
            controls = holder.value;
            return m;
        }

        it('are told reactively: a drawn measurement makes them unsaved, a save or a load makes them saved', async () => {
            const m = startWithControls();
            await m.loadSavedMeasurements();
            expect(m.hasUnsavedMeasurements.value).toBe(false);
            controls.importFromGeoJSON(JSON.parse(fileOf('n1')));
            expect(m.hasUnsavedMeasurements.value).toBe(true);
            await m.saveMeasurements();
            expect(m.hasUnsavedMeasurements.value).toBe(false);
            controls.deleteMeasurement(controls.source.getFeatures()[0]);
            expect(m.hasUnsavedMeasurements.value).toBe(true);
            files.value = [{ entry: { path: 'b/other.tif', type: T.GEORASTER } }];
            await m.loadSavedMeasurements();
            expect(m.hasUnsavedMeasurements.value).toBe(false);
        });

        it('offer their photos the dataset and the file they are saved in, once it is known, and the write access of the user', async () => {
            const m = startWithControls();
            expect(controls.getPhotoHost()).toBeNull();
            await m.loadSavedMeasurements();
            expect(controls.getPhotoHost()).toEqual({ dataset, measurementPath: 'a/ortho_measurements.geojson', readOnly: false });
        });

        it('name the file they are saved in, once it is known', async () => {
            const m = startWithControls();
            expect(m.measurementsFilePath.value).toBe('');
            await m.loadSavedMeasurements();
            expect(m.measurementsFilePath.value).toBe('a/ortho_measurements.geojson');
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
            expect(events).toMatchObject({ written: ['a/cloud_measurements.geojson'], removed: [] });
            expect(m.hasSavedMeasurements.value).toBe(false);
            expect(onMap()).toEqual([]);
        });
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

    describe('the ids and the references of the measurements', () => {
        let scope;
        afterEach(() => scope?.stop());

        function startWired() {
            const holder = shallowRef(null);
            scope = effectScope();
            const m = scope.run(() => useMapMeasurements({
                measureControls: holder, files: () => files.value, dataset: () => dataset, canWrite: () => true, canDelete: () => true,
                currentUnitPref: ref('metric'), showAlert: () => () => {}, showFlash: () => (message, color) => flashes.push({ message, color }),
                choose: () => async () => 'confirm'
            }));
            flashes = [];
            m.createMeasureControls({ openDialog: () => {} });
            controls = holder.value;
            return m;
        }
        const drawn = id => {
            const feature = new Feature(new LineString([[0, 0], [100, 0]]));
            feature.setProperties({ measurementType: 'length', name: id, createdAt: '2026-11-01T10:00:00.000Z' });
            controls.source.addFeature(feature);
            return feature;
        };
        const refOf = name => controls.source.getFeatures().find(f => f.get('name') === name).get('ref');

        it('a file with none is loaded with ids and no references, and is not unsaved', async () => {
            const m = startWired();
            await m.loadSavedMeasurements();
            controls.source.getFeatures().forEach(f => {
                expect(f.get('id')).toMatch(/^[0-9a-f]{64}/);
                expect(f.get('ref')).toBeUndefined();
            });
            expect(m.hasUnsavedMeasurements.value).toBe(false);
        });

        it('a save numbers them: the map shows the references the file gave, and is saved', async () => {
            const m = startWired();
            await m.loadSavedMeasurements();
            await m.saveMeasurements();
            expect(['m1', 'm2'].map(refOf).sort()).toEqual(['1', '2']);
            expect(JSON.parse(stored['a/ortho_measurements.geojson']).features.map(f => f.properties.ref).sort()).toEqual(['1', '2']);
            expect(m.hasUnsavedMeasurements.value).toBe(false);
        });

        it('a new measurement has the next reference after the ones of the file, the other view\'s too', async () => {
            stored['a/ortho_measurements.geojson'] = JSON.stringify({
                type: 'FeatureCollection', metadata: { version: '3.0', lastRef: 6 },
                features: [{ ...lengthFeature('m1'), properties: { ...lengthFeature('m1').properties, id: 'i1', ref: '2' } }]
            });
            const m = startWired();
            await m.loadSavedMeasurements();
            const added = drawn('n1');
            controls.identify(added);
            expect(added.get('ref')).toBe('7');
            await m.saveMeasurements();
            expect(refOf('n1')).toBe('7');
            expect(JSON.parse(stored['a/ortho_measurements.geojson']).metadata.lastRef).toBe(7);
        });

        it('says so when a save finds the reference of a new measurement taken by another session, and the map shows the new one', async () => {
            const m = startWired();
            await m.loadSavedMeasurements();
            const added = drawn('n1');
            controls.identify(added);
            expect(added.get('ref')).toBe('1');
            // The 3D viewer saved an item with that reference since the map read the file
            const doc = JSON.parse(stored['a/ortho_measurements.geojson']);
            doc.features.push({ type: 'Feature', geometry: null, properties: { measurementType: 'distance', localCoordinates: [[0, 0, 0]], id: 'cloud-1', ref: '1' } });
            stored['a/ortho_measurements.geojson'] = JSON.stringify(doc);
            const warn = vi.spyOn(notify, 'warn').mockImplementation(() => {});
            try {
                await m.saveMeasurements();
                expect(warn).toHaveBeenCalledWith('Reference 1 was taken; the item is now 2', expect.anything());
                expect(refOf('n1')).not.toBe('1');
                const refs = JSON.parse(stored['a/ortho_measurements.geojson']).features.map(f => f.properties.ref);
                expect(new Set(refs).size).toBe(refs.length);
                expect(m.hasUnsavedMeasurements.value).toBe(false);
            } finally {
                warn.mockRestore();
            }
        });

        it('gives the dialog of a measurement the organization\'s schema once it is read', async () => {
            const m = startWired();
            const schema = { categories: [{ id: 'c', name: 'C', colour: '#000000' }], severities: [], statuses: [{ id: 's', name: 'S', closed: false }] };
            dataset.registry.getRequest.mockResolvedValue({ templates: [], schema });
            await m.loadSavedMeasurements();
            await vi.waitFor(() => expect(controls.annotationSchema).toBe(schema));
            expect(dataset.registry.getRequest).toHaveBeenCalledWith('/orgs/o/ds/d/report-settings');
        });

        it('exports the id, reference and fields of each measurement in the CSV', async () => {
            const saved = vi.spyOn(csv, 'downloadCsv').mockImplementation(() => {});
            try {
                const m = startWired();
                await m.loadSavedMeasurements();
                await m.saveMeasurements();
                controls.source.getFeatures().find(f => f.get('name') === 'm1').setProperties({ category: 'defect', status: 'open', assignee: 'Anna', dueDate: '2026-12-01' });
                m.exportMeasurementsToCsv();
                const [header, ...rows] = saved.mock.calls[0][0].trim().split('\r\n');
                expect(header).toContain('id,ref,category,severity,status,assignee,dueDate,photoCount');
                // The WKT of a line has commas: it is quoted
                const fields = line => line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
                const columns = fields(header);
                const row = fields(rows.find(r => fields(r)[1] === 'm1'));
                expect(row[columns.indexOf('category')]).toBe('defect');
                expect(row[columns.indexOf('status')]).toBe('open');
                expect(row[columns.indexOf('assignee')]).toBe('Anna');
                expect(row[columns.indexOf('dueDate')]).toBe('2026-12-01');
                expect(row[columns.indexOf('ref')]).toMatch(/^[12]$/);
                expect(row[columns.indexOf('photoCount')]).toBe('0');
            } finally {
                saved.mockRestore();
            }
        });
    });
});
