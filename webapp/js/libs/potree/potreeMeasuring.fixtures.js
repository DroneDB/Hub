/**
 * A point-cloud viewer for the specs of drawing measures, with the real measuring tool, input handler, scene and measures of
 * the vendored Potree: `loadPotree({ internals: ['InputHandler'] })` must have run. What needs WebGL is not there: the point
 * of the cloud under the pointer is what `cloud.at(x, y)` gives (a position, or null where no point of the cloud is) in place
 * of Potree's pick, and the labels draw on a 2D context that takes everything and draws nothing.
 *
 * The input is what a browser sends: a mouse sends mouse events; a finger sends pointer events, then touch events (Potree's
 * input handler calls preventDefault() on touchstart, so the browser sends no mouse event for it).
 */
import { vi } from 'vitest';

// The labels of the measures draw their text on a canvas
const context2d = new Proxy({}, {
    get: (target, key) => (key in target ? target[key] : key === 'measureText' ? () => ({ width: 40 }) : () => {}),
    set: (target, key, value) => { target[key] = value; return true; }
});

/**
 * @returns {{ viewer: any, canvas: HTMLCanvasElement, cloud: { at: (x: number, y: number) => ({ x: number, y: number, z: number } | null) } }}
 *   `cloud.at` is the point of the cloud at a point of the screen (by default the point (x, y, 0) everywhere)
 */
export function createMeasuringViewer() {
    const { THREE, Potree } = /** @type {any} */ (globalThis);
    if (!Potree?.InputHandler) throw new Error('loadPotree({ internals: [\'InputHandler\'] }) has not run');
    const original = HTMLCanvasElement.prototype.getContext;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (type, ...args) {
        return type === '2d' ? context2d : original.call(this, type, ...args);
    });

    const canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'clientWidth', { value: 1000 });
    Object.defineProperty(canvas, 'clientHeight', { value: 800 });
    document.body.appendChild(canvas);

    const cloud = { at: (x, y) => ({ x, y, z: 0 }) };
    vi.spyOn(Potree.Utils, 'getMousePointCloudIntersection').mockImplementation(mouse => {
        const at = cloud.at(mouse.x, mouse.y);
        if (!at) return null;
        const location = new THREE.Vector3(at.x, at.y, at.z);
        return { location, point: { position: location.clone() } };
    });

    // What Potree.Viewer makes, in its order: the scene, the input handler on the canvas, then the measuring tool
    const viewer = new Potree.EventDispatcher();
    viewer.renderer = { domElement: canvas, getSize: target => target.set(1000, 800) };
    viewer.scene = new Potree.Scene();
    viewer.inputHandler = new Potree.InputHandler(viewer);
    viewer.inputHandler.setScene(viewer.scene);
    viewer.measuringTool = new Potree.MeasuringTool(viewer);
    viewer.lengthUnit = viewer.lengthUnitDisplay = { code: 'm', unitspermeter: 1 };
    return { viewer, canvas, cloud };
}

/** The input of a mouse and of a finger on the canvas, as a browser sends it. @param {HTMLCanvasElement} canvas */
export function inputOn(canvas) {
    const mouse = (type, x, y, init = {}) => canvas.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, ...init }));
    const pointer = (type, x, y) => canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 1, isPrimary: true, clientX: x, clientY: y }));
    const touch = (type, x, y, lifted = false) => {
        const point = { identifier: 1, clientX: x, clientY: y, pageX: x, pageY: y, target: canvas };
        canvas.dispatchEvent(Object.assign(new Event(type, { bubbles: true, cancelable: true }), { touches: lifted ? [] : [point], changedTouches: [point] }));
    };
    return {
        /** The mouse moves to (x, y) with no button down */
        move: (x, y) => mouse('mousemove', x, y, { buttons: 0 }),
        /** A left click at (x, y), the pointer moved there first */
        click(x, y) {
            mouse('mousemove', x, y, { buttons: 0 });
            mouse('mousedown', x, y, { buttons: 1 });
            mouse('mouseup', x, y, { detail: 1 });
        },
        /** A right click at (x, y) */
        rightClick(x, y) {
            mouse('mousedown', x, y, { button: 2, buttons: 2 });
            mouse('mouseup', x, y, { button: 2 });
        },
        /** A tap of a finger at (x, y) */
        tap(x, y) {
            pointer('pointerdown', x, y);
            touch('touchstart', x, y);
            pointer('pointerup', x, y);
            touch('touchend', x, y, true);
        },
        /** A finger that drags the view from one point of the screen to another */
        swipe([x, y], [toX, toY]) {
            pointer('pointerdown', x, y);
            touch('touchstart', x, y);
            pointer('pointermove', toX, toY);
            touch('touchmove', toX, toY);
            pointer('pointerup', toX, toY);
            touch('touchend', toX, toY, true);
        }
    };
}
