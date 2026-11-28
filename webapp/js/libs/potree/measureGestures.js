// @ts-check
/**
 * The gesture rule of every measuring tool (D-027, FR-XC-17) for the point-cloud viewer's measures. Potree 1.8
 * starts a measure with `viewer.measuringTool.startInsertion(...)` and ends it by itself on a right-button
 * release whatever the pointer did since the press, so a right-drag that pans also ended it, and it has no
 * double click, Enter or Escape. The vendored Potree stays as it is; this module sits next to it:
 *
 *   - a right click (a release within 4 CSS px of the press, `isRightClick`) ends the measure, a longer right-drag
 *     pans the camera and does not (the release is kept from Potree's own handler). Potree's input handler drags the
 *     marker that follows the pointer, so its controls never hear the drag: the press lets the marker go, and the
 *     release takes it up again, so the next click places its point where it is made;
 *   - a double click and Enter end it, Escape drops it (it is removed, with no entry in the history of undo). The
 *     double click of a measure is the measure's alone: the controls do not fly the camera to it, and nothing
 *     else on the canvas hears it (the edit of a finished measure);
 *   - a measure that ends leaves the input handler with nothing in hand, so the next drag moves the camera;
 *   - the point that follows the pointer, and a last point on the spot of the one before, are taken out; a measure
 *     that has too few points left is dropped. A double click clicks twice: the point its second click placed is
 *     taken out when that click is the second of a double click (`detail`) or lands within 4 CSS px of the first
 *     (`RIGHT_CLICK_MAX_MOVE_PX`), so a hand that moves a pixel or two adds no segment;
 *   - Enter on a focused button or link is the button's or the link's (Escape still drops the measure); a field keeps both.
 *
 * A finger places points too. Potree takes the points of a measure from mouse events (the marker that follows the
 * pointer, and a mouse release that places it), and a touch gives none: it calls preventDefault() on touchstart and
 * lets go of the marker. A tap on the canvas (a touch released where it was pressed) is therefore placed here: the
 * marker is taken in hand again, moved to the point of the cloud under the finger, and released as a mouse release
 * does it. A tap that is on no point of the cloud places nothing; a touch that moves the view (a drag, a pinch) gives
 * the marker back to the pointer afterwards, as a right-drag does.
 *
 * The measure of the tools of the Hub (`start(kind)`) and the one that the icons of the Potree sidebar start are
 * both followed: Potree tells the measuring tool starts one (`start_inserting_measurement`).
 */
import { isRightClick, RIGHT_BUTTON, RIGHT_CLICK_MAX_MOVE_PX } from '@/libs/mouse';

/**
 * What Potree's own icons ask for, by kind: the arguments of `startInsertion`.
 * @type {Record<string, Record<string, any>>}
 */
export const MEASURE_TOOLS = Object.freeze({
    point: { showDistances: false, showAngles: false, showCoordinates: true, showArea: false, closed: true, maxMarkers: 1, name: 'Point' },
    distance: { showDistances: true, showArea: false, closed: false, name: 'Distance' },
    height: { showDistances: false, showHeight: true, showArea: false, closed: false, maxMarkers: 2, name: 'Height' },
    area: { showDistances: true, showArea: true, closed: true, name: 'Area' }
});

const KIND_BY_NAME = Object.freeze({ Point: 'point', Distance: 'distance', Height: 'height', Area: 'area' });

/** A touch released this far (CSS px) or less from where it was pressed is a tap; more is a drag of the view. */
const TAP_MAX_MOVE_PX = 10;

/** The points a measure of an open kind needs to be kept. */
const MIN_OPEN = Object.freeze({ distance: 2, area: 3 });

// Typing keeps its keys
const isTyping = (/** @type {any} */ t) => t instanceof Element && !!t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
// Enter on a focused button or link presses it (as drawingSession's keepsItsKeys); Escape still drops the measure
const pressesOnEnter = (/** @type {any} */ t) => t instanceof Element && !!t.closest('button, a[href]');

