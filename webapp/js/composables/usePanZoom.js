// @ts-check
/**
 * Zoom and pan of one picture inside a stage (the photo viewer, FR-VWR-12): the wheel, a
 * pinch, a double click or tap, and a drag while zoomed. The state is a scale and an offset
 * from the centre of the stage; the picture is drawn with
 * `transform: translate(x px, y px) scale(s)` from its centre.
 *
 *   const zoom = usePanZoom({ element: () => stageEl.value });
 *   zoom.setBounds(stageW, stageH, imageW, imageH);       // after a load and a resize
 *   <div @wheel.prevent="zoom.onWheel" @pointerdown="zoom.onPointerDown" ... />
 *
 * The scale runs from 1 (the picture fits the stage) to `maxScale`; the offset is kept so that
 * the picture never leaves a gap at the edge of the stage, and is 0 when it is smaller than it.
 *
 * The stage captures a pointer only once it drags or pinches: a press that stays a click keeps its
 * own target, so its click and dblclick reach what was clicked (the picture or the empty stage).
 */
import { ref, computed } from 'vue';

export const MAX_SCALE = 8;
/** The scale of a double click or tap from the fitted picture */
export const DOUBLE_TAP_SCALE = 2.5;
/** The scale factor of the + and - buttons and keys */
export const ZOOM_STEP = 1.5;
// Smaller than this over 1 is not a zoom (a pinch or wheel that comes back to the fit)
const EPSILON = 0.001;
const DRAG_THRESHOLD = 4;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_DISTANCE = 30;

/**
 * @param {object} [options]
 * @param {() => (HTMLElement | null | undefined)} [options.element]  the stage: the origin of the pointer positions
 * @param {number} [options.maxScale]
 */
