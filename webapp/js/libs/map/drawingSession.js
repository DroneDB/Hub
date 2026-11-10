// @ts-check
/**
 * The drawing session of every 2D map tool that draws or picks on the map: Measure Length and Area, the
 * point annotation and the eraser (measureControl), Inspect, the statistics rectangle and the profile
 * (useRasterAnalysis), the stockpile Click map and Draw (useStockpileVolume). FR-XC-17, D-027.
 *
 * One session owns what the tool needs while it is armed, and removes it all in `end()`:
 *   - the OpenLayers Draw interaction (a point, a line, a polygon or a box);
 *   - the keys: Esc abandons the shape and ends the session (a key of a dialog is the dialog's; with no
 *     shape drawn the key goes on to the page too), Enter finishes the shape, Space adds the
 *     point under the crosshair (the centre of the view) when the map is focused, so a tool works without
 *     a pointer; the crosshair is drawn over the centre of the map while the session runs;
 *   - the mouse: a click of the main button adds a point (the other buttons never start, add or place
 *     anything); a double click (two presses of the main button in one place, `DOUBLE_CLICK_MAX_MOVE_PX`) or a
 *     right click (a right-button release after a move of 4 CSS px or less, `isRightClick`) finishes the shape, a longer right-drag pans the map (a pan of the right
 *     button, there while the session runs) and is not a click; the browser's context menu stays away
 *     from the map while a tool is armed;
 *   - the tool lock: the measurement toolbar is disabled, once, so that another tool cannot start on top;
 *     and one session per map: a session that starts ends the one that runs on its map ('stop').
 *
 * Finishing a shape with too few vertices drops it, as Esc does: `abortDrawing()` never adds a feature to
 * the source and `finishDrawing()` adds one only for a shape that has enough points.
 */
import Draw, { createBox, DrawEvent } from 'ol/interaction/Draw';
import DragPan from 'ol/interaction/DragPan';
import { noModifierKeys, primaryAction } from 'ol/events/condition';
import { Feature } from 'ol';
import { Point } from 'ol/geom';
import { fromExtent } from 'ol/geom/Polygon';
import { boundingExtent } from 'ol/extent';
import { Style } from 'ol/style';
import { unByKey } from 'ol/Observable';
import { markRaw, toRaw } from 'vue';
import { isRightClick, RIGHT_BUTTON } from '@/libs/mouse';
import { drawingHint } from '@/libs/measureHints';

/** The least points a shape needs to be finished; fewer and the shape is dropped. */
const MIN_VERTICES = { LineString: 2, Polygon: 3 };
/** @type {Record<string, 'point' | 'line' | 'area' | 'box'>} */
const HINT_KIND = { Point: 'point', LineString: 'line', Polygon: 'area', Box: 'box' };

/**
 * What adds a point: the main button (a touch, a pen) with no modifier key. OpenLayers' default takes any button,
 * so the right click that finishes a shape would also start the next one, place a point or erase.
 * @param {import('ol/MapBrowserEvent').default<any>} e
 */
const addsPoint = e => noModifierKeys(e) && primaryAction(e);
/** What pans while a tool draws (D-027): a drag of the right mouse button. @param {import('ol/MapBrowserEvent').default<any>} e */
const rightButtonPan = e => e.originalEvent?.button === RIGHT_BUTTON;

/** The session that runs on each map: one at a time. @type {WeakMap<object, DrawingSession>} */
const sessionsByMap = new WeakMap();

/** @typedef {{ setToolsDisabled?: (disabled: boolean) => void }} ToolbarLike */
/** @typedef {'finish' | 'abort' | 'stop'} EndReason  finish: the shape is done (`once`); abort: Esc or `end()`; stop: a tool was started instead */

/**
 * The tool lock: disables the measurement toolbar while a tool of the map draws, held at most once
 * and released exactly once. The toolbar counts the locks (`setToolsDisabled`), so two tools can hold it
 * together.
 * @param {ToolbarLike | (() => ToolbarLike | null | undefined) | null | undefined} toolbar  the toolbar, or what returns it when it is needed
 */
