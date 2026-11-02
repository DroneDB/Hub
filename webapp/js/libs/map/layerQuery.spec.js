import { describe, it, expect } from 'vitest';
import { b64urlEncode } from '@/libs/base64';
import { MAX_ADDED_LAYERS, encodeLayerParam, parseLayerParams } from './layerQuery';

const enc = b64urlEncode;
const MAIN = 'flights/ortho.tif';

describe('parseLayerParams', () => {
    it('reads valid paths in order', () => {
        expect(parseLayerParams([enc('a/dsm.tif'), enc('dtm.tif')], MAIN)).toEqual(['a/dsm.tif', 'dtm.tif']);
    });

    it('accepts one string, an array or nothing', () => {
        expect(parseLayerParams(enc('dsm.tif'), MAIN)).toEqual(['dsm.tif']);
        expect(parseLayerParams([enc('dsm.tif')], MAIN)).toEqual(['dsm.tif']);
        expect(parseLayerParams(undefined, MAIN)).toEqual([]);
        expect(parseLayerParams(null, MAIN)).toEqual([]);
        expect(parseLayerParams([], MAIN)).toEqual([]);
    });

    it('drops paths that leave the dataset', () => {
        const values = ['../x.tif', '/abs.tif', 'http://evil.example/x.tif', 'a\\b.tif', 'a/../b.tif', 'a//b.tif', ''].map(enc);
        expect(parseLayerParams(values, MAIN)).toEqual([]);
    });

    it('ignores values that cannot be decoded and never throws', () => {
        expect(parseLayerParams(['!!!not base64!!!', '%%', enc('ok.tif'), '/w==', null, 42], MAIN)).toEqual(['ok.tif']);
    });

    it('drops the main file and repeats', () => {
        expect(parseLayerParams([enc(MAIN), enc('a.tif'), enc('a.tif'), enc('b.tif')], MAIN)).toEqual(['a.tif', 'b.tif']);
    });

    it('keeps the first three valid layers', () => {
        expect(MAX_ADDED_LAYERS).toBe(3);
        const values = ['../bad', 'a.tif', 'b.tif', 'c.tif', 'd.tif'].map(enc);
        expect(parseLayerParams(values, MAIN)).toEqual(['a.tif', 'b.tif', 'c.tif']);
    });

    it('loads a value that carries a ~ suffix', () => {
        expect(parseLayerParams(`${enc('dsm.tif')}~0.5`, MAIN)).toEqual(['dsm.tif']);
        // Nothing before the suffix: no path
        expect(parseLayerParams(['~0.5', '~'], MAIN)).toEqual([]);
        expect(parseLayerParams([`${enc('dsm.tif')}~`, `${enc('dtm.tif')}~0.5~x`], MAIN)).toEqual(['dsm.tif', 'dtm.tif']);
    });
});

describe('encodeLayerParam', () => {
    it('round-trips through parseLayerParams, including non-ASCII paths', () => {
        const paths = ['ü é/città 日本.tif', 'a b.tif'];
        expect(parseLayerParams(paths.map(encodeLayerParam), MAIN)).toEqual(paths);
        expect(encodeLayerParam('ûÿ?>.tif')).not.toMatch(/[+/=]/);
    });
});