/** The left button of a `MouseEvent` (`event.button`) */
const LEFT_BUTTON = 0;

export class PotreeMeasureGestures {
    /**
     * @param {object} ctx
     * @param {any} ctx.viewer  the Potree viewer
     * @param {{ track: Function }} ctx.session  owner of the listeners (removed when the viewer closes)
     * @param {(kind: string | null) => void} [ctx.onActive]  the kind being drawn changed (null: none, 'other' for a tool the toolbar does not have)
     * @param {(measure: any) => void} [ctx.discard]  removes a measure that was dropped (without a step of the history)
     * @param {(fn: () => void, ms: number) => void} [ctx.later]  runs fn after ms, for the life of the viewer
     */
    constructor({ viewer, session, onActive = () => {}, discard, later = (fn, ms) => { setTimeout(fn, ms); } }) {
        this.viewer = viewer;
        this.onActive = onActive;
        this.discard = discard ?? (measure => viewer.scene.removeMeasurement(measure));
        this.later = later;
        /** The measure being drawn, null between measures */
        this.measure = /** @type {any} */ (null);
        this.kind = /** @type {string | null} */ (null);
        this.pendingKind = /** @type {string | null} */ (null);
        this.rightDown = /** @type {{ button: number, clientX: number, clientY: number } | null} */ (null);
        /** The marker that followed the pointer when the right button was pressed: it follows it again after the pan */
        this.carriedAtPress = /** @type {any} */ (null);
        /** The last two left releases of the measure being drawn (each one places a point of an open measure) */
        this.leftUps = /** @type {{ clientX: number, clientY: number, detail: number }[]} */ ([]);
        /** The fingers on the canvas, by pointer id, and whether the gesture is more than one tap (a second finger, a drag) */
        this.touches = /** @type {Map<number, { clientX: number, clientY: number }>} */ (new Map());
        this.touchGesture = /** @type {{ start: { clientX: number, clientY: number }, carried: any, tap: boolean } | null} */ (null);
        /** The measure whose marker is given back to the pointer when Potree's touchend, which lets go of it, has run */
        this.restoreFollower = /** @type {any} */ (null);

        const canvas = viewer.renderer.domElement;
        this.canvas = canvas;
        const doc = canvas.ownerDocument ?? document;
        session.track(viewer.measuringTool, 'start_inserting_measurement', (/** @type {any} */ e) => this.onStart(e.measure));
        session.track(viewer.scene, 'measurement_removed', (/** @type {any} */ e) => {
            if (this.measure && e.measurement === this.measure) this.close();
        });
        // The press and the double click are seen before Potree's input handler has them (the capture of the document)
        session.track(doc, 'mousedown', (/** @type {MouseEvent} */ e) => { if (e.target === canvas) this.onMouseDown(e); }, true);
        session.track(doc, 'dblclick', (/** @type {MouseEvent} */ e) => { if (e.target === canvas) this.onDoubleClick(e); }, true);
        // This listener is added after Potree's input handler (made with the viewer) and before any insertion adds its
        // own (Potree adds it when the measure starts), so it sees a release once the handler let go of its drag,
        // and can keep it from the insertion
        session.track(canvas, 'mouseup', (/** @type {MouseEvent} */ e) => this.onMouseUp(e));
        session.track(doc, 'keydown', (/** @type {KeyboardEvent} */ e) => this.onKey(e));
        // A touch gives Potree no mouse events: the pointer events are the only ones a finger sends (seen before Potree's
        // touchstart, which lets go of the marker that follows the pointer)
        session.track(doc, 'pointerdown', (/** @type {PointerEvent} */ e) => { if (e.target === canvas) this.onTouchDown(e); }, true);
        session.track(doc, 'pointermove', (/** @type {PointerEvent} */ e) => { if (e.target === canvas) this.onTouchMove(e); }, true);
        session.track(doc, 'pointerup', (/** @type {PointerEvent} */ e) => { if (e.target === canvas) this.onTouchUp(e, true); }, true);
        session.track(doc, 'pointercancel', (/** @type {PointerEvent} */ e) => { if (e.target === canvas) this.onTouchUp(e, false); }, true);
        // Potree's touchend (on the canvas) lets go of what it drags: this one, on the document, runs after it
        session.track(doc, 'touchend', () => this.onTouchEnded());
    }

