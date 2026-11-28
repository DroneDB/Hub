/**
 * The analysis overlays of the map (the raster area, the profile line, the stockpiles) are the
 * Hub's yellow, the stockpile panel's accent, with a dark halo that keeps a line readable on
 * bright aerial imagery; the Hub has no orange.
 */
import { describe, it, expect } from 'vitest';
import { ANALYSIS_YELLOW } from '@/libs/palette';
import { ANALYSIS_COLOR } from './mapUtils';
import {
    ANALYSIS_FILL, ANALYSIS_HALO, HALO_EXTRA_WIDTH, analysisStyles, haloStyle, currentAnalysisColour
} from './analysisStyles';

describe('the analysis colour', () => {
    it('is the yellow of the stockpile panel, not an orange', () => {
        expect(ANALYSIS_COLOR).toBe(ANALYSIS_YELLOW);
        expect(ANALYSIS_FILL).toBe('rgba(255, 213, 79, 0.2)');
    });

    it('replaces the orange the overlays were saved with, and nothing else', () => {
        expect(currentAnalysisColour('#ff9800')).toBe(ANALYSIS_COLOR);
        expect(currentAnalysisColour(' #FF9800 ')).toBe(ANALYSIS_COLOR);
        expect(currentAnalysisColour('rgba(255, 152, 0, 0.20)')).toBe(ANALYSIS_FILL);
        expect(currentAnalysisColour('#ff6600')).toBe('#ff6600');
        expect(currentAnalysisColour(undefined)).toBeUndefined();
    });
});

describe('analysisStyles', () => {
    it('draws a dark halo, wider and with the same dash, under the yellow line', () => {
        const [halo, line] = analysisStyles({ width: 3, lineDash: [8, 6], fill: ANALYSIS_FILL });
        expect(halo.getStroke().getColor()).toBe(ANALYSIS_HALO);
        expect(halo.getStroke().getWidth()).toBe(3 + HALO_EXTRA_WIDTH);
        expect(halo.getStroke().getLineDash()).toEqual([8, 6]);
        expect(halo.getFill()).toBeNull();
        expect(line.getStroke().getColor()).toBe(ANALYSIS_COLOR);
        expect(line.getStroke().getWidth()).toBe(3);
        expect(line.getFill().getColor()).toBe(ANALYSIS_FILL);
    });

    it('has no fill unless one is given', () => {
        const [, line] = analysisStyles();
        expect(line.getStroke().getWidth()).toBe(2);
        expect(line.getFill()).toBeNull();
    });

    it('gives the halo of a line of any width', () => {
        expect(haloStyle(5).getStroke().getWidth()).toBe(5 + HALO_EXTRA_WIDTH);
    });
});
