/** The highest ratio a canvas renderer draws at (D-042): beyond it the cost grows faster than the sharpness. */
export const MAX_PIXEL_RATIO = 2;

/**
 * The pixel ratio a canvas renderer applies: `min(devicePixelRatio, 2, presetCap)` (FR-XC-32, D-042).
 * The one place it is calculated; a renderer without a quality preset passes no cap.
 * @param {number} [presetCap]  the cap of the quality preset in force (High 2, Medium 1.5, Low 1)
 * @param {number} [devicePixelRatio]
 */
export function appliedPixelRatio(presetCap = MAX_PIXEL_RATIO, devicePixelRatio = globalThis.devicePixelRatio) {
    const cap = presetCap > 0 ? presetCap : MAX_PIXEL_RATIO;
    return Math.min(devicePixelRatio || 1, MAX_PIXEL_RATIO, cap);
}

/**
 * Calls `onChange(devicePixelRatio)` whenever the screen's ratio changes (the window moves to another screen, the
 * browser zoom changes): every canvas renderer applies its ratio again (FR-XC-32). The `resolution` media query
 * matches one ratio, so it is made again for each new one. Returns the function that stops watching.
 * @param {(devicePixelRatio: number) => void} onChange
 * @param {Pick<Window, 'matchMedia'> & { devicePixelRatio?: number }} [win]
 * @returns {() => void}
 */
export function watchPixelRatio(onChange, win = globalThis.window) {
    if (typeof win?.matchMedia !== 'function') return () => {};
    let query = null;
    let stopped = false;
    const handler = () => {
        if (stopped) return;
        arm();
        onChange(win.devicePixelRatio || 1);
    };
    function arm() {
        query?.removeEventListener?.('change', handler);
        query = win.matchMedia(`(resolution: ${win.devicePixelRatio || 1}dppx)`);
        // lifetime: paired (removed by the function this returns, and each time the query is made again)
        query.addEventListener?.('change', handler);
    }
    arm();
    return () => {
        stopped = true;
        query?.removeEventListener?.('change', handler);
        query = null;
    };
}
