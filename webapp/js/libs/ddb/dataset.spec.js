/**
 * dataset.spec - URL-builder regression tests for the Dataset API client.
 *
 * Guards the special-character contract for entry paths: file names may contain
 * '&' (the original "path not found" tile bug: dataset.tileUrl interpolated the
 * path raw into the query string, so the server saw the path truncated at the
 * ampersand), ',' (multi-path download transport), '#', '%' and spaces.
 */
import { describe, it, expect, vi } from 'vitest';
import Dataset from './dataset';

const NASTY = 'ortho & #25%, 100%slope (field) “café” #hash?.tif';

function makeDataset() {
    const registry = { remote: 'hub.example.com', secure: true };
    return new Dataset(registry, 'my_org', 'my_ds');
}

describe('Dataset URL builders — special characters in paths', () => {
    const ds = makeDataset();
    const base = '/orgs/my_org/ds/my_ds';

    it('tileUrl percent-encodes the path query parameter (& , # % space)', () => {
        const url = ds.tileUrl('ortho & crop.tif', 12, 3, 4);
        expect(url).toBe(`${base}/tiles/12/3/4.webp?path=ortho%20%26%20crop.tif`);
        // A raw '&' would truncate the path parameter server-side (the original bug).
        expect(url.indexOf('&', url.indexOf('?'))).toBe(-1);
    });

    it('tileUrl keeps retina and encodes all reserved characters', () => {
        const url = ds.tileUrl(NASTY, 1, 2, 3, { retina: true });
        expect(url).toContain('@2x.webp?path=');
        expect(url.split('?path=')[1]).not.toContain('&');
        expect(url).toContain(encodeURIComponent(NASTY));
    });

    it('thumbUrl encodes path and appends size as its own parameter', () => {
        const url = ds.thumbUrl('a & b.tif', 256);
        expect(url).toBe(`${base}/thumb?path=a%20%26%20b.tif&size=256`);
    });

    it('tileUrl and thumbUrl append the entry hash as v when given', () => {
        expect(ds.tileUrl('o.tif', 1, 2, 3, { retina: true, hash: 'abc' }))
            .toBe(`${base}/tiles/1/2/3@2x.webp?path=o.tif&v=abc`);
        expect(ds.thumbUrl('o.tif', 256, 'abc')).toBe(`${base}/thumb?path=o.tif&size=256&v=abc`);
        expect(ds.thumbUrl('o.tif', undefined, 'abc')).toBe(`${base}/thumb?path=o.tif&v=abc`);
        // Without a hash the URLs are unchanged.
        expect(ds.tileUrl('o.tif', 1, 2, 3)).toBe(`${base}/tiles/1/2/3.webp?path=o.tif`);
        expect(ds.thumbUrl('o.tif', 256)).toBe(`${base}/thumb?path=o.tif&size=256`);
    });

    // The extension chooses the format the server sends (WebP is the smaller one, PNG the universal one)
    it('tileUrl asks for WebP unless a format is given', () => {
        expect(ds.tileUrl('o.tif', 1, 2, 3)).toContain('/3.webp?');
        expect(ds.tileUrl('o.tif', 1, 2, 3, { format: 'png' })).toBe(`${base}/tiles/1/2/3.png?path=o.tif`);
        expect(ds.tileUrl('o.tif', 1, 2, 3, { format: 'jpg', retina: true })).toContain('/3@2x.jpg?');
        expect(ds.tileExUrl('o.tif', 1, 2, 3, {})).toContain('/tiles-ex/1/2/3.webp?');
        expect(ds.tileExUrl('o.tif', 1, 2, 3, {}, { format: 'png' })).toContain('/3.png?');
    });

    it('tileUrl keeps the {z}/{x}/{y} placeholders of a tile source template', () => {
        expect(ds.tileUrl('o.tif', '{z}', '{x}', '{y}', { hash: 'abc' }))
            .toBe(`${base}/tiles/{z}/{x}/{y}.webp?path=o.tif&v=abc`);
    });

    it('tileExUrl encodes path and viz params', () => {
        const url = ds.tileExUrl('x & y.tif', 1, 2, 3, { bands: '1&2', colormap: 'a b' });
        expect(url).toContain(`path=${encodeURIComponent('x & y.tif')}`);
        expect(url).toContain(`bands=${encodeURIComponent('1&2')}`);
    });

    it('downloadUrl single path: encodes per path segment, keeps separators', () => {
        const url = ds.downloadUrl('folder/sub #1 & stuff.tif');
        expect(url).toBe(`${base}/download/folder/sub%20%231%20%26%20stuff.tif`);
        // Separators survive as separators, never encoded to %2F:
        expect(ds.downloadUrl('a/b/c.tif')).toBe(`${base}/download/a/b/c.tif`);
    });

    it('downloadUrl single path: inline flag is a separate query param', () => {
        const url = ds.downloadUrl('p & q.tif', { inline: true });
        expect(url).toBe(`${base}/download/p%20%26%20q.tif?inline=1`);
    });

    it('downloadUrl multi path: one repeated path= param per file, commas encoded', () => {
        const url = ds.downloadUrl(['a,one.tif', 'b & two.tif']);
        expect(url.startsWith(`${base}/download?`)).toBe(true);
        expect(url.match(/(?:^|[?&])path=/g)).toHaveLength(2);
        // Assert via the canonical parser on both sides (URLSearchParams encodes
        // spaces as '+', which servers decode back to space):
        const params = new URLSearchParams(url.slice(url.indexOf('?') + 1));
        expect(params.getAll('path')).toEqual(['a,one.tif', 'b & two.tif']);
    });

    it('downloadUrl empty/undefined paths produce a bare endpoint (no undefined segment)', () => {
        expect(ds.downloadUrl([])).toBe(`${base}/download`);
        expect(ds.downloadUrl(undefined)).toBe(`${base}/download`);
    });

    it('all builders never emit a raw & or an unescaped # and round-trip the path', () => {
        const cases = [
            { url: ds.tileUrl(NASTY, 1, 2, 3), expected: [NASTY] },
            { url: ds.thumbUrl(NASTY, 512), expected: [NASTY] },
            { url: ds.downloadUrl([NASTY, 'x.tif']), expected: [NASTY, 'x.tif'] },
            { url: ds.downloadUrl(NASTY, { inline: true }), expected: null }
        ];
        for (const { url, expected } of cases) {
            const query = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
            // A raw # would start a URL fragment and truncate the path server-side.
            expect(url).not.toContain('#');
            // Raw & may only appear as a KVP separator in front of a known key.
            expect(query.replace(/&(?=(path|size|inline)=)/g, '')).not.toContain('&');
            if (expected) {
                // Server-side parser must recover the exact paths.
                expect(new URLSearchParams(query).getAll('path')).toEqual(expected);
            } else {
                // Route-segment form: decode each segment and compare.
                const seg = url.slice(`${base}/download/`.length).split('?')[0];
                expect(seg.split('/').map(decodeURIComponent).join('/')).toBe(NASTY);
                expect(new URLSearchParams(query).get('inline')).toBe('1');
            }
        }
    });
});

