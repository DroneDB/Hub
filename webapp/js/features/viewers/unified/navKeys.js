/**
 * navKeys - the keyboard of the 3D viewer's canvas and the help of its controls (FR-VWR-16, D-001,
 * D-019). The keys move the view only through the navigation interface that both strategies share
 * (navControls: orbit, pan, zoomAt), so they work the same with the constrained orbit and the free
 * trackball:
 *
 *  - the arrow keys orbit around the pivot (the camera goes the way of the arrow: left, right, up
 *    to look from higher, down from lower), 5 degrees a press;
 *  - Shift + the arrow keys pan (the camera goes the way of the arrow), 5 % of the view height a press;
 *  - + and - (also = and _, PageUp and PageDown) zoom to the pivot, x1.1 a press as the wheel.
 *
 * Home, H and 0 are the shell's (ViewerShell). `NAV_GESTURES` is the list the Controls help of the
 * ViewerShell toolbar shows, and `showNavHintOnce` the hint that points to it the first time.
 */

/** Radians an arrow key turns the camera around the pivot. */
export const KEY_ORBIT_STEP = 5 * Math.PI / 180;
/** View heights an arrow key with Shift pans the camera. */
export const KEY_PAN_STEP = 0.05;

// [dx, dy] of an arrow: dx to the right of the screen, dy to its top
const ARROWS = Object.freeze({
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, 1],
    ArrowDown: [0, -1]
});
const ZOOM_IN = ['+', '=', 'PageUp'];
const ZOOM_OUT = ['-', '_', 'PageDown'];

/**
 * Moves the view for a key event, through `controls` (a navigation strategy). Returns whether the
 * key was one of the navigation keys (the caller then stops its default: the page scrolling);
 * `beforeMove` runs first, only for those. A key with Ctrl, Meta or Alt is not.
 *
 * @param controls - the strategy: orbit(dx, dy), pan(dx, dy), zoomAt(point, factor), scaleFactor.
 * @param event - { key, shiftKey, ctrlKey, metaKey, altKey }
 * @param {() => void} [beforeMove]
 */
export function navigateByKey(controls, event, beforeMove) {
    if (event.ctrlKey || event.metaKey || event.altKey) return false;
    const arrow = ARROWS[event.key];
    const zoom = ZOOM_IN.includes(event.key) ? 1 : ZOOM_OUT.includes(event.key) ? -1 : 0;
    if (!arrow && !zoom) return false;
    if (beforeMove) beforeMove();
    if (arrow) {
        if (event.shiftKey) controls.pan(arrow[0] * KEY_PAN_STEP, arrow[1] * KEY_PAN_STEP);
        else controls.orbit(arrow[0] * KEY_ORBIT_STEP, arrow[1] * KEY_ORBIT_STEP);
    } else {
        const step = controls.scaleFactor > 1 ? controls.scaleFactor : 1.1;
        controls.zoomAt(undefined, zoom > 0 ? step : 1 / step);
    }
    return true;
}

/** What the navigation does, for the Controls help of the toolbar (the gestures prop of ViewerShell). */
export const NAV_GESTURES = Object.freeze([
    { input: 'Left drag', action: 'Rotate' },
    { input: 'Right drag or Ctrl + left drag', action: 'Pan' },
    { input: 'Wheel', action: 'Zoom to the cursor' },
    { input: 'Shift + wheel', action: 'Field of view' },
    { input: 'Double click', action: 'Focus on the point' },
    { input: 'Two fingers', action: 'Drag to pan, pinch to zoom, twist to turn' },
    { input: 'Arrow keys', action: 'Rotate (the view focused)' },
    { input: 'Shift + arrow keys', action: 'Pan' },
    { input: '+ and -', action: 'Zoom' }
]);

/** The text of the one-time hint. */
export const NAV_HINT = 'Drag to rotate, right-drag to pan, scroll to zoom, or click the view and use the arrow keys. The ? button lists every control.';

/**
 * Tells the user how to move in the view, once: when `seen` (a ref, a stored preference) is not
 * set it is set and the hint shown with `notify.info`. Returns whether it was shown.
 *
 * @param {{ info: Function }} notify
 * @param {{ value: boolean }} seen
 */
export function showNavHintOnce(notify, seen) {
    if (seen.value) return false;
    seen.value = true;
    notify.info(NAV_HINT, { summary: '3D view controls', life: 'long' });
    return true;
}
