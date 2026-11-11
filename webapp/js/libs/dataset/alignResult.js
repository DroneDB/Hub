// @ts-check
/**
 * The result of an Align (align-raster) task, in words: what the Align window keeps on screen when the task is
 * done, and what the toast of the page says. The numbers go through the one formatter (libs/format, FR-XC-08).
 */
import { formatNumber } from '@/libs/format';

/**
 * @typedef {object} AlignResult
 * @property {number} [tx]  the shift east, in metres
 * @property {number} [ty]  the shift north, in metres
 * @property {number} [thetaDeg]  the rotation, in degrees
 * @property {number} [scale]
 * @property {number} [confidence]
 */

/**
 * "tx=-3.000 m, ty=2.000 m, θ=0.000°, s=1.00000, conf=1.00"
 * @param {AlignResult | null | undefined} result
 */
export function formatAlignResult(result) {
    if (!result) return '';
    return `tx=${formatNumber(result.tx, 3)} m, ty=${formatNumber(result.ty, 3)} m, θ=${formatNumber(result.thetaDeg, 3)}°, `
        + `s=${formatNumber(result.scale, 5)}, conf=${formatNumber(result.confidence, 2)}`;
}