describe('Dataset.checkDownloadSlot — error message of a refused download', () => {
    function datasetAnswering(status, contentType, body) {
        const response = new Response(JSON.stringify(body), { status, headers: { 'Content-Type': contentType } });
        const registry = { remote: 'hub.example.com', secure: true, fetchRaw: vi.fn(async () => response) };
        return new Dataset(registry, 'my_org', 'my_ds');
    }

    it('reads a ProblemDetails body (application/problem+json)', async () => {
        const ds = datasetAnswering(429, 'application/problem+json', { title: 'Too Many Requests', status: 429, detail: 'Too many downloads in progress' });
        await expect(ds.checkDownloadSlot('/x')).rejects.toMatchObject({ message: 'Too many downloads in progress', status: 429 });
    });

    it('still reads the legacy { error } body', async () => {
        const ds = datasetAnswering(429, 'application/json; charset=utf-8', { error: 'Busy' });
        await expect(ds.checkDownloadSlot('/x')).rejects.toMatchObject({ message: 'Busy', status: 429 });
    });
});

describe('Dataset.buildArtifactUrl', () => {
    const ds = makeDataset();

    it('asks for the main artifact of a file when no role is given', () => {
        expect(ds.buildArtifactUrl('flights/ortho & crop.tif')).toBe('/orgs/my_org/ds/my_ds/build-artifact?path=flights%2Fortho%20%26%20crop.tif');
    });

    it('asks for the artifact of a role, so the server names the file of a splat', () => {
        expect(ds.buildArtifactUrl('site.ply', 'gsplat.export')).toBe('/orgs/my_org/ds/my_ds/build-artifact?path=site.ply&role=gsplat.export');
    });
});

