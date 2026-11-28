/**
 * The measurement file of a set of files on show: the one file's sidecar, else measurements.geojson in the folder of the
 * first file. The map saves by it and a report's links open the map by it.
 */
import { describe, it, expect } from 'vitest';
import ddb from 'ddb';
import { drawnByMap, measuredFiles, measurementFileOf, measurementOwnerEntry, shownPath, standaloneMeasurementEntry, viewMeasurementOwner } from './measurementOwner';

const entry = (path, type = ddb.entry.type.GEORASTER) => ({ entry: { path, type } });
const placeholder = path => ({ placeholder: { path } });

describe('shownPath', () => {
    it('is the path of the entry, else of the placeholder, else null', () => {
        expect(shownPath(entry('a/b.tif'))).toBe('a/b.tif');
        expect(shownPath(placeholder('a/c.tif'))).toBe('a/c.tif');
        expect(shownPath({})).toBeNull();
    });
});

describe('measuredFiles', () => {
    it('leaves out the folders of a listing and the measurement files themselves, and keeps the placeholders', () => {
        const files = [entry('a'), entry('a/one.tif'), entry('a/one_measurements.geojson', ddb.entry.type.GENERIC), entry('a/measurements.geojson', ddb.entry.type.GENERIC), placeholder('a/two.tif')];
        files[0].entry.type = ddb.entry.type.DIRECTORY;
        expect(measuredFiles(files).map(shownPath)).toEqual(['a/one.tif', 'a/two.tif']);
    });
});

describe('drawnByMap', () => {
    it('is true for the types the map draws and for a layer that cannot be drawn yet', () => {
        const T = ddb.entry.type;
        for (const type of [T.GEORASTER, T.GEOIMAGE, T.GEOVIDEO, T.GEOPANORAMA, T.POINTCLOUD, T.VECTOR, T.GAUSSIAN_SPLAT]) {
            expect(drawnByMap(entry('a/file', type))).toBe(true);
        }
        expect(drawnByMap(placeholder('a/building.tif'))).toBe(true);
    });

    it('is false for a folder, a notes file, a PDF, a model and a measurements file', () => {
        const T = ddb.entry.type;
        for (const [path, type] of [['a/sub', T.DIRECTORY], ['a/notes.txt', T.GENERIC], ['a/report.pdf', T.GENERIC], ['a/model.obj', T.MODEL],
            ['a/ortho_measurements.geojson', T.VECTOR], ['a/measurements.geojson', T.VECTOR]]) {
            expect(drawnByMap(entry(path, type)), path).toBe(false);
        }
    });
});

