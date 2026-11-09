import { describe, it, expect, vi, afterEach } from 'vitest';
import { appliedPixelRatio, MAX_PIXEL_RATIO } from './pixelRatio';
import { QUALITY_PRESETS } from '@/features/viewers/splat/qualityPresets';

describe('appliedPixelRatio', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('is min(devicePixelRatio, 2, presetCap)', () => {
        expect(appliedPixelRatio(2, 3)).toBe(2);
        expect(appliedPixelRatio(2, 1.5)).toBe(1.5);
        expect(appliedPixelRatio(1.5, 2)).toBe(1.5);
        expect(appliedPixelRatio(1, 2)).toBe(1);
        expect(appliedPixelRatio(1, 1)).toBe(1);
    });

    it('uses the cap of each quality preset: High 2, Medium 1.5, Low 1', () => {
        expect(appliedPixelRatio(QUALITY_PRESETS.high.pixelRatio, 2)).toBe(2);
        expect(appliedPixelRatio(QUALITY_PRESETS.medium.pixelRatio, 2)).toBe(1.5);
        expect(appliedPixelRatio(QUALITY_PRESETS.low.pixelRatio, 2)).toBe(1);
    });

    it('caps a renderer without a preset at 2', () => {
        expect(MAX_PIXEL_RATIO).toBe(2);
        expect(appliedPixelRatio(undefined, 3)).toBe(2);
        expect(appliedPixelRatio(undefined, 1)).toBe(1);
        expect(appliedPixelRatio(10, 3)).toBe(2);
    });

    it('reads the window ratio by default and falls back to 1', () => {
        vi.stubGlobal('devicePixelRatio', 1.25);
        expect(appliedPixelRatio(2)).toBe(1.25);
        vi.stubGlobal('devicePixelRatio', 0);
        expect(appliedPixelRatio(2)).toBe(1);
    });
});