export function createToolLock(toolbar) {
    let held = false;
    const target = () => (typeof toolbar === 'function' ? toolbar() : toolbar);
    return {
        get held() { return held; },
        hold() {
            if (held) return;
            const t = target();
            if (!t || typeof t.setToolsDisabled !== 'function') return;
            t.setToolsDisabled(true);
            held = true;
        },
        release() {
            if (!held) return;
            held = false;
            const t = target();
            try { if (t && typeof t.setToolsDisabled === 'function') t.setToolsDisabled(false); } catch { /* the toolbar is gone */ }
        }
    };
}

/**
 * The two presses of a double click are this far apart or less (CSS pixels): the snap tolerance of the Draw interaction,
 * where its second click finishes the shape itself. OpenLayers reports a `dblclick` for any two clicks within 250 ms
 * wherever they are: two quick points of a line, or the click on the tool's button and the first point.
 */
export const DOUBLE_CLICK_MAX_MOVE_PX = 12;

// The contextmenu that follows the release of a right click that ended the session is still the tool's, for this long
const MENU_GUARD_MS = 500;

/**
 * A browser sends its contextmenu after the release of the right button (Windows, macOS): when that click
 * ended the session, the session has already gone. The next contextmenu of the viewport is kept from the
 * page, once.
 * @param {HTMLElement} viewport
 */
function swallowNextContextMenu(viewport) {
    const guard = (/** @type {Event} */ e) => {
        e.preventDefault();
        viewport.removeEventListener('contextmenu', guard, true);
    };
    // lifetime: paired (removed by the first contextmenu, or by the timer below)
    viewport.addEventListener('contextmenu', guard, true);
    setTimeout(() => viewport.removeEventListener('contextmenu', guard, true), MENU_GUARD_MS);
}

/** Whether a key event is aimed at a control that keeps its keys (typing, a button that Enter and Space press). */
const keepsItsKeys = (/** @type {EventTarget | null} */ target) =>
    target instanceof Element && !!target.closest('input, textarea, select, button, a[href], [contenteditable=""], [contenteditable="true"]');

/** The dialog a key event is aimed at, if any. @param {EventTarget | null} target */
const dialogOf = target =>
    target instanceof Element ? target.closest('[role="dialog"], [role="alertdialog"], [aria-modal="true"]') : null;

/**
 * @typedef {object} SessionOptions
 * @property {import('ol/Map').default} map
 * @property {'Point' | 'LineString' | 'Polygon' | 'Box'} type  Box: a rectangle by two opposite corners
 * @property {import('ol/source/Vector').default<any>} [source]  where the finished shape goes; none: the shape is only reported (drawend)
 * @property {import('ol/style/Style').StyleLike} [style]  the look of the sketch (a Point session shows none by default)
 * @property {ToolbarLike | (() => ToolbarLike | null | undefined) | null} [toolbar]  the measurement toolbar to lock while the session runs
 * @property {boolean} [once]  the session ends by itself after the first finished shape (default false)
 * @property {boolean} [crosshair]  show the centre crosshair and take Space for a point (default true)
 * @property {'point' | 'line' | 'area' | 'box' | 'height' | 'pick'} [hintKind]  the hint to show (default: by type)
 * @property {(event: DrawEvent) => void} [onDrawStart]
 * @property {(event: DrawEvent) => void} [onDrawEnd]  a shape is finished (before the source has it)
 * @property {() => void} [onDrawAbort]  the shape being drawn was dropped
 * @property {(reason: EndReason) => void} [onEnd]  the session ended
 */