describe('Dataset meta reads', () => {
    function datasetReading(answer = [{ id: 'm1', data: '{}', mtime: 1 }]) {
        const registry = { remote: 'hub.example.com', secure: true, getRequest: vi.fn(async () => answer) };
        return { ds: new Dataset(registry, 'my_org', 'my_ds'), get: registry.getRequest };
    }

    it('metaGet reads the key from meta/get and returns the parsed answer', async () => {
        const { ds, get } = datasetReading();
        expect(await ds.metaGet('views')).toEqual([{ id: 'm1', data: '{}', mtime: 1 }]);
        expect(get).toHaveBeenCalledWith('/orgs/my_org/ds/my_ds/meta/get/views');
    });

    it('metaGet sends the path only when there is one, and encodes both', async () => {
        const { ds, get } = datasetReading();
        await ds.metaGet('a b/c', 'flights/ortho & dsm.tif');
        expect(get).toHaveBeenCalledWith('/orgs/my_org/ds/my_ds/meta/get/a%20b%2Fc?path=flights%2Fortho%20%26%20dsm.tif');
        get.mockClear();
        await ds.metaGet('views', '');
        expect(get.mock.calls[0][0]).not.toContain('?');
    });

    it('metaGet skips the request cache only when asked to', async () => {
        const { ds, get } = datasetReading();
        await ds.metaGet('views', '', { cache: false });
        expect(get).toHaveBeenCalledWith('/orgs/my_org/ds/my_ds/meta/get/views', { cache: false });
        get.mockClear();
        await ds.metaGet('views', '', { cache: true });
        expect(get.mock.calls[0]).toHaveLength(1);
    });

    it('metaGet refuses a missing key and lets the error of the server through', async () => {
        const { ds, get } = datasetReading();
        await expect(ds.metaGet('')).rejects.toThrow('Invalid key');
        expect(get).not.toHaveBeenCalled();
        get.mockRejectedValueOnce(Object.assign(new Error('none'), { status: 404 }));
        await expect(ds.metaGet('views')).rejects.toMatchObject({ status: 404 });
    });
});

