/**
 * The OGC share URLs of the Share dialog: FR-SHR-01 (the WMTS template names the tile matrix set that
 * GetCapabilities lists), FR-SHR-02 (the sample GetCoverage asks for a size within the server's limit),
 * FR-SHR-04 (WMS for rasters only). The contract test (FR-XC-31) checks the template and the service table against
 * what the Registry serves (__vectors__/ogc-contract.json).
 */
import { describe, it, expect } from 'vitest';
import ddb from 'ddb';
import contract from './__vectors__/ogc-contract.json';
import {
    buildOgcShareUrls,
    OGC_SERVICE_TABLE,
    ogcServicesOfEntryType,
    escapeLayerPath,
    WMTS_TILE_MATRIX_SET
} from './ogcShareUrls';

const T = ddb.entry.type;
const BASE = 'https://registry.test';

const raster = (extra = {}) => ({
    type: T.GEORASTER, path: 'ortho.tif', properties: { width: 12544, height: 10240 }, ...extra
});
const vector = () => ({ type: T.VECTOR, path: 'roads.fgb', properties: {} });
const urls = (entry, extra = {}) =>
    buildOgcShareUrls({ baseUrl: BASE, org: 'org', ds: 'ds', scope: 'entry', entry, ...extra });

describe('WMTS RESTful tile template (FR-SHR-01)', () => {
    it('names GoogleMapsCompatible, the tile matrix set GetCapabilities lists', () => {
        expect(urls(raster()).wmts.restTileTemplate)
            .toBe('https://registry.test/orgs/org/ds/ds/wmts/1.0.0/ortho.tif/default/GoogleMapsCompatible/{z}/{y}/{x}.png');
        expect(WMTS_TILE_MATRIX_SET).toBe('GoogleMapsCompatible');
    });

    it('names a nested raster by its escaped path (AC-015)', () => {
        expect(urls(raster({ path: 'odm_orthophoto/odm_orthophoto.tif' })).wmts.restTileTemplate).toBe(
            'https://registry.test/orgs/org/ds/ds/wmts/1.0.0/odm_orthophoto%2Fodm_orthophoto.tif/default/GoogleMapsCompatible/{z}/{y}/{x}.png');
    });

    it('escapes the characters encodeURIComponent keeps like Uri.EscapeDataString does', () => {
        expect(escapeLayerPath("a b/c (1)!'*.tif")).toBe('a%20b%2Fc%20%281%29%21%27%2A.tif');
    });

    it('serves a vector entry as pbf tiles with the same matrix set', () => {
        expect(urls(vector()).wmts.restTileTemplate)
            .toBe('https://registry.test/orgs/org/ds/ds/wmts/1.0.0/roads.fgb/default/GoogleMapsCompatible/{z}/{y}/{x}.pbf');
    });
});

describe('WMS for georasters only (FR-SHR-04)', () => {
    it('offers WMS for a raster entry with a GetMap sample', () => {
        const { wms } = urls(raster());
        expect(wms.supported).toBe(true);
        expect(wms.getMap).toContain('LAYERS=ortho.tif');
    });

    it('does not offer WMS for a vector entry and says why', () => {
        const { wms } = urls(vector());
        expect(wms.supported).toBe(false);
        expect(wms.reason).toBe('WMS is only available for GeoRaster entries.');
        expect(wms.serviceUrl).toBe('');
        expect(wms.getMap).toBeNull();
    });

    it('still offers WMS for a dataset and a folder, which may hold rasters', () => {
        expect(buildOgcShareUrls({ baseUrl: BASE, org: 'org', ds: 'ds', scope: 'dataset' }).wms.supported).toBe(true);
        expect(buildOgcShareUrls({ baseUrl: BASE, org: 'org', ds: 'ds', scope: 'folder', folderPath: 'a/b' }).wms.serviceUrl)
            .toBe('https://registry.test/orgs/org/ds/ds/wms/p/a/b');
    });

    it('keeps the other services of each entry type as the table lists them', () => {
        const supported = entry => Object.entries(urls(entry)).filter(([, d]) => d.supported).map(([k]) => k).sort();
        expect(supported(raster())).toEqual(['ogcApiTiles', 'wcs', 'wmts', 'wms'].sort());
        expect(supported(vector())).toEqual(['ogcApiFeatures', 'ogcApiTiles', 'wfs', 'wmts']);
        expect(urls(vector()).wcs.reason).toBe('WCS is only available for GeoRaster entries.');
        expect(urls(raster()).wfs.reason).toBe('WFS is only available for Vector entries.');
        expect(urls(raster()).ogcApiFeatures.reason).toBe('OGC API Features is only available for Vector entries.');
    });
});

