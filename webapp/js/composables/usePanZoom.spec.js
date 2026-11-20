/**
 * usePanZoom: the zoom and pan of the photo viewer (FR-VWR-12): the wheel, a pinch, a double click
 * or tap, the buttons, and the offset kept inside the picture.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { usePanZoom, MAX_SCALE, DOUBLE_TAP_SCALE, ZOOM_STEP } from './usePanZoom';

// A stage of 1000 x 600 at (0, 0): its centre is (500, 300)
const stage = () => ({
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 600 }),
    setPointerCapture: vi.fn()
});
const pointer = (id, x, y, extra = {}) => ({ pointerId: id, clientX: x, clientY: y, type: 'pointerdown', pointerType: 'mouse', ...extra });

afterEach(() => vi.useRealTimers());

describe('usePanZoom', () => {
    it('starts at the fit: scale 1, no offset, not zoomed', () => {
        const zoom = usePanZoom();
        expect(zoom.scale.value).toBe(1);
        expect(zoom.isZoomed.value).toBe(false);
        expect(zoom.transform.value).toBe('translate(0px, 0px) scale(1)');
    });

    it('zooms in and out in steps from the centre, and goes back to the fit below 1', () => {
        const zoom = usePanZoom();
        zoom.zoomIn();
        expect(zoom.scale.value).toBeCloseTo(ZOOM_STEP);
        expect(zoom.isZoomed.value).toBe(true);
        zoom.zoomOut();
        expect(zoom.scale.value).toBe(1);
        zoom.zoomOut();
        expect(zoom.scale.value).toBe(1);
    });

    it('never goes above the maximum scale', () => {
        const zoom = usePanZoom();
        for (let i = 0; i < 20; i++) zoom.zoomIn();
        expect(zoom.scale.value).toBe(MAX_SCALE);
    });

    it('keeps the point under the cursor where it is', () => {
        const zoom = usePanZoom();
        zoom.zoomAt(2, 100, 50);
        // the picture point under (100, 50) at scale 1 is still there at scale 2
        expect(zoom.x.value).toBe(-100);
        expect(zoom.y.value).toBe(-50);
    });

    it('limits the offset to the picture: no gap at the edge, and none when it is smaller than the stage', () => {
        const zoom = usePanZoom();
        zoom.setBounds(1000, 600, 800, 600);
        zoom.zoomAt(2);
        // 800 * 2 = 1600 wide in 1000: 300 each side; 600 * 2 = 1200 high in 600: 300 each side
        zoom.panBy(5000, -5000);
        expect(zoom.x.value).toBe(300);
        expect(zoom.y.value).toBe(-300);
        zoom.reset();
        zoom.zoomAt(1.1);
        // 800 * 1.1 = 880 < 1000: centred
        zoom.panBy(100, 0);
        expect(zoom.x.value).toBe(0);
    });

    it('does not pan a photo at the fit', () => {
        const zoom = usePanZoom();
        zoom.panBy(40, 40);
        expect(zoom.x.value).toBe(0);
        expect(zoom.y.value).toBe(0);
    });

    it('zooms by the wheel at the pointer, a trackpad pinch (ctrl) faster', () => {
        const zoom = usePanZoom({ element: stage });
        zoom.onWheel({ deltaY: -100, deltaMode: 0, ctrlKey: false, clientX: 500, clientY: 300 });
        const wheel = zoom.scale.value;
        expect(wheel).toBeGreaterThan(1);
        zoom.reset();
        zoom.onWheel({ deltaY: -100, deltaMode: 0, ctrlKey: true, clientX: 500, clientY: 300 });
        expect(zoom.scale.value).toBeGreaterThan(wheel);
        zoom.onWheel({ deltaY: 5000, deltaMode: 0, ctrlKey: false, clientX: 500, clientY: 300 });
        expect(zoom.scale.value).toBe(1);
    });

    it('double click zooms in at the point and a second one goes back to the fit', () => {
        const zoom = usePanZoom({ element: stage });
        zoom.onDoubleClick({ clientX: 700, clientY: 300 });
        expect(zoom.scale.value).toBe(DOUBLE_TAP_SCALE);
        expect(zoom.x.value).toBeCloseTo(-200 * (DOUBLE_TAP_SCALE - 1));
        zoom.onDoubleClick({ clientX: 700, clientY: 300 });
        expect(zoom.scale.value).toBe(1);
        expect(zoom.x.value).toBe(0);
    });

    it('drags a zoomed photo with one pointer, and does nothing at the fit', () => {
        const zoom = usePanZoom({ element: stage });
        zoom.onPointerDown(pointer(1, 500, 300));
        zoom.onPointerMove(pointer(1, 540, 300));
        expect(zoom.x.value).toBe(0);
        zoom.onPointerUp(pointer(1, 540, 300, { type: 'pointerup' }));
        zoom.zoomAt(3);
        zoom.onPointerDown(pointer(1, 500, 300));
        expect(zoom.dragging.value).toBe(true);
        zoom.onPointerMove(pointer(1, 540, 320));
        expect(zoom.x.value).toBe(40);
        expect(zoom.y.value).toBe(20);
        expect(zoom.wasGesture()).toBe(true);
        zoom.onPointerUp(pointer(1, 540, 320, { type: 'pointerup' }));
        expect(zoom.dragging.value).toBe(false);
    });

    it('forgets a mouse released outside the stage: with no button down it does not pan a zoomed photo', () => {
        const zoom = usePanZoom({ element: stage });
        // A press at the fit is not captured: its pointerup goes elsewhere
        zoom.onPointerDown(pointer(1, 500, 300, { buttons: 1 }));
        zoom.zoomAt(3);
        zoom.onPointerMove(pointer(1, 540, 320, { type: 'pointermove', buttons: 0 }));
        zoom.onPointerMove(pointer(1, 600, 360, { type: 'pointermove', buttons: 0 }));
        expect(zoom.x.value).toBe(0);
        expect(zoom.y.value).toBe(0);
        expect(zoom.dragging.value).toBe(false);
        // The next press drags again
        zoom.onPointerDown(pointer(1, 500, 300, { buttons: 1 }));
        expect(zoom.dragging.value).toBe(true);
        zoom.onPointerMove(pointer(1, 540, 300, { type: 'pointermove', buttons: 1 }));
        expect(zoom.x.value).toBe(40);
        expect(zoom.scale.value).toBe(3);
    });

    it('pinches: two pointers moving apart zoom in, together zoom out', () => {
        const zoom = usePanZoom({ element: stage });
        zoom.onPointerDown(pointer(1, 400, 300));
        zoom.onPointerDown(pointer(2, 600, 300));
        zoom.onPointerMove(pointer(1, 300, 300));
        zoom.onPointerMove(pointer(2, 700, 300));
        // 200 px apart became 400: twice the scale
        expect(zoom.scale.value).toBeCloseTo(2);
        zoom.onPointerMove(pointer(1, 450, 300));
        zoom.onPointerMove(pointer(2, 550, 300));
        expect(zoom.scale.value).toBe(1);
        zoom.onPointerUp(pointer(1, 450, 300, { type: 'pointerup' }));
        zoom.onPointerUp(pointer(2, 550, 300, { type: 'pointerup' }));
    });

    it('captures a pointer only once it drags a zoomed photo or pinches: a click keeps its own target', () => {
        const el = stage();
        const zoom = usePanZoom({ element: () => el });
        // A click, and a press that moves less than 4 px on a zoomed photo
        zoom.onPointerDown(pointer(1, 500, 300));
        zoom.onPointerUp(pointer(1, 500, 300, { type: 'pointerup' }));
        zoom.zoomAt(2);
        zoom.onPointerDown(pointer(1, 500, 300));
        zoom.onPointerMove(pointer(1, 502, 301));
        expect(zoom.wasGesture()).toBe(false);
        expect(el.setPointerCapture).not.toHaveBeenCalled();
        // The drag starts: from then on the stage follows it
        zoom.onPointerMove(pointer(1, 520, 300));
        expect(el.setPointerCapture).toHaveBeenCalledWith(1);
        zoom.onPointerUp(pointer(1, 520, 300, { type: 'pointerup' }));
        // A drag at the fit moves nothing and needs no capture
        el.setPointerCapture.mockClear();
        zoom.reset();
        zoom.onPointerDown(pointer(1, 500, 300));
        zoom.onPointerMove(pointer(1, 560, 300));
        expect(zoom.wasGesture()).toBe(true);
        expect(el.setPointerCapture).not.toHaveBeenCalled();
        zoom.onPointerUp(pointer(1, 560, 300, { type: 'pointerup' }));
        // Two pointers pinch: both are captured
        zoom.onPointerDown(pointer(1, 400, 300, { pointerType: 'touch' }));
        zoom.onPointerDown(pointer(2, 600, 300, { pointerType: 'touch' }));
        expect(el.setPointerCapture.mock.calls.map(c => c[0])).toEqual([1, 2]);
    });

    it('a dblclick after a touch double tap does not zoom back out; a mouse double click still zooms', () => {
        const zoom = usePanZoom({ element: stage });
        const tap = () => {
            zoom.onPointerDown(pointer(1, 500, 300, { pointerType: 'touch' }));
            zoom.onPointerUp(pointer(1, 500, 300, { pointerType: 'touch', type: 'pointerup' }));
        };
        tap();
        tap();
        zoom.onDoubleClick({ clientX: 500, clientY: 300 });
        expect(zoom.scale.value).toBe(DOUBLE_TAP_SCALE);
        zoom.onPointerDown(pointer(1, 500, 300));
        zoom.onPointerUp(pointer(1, 500, 300, { type: 'pointerup' }));
        zoom.onDoubleClick({ clientX: 500, clientY: 300 });
        expect(zoom.scale.value).toBe(1);
    });

    it('two quick taps of a touch zoom in; a slow second tap does not', () => {
        vi.useFakeTimers();
        const zoom = usePanZoom({ element: stage });
        const tap = () => {
            zoom.onPointerDown(pointer(1, 500, 300, { pointerType: 'touch' }));
            zoom.onPointerUp(pointer(1, 500, 300, { pointerType: 'touch', type: 'pointerup' }));
        };
        tap();
        vi.advanceTimersByTime(600);
        tap();
        expect(zoom.isZoomed.value).toBe(false);
        vi.advanceTimersByTime(100);
        tap();
        expect(zoom.scale.value).toBe(DOUBLE_TAP_SCALE);
    });
});
