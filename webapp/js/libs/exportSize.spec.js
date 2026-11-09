/**
 * The estimate of an export comes from the Registry (U-201, D-023): the pixels that are not NoData x 4 bytes. The Hub
 * computes the size of the raw raster only for an info that has no estimate.
 */
import { describe, it, expect } from 'vitest';
import { isExportTooLarge } from './exportSize';

const GIB = 1073741824;

describe('isExportTooLarge', () => {
    it('uses the estimate of the Registry when the info has one', () => {
        // 100000 x 100000 Float32 pixels is 40 GB raw, but 3 GB of them have a value
        const info = { width: 100000, height: 100000, dataType: 'Float32', estimatedExportBytes: 3 * GIB };
        expect(isExportTooLarge(info, 4 * GIB)).toBe(false);
        expect(isExportTooLarge(info, 2 * GIB)).toBe(true);
    });

    it('falls back to the size of the raw raster without an estimate', () => {
        const info = { width: 20000, height: 20000, bandCount: 1, dataType: 'Float32' };
        expect(isExportTooLarge(info, GIB)).toBe(true);
        expect(isExportTooLarge({ width: 100, height: 100, dataType: 'Byte' }, GIB)).toBe(false);
    });

    it('has no limit without a configured one', () => {
        expect(isExportTooLarge({ estimatedExportBytes: 10 * GIB }, null)).toBe(false);
        expect(isExportTooLarge({ estimatedExportBytes: 10 * GIB }, 0)).toBe(false);
    });
});
