import { describe, it, expect, vi, afterEach } from 'vitest';
import ddb from 'ddb';
import { effectScope, shallowRef } from 'vue';
import { Group as LayerGroup, Tile as TileLayer } from 'ol/layer';
import { createRasterSource } from '@/libs/map/rasterLayers';
import { usePlantHealth } from './usePlantHealth';

const layerFor = path => {
    const layer = new TileLayer({ source: createRasterSource({ url: `ddb://h/o/d/${path}`, native: 20, retina: false }) });
    layer.file = { path: `ddb://h/o/d/${path}`, entry: { path, hash: 'h' } };
    layer.set('rasterNativeZoom', 20);
    return layer;
};

describe('usePlantHealth refreshRasterLayers', () => {
    it('restyles only the layers whose parameters changed', () => {
        const a = layerFor('a.tif');
        const b = layerFor('b.tif');
        const group = shallowRef(new LayerGroup({ layers: [a, b] }));
        const ph = effectScope().run(() => usePlantHealth({ dataset: () => null, rasterLayer: group, entry: () => null }));
        const bSource = b.getSource();

        ph.vizParamsByPath.value = { 'a.tif': { formula: 'NDVI' } };
        ph.refreshRasterLayers();
        expect(a.getSource().vizParams).toEqual({ formula: 'NDVI' });
        expect(b.getSource()).toBe(bSource);

        const aSource = a.getSource();
        const aKey = aSource.getKey();
        ph.refreshRasterLayers();
        expect(a.getSource()).toBe(aSource);
        expect(aSource.getKey()).toBe(aKey);

        ph.vizParamsByPath.value = {};
        ph.refreshRasterLayers();
        expect(a.getSource().vizParams).toBeNull();
        expect(b.getSource()).toBe(bSource);
    });
});

// FR-RAS-17: a new style does not blank the layer while its tiles load
describe('usePlantHealth restyle in place', () => {
    it('keeps the source of the layer and gives its tiles a new key, so the tiles it has stay drawn until the new ones load', () => {
        const a = layerFor('a.tif');
        const group = shallowRef(new LayerGroup({ layers: [a] }));
        const ph = effectScope().run(() => usePlantHealth({ dataset: () => null, rasterLayer: group, entry: () => null }));
        const source = a.getSource();
        const plainKey = source.getKey();
        const plainLoad = source.tileLoadFunction;

        ph.vizParamsByPath.value = { 'a.tif': { colormap: 'viridis', rescale: '-6.3,216' } };
        ph.refreshRasterLayers();
        // The same source: OpenLayers draws the tiles of its previous key (stale tiles) until those of the new key load
        expect(a.getSource()).toBe(source);
        expect(source.vizParams).toEqual({ colormap: 'viridis', rescale: '-6.3,216' });
        expect(source.getKey()).not.toBe(plainKey);
        expect(source.tileLoadFunction).not.toBe(plainLoad);
        const styledKey = source.getKey();

        // The same parameters in another order are the same tiles
        source.setVizParams({ rescale: '-6.3,216', colormap: 'viridis' });
        expect(source.getKey()).toBe(styledKey);

        ph.vizParamsByPath.value = {};
        ph.refreshRasterLayers();
        expect(a.getSource()).toBe(source);
        expect(source.vizParams).toBeNull();
        expect(source.getKey()).toBe(plainKey);
    });
});

// A georaster entry of the bands given, as the explorer lists it
const georaster = (path, bands = 1) => ({
    path, hash: 'h', type: ddb.entry.type.GEORASTER,
    properties: { bands: Array.from({ length: bands }, () => ({ colorInterp: 'Gray' })) }
});
const rasterLayer = (path, bands) => {
    const layer = layerFor(path);
    layer.file.entry = georaster(path, bands);
    return layer;
};
// LisbonElevation.tif: negative heights, no NoData value; the stretch is ddb's (D-041)
const LISBON = { bandCount: 1, dataType: 'Float32', isThermal: false, unit: '', valueMin: -6.3, valueMax: 216, stretch: [{ min: -6.3, max: 216 }] };

function seedSetup(layers, getRasterValueInfo = vi.fn(async () => ({ ...LISBON })), savedLayers = []) {
    const group = shallowRef(new LayerGroup({ layers }));
    const dataset = { getRasterValueInfo };
    const saved = { value: savedLayers };
    const ph = effectScope().run(() => usePlantHealth({ dataset: () => dataset, rasterLayer: group, entry: () => null, savedLayers: () => saved.value }));
    return { ph, dataset, saved };
}

