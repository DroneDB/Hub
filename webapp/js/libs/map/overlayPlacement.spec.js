/**
 * The rule that keeps the label of a feature and the popup of a point inside the visible map and out of
 * the toolbar rail (FR-MAP-19, FR-MAP-26). The expected placements are worked out from the geometry, not read
 * from the code: a map of 800 x 600 px whose rail takes 64 px (4rem) on the right.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import Overlay from 'ol/Overlay';
import { placeOverlay, keepOverlayInView } from './overlayPlacement';

const MAP = [800, 600];
const LABEL = { positioning: 'center-left', offset: [12, 0] };
const POPUP = { positioning: 'bottom-center', offset: [0, -12] };
const place = (pixel, size, base, railReserve = 64) => placeOverlay({ pixel, size, mapSize: MAP, railReserve, base });

describe('placeOverlay: a label beside its point (center-left, 12 px to the right)', () => {
    const SIZE = [120, 30];

    it('stays on the right of the point when it fits before the rail', () => {
        // 300 + 12 + 120 = 432 <= 800 - 64
        expect(place([300, 300], SIZE, LABEL)).toEqual({ positioning: 'center-left', offset: [12, 0] });
    });

    it('stays on the right up to the last pixel before the rail, and goes to the left from the next one', () => {
        // 604 + 12 + 120 = 736 = 800 - 64
        expect(place([604, 300], SIZE, LABEL).positioning).toBe('center-left');
        expect(place([605, 300], SIZE, LABEL)).toEqual({ positioning: 'center-right', offset: [-12, 0] });
    });

    it('goes to the left of a point near the right edge (FR-MAP-19)', () => {
        expect(place([760, 300], SIZE, LABEL)).toEqual({ positioning: 'center-right', offset: [-12, 0] });
    });

    it('reads the rail from the token: with no rail the same point still fits', () => {
        // 660 + 12 + 120 = 792: before the edge of the map, inside the 64 px of the rail
        expect(place([660, 300], SIZE, LABEL, 0).positioning).toBe('center-left');
        expect(place([660, 300], SIZE, LABEL, 64).positioning).toBe('center-right');
    });

    it('is aligned to the top edge when its half height would cross it, and to the bottom edge likewise', () => {
        expect(place([300, 14], SIZE, LABEL)).toEqual({ positioning: 'top-left', offset: [12, 0] });
        expect(place([300, 15], SIZE, LABEL).positioning).toBe('center-left');
        expect(place([300, 586], SIZE, LABEL)).toEqual({ positioning: 'bottom-left', offset: [12, 0] });
    });

    it('does both in a corner', () => {
        expect(place([780, 5], SIZE, LABEL)).toEqual({ positioning: 'top-right', offset: [-12, 0] });
    });

    it('comes back from the left of the point when the point is too near the left edge for it', () => {
        expect(placeOverlay({ pixel: [50, 300], size: [120, 30], mapSize: MAP, railReserve: 64, base: { positioning: 'center-right', offset: [-12, 0] } }))
            .toEqual({ positioning: 'center-left', offset: [12, 0] });
    });
});

describe('placeOverlay: a popup above its point (bottom-center, 12 px up) (FR-MAP-26)', () => {
    const SIZE = [224, 80];

    it('stays above the point with room', () => {
        expect(place([400, 300], SIZE, POPUP)).toEqual({ positioning: 'bottom-center', offset: [0, -12] });
    });

    it('flips below the point when the point is within the height of the popup of the top edge', () => {
        // 92 - 12 - 80 = 0: the popup's top is at the edge; one pixel less and it crosses it
        expect(place([400, 92], SIZE, POPUP).positioning).toBe('bottom-center');
        expect(place([400, 91], SIZE, POPUP)).toEqual({ positioning: 'top-center', offset: [0, 12] });
    });

    it('goes up again when there is no room below it either', () => {
        const tall = [224, 700];
        expect(place([400, 300], tall, POPUP).positioning).toBe('top-center');
    });
});

describe('keepOverlayInView', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        document.body.replaceChildren();
    });

    /** A map that puts every coordinate at `pixel`, with a rail of `rail` */
    const mapAt = (pixel, rail) => {
        const target = document.createElement('div');
        if (rail) target.style.setProperty('--map-rail-reserve', rail);
        document.body.appendChild(target);
        return { getSize: () => MAP, getPixelFromCoordinate: () => pixel, getTargetElement: () => target };
    };
    const overlayAt = () => {
        const overlay = new Overlay({ element: document.createElement('div'), ...{ positioning: 'center-left', offset: [12, 0] } });
        overlay.setPosition([1, 2]);
        return overlay;
    };
    const sized = (width, height) => {
        const element = document.createElement('div');
        vi.spyOn(element, 'offsetWidth', 'get').mockReturnValue(width);
        vi.spyOn(element, 'offsetHeight', 'get').mockReturnValue(height);
        return element;
    };

    it('sets the positioning and the offset of the overlay from where its point is', () => {
        const overlay = overlayAt();
        const placement = keepOverlayInView(mapAt([760, 300]), overlay, sized(120, 30), LABEL);
        expect(placement).toEqual({ positioning: 'center-right', offset: [-12, 0] });
        expect(overlay.getPositioning()).toBe('center-right');
        expect(overlay.getOffset()).toEqual([-12, 0]);
    });

    it('starts again from the placement it prefers, not from the one it has: a flipped label comes back', () => {
        const overlay = overlayAt();
        const element = sized(120, 30);
        keepOverlayInView(mapAt([760, 300]), overlay, element, LABEL);
        keepOverlayInView(mapAt([300, 300]), overlay, element, LABEL);
        expect(overlay.getPositioning()).toBe('center-left');
        expect(overlay.getOffset()).toEqual([12, 0]);
    });

    it('reads the rail from the --map-rail-reserve token of the map', () => {
        // 600 + 12 + 120 = 732: before a rail of 64 px, inside one of 96 px
        expect(keepOverlayInView(mapAt([600, 300], '64px'), overlayAt(), sized(120, 30), LABEL).positioning).toBe('center-left');
        expect(keepOverlayInView(mapAt([600, 300], '96px'), overlayAt(), sized(120, 30), LABEL).positioning).toBe('center-right');
    });

    it('changes nothing while the element has no size, or the overlay no position, or the map no size', () => {
        const overlay = overlayAt();
        expect(keepOverlayInView(mapAt([760, 300]), overlay, sized(0, 0), LABEL)).toBeNull();
        expect(overlay.getPositioning()).toBe('center-left');
        const unplaced = new Overlay({ element: document.createElement('div') });
        expect(keepOverlayInView(mapAt([760, 300]), unplaced, sized(120, 30), LABEL)).toBeNull();
        const noSize = { ...mapAt([760, 300]), getSize: () => undefined };
        expect(keepOverlayInView(noSize, overlay, sized(120, 30), LABEL)).toBeNull();
    });
});