export class DrawingSession {
    /** @param {SessionOptions} options */
    constructor(options) {
        // The session and the map are OpenLayers' business: a host that keeps them in reactive state
        // must not hand the interaction to the map as one object and take it away as another
        markRaw(this);
        this.options = options;
        this.map = toRaw(options.map);
        this.type = options.type;
        this.active = true;
        // One session per map: a tool that starts takes the map from the one that runs (its owner hears 'stop')
        sessionsByMap.get(this.map)?.end('stop');
        sessionsByMap.set(this.map, this);
        /** The shape being drawn (the OpenLayers sketch), null between shapes */
        this.sketch = /** @type {import('ol').Feature<any> | null} */ (null);
        /** The first corner of a box placed from the keyboard */
        this.corner = /** @type {number[] | null} */ (null);
        this.lock = createToolLock(options.toolbar);
        this.rightDown = /** @type {{ button: number, clientX: number, clientY: number } | null} */ (null);
        // The last two presses of the main button on the map, for what is a double click
        this.mainDowns = /** @type {{ clientX: number, clientY: number }[]} */ ([]);
        // When the last right click was, to keep the page's menu away from the contextmenu that follows it
        this.rightClickedAt = -Infinity;
        this.inDrawEnd = false;
        this.crosshairEl = /** @type {HTMLElement | null} */ (null);
        this.viewport = /** @type {HTMLElement | null} */ (null);
        this.addedTabIndex = false;
        this.dblClickKey = null;
        /** The hint of the tool: how to place a point, finish and cancel */
        this.hint = drawingHint(options.hintKind ?? HINT_KIND[options.type], { crosshair: options.crosshair !== false });

        const isBox = options.type === 'Box';
        this.draw = new Draw({
            source: options.source,
            type: /** @type {any} */ (isBox ? 'Circle' : options.type),
            geometryFunction: isBox ? createBox() : undefined,
            condition: addsPoint,
            // Nothing follows the pointer for a pick (its cursor is the crosshair)
            style: options.style ?? (options.type === 'Point' ? new Style() : undefined)
        });
        // lifetime: owner (the Draw interaction belongs to this session and is dropped with it)
        this.draw.on('drawstart', e => {
            this.sketch = e.feature;
            options.onDrawStart?.(e);
        });
        // lifetime: owner (the Draw interaction belongs to this session and is dropped with it)
        this.draw.on('drawend', e => {
            this.sketch = null;
            this.corner = null;
            // OpenLayers is still dispatching: the session leaves once it is done with the event
            this.inDrawEnd = true;
            queueMicrotask(() => { this.inDrawEnd = false; });
            options.onDrawEnd?.(e);
            if (options.once) this.end('finish');
        });
        // lifetime: owner (the Draw interaction belongs to this session and is dropped with it)
        this.draw.on('drawabort', () => {
            this.sketch = null;
            this.corner = null;
            options.onDrawAbort?.();
        });

        // A right-drag pans while the tool draws (the map's own pan takes the main button only)
        this.rightPan = new DragPan({ condition: rightButtonPan });

        this.map.addInteraction(this.draw);
        this.map.addInteraction(this.rightPan);
        this.lock.hold();
        this.attach();
    }

    /** Whether a shape is being drawn. */
    get drawing() {
        return this.active && this.sketch !== null;
    }

    /** The points of the shape being drawn that were placed (the last point of the sketch follows the pointer). */
    get vertexCount() {
        const geometry = this.sketch?.getGeometry();
        if (!geometry) return 0;
        const type = geometry.getType();
        if (type === 'LineString') return Math.max(0, /** @type {import('ol/geom').LineString} */ (geometry).getCoordinates().length - 1);
        if (type === 'Polygon') {
            const ring = /** @type {import('ol/geom').Polygon} */ (geometry).getCoordinates()[0] ?? [];
            // The ring is closed with the first point again, and its last open point follows the pointer
            return this.type === 'Polygon' ? Math.max(0, ring.length - 2) : (this.corner ? 1 : 0);
        }
        return 0;
    }

    /**
     * Finishes the shape being drawn (double click, Enter, right click). A shape with too few points is
     * dropped. Returns whether a shape was finished.
     * @returns {boolean}
     */
    finishDrawing() {
        if (!this.drawing) return false;
        // A box with its first corner placed from the keyboard ends at the crosshair: the pointer did not move
        if (this.type === 'Box' && this.corner) return this.addCenterPoint();
        const needed = /** @type {Record<string, number>} */ (MIN_VERTICES)[this.type];
        if (needed && this.vertexCount < needed) {
            this.abortDrawing();
            return false;
        }
        this.draw.finishDrawing();
        return true;
    }

