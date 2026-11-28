/**
 * The vector layers of the 3D viewer stop at the last zoom level of their MVT pyramid: a closer view
 * draws the tiles of that level enlarged instead of asking for tiles the pyramid does not have (the
 * server answers 404 and the layer goes blank). OpenLayers, Giro3D's VectorTileSource and the loader
 * are the real things; the Registry's answers are stubbed.
 */
import { describe, it, expect, vi } from 'vitest';

// Giro3D's image decoder is also a worker script: it sets the worker's onmessage when imported
vi.hoisted(() => { globalThis.onmessage = null; });

import VectorTileSource from '@giro3d/giro3d/sources/VectorTileSource.js';
import OlVectorTile from 'ol/source/VectorTile.js';
import MVT from 'ol/format/MVT.js';
import * as olStyle from 'ol/style.js';
import { createXYZ } from 'ol/tilegrid.js';
import { get as getProjection } from 'ol/proj.js';
import ddb from 'ddb';
import Registry from '@/libs/ddb/registry';
import { capVectorTileZoom } from './sceneUtils';
import { LOADERS } from './loaders';

const URL_TEMPLATE = '/orgs/o/ds/d/mvt/abc/{z}/{x}/{y}.pbf';
const mercator = getProjection('EPSG:3857');

/** The zoom levels of the source tiles OpenLayers asks for to draw tile z/x/y of the layer. */
function sourceZoomsFor(olSource, z, x, y) {
    olSource.setTileLoadFunction(() => {}); // no request in the test
    const tile = olSource.getTile(z, x, y, 1, mercator);
    return [...new Set(olSource.getSourceTiles(1, mercator, tile).map(t => t.getTileCoord()[0]))];
}

describe('capVectorTileZoom', () => {
    it('asks for the tiles of the last level of the pyramid to draw a closer view, and keeps the levels the layer is drawn on', () => {
        const olSource = new OlVectorTile({ url: URL_TEMPLATE, format: new MVT() });
        expect(sourceZoomsFor(olSource, 20, 530970, 360736)).toEqual([20]);

        const capped = new OlVectorTile({ url: URL_TEMPLATE, format: new MVT() });
        capVectorTileZoom(capped, 18, createXYZ);
        expect(capped.getTileGrid().getMaxZoom()).toBe(18);
        expect(sourceZoomsFor(capped, 20, 530970, 360736)).toEqual([18]);
        expect(sourceZoomsFor(capped, 12, 2074, 1409)).toEqual([12]);
        expect(capped.getTileGridForProjection(mercator).getMaxZoom()).toBeGreaterThan(20);
    });

    it('leaves the grid as it is without a usable level', () => {
        for (const maxZoom of [undefined, NaN, 22, 30, -1, 2.5]) {
            const olSource = new OlVectorTile({ url: URL_TEMPLATE, format: new MVT() });
            const grid = olSource.getTileGrid();
            capVectorTileZoom(olSource, maxZoom, createXYZ);
            expect(olSource.getTileGrid()).toBe(grid);
        }
    });
});

describe('the vector loader of the 3D viewer', () => {
    it('stops the tiles of the layer at the maxzoom of the metadata of its pyramid', async () => {
        const fetchRaw = vi.fn(async () => ({ ok: true, json: async () => ({ minzoom: 0, maxzoom: 14 }) }));
        const dataset = new Registry('http://vector-zoom.test').Organization('o').Dataset('d');
        dataset.registry.fetchRaw = fetchRaw;
        const entry = { type: ddb.entry.type.VECTOR, path: 'roads.fgb', hash: 'abc', point_geom: { type: 'Point', coordinates: [2.29, 48.86] } };
        const added = [];
        const scene = {
            view: { loadingText: '' },
            libs: {
                ColorLayer: class { constructor(options) { Object.assign(this, options); } },
                VectorTileSource, olStyle, createXYZ, CoordinateSystem: { epsg3857: {} }
            },
            computeExtent: () => ({ extent: {} }),
            setupInstance: vi.fn(), addBasemap: vi.fn(), registerLayer: vi.fn(), frameExtent: vi.fn(),
            map: { addLayer: layer => added.push(layer) }
        };

        await LOADERS[ddb.entry.type.VECTOR](scene, entry, dataset);

        expect(fetchRaw).toHaveBeenCalledWith(expect.stringMatching(/\/mvt\/abc\/metadata\.json$/));
        const olSource = added[0].source.source;
        expect(olSource.getTileGrid().getMaxZoom()).toBe(14);
        expect(olSource.getUrls()[0]).toMatch(/\/mvt\/abc\/\{z\}\/\{x\}\/\{y\}\.pbf$/);
    });
});