    /** The kind being drawn ('point', 'distance', 'height', 'area', 'other'), or null. */
    get activeKind() {
        return this.measure ? this.kind : null;
    }

    /**
     * Starts a measure of the kind, as Potree's icon of it does; the one being drawn ends first.
     * @param {string} kind  one of MEASURE_TOOLS
     */
    start(kind) {
        if (!Object.hasOwn(MEASURE_TOOLS, kind)) return;
        this.pendingKind = kind;
        try {
            this.viewer.measuringTool.startInsertion({ ...MEASURE_TOOLS[kind] });
        } finally {
            this.pendingKind = null;
        }
    }

    /**
     * Ends the measure being drawn with the points it has: Potree takes the point that followed the pointer
     * out, and a last point on the spot of the one before goes too. With too few points left the measure is dropped
     * when `dropShort` is set (a right click), or goes on (Enter, a double click, Done).
     * @param {{ dropShort?: boolean }} [options]
     * @returns {boolean} whether the measure ended
     */
    finish({ dropShort = true } = {}) {
        const measure = this.measure;
        if (!measure) return false;
        if (!dropShort && this.placed(measure) < this.minPoints(measure)) return false;
        // Potree's own end of an insertion: it takes the marker that followed the pointer out
        this.viewer.dispatchEvent({ type: 'cancel_insertions' });
        // The input handler lets go of that marker, so the next drag moves the camera
        this.release();
        this.trim(measure);
        if (this.pointsOf(measure).length < this.minPoints(measure)) this.drop(measure);
        else this.close();
        return true;
    }

    /** Drops the measure being drawn: it is removed. */
    cancel() {
        const measure = this.measure;
        if (!measure) return;
        this.viewer.dispatchEvent({ type: 'cancel_insertions' });
        this.drop(measure);
    }

    // ---- The measure ----------------------------------------------------------------------

    /** @param {any} measure */
    pointsOf(measure) {
        return measure.points || [];
    }

    /** Whether the pointer is still carrying one of the markers of the measure (the one that follows it). @param {any} measure */
    carrying(measure) {
        const dragged = this.viewer.inputHandler?.drag?.object;
        return !!dragged && (measure.spheres || []).includes(dragged);
    }

    /** The points the user placed: the marker that follows the pointer is not one. @param {any} measure */
    placed(measure) {
        return this.pointsOf(measure).length - (this.carrying(measure) ? 1 : 0);
    }

    /** What a measure needs to be kept: its own number of markers, or the least of its kind. @param {any} measure */
    minPoints(measure) {
        if (Number.isFinite(measure.maxMarkers)) return measure.maxMarkers;
        return /** @type {Record<string, number>} */ (MIN_OPEN)[KIND_BY_NAME[/** @type {keyof typeof KIND_BY_NAME} */ (measure.name)]] ?? 2;
    }

    /** Takes a last point on the spot of the one before out (a double click clicks twice). @param {any} measure */
    trim(measure) {
        const same = (/** @type {any} */ a, /** @type {any} */ b) => a.position.x === b.position.x && a.position.y === b.position.y && a.position.z === b.position.z;
        for (;;) {
            const points = this.pointsOf(measure);
            if (points.length < 2 || !same(points[points.length - 1], points[points.length - 2])) return;
            measure.removeMarker(points.length - 1);
        }
    }

    /** @param {any} measure */
    drop(measure) {
        this.close();
        this.release();
        this.discard(measure);
    }

