// @ts-check
/**
 * The size of a split pane in CSS px (FR-EXP-40). A pane is asked for in px or rem, or as a CSS length that only the
 * browser can resolve (`var(--ddb-panel-tree-width)`, a clamp of vw units): the Splitter of PrimeVue takes percents,
 * so a size is resolved to px, kept in px and converted to the percent of the container it has now.
 */

/** The size of the root font when none can be read (the browser default) */
const DEFAULT_ROOT_FONT_PX = 16;

/**
 * The width in px of a CSS length.
 * - `320px` and `20rem` are read as numbers (a rem is the root font size).
 * - Anything else (`var(--token)`, `clamp(15rem, 18vw, 22.5rem)`) is laid out: a hidden probe with that width is put in
 *   `host`, measured and removed.
 * @param {string} value
 * @param {Element|null} host  where the probe goes; none or an unresolvable value: null
 * @returns {number|null} a positive width, or null when the value cannot be resolved
 */
export function resolveLengthPx(value, host) {
    const text = String(value ?? '').trim();
    if (!text) return null;
    const literal = /^(\d+(?:\.\d+)?)(px|rem)$/.exec(text);
    if (literal) {
        const n = parseFloat(literal[1]);
        if (literal[2] === 'px') return n > 0 ? n : null;
        const root = typeof document !== 'undefined' ? parseFloat(getComputedStyle(document.documentElement).fontSize) : NaN;
        const px = n * (Number.isFinite(root) && root > 0 ? root : DEFAULT_ROOT_FONT_PX);
        return px > 0 ? px : null;
    }
    if (!host || typeof document === 'undefined') return null;
    const probe = document.createElement('div');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = `position: absolute; visibility: hidden; pointer-events: none; height: 0; overflow: hidden; width: ${text};`;
    host.appendChild(probe);
    const width = probe.getBoundingClientRect().width;
    probe.remove();
    return Number.isFinite(width) && width > 0 ? width : null;
}

/**
 * The percent of a container that a width in px is, kept inside the limits of a pane.
 * @param {number} px
 * @param {number} containerPx
 * @param {number} minPercent  the smallest size of a pane; the other pane keeps the same
 * @returns {number|null} null when the container has no width yet
 */
export function pxToPercent(px, containerPx, minPercent) {
    if (!(containerPx > 0) || !Number.isFinite(px)) return null;
    const percent = (px / containerPx) * 100;
    return Math.min(100 - minPercent, Math.max(minPercent, percent));
}

/**
 * A width in px kept inside a container that got narrower: the other pane keeps `reservePx` (or the minimum of a pane
 * when the container is narrower than that). The width that was asked for is not changed, only the one that is shown.
 * @param {number} px
 * @param {number} containerPx
 * @param {number} reservePx   what the other pane keeps
 * @param {number} minPercent  the smallest size of a pane
 * @returns {number}
 */
export function capPaneWidth(px, containerPx, reservePx, minPercent) {
    if (!(containerPx > 0)) return px;
    return Math.min(px, Math.max(containerPx - reservePx, (containerPx * minPercent) / 100));
}

/**
 * The width in px that a percent of a container is.
 * @param {number} percent
 * @param {number} containerPx
 * @returns {number}
 */
export function percentToPx(percent, containerPx) {
    return (percent / 100) * containerPx;
}
