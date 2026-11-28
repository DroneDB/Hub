import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import { fromLonLat } from 'ol/proj';
import Observable from 'ol/Observable';
import Collection from 'ol/Collection';
import { showPointPopup, pointPopupHtml, POPUP_BELOW_CLASS } from './pointPopup';
import { copyText } from '@/composables/useCopyText';
import { readSource, ruleOf } from '@/specs/cssSource';
import { PRIMARY } from '@/libs/palette';

vi.mock('@/composables/useCopyText', () => ({ copyText: vi.fn(() => Promise.resolve()) }));

/** A point feature at map coordinates `coords` (Web Mercator) */
const pointAt = (coords, properties = {}) => new Feature({ geometry: new Point(coords), ...properties });
const noActions = () => ({ onEdit: vi.fn(), onDelete: vi.fn(), onMoved: vi.fn() });

/**
 * A map that has a size and puts every coordinate at `pixel` (or at the pixel `pixels` sets for that coordinate); its events
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
        // A point's geometry hands out copies of its coordinates: they are matched by value
        // The map coordinate of a pointer event: its client position, as if the map were at its origin with 1 m per pixel
        getEventCoordinate: e => [e.clientX, e.clientY],
        getPixelFromCoordinate(coordinate) {
            const set = [...this.pixels].find(([c]) => String(c) === String(coordinate));
            return set ? set[1] : this.pixel;
        },
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
        const coords = fromLonLat([9.25, 45.5]);
        const feature = pointAt(coords, { name: 'Gate', stroke: '#ff0000', description: 'North gate' });

        const { popupEl, popupOverlay } = showPointPopup(map, feature);

        expect(map.addOverlay).toHaveBeenCalledWith(popupOverlay);
        expect(popupOverlay.getPosition()).toEqual(coords);
        expect(popupEl.className).toBe('ol-point-popup');
        expect(popupEl.textContent).toContain('Gate');
        expect(popupEl.textContent).toContain('North gate');
        expect(popupEl.querySelector('.ol-point-popup-edit')).toBeNull();
        expect(feature.get('measureTooltipElement')).toBe(popupEl);
        expect(feature.get('measureTooltip')).toBe(popupOverlay);
    });

    it('leaves the coordinates out of a point with a description or a name: the copy button names them', () => {
        for (const properties of [{ description: 'Ciao a tutti' }, { name: 'Pippo' }, { name: 'Pippo', description: 'Ciao a tutti' }]) {
            const feature = pointAt(fromLonLat([31.138658, -23.940176]), properties);
            const { popupEl } = showPointPopup(fakeMap(), feature, noActions());
            expect(popupEl.querySelector('.ol-point-popup-coords')).toBeNull();
            expect(popupEl.textContent).not.toContain('-23.940176');
            expect(popupEl.querySelector('.ol-point-popup-copy').getAttribute('title')).toBe('Copy coordinates: -23.940176, 31.138658');
        }
    });

    it('shows the description under the name, and no empty text under a name alone', () => {
        const both = showPointPopup(fakeMap(), pointAt([0, 0], { name: 'Pippo', description: 'Ciao a tutti' }), noActions()).popupEl;
        expect(both.querySelector('.ol-point-popup-title').textContent).toBe('Pippo');
        expect(both.querySelector('.ol-point-popup-text').textContent.trim()).toBe('Ciao a tutti');
        const nameOnly = showPointPopup(fakeMap(), pointAt([0, 0], { name: 'Pippo' }), noActions()).popupEl;
        expect(nameOnly.querySelector('.ol-point-popup-text')).toBeNull();
    });

    it('shows the coordinates of a point with neither a name nor a description, with the same point in DMS as tooltip', () => {
        const { popupEl } = showPointPopup(fakeMap(), pointAt(fromLonLat([31.138658, -23.940176])), noActions());
        expect(popupEl.querySelector('.ol-point-popup-text').textContent.trim()).toBe('-23.940176, 31.138658');
        // The tooltip as the HTML writes it: its quotes escaped, so the seconds (") do not end the attribute
        expect(pointPopupHtml({ lat: -23.940176, lon: 31.138658 }))
            .toContain(`title="23\u00B056&#39;24.63&quot; S / 31\u00B008&#39;19.17&quot; E"`);
    });

    it('hides its icons from screen readers', () => {
        const { popupEl } = showPointPopup(fakeMap(), pointAt([0, 0], { name: 'Gate' }), noActions());
        const icons = [...popupEl.querySelectorAll('i')];
        expect(icons.length).toBeGreaterThan(0);
        for (const i of icons) expect(i.getAttribute('aria-hidden')).toBe('true');
    });

    it('adds the move, edit, copy and delete buttons, in this order, when it is given their handlers', () => {
        const { popupEl } = showPointPopup(fakeMap(), pointAt([0, 0], { name: 'Gate' }), noActions());
        expect([...popupEl.querySelectorAll('.ol-point-popup-actions button')].map(b => b.getAttribute('aria-label')))
            .toEqual(['Move point', 'Edit annotation', 'Copy coordinates', 'Delete point']);
    });

    it('gives the point to the handlers of its edit and delete buttons, and copies its coordinates', () => {
        const actions = noActions();
        const feature = pointAt(fromLonLat([31.136198, -23.939526]));
        const { popupEl } = showPointPopup(fakeMap(), feature, actions);
        /** @type {HTMLElement} */ (popupEl.querySelector('.ol-point-popup-edit')).click();
        expect(actions.onEdit).toHaveBeenCalledWith(feature);
        /** @type {HTMLElement} */ (popupEl.querySelector('.ol-point-popup-copy')).click();
        expect(copyText).toHaveBeenCalledWith('-23.939526, 31.136198');
        /** @type {HTMLElement} */ (popupEl.querySelector('.ol-point-popup-delete')).click();
        expect(actions.onDelete).toHaveBeenCalledWith(feature);
    });

    it('replaces the popup the point had: shown again after an edit, the point has one popup, with its buttons', () => {
        const map = fakeMap();
        const feature = pointAt([0, 0], { stroke: '#ffc107' });
        const first = showPointPopup(map, feature, noActions());
        document.body.appendChild(first.popupEl);
        feature.set('description', 'Ciao');

        const second = showPointPopup(map, feature, noActions());

        expect(map.getOverlays().getArray()).toEqual([second.popupOverlay]);
        expect(first.popupEl.isConnected).toBe(false);
        expect(second.popupEl.textContent).toContain('Ciao');
        expect(second.popupEl.querySelector('.ol-point-popup-edit')).not.toBeNull();
        expect(feature.get('measureTooltip')).toBe(second.popupOverlay);
    });

    it('is at the place the point has now, once it is moved', () => {
        const map = fakeMap();
        const feature = pointAt(fromLonLat([9, 45]));
        showPointPopup(map, feature, noActions());
        feature.getGeometry().setCoordinates(fromLonLat([10, 46]));

        const { popupEl, popupOverlay } = showPointPopup(map, feature, noActions());

        expect(popupOverlay.getPosition()).toEqual(fromLonLat([10, 46]));
        expect(popupEl.textContent).toContain('46.000000, 10.000000');
    });
});