    /** Drops the shape being drawn: it never reaches the source. The session goes on. */
    abortDrawing() {
        if (this.sketch) this.draw.abortDrawing();
        this.sketch = null;
        this.corner = null;
    }

    /**
     * The keyboard's point: the centre of the view (the crosshair) is added as the point of a Point tool
     * (which finishes it), the next vertex of a line or a polygon, or the next corner of a box.
     * @returns {boolean} whether a point was added
     */
    addCenterPoint() {
        if (!this.active) return false;
        const center = this.map.getView().getCenter();
        if (!center) return false;
        const point = [center[0], center[1]];
        if (this.type === 'Point') {
            this.finishWith(new Feature(new Point(point)));
            return true;
        }
        if (this.type === 'Box') {
            if (!this.corner) {
                this.corner = point;
                this.draw.appendCoordinates([point.slice()]);
                return true;
            }
            const corner = this.corner;
            this.abortDrawing();
            this.finishWith(new Feature(fromExtent(boundingExtent([corner, point]))));
            return true;
        }
        this.draw.appendCoordinates([point]);
        return true;
    }

    /** Finishes a shape that OpenLayers did not draw (the keyboard's): the same events and the same source. @param {Feature<any>} feature */
    finishWith(feature) {
        this.draw.dispatchEvent(new DrawEvent('drawend', feature));
        this.options.source?.addFeature(feature);
    }

    /**
     * Ends the session: a shape being drawn is dropped, the interaction, the keys, the crosshair and the
     * tool lock go. Safe to call twice, and from inside a drawend handler.
     * @param {EndReason} [reason]
     */
    end(reason = 'abort') {
        if (!this.active) return;
        this.abortDrawing();
        this.active = false;
        if (sessionsByMap.get(this.map) === this) sessionsByMap.delete(this.map);
        const viewport = this.viewport;
        this.detach();
        if (viewport && performance.now() - this.rightClickedAt < MENU_GUARD_MS) swallowNextContextMenu(viewport);
        this.draw.setActive(false);
        this.rightPan.setActive(false);
        const remove = () => {
            try {
                this.map.removeInteraction(this.draw);
                this.map.removeInteraction(this.rightPan);
            } catch { /* the map is gone */ }
        };
        // Taking the interaction out of the map while OpenLayers dispatches the event of this very pointer
        // lets the next interaction miss it: it leaves a moment later
        if (this.inDrawEnd) queueMicrotask(remove);
        else remove();
        this.lock.release();
        this.options.onEnd?.(reason);
    }

    // ---- Input ----------------------------------------------------------------------------

    attach() {
        const viewport = this.map.getViewport();
        this.viewport = viewport;
        if (viewport) {
            // lifetime: owner (removed in detach())
            viewport.addEventListener('pointerdown', this.onPointerDown);
            // lifetime: owner (removed in detach())
            viewport.addEventListener('pointerup', this.onPointerUp);
            // lifetime: owner (removed in detach())
            viewport.addEventListener('contextmenu', this.onContextMenu);
            if (this.options.crosshair !== false) this.showCrosshair(viewport);
        }
        this.dblClickKey = this.map.on('dblclick', () => { if (this.isDoubleClick()) this.finishDrawing(); });
        // lifetime: owner (removed in detach())
        window.addEventListener('keydown', this.onKeyDown, true);
    }

    detach() {
        const viewport = this.viewport;
        if (viewport) {
            viewport.removeEventListener('pointerdown', this.onPointerDown);
            viewport.removeEventListener('pointerup', this.onPointerUp);
            viewport.removeEventListener('contextmenu', this.onContextMenu);
            this.hideCrosshair(viewport);
        }
        if (this.dblClickKey) unByKey(this.dblClickKey);
        this.dblClickKey = null;
        window.removeEventListener('keydown', this.onKeyDown, true);
        this.viewport = null;
    }