describe('Dataset meta writes', () => {
    function datasetPosting() {
        const registry = { remote: 'hub.example.com', secure: true, postFormData: vi.fn(async () => ({ ok: true })) };
        return { ds: new Dataset(registry, 'my_org', 'my_ds'), post: registry.postFormData };
    }
    const fields = formData => Object.fromEntries(formData.entries());

    it('metaAdd posts key, JSON data and path to meta/add', async () => {
        const { ds, post } = datasetPosting();
        await ds.metaAdd('comparisons', { name: 'before/after', layers: ['a.tif', 'b.tif'] }, 'flights');
        const [url, formData] = post.mock.calls[0];
        expect(url).toBe('/orgs/my_org/ds/my_ds/meta/add');
        expect(fields(formData)).toEqual({
            key: 'comparisons',
            data: '{"name":"before/after","layers":["a.tif","b.tif"]}',
            path: 'flights'
        });
    });

    it('metaAdd quotes a string like metaSet and defaults the path to empty', async () => {
        const { ds, post } = datasetPosting();
        await ds.metaAdd('note', 'hello');
        expect(fields(post.mock.calls[0][1])).toEqual({ key: 'note', data: '"hello"', path: '' });
    });

    it('metaSet sends objects as JSON too, and strings quoted, to meta/set', async () => {
        const { ds, post } = datasetPosting();
        await ds.metaSet('license', 'cc0');
        await ds.metaSet('obj', { a: 1 });
        expect(post.mock.calls[0][0]).toBe('/orgs/my_org/ds/my_ds/meta/set');
        expect(fields(post.mock.calls[0][1]).data).toBe('"cc0"');
        expect(fields(post.mock.calls[1][1]).data).toBe('{"a":1}');
    });

    it('metaAdd refuses a missing key or value', async () => {
        const { ds, post } = datasetPosting();
        await expect(ds.metaAdd('', 1)).rejects.toThrow('Invalid key');
        await expect(ds.metaAdd('k')).rejects.toThrow('Invalid data');
        expect(post).not.toHaveBeenCalled();
    });

    it('metaRemove posts the id to meta/remove', async () => {
        const { ds, post } = datasetPosting();
        await ds.metaRemove('abc-123');
        const [url, formData] = post.mock.calls[0];
        expect(url).toBe('/orgs/my_org/ds/my_ds/meta/remove');
        expect(fields(formData)).toEqual({ id: 'abc-123' });
    });

    it('metaRemove refuses an empty id', async () => {
        const { ds, post } = datasetPosting();
        await expect(ds.metaRemove('')).rejects.toThrow('Invalid id');
        expect(post).not.toHaveBeenCalled();
    });
});

describe('Dataset file writes', () => {
    function datasetPosting() {
        const registry = { remote: 'hub.example.com', secure: true, postFormData: vi.fn(async () => ({ ok: true })) };
        return { ds: new Dataset(registry, 'my_org', 'my_ds'), post: registry.postFormData };
    }
    const names = formData => [...formData.keys()];

    // FR-UPL-03: the Registry refuses a name that exists unless overwrite comes before the file
    it('writeObj and uploadObj send no overwrite unless asked', async () => {
        const { ds, post } = datasetPosting();
        await ds.writeObj('notes.txt', 'text');
        await ds.uploadObj('photo.jpg', new Blob(['x']));
        expect(post.mock.calls[0][0]).toBe('/orgs/my_org/ds/my_ds/obj');
        expect(names(post.mock.calls[0][1])).toEqual(['path', 'file']);
        expect(names(post.mock.calls[1][1])).toEqual(['path', 'file']);
    });

    it('writeObj and uploadObj send overwrite=true before the file when they replace', async () => {
        const { ds, post } = datasetPosting();
        await ds.writeObj('notes.txt', 'text', { overwrite: true });
        await ds.uploadObj('photo.jpg', new Blob(['x']), { overwrite: true });
        for (const [, formData] of post.mock.calls) {
            expect(names(formData)).toEqual(['path', 'overwrite', 'file']);
            expect(formData.get('overwrite')).toBe('true');
        }
    });
});

// FR-EXP-08: the size of a folder is read with one recursive search of its path
describe('Dataset.search', () => {
    function datasetPosting() {
        const registry = { remote: 'hub.example.com', secure: true, postFormData: vi.fn(async () => []) };
        return { ds: new Dataset(registry, 'my_org', 'my_ds'), post: registry.postFormData };
    }
    const names = formData => [...formData.keys()];

    it('posts only the query when it has no options, as before', async () => {
        const { ds, post } = datasetPosting();
        await ds.search('*IMG*');
        expect(post.mock.calls[0][0]).toBe('/orgs/my_org/ds/my_ds/search');
        expect(names(post.mock.calls[0][1])).toEqual(['query']);
    });

    it('posts the folder, the recursion and the signal when asked', async () => {
        const { ds, post } = datasetPosting();
        const signal = new AbortController().signal;
        await ds.search('*', { path: 'newdir', recursive: true, signal });
        const [, formData, options] = post.mock.calls[0];
        expect(names(formData)).toEqual(['query', 'path', 'recursive']);
        expect([formData.get('query'), formData.get('path'), formData.get('recursive')]).toEqual(['*', 'newdir', 'true']);
        expect(options.signal).toBe(signal);
    });

    // FR-MAP-10: the hint of the Map tab asks for one entry type (the server's EntryType: GeoImage is 3)
    it('posts the entry type to return when asked', async () => {
        const { ds, post } = datasetPosting();
        await ds.search('*', { path: 'site', recursive: true, type: 3 });
        const [, formData] = post.mock.calls[0];
        expect(names(formData)).toEqual(['query', 'path', 'recursive', 'type']);
        expect(formData.get('type')).toBe('3');
    });
});

