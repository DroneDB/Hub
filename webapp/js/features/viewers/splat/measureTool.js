// @ts-check
/**
 * The splat viewer's measurement tool: points, distances (a polyline), heights (the difference
 * along the scene's up) and areas (a polygon seen from above), drawn as three.js lines with HTML
 * labels. It has the interface of the 3D viewer's tool (`measure(kind)`, `clear()`, `dispose()`
 * and the count it reports), so the viewers use them alike.
 *
 * The user clicks on the splats; the click is turned into a point by `stage.pickSplat`. The points
 * are kept in the frame of the splat file (the overlay group of the stage is turned with the mesh),
 * and the values are worked out from them every time they are drawn, so they follow a change of the
 * scale or of the up. Navigation is suspended while a shape is drawn (a drag would also move the
 * camera): a click adds a point, Enter or a right click ends the shape, Escape cancels it. A
 * shape with a fixed number of points (a point, a height) ends by itself.
 *
 * The same drawing picks points that are not measurements: `measure('scale')` the two points of a
 * length the user knows, `measure('pin')` the place of a pin. The points are returned and nothing
 * is kept.
 */
import { MEASURE_COLOR } from '@/features/viewers/unified/sceneUtils';
import { MEASURE_KINDS, sceneLabels, shapeLabels } from './measureMath';
import { newId } from './sceneData';

// A press that moves more than this many pixels, or lasts longer than this, is a drag, not a click
const CLICK_MOVE_PX = 6;
const CLICK_MS = 600;

/** What can be picked but is not a measurement: the two points of a known length, the place of a pin. Not kept. */
const PICK_ONLY = { scale: { min: 2, max: 2 }, pin: { min: 1, max: 1 } };
const SPECS = { ...MEASURE_KINDS, ...PICK_ONLY };

/**
 * @typedef {object} MeasureHost
 * @property {any} THREE
 * @property {any} CSS2DObject                    the CSS2DObject class
 * @property {{ overlay: any, pickSplat: (ndc: { x: number, y: number }) => ({ point: any } | null) }} stage
 * @property {HTMLCanvasElement} canvas
 * @property {() => number[]} getUp               the scene's up in the frame of the file
 * @property {() => { metersPerUnit: number, unit: string }} getScale
 * @property {() => ((p: number[]) => string) | null} [getCoordinateWriter]   writes a point as coordinates on the Earth, null when the scene has none
 * @property {(target: any, type: string, listener: (e: any) => void) => void} listen   adds a listener for the life of the viewer
 * @property {(enabled: boolean) => void} setNavigationEnabled
 * @property {(kind: string | null) => void} [onActive]   the kind being drawn or picked changed (null: none)
 * @property {(measurements: import('./sceneData').Measurement[]) => void} [onChange]   the user drew a shape or cleared them
 * @property {() => void} [onMiss]                a click that found no splat
 */

export class SplatMeasureTool {
    /**
     * @param {MeasureHost} host
     * @param {(count: number) => void} onCount
     */
    constructor(host, onCount) {
        this.host = host;
        this.onCount = onCount;
        /** @type {import('./sceneData').Measurement[]} */
        this.measurements = [];
        /** @type {Map<number | string, { group: any, labels: any[] }>} */
        this.shapes = new Map();
        /** @type {{ kind: string, points: number[][], resolve: (m: any) => void, draft: { group: any, labels: any[] } | null, down: { x: number, y: number, at: number } | null } | null} */
        this.session = null;
        this.disposed = false;
        this.labels = sceneLabels(() => host.getScale(), () => host.getCoordinateWriter?.() ?? null);

        const { canvas, listen } = host;
        listen(canvas, 'pointerdown', e => this.onPointerDown(e));
        listen(canvas, 'pointerup', e => this.onPointerUp(e));
        listen(canvas, 'contextmenu', e => this.onContextMenu(e));
        listen(window, 'keydown', e => this.onKey(e));
    }

    /** The kind being drawn, or null. */
    get activeKind() {
        return this.session ? this.session.kind : null;
    }