describe('showPointPopup near the edges of the map (FR-MAP-26)', () => {
    const show = (map, coords = [1, 2]) => showPointPopup(map, pointAt(coords, { name: 'Gate' }));

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
    const show = (map, coords) => showPointPopup(map, pointAt(coords, { name: 'Gate' }));
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

describe('the move handle of a point popup', () => {
    // happy-dom has no pointer capture: the handle's calls are recorded
    const captured = new Set();
    beforeEach(() => {
        captured.clear();
        Object.assign(HTMLElement.prototype, {
            setPointerCapture: id => captured.add(id),
            releasePointerCapture: id => captured.delete(id),
            hasPointerCapture: id => captured.has(id)
        });
    });
    afterEach(() => {
        delete HTMLElement.prototype.setPointerCapture;
        delete HTMLElement.prototype.releasePointerCapture;
        delete HTMLElement.prototype.hasPointerCapture;
    });

    function shown() {
        const actions = noActions();
        const feature = pointAt([1000, 2000]);
        const { popupEl, popupOverlay } = showPointPopup(fakeMap(), feature, actions);
        const handle = /** @type {HTMLElement} */ (popupEl.querySelector('.ol-point-popup-move'));
        const pointer = (type, x, y, init = {}) => handle.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 7, button: 0, bubbles: true, cancelable: true, ...init }));
        return { actions, feature, popupEl, popupOverlay, handle, pointer };
    }
    const at = feature => feature.getGeometry().getCoordinates();

    it('moves the point and its popup by the distance the pointer moves, and reports the move on release', () => {
        const { actions, feature, popupEl, popupOverlay, pointer } = shown();
        pointer('pointerdown', 10, 10);
        expect(captured.has(7)).toBe(true);
        expect(popupEl.classList.contains('ol-point-popup-moving')).toBe(true);
        pointer('pointermove', 110, 60);
        expect(at(feature)).toEqual([1100, 2050]);
        expect(popupOverlay.getPosition()).toEqual([1100, 2050]);
        expect(actions.onMoved).not.toHaveBeenCalled();
        pointer('pointerup', 110, 60);
        expect(actions.onMoved).toHaveBeenCalledWith(feature, [1000, 2000]);
        expect(at(feature)).toEqual([1100, 2050]);
        expect(captured.has(7)).toBe(false);
        expect(popupEl.classList.contains('ol-point-popup-moving')).toBe(false);
    });

    it('puts the point back on Esc while it drags, and reports no move', () => {
        const { actions, feature, popupOverlay, pointer } = shown();
        pointer('pointerdown', 10, 10);
        pointer('pointermove', 60, 10);
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        expect(at(feature)).toEqual([1000, 2000]);
        expect(popupOverlay.getPosition()).toEqual([1000, 2000]);
        pointer('pointerup', 60, 10);
        expect(actions.onMoved).not.toHaveBeenCalled();
    });

    it('puts the point back when the pointer is cancelled (a touch the browser took over)', () => {
        const { actions, feature, pointer } = shown();
        pointer('pointerdown', 10, 10);
        pointer('pointermove', 60, 10);
        pointer('pointercancel', 60, 10);
        expect(at(feature)).toEqual([1000, 2000]);
        expect(actions.onMoved).not.toHaveBeenCalled();
    });

    it('reports no move for a press without a move, or for another button than the main one', () => {
        const { actions, feature, pointer } = shown();
        pointer('pointerdown', 10, 10);
        pointer('pointerup', 10, 10);
        pointer('pointerdown', 10, 10, { button: 2 });
        pointer('pointermove', 60, 10, { button: 2 });
        pointer('pointerup', 60, 10, { button: 2 });
        expect(at(feature)).toEqual([1000, 2000]);
        expect(actions.onMoved).not.toHaveBeenCalled();
    });

    it('follows only the pointer that started the drag', () => {
        const { feature, pointer } = shown();
        pointer('pointerdown', 10, 10);
        pointer('pointermove', 500, 500, { pointerId: 8 });
        expect(at(feature)).toEqual([1000, 2000]);
    });
});