describe('Dataset chunked upload sessions (FR-UPL-04, §7.1)', () => {
    function setup(answer = []) {
        const registry = { remote: 'hub.example.com', secure: true, makeRequest: vi.fn(async () => answer) };
        return { ds: new Dataset(registry, 'my_org', 'my_ds'), request: registry.makeRequest };
    }

    it('lists the open uploads with GET obj/chunk, not from the cache', async () => {
        const open = [{ fileId: 'a', path: 'x.tif' }];
        const { ds, request } = setup(open);

        expect(await ds.listChunkUploads()).toBe(open);

        expect(request).toHaveBeenCalledWith('/orgs/my_org/ds/my_ds/obj/chunk', { method: 'GET', cache: false });
    });

    it('removes the chunks of an upload with DELETE obj/chunk/{fileId}, the id escaped', async () => {
        const { ds, request } = setup();

        await ds.deleteChunkUpload('a/b c');

        expect(request).toHaveBeenCalledWith('/orgs/my_org/ds/my_ds/obj/chunk/a%2Fb%20c', 'DELETE');
    });
});

describe('Dataset.detectAllStockpiles (FR-MAP-25)', () => {
    it('posts the path, the sensitivity, the smallest area and the most piles to stockpile/detect-all', async () => {
        const ds = makeDataset();
        const answer = { stockpiles: [], totalFound: 0, sensitivityUsed: 0.7, minAreaUsed: 20 };
        ds.registry.postRequest = vi.fn().mockResolvedValue(answer);

        const found = await ds.detectAllStockpiles('odm_dem/dsm.tif', { sensitivity: 0.7, minArea: 20, maxResults: 10 });

        expect(ds.registry.postRequest).toHaveBeenCalledWith('/orgs/my_org/ds/my_ds/stockpile/detect-all',
            { path: 'odm_dem/dsm.tif', sensitivity: 0.7, minAreaM2: 20, maxResults: 10 });
        expect(found).toBe(answer);
    });

    it('asks with the server defaults when the options are left out: sensitivity 0.5, 5 m², 50 piles', async () => {
        const ds = makeDataset();
        ds.registry.postRequest = vi.fn().mockResolvedValue({ stockpiles: [] });

        await ds.detectAllStockpiles('dsm.tif');

        expect(ds.registry.postRequest.mock.calls[0][1]).toEqual({ path: 'dsm.tif', sensitivity: 0.5, minAreaM2: 5, maxResults: 50 });
    });
});

