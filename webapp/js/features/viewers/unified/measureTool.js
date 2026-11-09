/**
 * Point / distance / area measurement in the 3D viewer, with Giro3D's DrawTool. The labels are in the
 * user's units (measureFormatters).
 *
 * The gesture rule of every measuring tool (D-027, FR-XC-17): a click adds a point; a double click, Enter
 * or a right click ends the shape; Escape (and Cancel) drops it; Clear takes it with the others. A right
 * click is a right-button release after a move of 4 CSS px or less (`isRightClick`), not Giro3D's own
 * `conditions.rightClick`, so a right-drag still pans: navigation stays on while a shape is drawn (the
 * double click that focuses the view does not: it waits while a tool is armed, see `view.activeTool`).
 *
 * The DrawTool keeps a temporary point at the pointer, which a gesture that ends the shape leaves in it
 * as a last point: it is taken out (and any last segment of length 0) before the shape is kept, so the
 * result is the points that were clicked and one length.
 */
import { measureFormatters, measureColor } from './sceneUtils';
import { isRightClick, RIGHT_BUTTON } from '@/libs/mouse';
import { measureLabelPx, MEASURE_LINE_PX } from '@/libs/measureScale';

/** The least points a shape is kept with: the shape being drawn with fewer is dropped. */
const MIN_POINTS = { point: 1, distance: 2, area: 3 };

const samePoint = (a, b) => a.x === b.x && a.y === b.y && a.z === b.z;

// The Giro3D condition for a double click with the main button, when the libraries do not give it
const isDoubleClick = e => e.type === 'dblclick' && e.button === 0;

/**
 * The points of a shape that a gesture ended: without the temporary point that followed the pointer
 * (the last one; for a closed ring the one before the closing point) and without a last segment of length 0
 * (two clicks on the same spot).
 * @param {{ x: number, y: number, z: number }[]} points
 * @param {boolean} closed  the shape is a ring that repeats its first point as its last
 * @returns {{ x: number, y: number, z: number }[]}
 */
export function trimDrawnPoints(points, closed) {
    const kept = points.slice();
    if (closed && kept.length > 1 && samePoint(kept[0], kept[kept.length - 1])) kept.pop();
    kept.pop();
    while (kept.length > 1 && samePoint(kept[kept.length - 1], kept[kept.length - 2])) kept.pop();
    return kept;
}

// Typing keeps its keys
const isTyping = t => t instanceof Element && !!t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]');

export class MeasureTool {
    /**
     * @param {import('./unifiedScene').UnifiedScene} scene
     * @param {(count: number) => void} onCount
     */
    constructor(scene, onCount) {
        this.scene = scene;
        this.onCount = onCount;
        this.drawTool = null;
        this.abort = null;
        this.shapes = [];
        this.format = measureFormatters(() => scene.mercatorScale);
        // The drawing in progress: which one it is (a newer one replaces it), the points clicked, and
        // whether a gesture (not the last click) ends it
        this.run = 0;
        this.kind = null;
        this.placed = 0;
        this.finishRequested = false;
        this.endedByGesture = false;
        this.rightDown = null;
        this.onKey = e => this.handleKey(e);
    }

    /**
     * How a shape looks: the label size and the line width in CSS px follow the height of the canvas, so the values are
     * readable on a 4K screen as on a 1080 one (FR-VWR-37).
     */
    look() {
        return { fontSize: measureLabelPx(this.scene.instance?.domElement?.clientHeight), lineWidth: MEASURE_LINE_PX };
    }

    /** The kind being drawn ('point' | 'distance' | 'area'), or null. */
    get activeKind() {
        return this.abort ? this.kind : null;
    }