    /**
     * Draws one shape of `kind` ('point', 'distance', 'height', 'area'), or picks points for
     * 'scale' or 'pin'; a new one cancels the current. Resolves with the shape (the points for a
     * pick) when it ends, null when it was cancelled.
     * @param {string} kind
     * @returns {Promise<import('./sceneData').Measurement | null>}
     */
    measure(kind) {
        if (this.disposed || !Object.hasOwn(SPECS, kind)) return Promise.resolve(null);
        this.cancel();
        return new Promise(resolve => {
            this.session = { kind, points: [], resolve, draft: null, down: null };
            this.host.setNavigationEnabled(false);
            this.host.onActive?.(kind);
        });
    }

    /** Ends the shape being drawn with the points it has, if they are enough. */
    finish() {
        const s = this.session;
        if (!s) return;
        if (s.points.length < SPECS[s.kind].min) return;
        /** @type {import('./sceneData').Measurement} */
        const measurement = { id: newId(), kind: /** @type {any} */ (s.kind), points: s.points.map(p => p.slice()) };
        this.end(measurement);
        if (Object.hasOwn(PICK_ONLY, s.kind)) return;
        this.measurements.push(measurement);
        this.draw(measurement);
        this.onCount(this.measurements.length);
        this.host.onChange?.(this.measurements);
    }

    /** Abandons the shape being drawn. */
    cancel() {
        if (this.session) this.end(null);
    }

    /** Removes every shape, drawn or being drawn. */
    clear() {
        this.cancel();
        this.shapes.forEach(shape => this.release(shape));
        this.shapes.clear();
        this.measurements = [];
        this.onCount(0);
        this.host.onChange?.(this.measurements);
    }

    /**
     * Shows these measurements instead of the ones shown (the saved ones, when the scene opens).
     * It is not a change by the user: nothing is reported but the count.
     * @param {import('./sceneData').Measurement[]} measurements
     */
    show(measurements) {
        this.shapes.forEach(shape => this.release(shape));
        this.shapes.clear();
        this.measurements = measurements.map(m => ({ id: m.id, kind: m.kind, points: m.points.map(p => p.slice()) }));
        this.measurements.forEach(m => this.draw(m));
        this.onCount(this.measurements.length);
    }

    /** Draws everything again: the scale or the up changed, and the values with it. */
    refresh() {
        this.measurements.forEach(m => this.draw(m));
        const s = this.session;
        if (s) this.drawDraft(s);
    }

    dispose() {
        this.disposed = true;
        this.cancel();
        this.shapes.forEach(shape => this.release(shape));
        this.shapes.clear();
        this.measurements = [];
    }

    // ---- Drawing --------------------------------------------------------------------------

    /**
     * Ends the session with its result (null when it was cancelled): the draft goes, navigation is back.
     * @param {import('./sceneData').Measurement | null} value
     */
    end(value) {
        const s = this.session;
        if (!s) return;
        this.session = null;
        if (s.draft) this.release(s.draft);
        this.host.setNavigationEnabled(true);
        this.host.onActive?.(null);
        s.resolve(value);
    }

    /** (Re)draws a kept measurement. @param {import('./sceneData').Measurement} m */
    draw(m) {
        const old = this.shapes.get(m.id);
        if (old) this.release(old);
        this.shapes.set(m.id, this.build(m.kind, m.points));
    }

    /** @param {NonNullable<SplatMeasureTool['session']>} s */
    drawDraft(s) {
        if (s.draft) this.release(s.draft);
        s.draft = s.points.length ? this.build(s.kind, s.points) : null;
    }

