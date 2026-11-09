import { describe, it, expect, vi, afterEach } from 'vitest';
import Feature from 'ol/Feature';
import Observable from 'ol/Observable';
import Collection from 'ol/Collection';
import { showPointPopup, POPUP_BELOW_CLASS } from './pointPopup';

/**
 * A map that has a size and puts every coordinate at `pixel` (or at `pixels.get(coordinate)`); its events
 * are real (an Observable), fired by hand with dispatchEvent, and its overlays a real Collection.
 */
function fakeMap({ size = [800, 600], pixel = [400, 300] } = {}) {
    const overlays = new Collection();
    return Object.assign(new Observable(), {
        overlays,
        pixel,
        /** @type {Map<number[], number[]>} */
        pixels: new Map(),
        addOverlay: vi.fn(overlay => overlays.push(overlay)),
        removeOverlay: overlay => overlays.remove(overlay),
        getOverlays: () => overlays,
        getSize: () => size,
        getPixelFromCoordinate(coordinate) { return this.pixels.get(coordinate) || this.pixel; },
        getTargetElement: () => null
    });
}

/** Gives every element the size of a popup (jsdom has no layout) */
function popupSize(width, height) {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(width);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(height);
}
afterEach(() => vi.restoreAllMocks());

describe('showPointPopup', () => {
    it('puts the popup of the point on the map and keeps it on the feature for cleanup', () => {
        const map = fakeMap();
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

    it('hides its icons from screen readers', () => {
        const feature = new Feature({ name: 'Gate' });
        const { popupEl } = showPointPopup(fakeMap(), feature, { lat: 1, lon: 2, coords: [0, 0], actions: true });
        const icons = [...popupEl.querySelectorAll('i')];
        expect(icons.length).toBeGreaterThan(0);
        for (const i of icons) expect(i.getAttribute('aria-hidden')).toBe('true');
    });

    it('adds the edit, copy and delete buttons for an imported point', () => {
        const feature = new Feature({ name: 'Gate' });
        const { popupEl } = showPointPopup(fakeMap(), feature, { lat: 1, lon: 2, coords: [0, 0], actions: true });
        for (const action of ['edit', 'copy', 'delete']) {
            expect(popupEl.querySelector(`.ol-point-popup-${action}`)).not.toBeNull();
        }
    });
});

describe('showPointPopup near the edges of the map (FR-MAP-26)', () => {
    const show = (map, coords = [1, 2]) => showPointPopup(map, new Feature({ name: 'Gate' }), { lat: 1, lon: 2, coords });

    it('puts the popup above its point when there is room, with the arrow down', () => {
        popupSize(224, 80);
        const { popupOverlay, popupEl } = show(fakeMap({ pixel: [400, 300] }));
        expect(popupOverlay.getPositioning()).toBe('bottom-center');
        expect(popupOverlay.getOffset()).toEqual([0, -12]);
        expect(popupEl.classList.contains(POPUP_BELOW_CLASS)).toBe(false);
    });

    it('puts it below its point when the point is within the height of the popup of the top edge', () => {
        popupSize(224, 80);
        // 60 px from the top: 60 - 12 (the offset) - 80 (the popup) is above the map
        const { popupOverlay, popupEl } = show(fakeMap({ pixel: [400, 60] }));
        expect(popupOverlay.getPositioning()).toBe('top-center');
        expect(popupOverlay.getOffset()).toEqual([0, 12]);
        expect(popupEl.classList.contains(POPUP_BELOW_CLASS)).toBe(true);
    });

    it('goes back above its point when the view moves and the point has room again', () => {
        popupSize(224, 80);
        const map = fakeMap({ pixel: [400, 60] });
        const { popupOverlay, popupEl } = show(map);
        expect(popupOverlay.getPositioning()).toBe('top-center');
        map.pixel = [400, 300];
        map.dispatchEvent('moveend');
        expect(popupOverlay.getPositioning()).toBe('bottom-center');
        expect(popupEl.classList.contains(POPUP_BELOW_CLASS)).toBe(false);
    });

    it('stops following the view once its overlay is off the map', () => {
        popupSize(224, 80);
        const map = fakeMap({ pixel: [400, 300] });
        const { popupOverlay } = show(map);
        map.removeOverlay(popupOverlay);
        map.pixel = [400, 10];
        map.dispatchEvent('moveend');
        expect(popupOverlay.getPositioning()).toBe('bottom-center');
    });

    it('waits for the first render when the map has no size yet', () => {
        popupSize(224, 80);
        const map = fakeMap({ pixel: [400, 60] });
        map.getSize = () => undefined;
        const { popupOverlay } = show(map);
        expect(popupOverlay.getPositioning()).toBe('bottom-center');
        map.getSize = () => [800, 600];
        map.dispatchEvent('postrender');
        expect(popupOverlay.getPositioning()).toBe('top-center');
    });
});

describe('the popups of a map share one listener of the view (FR-MAP-26)', () => {
    const show = (map, coords) => showPointPopup(map, new Feature({ name: 'Gate' }), { lat: 1, lon: 2, coords });
    const listenerCount = (map, type) => (map.getListeners(type) || []).length;

    it('registers one moveend listener for any number of popups, and re-places all of them on a move', () => {
        popupSize(224, 80);
        const map = fakeMap({ pixel: [400, 300] });
        const a = [1, 1], b = [2, 2], c = [3, 3];
        const popups = [show(map, a), show(map, b), show(map, c)];
        expect(listenerCount(map, 'moveend')).toBe(1);
        // a and c come near the top edge, b stays in the middle
        map.pixels.set(a, [100, 20]);
        map.pixels.set(c, [600, 50]);
        map.dispatchEvent('moveend');
        expect(popups.map(p => p.popupOverlay.getPositioning())).toEqual(['top-center', 'bottom-center', 'top-center']);
    });

    it('reads every popup size before it writes any placement', () => {
        const calls = [];
        vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(() => { calls.push('read'); return 224; });
        vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(80);
        const map = fakeMap({ pixel: [400, 300] });
        const popups = [show(map, [1, 1]), show(map, [2, 2]), show(map, [3, 3])];
        for (const { popupOverlay } of popups) {
            const set = popupOverlay.setPositioning.bind(popupOverlay);
            popupOverlay.setPositioning = p => { calls.push('write'); set(p); };
        }
        calls.length = 0;
        map.dispatchEvent('moveend');
        expect(calls).toEqual(['read', 'read', 'read', 'write', 'write', 'write']);
    });

    it('stops re-placing a popup whose overlay was removed, and keeps re-placing the others', () => {
        popupSize(224, 80);
        const map = fakeMap({ pixel: [400, 300] });
        const first = show(map, [1, 1]);
        const second = show(map, [2, 2]);
        map.removeOverlay(first.popupOverlay);
        map.pixel = [400, 10];
        map.dispatchEvent('moveend');
        expect(first.popupOverlay.getPositioning()).toBe('bottom-center');
        expect(second.popupOverlay.getPositioning()).toBe('top-center');
        expect(listenerCount(map, 'moveend')).toBe(1);
    });

    it('removes the moveend listener when the last popup leaves the map, and adds it again with a new popup', () => {
        popupSize(224, 80);
        const map = fakeMap({ pixel: [400, 300] });
        const first = show(map, [1, 1]);
        const second = show(map, [2, 2]);
        map.removeOverlay(first.popupOverlay);
        map.removeOverlay(second.popupOverlay);
        expect(listenerCount(map, 'moveend')).toBe(0);
        expect(listenerCount(map, 'postrender')).toBe(0);
        expect(map.overlays.hasListener('remove')).toBe(false);
        show(map, [3, 3]);
        expect(listenerCount(map, 'moveend')).toBe(1);
    });

    it('waits for one render for all the popups shown before the map has a size', () => {
        popupSize(224, 80);
        const map = fakeMap({ pixel: [400, 60] });
        map.getSize = () => undefined;
        const popups = [show(map, [1, 1]), show(map, [2, 2])];
        expect(listenerCount(map, 'postrender')).toBe(1);
        map.getSize = () => [800, 600];
        map.dispatchEvent('postrender');
        expect(popups.map(p => p.popupOverlay.getPositioning())).toEqual(['top-center', 'top-center']);
        expect(listenerCount(map, 'postrender')).toBe(0);
    });
});