// FR-RAS-01: a single-band georaster is drawn with a ramp stretched to its values when the map loads it
describe('usePlantHealth seedRasterDefaults', () => {
    it('gives a single-band georaster without a style the default of its value info, once', async () => {
        const dem = rasterLayer('dem/LisbonElevation.tif', 1);
        const { ph, dataset } = seedSetup([dem]);
        await ph.seedRasterDefaults();
        expect(dataset.getRasterValueInfo).toHaveBeenCalledWith('dem/LisbonElevation.tif');
        expect(ph.vizParamsByPath.value).toEqual({ 'dem/LisbonElevation.tif': { colormap: 'viridis', rescale: '-6.3,216' } });
        expect(dem.getSource().vizParams).toEqual({ colormap: 'viridis', rescale: '-6.3,216' });

        // The user removes the style (Original view): the next load does not put it back
        ph.vizParamsByPath.value = {};
        await ph.seedRasterDefaults();
        expect(dataset.getRasterValueInfo).toHaveBeenCalledTimes(1);
        expect(ph.vizParamsByPath.value).toEqual({});
    });

    it('leaves a multi-band orthophoto, a layer that has a style and a Byte image as they are', async () => {
        const rgb = rasterLayer('ortho.tif', 3);
        const styled = rasterLayer('styled.tif', 1);
        const byte = rasterLayer('byte.tif', 1);
        const { ph, dataset } = seedSetup([rgb, styled, byte],
            vi.fn(async path => (path === 'byte.tif' ? { ...LISBON, dataType: 'Byte' } : { ...LISBON })));
        ph.vizParamsByPath.value = { 'styled.tif': { colormap: 'magma' } };
        await ph.seedRasterDefaults();
        expect(dataset.getRasterValueInfo.mock.calls.map(c => c[0])).toEqual(['byte.tif']);
        expect(ph.vizParamsByPath.value).toEqual({ 'styled.tif': { colormap: 'magma' } });
    });

    it('does not replace a style that the user set while the value info was read', async () => {
        const dem = rasterLayer('dem.tif', 1);
        let answer;
        const { ph } = seedSetup([dem], vi.fn(() => new Promise(resolve => { answer = resolve; })));
        const seeding = ph.seedRasterDefaults();
        ph.vizParamsByPath.value = { 'dem.tif': { colormap: 'magma', rescale: '0,5' } };
        answer({ ...LISBON });
        await seeding;
        expect(ph.vizParamsByPath.value['dem.tif']).toEqual({ colormap: 'magma', rescale: '0,5' });
    });

    // FR-RAS-01: a saved view records the style of its layers, none included (a view saved before the default, or in
    // the Original view): opening it changes no style
    it('leaves a layer of the saved view without a style, and seeds one the user added to it', async () => {
        const saved = rasterLayer('dem/saved.tif', 1);
        const added = rasterLayer('dem/added.tif', 1);
        const { ph, dataset } = seedSetup([saved, added], undefined, ['dem/saved.tif']);
        await ph.seedRasterDefaults();
        expect(dataset.getRasterValueInfo.mock.calls.map(c => c[0])).toEqual(['dem/added.tif']);
        expect(ph.vizParamsByPath.value).toEqual({ 'dem/added.tif': { colormap: 'viridis', rescale: '-6.3,216' } });
        expect(saved.getSource().vizParams).toBeNull();
    });

    it('does not style a layer that the saved view shown meanwhile records', async () => {
        let answer;
        const { ph, saved } = seedSetup([rasterLayer('dem.tif', 1)], vi.fn(() => new Promise(resolve => { answer = resolve; })));
        const seeding = ph.seedRasterDefaults();
        saved.value = ['dem.tif'];
        answer({ ...LISBON });
        await seeding;
        expect(ph.vizParamsByPath.value).toEqual({});
    });

    it('reads at most 3 value infos at once, and styles each layer as its answer comes', async () => {
        const layers = ['a', 'b', 'c', 'd', 'e'].map(n => rasterLayer(`${n}.tif`, 1));
        const pending = [];
        let inFlight = 0;
        let most = 0;
        const read = vi.fn(() => {
            inFlight++;
            most = Math.max(most, inFlight);
            return new Promise(resolve => pending.push(() => { inFlight--; resolve({ ...LISBON }); }));
        });
        const { ph } = seedSetup(layers, read);
        const seeding = ph.seedRasterDefaults();
        await Promise.resolve();
        expect(read).toHaveBeenCalledTimes(3);
        pending.shift()();
        await new Promise(r => setTimeout(r, 0));
        // The first layer is styled before the others answer; the fourth request goes out
        expect(layers[0].getSource().vizParams).toEqual({ colormap: 'viridis', rescale: '-6.3,216' });
        expect(read).toHaveBeenCalledTimes(4);
        while (pending.length) {
            pending.shift()();
            await new Promise(r => setTimeout(r, 0));
        }
        await seeding;
        expect(read).toHaveBeenCalledTimes(5);
        expect(most).toBe(3);
        expect(Object.keys(ph.vizParamsByPath.value)).toEqual(['a.tif', 'b.tif', 'c.tif', 'd.tif', 'e.tif']);
    });

    it('leaves a layer without a style when its value info cannot be read', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { ph } = seedSetup([rasterLayer('dem.tif', 1)], vi.fn(async () => { throw new Error('500'); }));
        await ph.seedRasterDefaults();
        expect(ph.vizParamsByPath.value).toEqual({});
    });
});