    /** @param {PointerEvent} e */
    onPointerDown = e => {
        if (e.button === RIGHT_BUTTON) this.rightDown = { button: e.button, clientX: e.clientX, clientY: e.clientY };
        else if (e.button === 0) this.mainDowns = [...this.mainDowns.slice(-1), { clientX: e.clientX, clientY: e.clientY }];
    };

    /**
     * Whether the `dblclick` of OpenLayers is one: its two presses were on the map, in one place. A press before the
     * session (the click on the tool's button) or a quick click elsewhere is not the first half of it, else the first
     * point of a line would be dropped, or a line finished at its second point.
     */
    isDoubleClick() {
        const [first, second] = this.mainDowns;
        if (!first || !second) return false;
        return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY) <= DOUBLE_CLICK_MAX_MOVE_PX;
    }

    /** A right click finishes the shape; a right-drag is not one. @param {PointerEvent} e */
    onPointerUp = e => {
        if (e.button !== RIGHT_BUTTON) return;
        const down = this.rightDown;
        this.rightDown = null;
        if (!isRightClick(down, e)) return;
        this.rightClickedAt = performance.now();
        this.finishDrawing();
    };

    /** The browser's menu has no place on a map that draws: the right click is the tool's. @param {Event} e */
    onContextMenu = e => {
        e.preventDefault();
        e.stopPropagation();
    };

    /** @param {KeyboardEvent} e */
    onKeyDown = e => {
        if (!this.active) return;
        // A key of a dialog (the point's annotation, a confirmation) is the dialog's, unless the map is in it
        const dialog = dialogOf(e.target);
        if (dialog && !(this.viewport && dialog.contains(this.viewport))) return;
        if (e.key === 'Escape') {
            // The shape being drawn takes the key; with none, the tool ends and the page hears the key too
            if (this.drawing) {
                e.preventDefault();
                e.stopPropagation();
            }
            this.end('abort');
            return;
        }
        // The keys of a button, a field or a link are theirs; the map (or the page, with no focus) has the tool's
        if (keepsItsKeys(e.target) || !this.mapHasKeys(e.target)) return;
        if (e.key === 'Enter') {
            if (this.drawing) this.finishDrawing();
            else if (this.type === 'Point') this.addCenterPoint();
            else return;
        } else if (e.key === ' ' || e.code === 'Space') {
            if (this.options.crosshair === false) return;
            this.addCenterPoint();
        } else {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
    };

    /** The key is for the map when the map holds the focus, or nothing does. @param {EventTarget | null} target */
    mapHasKeys(target) {
        if (!(target instanceof Node)) return false;
        if (target === document.body || target === document.documentElement) return true;
        const element = this.map.getTargetElement();
        return (!!element && element.contains(target)) || (!!this.viewport && this.viewport.contains(target));
    }

    // ---- The crosshair --------------------------------------------------------------------

    /** The centre of the map is a point that the keyboard can place: it is shown, and the map can be reached with Tab. @param {HTMLElement} viewport */
    showCrosshair(viewport) {
        const el = document.createElement('div');
        el.className = 'map-crosshair';
        el.setAttribute('aria-hidden', 'true');
        viewport.appendChild(el);
        this.crosshairEl = el;
        if (!viewport.hasAttribute('tabindex')) {
            viewport.setAttribute('tabindex', '0');
            this.addedTabIndex = true;
        }
    }

    /** @param {HTMLElement} viewport */
    hideCrosshair(viewport) {
        this.crosshairEl?.remove();
        this.crosshairEl = null;
        if (this.addedTabIndex) {
            viewport.removeAttribute('tabindex');
            this.addedTabIndex = false;
        }
    }
}

/**
 * Starts a drawing session on a map (see the module comment).
 * @param {SessionOptions} options
 * @returns {DrawingSession}
 */
export function startDrawingSession(options) {
    return new DrawingSession(options);
}