describe('measurementOwnerEntry', () => {
    it('is the sidecar of the raster when the other files of the folder are not drawn: an upload of a notes file does not move the file', () => {
        const T = ddb.entry.type;
        const files = [entry('flights/ortho.tif'), entry('flights/notes.txt', T.GENERIC), entry('flights/report.pdf', T.GENERIC), entry('flights/sub', T.DIRECTORY)];
        expect(measurementFileOf(files)).toBe('flights/ortho_measurements.geojson');
        expect(measurementFileOf([files[0]])).toBe('flights/ortho_measurements.geojson');
    });

    it('is the sidecar of the first raster that has one when the folder has no measurements file of its own', () => {
        const files = [entry('flights/ortho.tif'), entry('flights/dsm.tif'), entry('flights/dsm_measurements.geojson', ddb.entry.type.VECTOR)];
        expect(measurementOwnerEntry(files).path).toBe('flights/dsm.tif');
        expect(measurementFileOf(files)).toBe('flights/dsm_measurements.geojson');
        // The first of two that have one
        expect(measurementFileOf([...files, entry('flights/ortho_measurements.geojson', ddb.entry.type.VECTOR)])).toBe('flights/ortho_measurements.geojson');
    });

    it('is the file of the folder as soon as the listing holds it, whatever sidecars are there', () => {
        const files = [entry('flights/ortho.tif'), entry('flights/dsm.tif'), entry('flights/ortho_measurements.geojson', ddb.entry.type.VECTOR),
            entry('flights/measurements.geojson', ddb.entry.type.VECTOR)];
        expect(measurementFileOf(files)).toBe('flights/measurements.geojson');
    });

    it('is the file of the folder when no raster has a sidecar, and for layers that are only placeholders', () => {
        expect(measurementFileOf([entry('flights/ortho.tif'), entry('flights/dsm.tif')])).toBe('flights/measurements.geojson');
        expect(measurementFileOf([placeholder('flights/ortho.tif'), placeholder('flights/dsm.tif')])).toBe('flights/measurements.geojson');
    });

    it('does not take the sidecar of a file that is not a raster', () => {
        const T = ddb.entry.type;
        const files = [entry('flights/a.laz', T.POINTCLOUD), entry('flights/b.laz', T.POINTCLOUD), entry('flights/a_measurements.geojson', T.VECTOR)];
        expect(measurementFileOf(files)).toBe('flights/measurements.geojson');
    });

    it('is the one file on show: its sidecar holds the measurements', () => {
        const file = entry('flights/ortho.tif');
        expect(measurementOwnerEntry([file])).toBe(file.entry);
        expect(measurementFileOf([file])).toBe('flights/ortho_measurements.geojson');
    });

    it('is the one file even when a measurements file of the folder is listed beside it', () => {
        const files = [entry('flights/ortho.tif'), entry('flights/measurements.geojson', ddb.entry.type.GENERIC)];
        expect(measurementFileOf(files)).toBe('flights/ortho_measurements.geojson');
    });

    it('is the placeholder of a layer that cannot be drawn (yet) when it is the only one', () => {
        expect(measurementOwnerEntry([placeholder('flights/dsm.tif')])).toEqual({ path: 'flights/dsm.tif' });
        expect(measurementFileOf([placeholder('flights/dsm.tif')])).toBe('flights/dsm_measurements.geojson');
    });

    it('is the file of the folder of the first file when there are several', () => {
        const files = [entry('flights/ortho.tif'), entry('flights/dsm.tif')];
        expect(standaloneMeasurementEntry(files)).toEqual({ path: 'flights/measurements.geojson' });
        expect(measurementFileOf(files)).toBe('flights/measurements.geojson');
        expect(measurementFileOf([entry('other/dsm.tif'), entry('flights/ortho.tif')])).toBe('other/measurements.geojson');
    });

    it('is the file at the root of the dataset for files at the root', () => {
        expect(measurementFileOf([entry('ortho.tif'), entry('dsm.tif')])).toBe('measurements.geojson');
    });

    it('is the file of the folder when the listing shows nothing but a folder or measurement files', () => {
        const folder = entry('flights', ddb.entry.type.DIRECTORY);
        expect(measurementFileOf([folder])).toBe('measurements.geojson');
        expect(measurementFileOf([])).toBe('measurements.geojson');
    });
});

describe('viewMeasurementOwner', () => {
    const state = (base, layers) => ({ base: { path: base }, layers: layers.map(path => ({ path })) });

    it('is the one georaster of a view: its sidecar holds the measurements', () => {
        expect(viewMeasurementOwner(state('odm/ortho.tif', ['odm/ortho.tif']))).toEqual({ path: 'odm/ortho.tif' });
    });

    it('is the folder file of the bottom layer for a view of several layers, and of the base for a base that is not a layer', () => {
        expect(viewMeasurementOwner(state('odm/ortho.tif', ['odm/ortho.tif', 'dsm/dsm.tif']))).toEqual({ path: 'dsm/measurements.geojson' });
        expect(viewMeasurementOwner(state('zones.geojson', ['odm/ortho.tif']))).toEqual({ path: 'measurements.geojson' });
        expect(viewMeasurementOwner(state('zones.geojson', []))).toEqual({ path: 'zones.geojson' });
    });
});