export function usePanZoom({ element, maxScale = MAX_SCALE } = {}) {
    const scale = ref(1);
    const x = ref(0);
    const y = ref(0);
    const dragging = ref(false);
    const bounds = { stageW: 0, stageH: 0, contentW: 0, contentH: 0 };

    const isZoomed = computed(() => scale.value > 1 + EPSILON);
    const transform = computed(() => `translate(${x.value}px, ${y.value}px) scale(${scale.value})`);

    /** @param {number} content @param {number} stage */
    const limit = (content, stage) => Math.max(0, (content * scale.value - stage) / 2);

    function clampOffset() {
        // The size of the picture is not known yet: no limit
        if (!bounds.contentW || !bounds.contentH) return;
        const maxX = limit(bounds.contentW, bounds.stageW);
        const maxY = limit(bounds.contentH, bounds.stageH);
        x.value = Math.min(maxX, Math.max(-maxX, x.value));
        y.value = Math.min(maxY, Math.max(-maxY, y.value));
    }

    /**
     * The size of the stage and of the picture at scale 1, in CSS pixels.
     * @param {number} stageW @param {number} stageH @param {number} contentW @param {number} contentH
     */
    function setBounds(stageW, stageH, contentW, contentH) {
        Object.assign(bounds, { stageW, stageH, contentW, contentH });
        clampOffset();
    }

    function reset() {
        scale.value = 1;
        x.value = 0;
        y.value = 0;
    }

    /**
     * Multiplies the scale, keeping the point (cx, cy) - from the centre of the stage - where it is.
     * @param {number} factor
     * @param {number} [cx]
     * @param {number} [cy]
     */
    function zoomAt(factor, cx = 0, cy = 0) {
        const next = Math.min(maxScale, Math.max(1, scale.value * factor));
        if (next <= 1 + EPSILON) {
            reset();
            return;
        }
        const k = next / scale.value;
        x.value = cx - (cx - x.value) * k;
        y.value = cy - (cy - y.value) * k;
        scale.value = next;
        clampOffset();
    }

    /** @param {number} s @param {number} [cx] @param {number} [cy] */
    const zoomTo = (s, cx, cy) => zoomAt(s / scale.value, cx, cy);

    /** The + button: from the centre of the stage. */
    const zoomIn = () => zoomAt(ZOOM_STEP);
    /** The - button: from the centre of the stage. */
    const zoomOut = () => zoomAt(1 / ZOOM_STEP);

    /** @param {number} dx @param {number} dy */
    function panBy(dx, dy) {
        if (!isZoomed.value) return;
        x.value += dx;
        y.value += dy;
        clampOffset();
    }

    /** Double click or tap: the fitted picture zooms in at the point, a zoomed one goes back to the fit. */
    function toggleAt(cx = 0, cy = 0) {
        if (isZoomed.value) reset();
        else zoomTo(DOUBLE_TAP_SCALE, cx, cy);
    }

    /** @param {{ clientX: number, clientY: number }} e @returns {[number, number]} from the centre of the stage */
    function localPoint(e) {
        const el = element && element();
        if (!el) return [0, 0];
        const r = el.getBoundingClientRect();
        return [(e.clientX || 0) - (r.left + r.width / 2), (e.clientY || 0) - (r.top + r.height / 2)];
    }

    /** @param {WheelEvent} e */
    function onWheel(e) {
        // A trackpad pinch comes as a wheel with ctrlKey and small deltas
        const unit = e.deltaMode === 1 ? 0.05 : (e.ctrlKey ? 0.01 : 0.0015);
        const [cx, cy] = localPoint(e);
        zoomAt(Math.exp(-e.deltaY * unit), cx, cy);
    }

    // Pointers down on the stage: one drags a zoomed picture, two pinch
    /** @type {Map<number, { x: number, y: number }>} */
    const pointers = new Map();
    /** @type {{ distance: number, cx: number, cy: number, scale: number } | null} */
    let pinch = null;
    let moved = false;
    let downAt = { x: 0, y: 0 };
    let lastTap = { time: 0, x: 0, y: 0 };
    let lastPointerType = '';

    /** @param {MouseEvent} e */
    function onDoubleClick(e) {
        // A touch zooms with its own double tap (onPointerUp); a dblclick the browser adds after it is not another one
        if (lastPointerType === 'touch') return;
        const [cx, cy] = localPoint(e);
        toggleAt(cx, cy);
    }

    /** The stage follows the pointer outside itself, for a drag or a pinch only. @param {number} pointerId */
    function capture(pointerId) {
        const el = element && element();
        if (!el || typeof el.setPointerCapture !== 'function') return;
        if (typeof el.hasPointerCapture === 'function' && el.hasPointerCapture(pointerId)) return;
        try { el.setPointerCapture(pointerId); } catch { /* the pointer is gone */ }
    }

    /** @returns {{ distance: number, cx: number, cy: number }} the two first pointers */
    function pinchState() {
        const [a, b] = [...pointers.values()];
        const [cx, cy] = localPoint({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 });
        return { distance: Math.hypot(a.x - b.x, a.y - b.y), cx, cy };
    }

    /** @param {PointerEvent} e */
    function onPointerDown(e) {
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        lastPointerType = e.pointerType || '';
        if (pointers.size === 1) {
            moved = false;
            downAt = { x: e.clientX, y: e.clientY };
        }
        if (pointers.size === 2) {
            const state = pinchState();
            pinch = { ...state, scale: scale.value };
            moved = true;
            pointers.forEach((_, id) => capture(id));
        }
        dragging.value = pointers.size === 1 && isZoomed.value;
    }

    /** @param {PointerEvent} e */
    function onPointerMove(e) {
        const previous = pointers.get(e.pointerId);
        if (!previous) return;
        // A mouse with no button down: its press was released outside the stage (not captured
        // at the fit), so its pointerup never came here. It is not down any more.
        if (e.pointerType === 'mouse' && e.buttons === 0) {
            pointers.delete(e.pointerId);
            if (pointers.size < 2) pinch = null;
            dragging.value = false;
            return;
        }
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.size >= 2 && pinch && pinch.distance > 0) {
            const now = pinchState();
            // The pinch scales from where it started and follows its centre
            const factor = (pinch.scale * now.distance / pinch.distance) / scale.value;
            panBy(now.cx - pinch.cx, now.cy - pinch.cy);
            zoomAt(factor, now.cx, now.cy);
            pinch = { ...pinch, cx: now.cx, cy: now.cy };
            return;
        }
        const dx = e.clientX - previous.x;
        const dy = e.clientY - previous.y;
        if (!moved && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) >= DRAG_THRESHOLD) {
            moved = true;
            // A drag of the zoomed picture: it goes on outside the stage
            if (isZoomed.value) capture(e.pointerId);
        }
        if (isZoomed.value && pointers.size === 1) panBy(dx, dy);
    }

    /** @param {PointerEvent} e */
    function onPointerUp(e) {
        const wasDown = pointers.delete(e.pointerId);
        if (pointers.size < 2) pinch = null;
        dragging.value = false;
        if (!wasDown) return;
        // A touch has no dblclick that can be relied on: two quick taps at the same place do it
        if (e.type === 'pointerup' && e.pointerType === 'touch' && !moved && pointers.size === 0) {
            const now = Date.now();
            const close = Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < DOUBLE_TAP_DISTANCE;
            if (now - lastTap.time < DOUBLE_TAP_MS && close) {
                const [cx, cy] = localPoint(e);
                toggleAt(cx, cy);
                lastTap = { time: 0, x: 0, y: 0 };
            } else {
                lastTap = { time: now, x: e.clientX, y: e.clientY };
            }
        }
    }

    /** Whether the pointer that just went up dragged or pinched (a click that follows is not a click). */
    const wasGesture = () => moved;

    return {
        scale, x, y, dragging, isZoomed, transform,
        setBounds, reset, zoomAt, zoomTo, zoomIn, zoomOut, panBy, toggleAt,
        onWheel, onDoubleClick, onPointerDown, onPointerMove, onPointerUp, wasGesture
    };
}
