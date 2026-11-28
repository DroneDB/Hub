/**
 * Reading the measurement files of a report: each source on its own, a failure listed with its reason, and the whole
 * path from an old file to a model.
 */
import { describe, it, expect, vi } from 'vitest';
import { loadReportSource, loadReportSources } from './reportSources';
import { buildReportModel } from './reportModel';
import { NO_REF } from './reportItems';
import { ApiError } from '@/libs/ddb/apiError';
import { mixedFile } from '@/libs/map/measurementFormat.fixtures';
import { definitionOf, inputOf, blocksOf, documentOf, mapFeature } from './reportModel.fixtures';
import { buildItems } from './reportItems';
import { ArtifactRole } from '@/libs/ddb/buildArtifacts';
import { US_FOOT_WKT, WGS84_WKT } from '@/libs/map/crs.fixtures';

const datasetOf = (files, entries = null) => ({
    getFileContents: vi.fn(async path => {
        if (!(path in files)) throw new ApiError('Not found', 404);
        if (files[path] instanceof Error) throw files[path];
        return files[path];
    }),
    ...(entries ? {
        listOne: vi.fn(async path => {
            if (!(path in entries)) throw new Error(`Cannot find: ${path}`);
            return entries[path];
        })
    } : {})
});

describe('loadReportSource', () => {
    it('reads a file as a 3.0 document, from text or from a parsed file', async () => {
        const document = documentOf([mapFeature('p1', '1', 'point', { type: 'Point', coordinates: [9, 45] })]);
        const dataset = datasetOf({ 'a.geojson': JSON.stringify(document), 'b.geojson': document });
        expect((await loadReportSource(dataset, 'a.geojson')).document.metadata.version).toBe('3.0');
        expect((await loadReportSource(dataset, 'b.geojson')).document.features).toHaveLength(1);
    });

    it('says why it could not: missing, empty, not JSON, of a newer format, a failed request', async () => {
        const dataset = datasetOf({
            'empty.geojson': '', 'bad.geojson': '{nope', 'future.geojson': JSON.stringify({ type: 'FeatureCollection', features: [], metadata: { version: '4.0' } }),
            'down.geojson': new ApiError('Gateway timeout', 504)
        });
        expect(await loadReportSource(dataset, 'missing.geojson')).toEqual({ file: 'missing.geojson', error: 'The file does not exist' });
        expect(await loadReportSource(dataset, 'empty.geojson')).toEqual({ file: 'empty.geojson', error: 'The file is empty' });
        expect((await loadReportSource(dataset, 'bad.geojson')).error).toBe('The measurements file is not valid JSON');
        expect((await loadReportSource(dataset, 'future.geojson')).error).toContain('newer format');
        expect((await loadReportSource(dataset, 'down.geojson')).error).toBe('The file cannot be read: Gateway timeout');
    });
});

describe('loadReportSources', () => {
    it('reads every source, a failure not stopping the others', async () => {
        const dataset = datasetOf({ 'a.geojson': JSON.stringify(documentOf([])) });
        const result = await loadReportSources(dataset, [{ file: 'a.geojson', label: 'A' }, { file: 'gone.geojson', label: 'B' }]);
        expect(result.map(r => [r.label, r.file, 'document' in r, r.error])).toEqual([['A', 'a.geojson', true, undefined], ['B', 'gone.geojson', false, 'The file does not exist']]);
    });
});

describe('a report of a file written before the references', () => {
    it('lists its items unnumbered, the 3D ones on the map when the file states the CRS of its cloud', async () => {
        const dataset = datasetOf({ 'a.geojson': JSON.stringify(mixedFile()) });
        const definition = definitionOf(['a.geojson']);
        const sources = await loadReportSources(dataset, definition.sources);
        const model = buildReportModel({ ...inputOf([]), definition, sources });
        expect(model.failedSources).toEqual([]);
        expect(model.items.length).toBeGreaterThan(3);
        expect(model.items.every(i => !i.numbered && i.displayRef === NO_REF && /^[0-9a-f]{64}(-\d+)?$/.test(i.id))).toBe(true);
        expect(model.items.some(i => i.owner === 'pointCloud' && i.georeferenced)).toBe(true);
        expect(model.items.find(i => i.name === 'Fence line').groupName).toBe('Fence');
        expect(blocksOf(model, 'items', 'qr')).toEqual([]);
    });
});

