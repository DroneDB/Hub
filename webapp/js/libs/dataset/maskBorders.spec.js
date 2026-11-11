import { describe, it, expect } from 'vitest';
import { maskedOutputPath } from './maskBorders';

describe('maskedOutputPath', () => {
    it('is the name without its extension, with _masked.tif, in the same folder', () => {
        expect(maskedOutputPath('mask/black2.tif')).toBe('mask/black2_masked.tif');
        expect(maskedOutputPath('sheffield_rgb_black.tif')).toBe('sheffield_rgb_black_masked.tif');
        expect(maskedOutputPath('a/b/Ortho.v2.TIFF')).toBe('a/b/Ortho.v2_masked.tif');
    });

    it('keeps a name without an extension whole, and takes the last dot as the start of the extension, as the Registry does', () => {
        expect(maskedOutputPath('a/ortho')).toBe('a/ortho_masked.tif');
        expect(maskedOutputPath('.hidden')).toBe('_masked.tif');
    });
});