// U-201 (D-021, FR-RAS-02, FR-RAS-31): the value calls send map coordinates and the options of the values, never pixels
describe('Dataset raster value calls', () => {
    const base = '/orgs/my_org/ds/my_ds';
    function datasetGetting() {
        const get = vi.fn(async () => ({}));
        const post = vi.fn(async () => ({}));
        const ds = new Dataset({ remote: 'h', secure: true, getRequest: get, postRequest: post }, 'my_org', 'my_ds');
        return { ds, get, post };
    }

    it('a point is asked by longitude and latitude, with the NoData value when there is one', async () => {
        const { ds, get } = datasetGetting();
        await ds.getRasterPointValueAt('t.tif', 15.0012848916515, 45.152568005955);
        expect(get).toHaveBeenLastCalledWith(`${base}/raster-point-value?path=t.tif&lon=15.0012848916515&lat=45.152568005955`);
        await ds.getRasterPointValueAt('t.tif', 1, 2, { nodata: 0, formula: 'KELVIN' });
        expect(get).toHaveBeenLastCalledWith(`${base}/raster-point-value?path=t.tif&lon=1&lat=2&nodata=0&formula=KELVIN`);
    });

    it('an R-JPEG point keeps its pixel coordinates, with the options of the values', async () => {
        const { ds, get } = datasetGetting();
        await ds.getRasterPointValue('r.jpg', 320, 256);
        expect(get).toHaveBeenLastCalledWith(`${base}/raster-point-value?path=r.jpg&x=320&y=256`);
        await ds.getRasterPointValue('r.jpg', 320, 256, { nodata: -9999, formula: 'CELSIUS' });
        expect(get).toHaveBeenLastCalledWith(`${base}/raster-point-value?path=r.jpg&x=320&y=256&nodata=-9999&formula=CELSIUS`);
    });

    it('an R-JPEG area keeps its pixel coordinates, with the options of the values', async () => {
        const { ds, get } = datasetGetting();
        await ds.getRasterAreaStats('r.jpg', 0, 1, 5, 6);
        expect(get).toHaveBeenLastCalledWith(`${base}/raster-area-stats?path=r.jpg&x0=0&y0=1&x1=5&y1=6`);
        await ds.getRasterAreaStats('r.jpg', 0, 1, 5, 6, { nodata: '0', formula: 'KELVIN' });
        expect(get).toHaveBeenLastCalledWith(`${base}/raster-area-stats?path=r.jpg&x0=0&y0=1&x1=5&y1=6&nodata=0&formula=KELVIN`);
    });

    it('an area is asked by its window in longitude and latitude', async () => {
        const { ds, get } = datasetGetting();
        await ds.getRasterAreaStatsOfWindow('t.tif', [15.0020449, 45.1523636, 15.0022245, 45.1524903], { nodata: '0' });
        expect(get).toHaveBeenLastCalledWith(
            `${base}/raster-area-stats?path=t.tif&bbox=15.0020449,45.1523636,15.0022245,45.1524903&nodata=0`);
    });

    it('the value info takes the options and a window for the export estimate', async () => {
        const { ds, get } = datasetGetting();
        await ds.getRasterValueInfo('t.tif');
        expect(get).toHaveBeenLastCalledWith(`${base}/raster-value-info?path=t.tif`);
        await ds.getRasterValueInfo('t.tif', { nodata: -9999, formula: 'NDVI', bbox: [1, 2, 3, 4] });
        expect(get).toHaveBeenLastCalledWith(`${base}/raster-value-info?path=t.tif&nodata=-9999&formula=NDVI&bbox=1,2,3,4`);
    });

    it('a NoData value written with a comma is read as a decimal; text that is not a number is not sent', async () => {
        const { ds, get } = datasetGetting();
        await ds.getRasterValueInfo('t.tif', { nodata: '-0,5' });
        expect(get).toHaveBeenLastCalledWith(`${base}/raster-value-info?path=t.tif&nodata=-0.5`);
        await ds.getRasterValueInfo('t.tif', { nodata: 'abc' });
        expect(get).toHaveBeenLastCalledWith(`${base}/raster-value-info?path=t.tif`);
    });

    it('a profile sends the NoData value in its body', async () => {
        const { ds, post } = datasetGetting();
        await ds.getRasterProfile('t.tif', { type: 'LineString', coordinates: [[0, 0], [1, 1]] }, 64, { nodata: 0 });
        expect(post).toHaveBeenLastCalledWith(`${base}/raster-profile`, expect.objectContaining({ path: 't.tif', samples: 64, nodata: 0 }));
        await ds.getRasterProfile('t.tif', '{}', 8);
        expect(post.mock.calls[1][1]).not.toHaveProperty('nodata');
    });

    // D-022: the contours of a thermal layer are in its unit (levels, limits, labels), and they skip its NoData value
    it('contours send the NoData value and the thermal formula of the layer in the body', async () => {
        const { ds, post } = datasetGetting();
        await ds.generateContours('t.tif', { interval: 5 }, { nodata: '0', formula: 'KELVIN' });
        expect(post).toHaveBeenLastCalledWith(`${base}/contours`, {
            path: 't.tif', interval: 5, count: null, baseOffset: 0, minElev: null, maxElev: null, simplifyTolerance: 0, bandIndex: 1,
            nodata: 0, formula: 'KELVIN'
        });
        await ds.generateContours('dsm.tif', { count: 10 });
        expect(post.mock.calls[1][1]).not.toHaveProperty('formula');
        expect(post.mock.calls[1][1]).not.toHaveProperty('nodata');
        expect(post.mock.calls[1][1]).toMatchObject({ path: 'dsm.tif', count: 10 });
    });

    it('the tiles and the export of a layer with a NoData value carry it', () => {
        const { ds } = datasetGetting();
        expect(ds.tileExUrl('t.tif', 1, 2, 3, { colormap: 'ironbow', nodata: 0 })).toBe(
            `${base}/tiles-ex/1/2/3.webp?path=t.tif&colormap=ironbow&nodata=0`);
        expect(ds.tileExUrl('t.tif', 1, 2, 3, { colormap: 'ironbow' })).not.toContain('nodata');
        expect(ds.exportUrl('t.tif', { rescale: '0,1', nodata: 65535 })).toContain('&nodata=65535');
    });

    // D-022: a rescale written in another unit than the formula's goes with its unit
    it('the tiles and the export of a thermal layer carry the unit its rescale was written in', () => {
        const { ds } = datasetGetting();
        const style = { formula: 'CELSIUS', colormap: 'ironbow', rescale: '280,310', rescaleUnit: 'K' };
        expect(ds.tileExUrl('t.tif', 1, 2, 3, style)).toBe(
            `${base}/tiles-ex/1/2/3.webp?path=t.tif&formula=CELSIUS&colormap=ironbow&rescale=280%2C310&rescaleUnit=K`);
        expect(ds.exportUrl('t.tif', style)).toContain('&rescale=280%2C310&rescaleUnit=K');
        expect(ds.tileExUrl('t.tif', 1, 2, 3, { ...style, rescaleUnit: undefined })).not.toContain('rescaleUnit');
        // Without a rescale or a formula it has no meaning
        expect(ds.tileExUrl('t.tif', 1, 2, 3, { formula: 'CELSIUS', rescaleUnit: '°F' })).not.toContain('rescaleUnit');
        expect(ds.tileExUrl('t.tif', 1, 2, 3, { rescale: '0,1', rescaleUnit: '°F' })).not.toContain('rescaleUnit');
    });
});


// U-603 (FR-RAS-15): the thermal viewer draws an R-JPEG through thumb-ex, with a thermal formula and a colormap
describe('Dataset.thumbExUrl', () => {
    const ds = new Dataset({ remote: 'h', secure: true }, 'my_org', 'my_ds');
    const base = '/orgs/my_org/ds/my_ds';

    it('names the path, the size, the formula and the colormap, in the encoded form', () => {
        expect(ds.thumbExUrl('H20T/DJI_0001_R.JPG', 1024, { formula: 'KELVIN', colormap: 'ironbow' }))
            .toBe(`${base}/thumb-ex?path=H20T%2FDJI_0001_R.JPG&size=1024&formula=KELVIN&colormap=ironbow`);
    });

    it('adds the rescale and the NoData value only when there are, and leaves the size out without one', () => {
        expect(ds.thumbExUrl('a & b.jpg', undefined, { rescale: '-5,36', nodata: 0 }))
            .toBe(`${base}/thumb-ex?path=a%20%26%20b.jpg&rescale=-5%2C36&nodata=0`);
        expect(ds.thumbExUrl('r.jpg', 512)).toBe(`${base}/thumb-ex?path=r.jpg&size=512`);
    });
});
