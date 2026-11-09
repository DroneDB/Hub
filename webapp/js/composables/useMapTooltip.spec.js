/**
 * The label of a vector feature stays inside the visible map and out of the toolbar rail (FR-MAP-19).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ref } from 'vue';
import Feature from 'ol/Feature';
import { useMapTooltip } from './useMapTooltip';

afterEach(() => vi.restoreAllMocks());

/** A map of 800 x 600 whose coordinates are pixels; the toolbar rail takes 64 px (the default of the token) */
const map = {
    getSize: () => [800, 600],
    getCoordinateFromPixel: pixel => pixel,
    getPixelFromCoordinate: coordinate => coordinate,
    getTargetElement: () => null
};

function labelAt(pixel, name = 'Union Army, 1862') {
    const tooltip = useMapTooltip({ map: ref(map), vectorLayers: () => [], dialogs: () => ({}) });
    tooltip.setupTooltipOverlay();
    // The label of the marker is 150 x 30 px
    vi.spyOn(tooltip.tooltipElement.value, 'offsetWidth', 'get').mockReturnValue(150);
    vi.spyOn(tooltip.tooltipElement.value, 'offsetHeight', 'get').mockReturnValue(30);
    tooltip.showFeatureTooltip(new Feature({ name }), pixel);
    return tooltip.tooltipOverlay.value;
}

describe('showFeatureTooltip', () => {
    it('puts the label on the right of the pointer with room', () => {
        const overlay = labelAt([300, 300]);
        expect(overlay.getPositioning()).toBe('center-left');
        expect(overlay.getOffset()).toEqual([12, 0]);
    });

    it('puts it on the left of a marker near the right edge, where the toolbar is (FR-MAP-19)', () => {
        // 700 + 12 + 150 = 862 is beyond the map (800) and its rail (800 - 64)
        const overlay = labelAt([700, 300]);
        expect(overlay.getPositioning()).toBe('center-right');
        expect(overlay.getOffset()).toEqual([-12, 0]);
    });

    it('keeps the label out of the rail even where the map has room', () => {
        // 580 + 12 + 150 = 742: before the edge (800), inside the rail (736)
        expect(labelAt([580, 300]).getPositioning()).toBe('center-right');
        expect(labelAt([570, 300]).getPositioning()).toBe('center-left');
    });

    it('shows the label of the feature at the pointer', () => {
        const overlay = labelAt([300, 300]);
        expect(overlay.getElement().innerHTML).toBe('Union Army, 1862');
        expect(overlay.getPosition()).toEqual([300, 300]);
    });
});
