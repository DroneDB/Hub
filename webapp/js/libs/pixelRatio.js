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