// FR-RAS-05: the link restores the formula, the colormap and the range
describe('usePlantHealth restorePlantHealthFromHash', () => {
    afterEach(() => {
        window.location.hash = '';
    });
    const HASH = '#path=rinconada/odm_orthophoto.tif&formula=NDVI&colormap=rdylgn&rescale=-0.272%2C0.644&stretch=percentile';

    it('opens the panel with the formula, colormap, rescale and stretch of the link, and styles the layer at once', () => {
        const layer = layerFor('rinconada/odm_orthophoto.tif');
        const ph = effectScope().run(() => usePlantHealth({ dataset: () => null, rasterLayer: shallowRef(new LayerGroup({ layers: [layer] })), entry: () => null }));
        window.location.hash = HASH;
        ph.restorePlantHealthFromHash([{ entry: { path: 'rinconada/odm_orthophoto.tif' } }]);
        const style = { formula: 'NDVI', colormap: 'rdylgn', rescale: '-0.272,0.644', stretch: 'percentile' };
        expect(ph.plantHealthVisible.value).toBe(true);
        expect(ph.plantHealthFilePath.value).toBe('rinconada/odm_orthophoto.tif');
        expect(ph.plantHealthInitialParams.value).toEqual(style);
        expect(ph.vizParamsByPath.value['rinconada/odm_orthophoto.tif']).toEqual(style);
        expect(layer.getSource().vizParams).toEqual(style);
    });

    // FR-RAS-05: the Copy Link of earlier releases wrote a rescale and a stretch without a formula
    it('decodes an old link with a rescale and no formula, and applies it', () => {
        const layer = layerFor('rinconada/odm_orthophoto.tif');
        const ph = effectScope().run(() => usePlantHealth({ dataset: () => null, rasterLayer: shallowRef(new LayerGroup({ layers: [layer] })), entry: () => null }));
        window.location.hash = '#path=rinconada%2Fodm_orthophoto.tif&bands=4%2C2%2C1&rescale=0.1%2C0.9&stretch=percentile';
        ph.restorePlantHealthFromHash([{ entry: { path: 'rinconada/odm_orthophoto.tif' } }]);
        const style = { bands: '4,2,1', rescale: '0.1,0.9', stretch: 'percentile' };
        expect(ph.plantHealthVisible.value).toBe(true);
        expect(ph.plantHealthInitialParams.value).toEqual(style);
        expect(layer.getSource().vizParams).toEqual(style);
    });

    it('restores once, and ignores a link to a file the map does not have', () => {
        const ph = effectScope().run(() => usePlantHealth({ dataset: () => null, rasterLayer: shallowRef(null), entry: () => null }));
        window.location.hash = HASH;
        ph.restorePlantHealthFromHash([{ entry: { path: 'other.tif' } }]);
        expect(ph.plantHealthVisible.value).toBe(false);
        ph.restorePlantHealthFromHash([{ entry: { path: 'rinconada/odm_orthophoto.tif' } }]);
        expect(ph.plantHealthInitialParams.value.formula).toBe('NDVI');
        ph.closePlantHealth();
        ph.restorePlantHealthFromHash([{ entry: { path: 'rinconada/odm_orthophoto.tif' } }]);
        expect(ph.plantHealthVisible.value).toBe(false);
    });
});
