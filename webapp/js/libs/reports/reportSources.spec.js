/**
 * Reading the measurement files of a report: each source on its own, a failure listed with its reason, and the whole
 * path from an old file to a model.
 */
import { describe, it, expect, vi } from 'vitest';
import { loadReportSource, loadReportSources } from './reportSources';
import { buildReportModel } from './reportModel';
import { ApiError } from '@/libs/ddb/apiError';
import { mixedFile } from '@/libs/map/measurementFormat.fixtures';
import { definitionOf, inputOf, blocksOf, documentOf, mapFeature } from './reportModel.fixtures';

const datasetOf = files => ({
    getFileContents: vi.fn(async path => {
        if (!(path in files)) throw new ApiError('Not found', 404);
        if (files[path] instanceof Error) throw files[path];
        return files[path];
    })
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
        expect(model.items.every(i => !i.numbered && i.displayRef === '—' && /^[0-9a-f]{64}(-\d+)?$/.test(i.id))).toBe(true);
        expect(model.items.some(i => i.owner === 'pointCloud' && i.georeferenced)).toBe(true);
        expect(model.items.find(i => i.name === 'Fence line').groupName).toBe('Fence');
        expect(blocksOf(model, 'items', 'qr')).toEqual([]);
    });
});
