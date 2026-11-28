/**
 * A 3D Tiles archive is streamed with the decoders of this server: the basis transcoder and the
 * Draco decoder come from /wasm (webpack copies them), never from the renderer's defaults, which
 * are unpkg.com addresses (no tiles on an air-gapped install, unpinned remote code in a worker).
 */
import { describe, it, expect } from 'vitest';
import ddb from 'ddb';
import { LOADERS } from './loaders';

function fakeScene(options) {
    class Tiles3D {
        constructor(opts) { options.push(opts); this.tiles = {}; }
        getBoundingBox() { return null; }
    }
    return {
        view: {},
        libs: { Tiles3D, CoordinateSystem: { epsg3857: 'EPSG:3857' } },
        setupGlobe() {},
        setupInstance() {},
        shadeUntexturedTiles() {},
        configureTilesetStreaming() {},
        instance: { add: async () => {} }
    };
}

describe('3D Tiles loader', () => {
    it('points Tiles3D at the local Draco and basis decoders', async () => {
        const options = [];
        const dataset = { Entry: () => ({ get3DTiles: () => '/orgs/o/ds/d/tiles/tileset.json' }) };
        const entry = { path: 'a.3tz', type: ddb.entry.type.TILES3D, properties: {} };

        await expect(LOADERS[ddb.entry.type.TILES3D](fakeScene(options), entry, dataset)).rejects.toThrow(/empty or invalid/);

        expect(options).toHaveLength(1);
        expect(options[0]).toMatchObject({
            url: '/orgs/o/ds/d/tiles/tileset.json',
            dracoDecoderPath: '/wasm/draco/',
            ktx2DecoderPath: '/wasm/basis/'
        });
    });
});
