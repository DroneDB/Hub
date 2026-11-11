import { describe, it, expect } from 'vitest';
import { shortenMiddle, groupWarnings, cameraBandName } from './mergeBands';

describe('shortenMiddle', () => {
    it('returns a name that fits as it is', () => {
        expect(shortenMiddle('IMG_0180_1.tif')).toBe('IMG_0180_1.tif');
        expect(shortenMiddle('a'.repeat(24))).toBe('a'.repeat(24));
    });

    it('cuts the middle and keeps the suffix and the extension of the band', () => {
        expect(shortenMiddle('IMG_180822_135805_0467_GRE.TIF')).toBe('IMG_180822_135…7_GRE.TIF');
        expect(shortenMiddle('DJI_20240525174755_0001_MS_RE.TIF')).toBe('DJI_2024052517…MS_RE.TIF');
    });

    it('gives a result of the length it is asked for', () => {
        expect(shortenMiddle('IMG_180822_135805_0467_GRE.TIF', 16).length).toBe(16);
        expect(shortenMiddle('x'.repeat(100), 10).length).toBe(10);
    });
});

describe('groupWarnings', () => {
    it('joins identical warnings in the order of their first appearance', () => {
        expect(groupWarnings(['b', 'a', 'b', 'b'])).toEqual([{ text: 'b', count: 3 }, { text: 'a', count: 1 }]);
    });

    it('gives nothing for no warning', () => {
        expect(groupWarnings([])).toEqual([]);
    });
});

describe('cameraBandName', () => {
    const validation = { alignment: { bands: [{ name: 'Blue' }, { name: 'Red edge' }, {}] } };

    it('gives the name of the band at the position', () => {
        expect(cameraBandName(validation, 0)).toBe('Blue');
        expect(cameraBandName(validation, 1)).toBe('Red edge');
    });

    it('gives an empty text for a band without a name or without a check', () => {
        expect(cameraBandName(validation, 2)).toBe('');
        expect(cameraBandName(validation, 7)).toBe('');
        expect(cameraBandName({ alignment: null }, 0)).toBe('');
        expect(cameraBandName(null, 0)).toBe('');
    });
});