    /** Draws one shape of `kind` ('point', 'distance', 'area'); a new one cancels the current. */
    async measure(kind) {
        const { scene } = this;
        if (!scene.instance || !Object.hasOwn(MIN_POINTS, kind)) return;
        if (!this.drawTool) this.drawTool = new scene.libs.DrawTool({ instance: scene.instance });
        if (this.abort) this.abort.abort();
        // The shapes already drawn take the size of the view as it is now
        const look = this.look();
        this.shapes.forEach(s => { s.fontSize = look.fontSize; s.lineWidth = look.lineWidth; });
        const abort = this.abort = new AbortController();
        const run = ++this.run;
        this.kind = kind;
        this.placed = 0;
        this.finishRequested = false;
        this.endedByGesture = false;
        this.rightDown = null;
        const signal = abort.signal;
        scene.view.activeTool = kind;
        // lifetime: paired (removed when this drawing ends, below)
        window.addEventListener('keydown', this.onKey);

        const options = { signal, color: measureColor(), ...this.look(), endCondition: e => this.endCondition(e), onPointCreated: (shape, index) => { this.placed = index + 1; } };
        let shape = null;
        try {
            if (kind === 'point') {
                shape = await this.drawTool.createPoint(options);
            } else if (kind === 'distance') {
                shape = await this.drawTool.createLineString({ ...options, showVertices: true, showSegmentLabels: true,
                    segmentLabelFormatter: this.format.length });
            } else if (kind === 'area') {
                shape = await this.drawTool.createPolygon({ ...options, showSurface: true, showSurfaceLabel: true,
                    surfaceLabelFormatter: this.format.area });
            }
        } catch {
            // Cancelled
        }
        // A newer drawing replaced this one: it owns the state now
        if (run !== this.run) return;
        window.removeEventListener('keydown', this.onKey);
        this.abort = null;
        scene.view.activeTool = null;
        if (shape && this.endedByGesture) shape = this.trim(shape, kind);
        if (shape && scene.instance) {
            this.shapes.push(shape);
            this.onCount(this.shapes.length);
            scene.instance.notifyChange();
        }
    }

    /**
     * Whether an event of the DrawTool (mouse down, move, up, click, double click) ends the shape: a double
     * click, a right click (isRightClick), or what finish() asked for.
     */
    endCondition(e) {
        let ends = this.finishRequested;
        if (!ends) {
            const doubleClick = this.scene.libs.DrawConditions?.doubleClick ?? isDoubleClick;
            if (e.type === 'mousedown' && e.button === RIGHT_BUTTON) {
                this.rightDown = { button: e.button, clientX: e.clientX, clientY: e.clientY };
            } else if (e.type === 'mouseup' && e.button === RIGHT_BUTTON) {
                const down = this.rightDown;
                this.rightDown = null;
                if (isRightClick(down, e)) {
                    e.stopPropagation();
                    ends = true;
                }
            } else if (doubleClick(e)) {
                ends = true;
            }
        }
        if (ends) this.endedByGesture = true;
        return ends;
    }

    /**
     * Takes the temporary point (and a last segment of length 0) out of a shape that a gesture ended. A shape
     * with too few points left is dropped (null).
     */
    trim(shape, kind) {
        const closed = kind === 'area';
        const points = trimDrawnPoints(shape.points, closed);
        if (points.length < MIN_POINTS[kind]) {
            try { this.scene.instance.remove(shape); } catch { /* already gone */ }
            return null;
        }
        shape.setPoints(points);
        if (closed) shape.makeClosed();
        shape.rebuildLabels?.();
        return shape;
    }

    /**
     * Ends the shape being drawn with the points clicked, if they are enough (Enter, Done). The DrawTool ends
     * on an event of its own, so the end is asked of its end condition and one event is sent to it.
     */
    finish() {
        if (!this.abort || this.kind === 'point' || this.placed < MIN_POINTS[this.kind]) return;
        this.finishRequested = true;
        this.scene.instance.domElement.dispatchEvent(new MouseEvent('mousemove'));
    }

    /** Drops the shape being drawn (Escape, Cancel). */
    cancel() {
        if (this.abort) this.abort.abort();
    }

    handleKey(e) {
        if (!this.abort || isTyping(e.target)) return;
        if (e.key === 'Escape') this.cancel();
        else if (e.key === 'Enter') this.finish();
        else return;
        e.preventDefault();
    }

    /** Writes the labels of the shapes again: the formatters read the units at call time. */
    relabel() {
        const instance = this.scene.instance;
        if (!instance) return;
        this.shapes.forEach(s => s.rebuildLabels());
        instance.notifyChange();
    }

    /** Removes every shape, and the one being drawn. */
    clear() {
        const instance = this.scene.instance;
        if (!instance) return;
        this.cancel();
        this.shapes.forEach(s => { try { instance.remove(s); } catch { /* already gone */ } });
        this.shapes = [];
        this.onCount(0);
        instance.notifyChange();
    }

    dispose() {
        window.removeEventListener('keydown', this.onKey);
        if (this.abort) this.abort.abort();
        if (this.drawTool) {
            try { this.drawTool.dispose(); } catch { /* already gone */ }
        }
        this.abort = this.drawTool = null;
        this.shapes = [];
    }
}