describe('the sample GetCoverage size (FR-SHR-02)', () => {
    const size = descriptor => descriptor.wcs.getCoverage.match(/&SCALESIZE=Long\((\d+)\),Lat\((\d+)\)/)?.slice(1).map(Number);

    it('asks for at most the published limit on the long side, keeping the aspect ratio (12544x10240, 8192)', () => {
        const d = urls(raster(), { maxWcsCoverageSizePixels: 8192 });
        expect(d.wcs.getCoverage).toBe(
            'https://registry.test/orgs/org/ds/ds/wcs?service=WCS&request=GetCoverage&version=2.0.1' +
            '&CoverageId=ortho.tif&FORMAT=image/tiff&SCALESIZE=Long(8192),Lat(6687)');
        expect(size(d)).toEqual([8192, 6687]);
    });

    it('falls back to 4096 pixels when the server publishes no limit (an older Registry)', () => {
        expect(size(urls(raster()))).toEqual([4096, 3344]);
        expect(size(urls(raster(), { maxWcsCoverageSizePixels: undefined }))).toEqual([4096, 3344]);
        expect(size(urls(raster(), { maxWcsCoverageSizePixels: 0 }))).toEqual([4096, 3344]);
        expect(size(urls(raster(), { maxWcsCoverageSizePixels: 'x' }))).toEqual([4096, 3344]);
    });

    it('scales a tall raster by its height', () => {
        expect(size(urls(raster({ properties: { width: 5000, height: 20000 } }), { maxWcsCoverageSizePixels: 8192 })))
            .toEqual([2048, 8192]);
    });

    it('asks for the native size of a raster within the limit', () => {
        expect(size(urls(raster({ properties: { width: 1000, height: 800 } }), { maxWcsCoverageSizePixels: 8192 })))
            .toEqual([1000, 800]);
    });

    it('sends no size for a raster whose size is not known', () => {
        const d = urls(raster({ properties: {} }), { maxWcsCoverageSizePixels: 8192 });
        expect(d.wcs.getCoverage).toBe(
            'https://registry.test/orgs/org/ds/ds/wcs?service=WCS&request=GetCoverage&version=2.0.1' +
            '&CoverageId=ortho.tif&FORMAT=image/tiff');
    });
});