    /**
     * The three.js objects of a shape, added to the overlay: the line, a dot at every point and the labels.
     * @param {string} kind @param {number[][]} points
     */
    build(kind, points) {
        const { THREE, CSS2DObject, stage } = this.host;
        const group = new THREE.Group();
        const labels = [];
        const up = this.host.getUp();

        const path = this.pathOf(kind, points, up);
        if (path.length > 1) {
            const geometry = new THREE.BufferGeometry().setFromPoints(path.map(p => new THREE.Vector3(...p)));
            // Over the splats, which are transparent and sorted by Spark: depth testing would hide it
            const material = new THREE.LineBasicMaterial({ color: MEASURE_COLOR, depthTest: false, transparent: true });
            const line = kind === 'area' && points.length > 2 ? new THREE.LineLoop(geometry, material) : new THREE.Line(geometry, material);
            line.renderOrder = 10;
            group.add(line);
        }
        points.forEach(p => labels.push(this.element(CSS2DObject, 'splat-vertex', '', p)));
        if (!Object.hasOwn(PICK_ONLY, kind)) {
            shapeLabels(kind, points, up, this.labels).forEach(l => labels.push(this.element(CSS2DObject, `splat-measure-label ${l.kind}`, l.text, l.at)));
        }
        labels.forEach(l => group.add(l));
        stage.overlay.add(group);
        return { group, labels };
    }

    /**
     * The polyline of a shape. A height is drawn as its vertical leg and the step across: a, the
     * point above or below the other one, then b.
     * @param {string} kind @param {number[][]} points @param {number[]} up
     */
    pathOf(kind, points, up) {
        if (kind !== 'height' || points.length < 2) return points;
        const [a, b] = points;
        const upLengthSq = up[0] * up[0] + up[1] * up[1] + up[2] * up[2];
        if (!(upLengthSq > 0)) return points;
        const along = ((b[0] - a[0]) * up[0] + (b[1] - a[1]) * up[1] + (b[2] - a[2]) * up[2]) / upLengthSq;
        return [a, [a[0] + up[0] * along, a[1] + up[1] * along, a[2] + up[2] * along], b];
    }

    /** @param {any} CSS2DObject @param {string} className @param {string} text @param {number[]} at */
    element(CSS2DObject, className, text, at) {
        const div = document.createElement('div');
        div.className = className;
        div.textContent = text;
        const object = new CSS2DObject(div);
        object.position.set(at[0], at[1], at[2]);
        return object;
    }

    /** @param {{ group: any, labels: any[] }} shape */
    release(shape) {
        // A CSS2DObject removes its element when it is removed itself, not when a group holding it is
        shape.labels.forEach(l => { l.removeFromParent(); l.element.remove(); });
        shape.group.traverse((/** @type {any} */ o) => {
            o.geometry?.dispose();
            o.material?.dispose();
        });
        shape.group.removeFromParent();
    }

    // ---- Input ----------------------------------------------------------------------------

    /** @param {PointerEvent} e */
    onPointerDown(e) {
        if (!this.session || e.button !== 0) return;
        this.session.down = { x: e.clientX, y: e.clientY, at: performance.now() };
    }

    /** A click (a press that stayed where it was) adds a point where the splats are under it. @param {PointerEvent} e */
    onPointerUp(e) {
        const s = this.session;
        if (!s || e.button !== 0 || !s.down) return;
        const { down } = s;
        s.down = null;
        if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > CLICK_MOVE_PX || performance.now() - down.at > CLICK_MS) return;
        const rect = this.host.canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const ndc = { x: ((e.clientX - rect.left) / rect.width) * 2 - 1, y: -((e.clientY - rect.top) / rect.height) * 2 + 1 };
        const hit = this.host.stage.pickSplat(ndc);
        if (!hit) {
            this.host.onMiss?.();
            return;
        }
        const { overlay } = this.host.stage;
        overlay.updateWorldMatrix(true, false);
        const local = overlay.worldToLocal(hit.point.clone());
        s.points.push([local.x, local.y, local.z]);
        this.drawDraft(s);
        if (s.points.length >= SPECS[s.kind].max) this.finish();
    }

    /** A right click ends the shape (or drops it when it has too few points). @param {MouseEvent} e */
    onContextMenu(e) {
        const s = this.session;
        if (!s) return;
        e.preventDefault();
        if (s.points.length >= SPECS[s.kind].min) this.finish();
        else this.cancel();
    }

    /** @param {KeyboardEvent} e */
    onKey(e) {
        if (!this.session) return;
        // Typing keeps its keys
        if (e.target instanceof Element && e.target.closest('input, textarea, select')) return;
        if (e.key === 'Escape') this.cancel();
        else if (e.key === 'Enter') this.finish();
        else return;
        e.preventDefault();
    }
}
