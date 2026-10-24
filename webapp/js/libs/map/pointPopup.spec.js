import { describe, it, expect, vi } from 'vitest';
import Feature from 'ol/Feature';
import { showPointPopup } from './pointPopup';

describe('showPointPopup', () => {
    it('puts the popup of the point on the map and keeps it on the feature for cleanup', () => {
        const map = { addOverlay: vi.fn() };
        const feature = new Feature({ name: 'Gate', stroke: '#ff0000', description: 'North gate' });

        const { popupEl, popupOverlay } = showPointPopup(map, feature, { lat: 45.5, lon: 9.25, coords: [1, 2] });

        expect(map.addOverlay).toHaveBeenCalledWith(popupOverlay);
        expect(popupOverlay.getPosition()).toEqual([1, 2]);
        expect(popupEl.className).toBe('ol-point-popup');
        expect(popupEl.textContent).toContain('Gate');
        expect(popupEl.textContent).toContain('North gate');
        expect(popupEl.querySelector('.ol-point-popup-edit')).toBeNull();
        expect(feature.get('measureTooltipElement')).toBe(popupEl);
        expect(feature.get('measureTooltip')).toBe(popupOverlay);
    });

    it('adds the edit, copy and delete buttons for an imported point', () => {
        const feature = new Feature({ name: 'Gate' });
        const { popupEl } = showPointPopup({ addOverlay() {} }, feature, { lat: 1, lon: 2, coords: [0, 0], actions: true });
        for (const action of ['edit', 'copy', 'delete']) {
            expect(popupEl.querySelector(`.ol-point-popup-${action}`)).not.toBeNull();
        }
    });
});