describe('the colour of a popup comes from a file', () => {
    const INJECTED = 'red;position:fixed;inset:0;z-index:99999;background:url(https://evil/x)';

    it('is the accent of the point when it is a hexadecimal colour', () => {
        const html = pointPopupHtml({ lat: 1, lon: 2, name: 'Gate', accent: '#12ab34' });
        expect(html).toContain('border-left-color:#12ab34');
    });

    it('is the default accent for style text: nothing of it reaches the markup', () => {
        const html = pointPopupHtml({ lat: 1, lon: 2, name: 'Gate', accent: INJECTED });
        expect(html).not.toContain('position:fixed');
        expect(html).not.toContain('evil');
        expect(html).toContain(`border-left-color:${PRIMARY[500]}`);
    });

    it('is the default accent for a popup made from a feature whose stroke is style text', () => {
        const feature = pointAt([0, 0], { name: 'Gate', stroke: INJECTED });
        const { popupEl } = showPointPopup(fakeMap(), feature, noActions());
        expect(popupEl.innerHTML).not.toContain('position:fixed');
        expect(popupEl.querySelector('.ol-point-popup-header').getAttribute('style')).toBe(`border-left-color:${PRIMARY[500]}`);
    });
});

describe('the callout of a point in the dark theme', () => {
    const css = readSource(__dirname, '../../../css/ol-controls.css');

    it('takes the surface colour of the theme for its box and both arrows, not white', () => {
        expect(ruleOf(css, '.ol-point-popup')).toMatch(/background:\s*var\(--ddb-bg-surface\)/);
        expect(ruleOf(css, '.ol-point-popup::after')).toMatch(/border-top:\s*0\.5rem solid var\(--ddb-bg-surface\)/);
        expect(ruleOf(css, '.ol-point-popup-below::after')).toMatch(/border-bottom:\s*0\.5rem solid var\(--ddb-bg-surface\)/);
    });
});