    /** The input handler holds nothing: what it drags next is the camera's. */
    release() {
        try { this.viewer.inputHandler?.startDragging(null); } catch { /* no input handler */ }
    }

    /** The measure is no longer being drawn. */
    close() {
        if (!this.measure) return;
        this.measure = null;
        this.kind = null;
        this.leftUps = [];
        this.onActive(null);
    }

    /** Potree starts a measure (the Hub's tool or an icon of its sidebar): the one before ends, this one is followed. @param {any} measure */
    onStart(measure) {
        if (this.measure && this.measure !== measure) this.finish({ dropShort: true });
        const known = this.pendingKind;
        this.measure = measure;
        this.kind = known;
        this.leftUps = [];
        if (known) this.onActive(known);
        // Potree names the measure and sets its markers after it tells: the kind is read then
        this.later(() => {
            if (this.measure !== measure) return;
            this.kind = known ?? KIND_BY_NAME[/** @type {keyof typeof KIND_BY_NAME} */ (measure.name)] ?? 'other';
            this.onActive(this.kind);
        }, 0);
    }

    // ---- Input ----------------------------------------------------------------------------

    /** @param {MouseEvent} e */
    onMouseDown(e) {
        if (e.button !== RIGHT_BUTTON) return;
        this.rightDown = { button: e.button, clientX: e.clientX, clientY: e.clientY };
        this.carriedAtPress = null;
        const measure = this.measure;
        if (!measure || !this.carrying(measure)) return;
        // The input handler would drag the marker with the right button and the camera would not pan: it lets go
        this.carriedAtPress = this.viewer.inputHandler.drag.object;
        this.release();
    }

    /** A double click while a measure is drawn ends it, and is not the view's (no flight of the camera). @param {MouseEvent} e */
    onDoubleClick(e) {
        if (!this.measure) return;
        e.stopPropagation();
        e.preventDefault();
        this.dropSecondClick(this.measure);
        this.finish({ dropShort: false });
    }