// FR-XC-31: the Hub's templates and its service table are those of the Registry (a copy of what it serves)
describe('contract with the Registry (FR-XC-31)', () => {
    const doc = new DOMParser().parseFromString(contract.wmtsCapabilities, 'application/xml');
    const resourceUrls = [...doc.getElementsByTagName('ResourceURL')];

    /** The Hub template, as GetCapabilities writes it: the placeholders of WMTS 1.0.0 §10.2. */
    const asCapabilities = template => template
        .replace('/default/', '/{Style}/')
        .replace('/GoogleMapsCompatible/', '/{TileMatrixSet}/')
        .replace('{z}', '{TileMatrix}').replace('{y}', '{TileRow}').replace('{x}', '{TileCol}');

    it('uses the tile matrix set that GetCapabilities lists', () => {
        const listed = [...doc.getElementsByTagName('TileMatrixSet')].map(e => e.textContent.trim());
        expect(listed).toContain('GoogleMapsCompatible');
        const link = doc.getElementsByTagName('TileMatrixSetLink')[0].textContent.trim();
        expect(link).toBe('GoogleMapsCompatible');
        expect(urls(raster()).wmts.restTileTemplate).toContain(`/${link}/`);
    });

    /** The Layers of the fixture: the entry path (the Title), the Identifier and the png template of each. */
    const layers = [...doc.getElementsByTagName('Layer')].map(layer => ({
        path: layer.getElementsByTagName('ows:Title')[0].textContent,
        identifier: layer.getElementsByTagName('ows:Identifier')[0].textContent,
        png: [...layer.getElementsByTagName('ResourceURL')]
            .find(e => e.getAttribute('format') === 'image/png').getAttribute('template')
    }));

    it('is the ResourceURL template that GetCapabilities advertises for png, with its extension', () => {
        const ortho = layers.find(l => l.path === 'ortho.tif');
        expect(ortho.png).toBe(
            'https://registry.test/orgs/org/ds/ds/wmts/1.0.0/ortho.tif/{Style}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.png');
        expect(asCapabilities(urls(raster()).wmts.restTileTemplate)).toBe(ortho.png);
    });

    it('is the template of every Layer of GetCapabilities, nested and non-NCName paths included (AC-015)', () => {
        expect(layers.map(l => l.path)).toEqual(['ortho.tif', 'odm_orthophoto/odm_orthophoto.tif', 'my map (1).tif']);
        for (const layer of layers)
            expect(asCapabilities(urls(raster({ path: layer.path })).wmts.restTileTemplate), layer.path).toBe(layer.png);

        // The nested raster is named by its escaped path, not by the NCName of its Identifier
        const nested = layers[1];
        expect(nested.png).toContain('/wmts/1.0.0/odm_orthophoto%2Fodm_orthophoto.tif/');
        expect(nested.identifier).toBe('odm_orthophoto_odm_orthophoto.tif');
        expect(layers[2].png).toContain('/wmts/1.0.0/my%20map%20%281%29.tif/');
    });

    it('ends in an extension of the RESTful route and its media type, for rasters and vectors', () => {
        const extensionOf = template => template.slice(template.lastIndexOf('.') + 1);
        const png = extensionOf(urls(raster()).wmts.restTileTemplate);
        const pbf = extensionOf(urls(vector()).wmts.restTileTemplate);
        expect(contract.restfulExtensions[png]).toBe('image/png');
        expect(contract.restfulExtensions[pbf]).toBe('application/vnd.mapbox-vector-tile');
        // The extension that GetCapabilities gives each of its formats is in the map
        for (const e of resourceUrls)
            expect(contract.restfulExtensions[extensionOf(e.getAttribute('template'))]).toBe(e.getAttribute('format'));
    });

    it('has a service table that offers each entry type what the Registry serves', () => {
        const names = { [T.GEORASTER]: 'georaster', [T.VECTOR]: 'vector' };
        for (const [type, name] of Object.entries(names))
            expect(ogcServicesOfEntryType(Number(type)).sort()).toEqual([...contract.servicesByEntryType[name]].sort());

        // Every service of the Registry has a row, and no row serves a type the Registry does not
        const registryServices = new Set(Object.values(contract.servicesByEntryType).flat());
        expect(Object.keys(OGC_SERVICE_TABLE).sort()).toEqual([...registryServices].sort());
    });

    it('describes, for an entry, the services the table lists as supported', () => {
        const supported = entry => Object.entries(urls(entry)).filter(([, d]) => d.supported).map(([k]) => k).sort();
        expect(supported(raster())).toEqual([...contract.servicesByEntryType.georaster].sort());
        expect(supported(vector())).toEqual([...contract.servicesByEntryType.vector].sort());
    });
});
