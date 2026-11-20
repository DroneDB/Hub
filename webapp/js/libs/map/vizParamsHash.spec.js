/**
 * The style of a raster layer in the address (FR-RAS-05): one codec for Copy Link and for the map that opens the link.
 */
import { describe, it, expect } from 'vitest';
import { encodeVizParamsHash, decodeVizParamsHash } from './vizParamsHash';

const NDVI = { formula: 'NDVI', colormap: 'rdylgn', rescale: '-0.272,0.644', stretch: 'percentile' };

describe('vizParamsHash', () => {
    it('writes the path and the style in the hash', () => {
        expect(encodeVizParamsHash('rinconada/odm_orthophoto.tif', NDVI))
            .toBe('path=rinconada%2Fodm_orthophoto.tif&formula=NDVI&colormap=rdylgn&rescale=-0.272%2C0.644&stretch=percentile');
    });

    it('reads the link of the finding back: NDVI, the same colormap and range', () => {
        const hash = '#path=rinconada/odm_orthophoto.tif&formula=NDVI&colormap=rdylgn&rescale=-0.272%2C0.644&stretch=percentile';
        expect(decodeVizParamsHash(hash)).toEqual({ path: 'rinconada/odm_orthophoto.tif', vizParams: NDVI });
    });

    it('decodes what it encodes', () => {
        for (const vizParams of [NDVI, { preset: 'cir' }, { bands: '4,2,1' }, { colormap: 'magma', rescale: '0,1', nodata: -9999 }, {}]) {
            expect(decodeVizParamsHash(encodeVizParamsHash('a b/c&d.tif', vizParams))).toEqual({ path: 'a b/c&d.tif', vizParams });
        }
    });

    // D-022: a rescale of a thermal layer keeps the unit it was written in
    it('keeps the unit of the rescale of a thermal layer', () => {
        const thermal = { formula: 'CELSIUS', colormap: 'ironbow', rescale: '280,310', rescaleUnit: 'K' };
        expect(encodeVizParamsHash('t.tif', thermal))
            .toBe('path=t.tif&formula=CELSIUS&colormap=ironbow&rescale=280%2C310&rescaleUnit=K');
        expect(decodeVizParamsHash(encodeVizParamsHash('t.tif', thermal))).toEqual({ path: 't.tif', vizParams: thermal });
    });

    it('leaves out empty values and keeps a NoData value of zero', () => {
        expect(encodeVizParamsHash('a.tif', { formula: '', rescale: undefined, nodata: 0 })).toBe('path=a.tif&nodata=0');
        expect(decodeVizParamsHash('path=a.tif&nodata=0').vizParams).toEqual({ nodata: 0 });
        expect(decodeVizParamsHash('path=a.tif&nodata=abc').vizParams).toEqual({});
    });

    it('is null for a hash without a file', () => {
        expect(decodeVizParamsHash('')).toBeNull();
        expect(decodeVizParamsHash('#')).toBeNull();
        expect(decodeVizParamsHash('#formula=NDVI')).toBeNull();
        expect(decodeVizParamsHash(null)).toBeNull();
    });
});