describe('the 3D measures of a report are measured on their points, in the CRS of the point cloud', () => {
    // A distance of a Hub of the 2.x series on a cloud in US survey feet: 100 feet long, stored as 100 'm'
    const feetDistance = () => ({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [[-79, 35.1], [-78.9997, 35.1]] },
        properties: { measurementType: 'distance', name: 'Fence', localCoordinates: [[2000000, 500000, 10], [2000100, 500000, 10]], distance: 100, unit: 'm' }
    });
    const legacyFile = (coordinateSystem = null) => ({
        type: 'FeatureCollection',
        metadata: { version: '1.1', pointCloudFile: 'cloud.laz', application: 'Registry-Potree', ...(coordinateSystem ? { coordinateSystem } : {}) },
        features: [feetDistance()]
    });
    const feetCloud = { path: 'cloud.laz', properties: { projection: US_FOOT_WKT, crsStatus: 'projected' } };
    const itemsOf = async (dataset) => {
        const definition = definitionOf(['a.geojson']);
        const sources = await loadReportSources(dataset, definition.sources);
        return buildItems(definition, sources, {}, '2026-11-28').items;
    };

    it('reports a distance of a file that states feet in the unit of its cloud, not as the metres it was labelled with', async () => {
        const [item] = await itemsOf(datasetOf({ 'a.geojson': JSON.stringify(legacyFile({ srs: US_FOOT_WKT })) }));
        expect(item.measured.length).toBeCloseTo(30.48, 2);
        expect(item.properties).toMatchObject({ distance: 100, unit: 'ftUS' });
    });

    it('takes the CRS from the cloud\'s entry when the file states none', async () => {
        const dataset = datasetOf({ 'a.geojson': JSON.stringify(legacyFile()) }, { 'cloud.laz': feetCloud });
        const [item] = await itemsOf(dataset);
        expect(dataset.listOne).toHaveBeenCalledWith('cloud.laz');
        expect(item.measured.length).toBeCloseTo(30.48, 2);
    });

    it('measures a distance saved while the COPC was in degrees, with a length of 0, in the UTM zone the COPC is in now', async () => {
        const file = legacyFile({ srs: WGS84_WKT });
        file.features[0].properties = { ...file.features[0].properties, localCoordinates: [[-75, 40, 10], [-74.999, 40, 10]], distance: 0 };
        const rebuilt = {
            path: 'cloud.laz', properties: { projection: WGS84_WKT, crsStatus: 'geographic' },
            artifacts: [{ role: ArtifactRole.POINTCLOUD_COPC, url: '/b/copc/cloud.copc.laz', crs: { name: 'WGS 84 / UTM zone 18N', epsg: 32618, transformed: true } }]
        };
        const [item] = await itemsOf(datasetOf({ 'a.geojson': JSON.stringify(file) }, { 'cloud.laz': rebuilt }));
        // A thousandth of a degree of longitude at 40 degrees north: about 85.2 m
        expect(item.measured.length).toBeCloseTo(85.2, 0);
        expect(item.properties.unit).toBe('m');
    });

    it('keeps the stored values when it cannot measure: in degrees with no other CRS, a cloud that cannot be listed, no points', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const degrees = legacyFile({ srs: WGS84_WKT });
        degrees.features[0].properties = { ...degrees.features[0].properties, localCoordinates: [[-75, 40, 10], [-74.999, 40, 10]], distance: 7 };
        expect((await itemsOf(datasetOf({ 'a.geojson': JSON.stringify(degrees) }, {})))[0].measured.length).toBe(7);
        expect(warn).toHaveBeenCalledOnce();
        warn.mockRestore();

        const pointless = legacyFile({ srs: US_FOOT_WKT });
        delete pointless.features[0].properties.localCoordinates;
        expect((await itemsOf(datasetOf({ 'a.geojson': JSON.stringify(pointless) })))[0].measured.length).toBe(100);
    });
});