    /**
     * Takes out the point the second click of a double click placed, so the double click ends the measure where it is
     * made with no near-duplicate point. Only while Potree still inserts points (an open measure, a marker follows the
     * pointer): a measure of a fixed number of points has no point from that click.
     * @param {any} measure
     */
    dropSecondClick(measure) {
        const [first, second] = this.leftUps;
        this.leftUps = [];
        if (!first || !second || Number.isFinite(measure.maxMarkers) || !this.carrying(measure)) return;
        const repeats = second.detail >= 2 || Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY) <= RIGHT_CLICK_MAX_MOVE_PX;
        // The two clicks each placed a point, before the marker that follows the pointer
        if (!repeats || this.placed(measure) < 2) return;
        measure.removeMarker(this.pointsOf(measure).length - 2);
    }

    /** @param {MouseEvent} e */
    onMouseUp(e) {
        if (!this.measure) return;
        if (e.button === RIGHT_BUTTON) {
            const down = this.rightDown;
            const carried = this.carriedAtPress;
            this.rightDown = null;
            this.carriedAtPress = null;
            // A right click ends the measure here; a right-drag is a pan and Potree's handler does not hear it
            e.stopImmediatePropagation();
            if (isRightClick(down, e)) this.finish({ dropShort: true });
            else if (carried) this.carry(this.measure);
            return;
        }
        if (e.button === LEFT_BUTTON) this.leftUps = [...this.leftUps, { clientX: e.clientX, clientY: e.clientY, detail: e.detail }].slice(-2);
        // A measure of a fixed number of points ends by itself with its last click, once Potree has handled it
        const measure = this.measure;
        this.later(() => {
            if (this.measure === measure && Number.isFinite(measure.maxMarkers) && !this.carrying(measure)) this.close();
        }, 0);
    }

    /** The marker that follows the pointer follows it again (after a pan): the last one of the measure. @param {any} measure */
    carry(measure) {
        const marker = (measure.spheres || []).at(-1);
        if (marker) this.viewer.inputHandler?.startDragging(marker);
    }

    // ---- Touch ----------------------------------------------------------------------------

    /** @param {PointerEvent} e */
    onTouchDown(e) {
        if (e.pointerType !== 'touch') return;
        this.touches.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
        if (this.touchGesture) {
            // A second finger: a pinch or a pan of the view, not a tap
            this.touchGesture.tap = false;
            return;
        }
        const measure = this.measure;
        this.touchGesture = {
            start: { clientX: e.clientX, clientY: e.clientY },
            // The marker that follows the pointer: Potree's touchstart lets go of it
            carried: measure && this.carrying(measure) ? this.viewer.inputHandler.drag.object : null,
            tap: true
        };
    }

    /** @param {PointerEvent} e */
    onTouchMove(e) {
        const gesture = this.touchGesture;
        if (e.pointerType !== 'touch' || !gesture || !gesture.tap) return;
        const { start } = gesture;
        if (Math.hypot(e.clientX - start.clientX, e.clientY - start.clientY) > TAP_MAX_MOVE_PX) gesture.tap = false;
    }

    /**
     * The last finger leaves: a tap places a point; any other touch gives the marker back to the pointer.
     * @param {PointerEvent} e
     * @param {boolean} released  false when the touch was cancelled (it places nothing)
     */
    onTouchUp(e, released) {
        if (e.pointerType !== 'touch') return;
        this.touches.delete(e.pointerId);
        const gesture = this.touchGesture;
        if (!gesture || this.touches.size > 0) return;
        this.touchGesture = null;
        const measure = this.measure;
        if (!measure) return;
        if (!gesture.carried) return;
        const moved = Math.hypot(e.clientX - gesture.start.clientX, e.clientY - gesture.start.clientY) > TAP_MAX_MOVE_PX;
        // Whether a marker follows the pointer after this touch: after a tap that placed the last point of the measure, none
        const follows = released && gesture.tap && !moved ? this.placeAt(measure, e) : true;
        if (!follows) return;
        // Potree lets go of the marker at touchend, which comes after this event: it is given back then
        if (released) this.restoreFollower = measure;
        else this.carry(measure);
    }

    /** Potree's touchend has run: the marker that follows the pointer is taken in hand again. */
    onTouchEnded() {
        const measure = this.restoreFollower;
        this.restoreFollower = null;
        if (measure && this.measure === measure) this.carry(measure);
    }

    /**
     * Places the point of the measure that follows the pointer where a tap was made, as a mouse release does: the marker
     * is taken in hand, moved to the point of the cloud under the finger, and released. Where no point of the cloud is, the
     * marker does not move, and nothing is placed.
     * @param {any} measure
     * @param {PointerEvent} e
     * @returns {boolean} whether a marker follows the pointer after the tap (the measure goes on)
     */
    placeAt(measure, e) {
        const marker = (measure.spheres || []).at(-1);
        const point = this.pointsOf(measure).at(-1);
        if (!marker || !point) return false;
        const init = { bubbles: true, cancelable: true, clientX: e.clientX, clientY: e.clientY };
        const before = { ...point.position };
        this.carry(measure);
        this.canvas.dispatchEvent(new MouseEvent('mousemove', { ...init, buttons: 0 }));
        const { x, y, z } = point.position;
        // No point of the cloud under the finger: the marker stays in hand, unplaced
        if (x === before.x && y === before.y && z === before.z) return true;
        this.canvas.dispatchEvent(new MouseEvent('mouseup', { ...init, button: LEFT_BUTTON, detail: 1 }));
        return this.carrying(measure);
    }

    /** @param {KeyboardEvent} e */
    onKey(e) {
        if (!this.measure || isTyping(e.target)) return;
        if (e.key === 'Escape') this.cancel();
        else if (e.key === 'Enter' && !pressesOnEnter(e.target)) this.finish({ dropShort: false });
        else return;
        e.preventDefault();
    }
}
