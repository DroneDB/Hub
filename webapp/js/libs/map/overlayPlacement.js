// @ts-check
/**
 * Keeps an overlay of the map (the label of a feature, the popup of a point) inside the visible
 * map (FR-MAP-19, FR-MAP-26): not under the toolbar rail on the right (the `--map-rail-reserve`
 * token of the map, css/ol-controls.css), not above its top edge, not below its bottom edge.
 * `placeOverlay` is the rule, from numbers; `keepOverlayInView` reads the map and applies it.
 */

/** What the tokens are when the map does not define them (the values of css/ol-controls.css) */
const FALLBACK_RAIL_PX = 64;
const FALLBACK_BOTTOM_PX = 64;
const FALLBACK_REM_PX = 16;

/**
 * @typedef {{ positioning: string, offset: number[] }} Placement  an OpenLayers overlay's positioning and offset
 */

/**
 * Where an overlay goes so that it stays in the map. `base` is the placement it prefers: the
 * horizontal part ('left': the overlay is on the right of its anchor, 'right': on the left,
 * 'center') and the vertical part ('top': below the anchor, 'bottom': above it, 'center') of
 * an OpenLayers positioning ('center-left', 'bottom-center', ...).
 * - on the right: when the overlay would reach into the rail it goes to the left of the anchor
 *   ('center-right', offset x mirrored);
 * - above (a popup): when there is no room above the anchor it goes below it ('top-center', offset y mirrored);
 * - beside (a label): when it would cross the top or the bottom edge it is aligned to that edge.
 * @param {{ pixel: number[], size: number[], mapSize: number[], railReserve?: number, base: Placement }} input
 *   `pixel` the anchor in the map, `size` the overlay's width and height, `mapSize` the map's.
 * @returns {Placement}
 */
export function placeOverlay({ pixel, size, mapSize, railReserve = FALLBACK_RAIL_PX, base }) {
    const [x, y] = pixel;
    const [width, height] = size;
    const [mapWidth, mapHeight] = mapSize;
    const [vertical, horizontal] = base.positioning.split('-');
    let [offsetX, offsetY] = base.offset;
    let v = vertical;
    let h = horizontal;

    if (h === 'left' && x + offsetX + width > mapWidth - railReserve) {
        h = 'right';
        offsetX = -offsetX;
    } else if (h === 'right' && x + offsetX - width < 0) {
        h = 'left';
        offsetX = -offsetX;
    }

    if (v === 'bottom') {
        // Above the anchor: its top is at y + offsetY - height
        if (y + offsetY - height < 0) {
            v = 'top';
            offsetY = -offsetY;
        }
    } else if (v === 'top') {
        if (y + offsetY + height > mapHeight) {
            v = 'bottom';
            offsetY = -offsetY;
        }
    } else if (v === 'center') {
        if (y - height / 2 < 0) v = 'top';
        else if (y + height / 2 > mapHeight) v = 'bottom';
    }

    return { positioning: `${v}-${h}`, offset: [offsetX, offsetY] };
}

/**
 * A length of a CSS custom property of the map in px ('4rem', '64px'); a fallback when it is not set.
 * @param {Element | null} element
 * @param {string} name
 * @param {number} fallback
 */
function tokenPx(element, name, fallback) {
    if (!element) return fallback;
    const value = getComputedStyle(element).getPropertyValue(name).trim();
    const number = parseFloat(value);
    if (!(number >= 0)) return fallback;
    if (value.endsWith('rem')) {
        const root = parseFloat(getComputedStyle(document.documentElement).fontSize);
        return number * (root > 0 ? root : FALLBACK_REM_PX);
    }
    return number;
}

/**
 * The width the toolbar rail keeps on the right of the map, in px (the `--map-rail-reserve` token).
 * @param {import('ol/Map').default} map
 * @returns {number}
 */
export function mapRailReserve(map) {
    return tokenPx(map.getTargetElement(), '--map-rail-reserve', FALLBACK_RAIL_PX);
}

/**
 * The height the bottom controls keep at the bottom of the map, in px (the `--map-bottom-reserve` token).
 * @param {import('ol/Map').default} map
 * @returns {number}
 */
export function mapBottomReserve(map) {
    return tokenPx(map.getTargetElement(), '--map-bottom-reserve', FALLBACK_BOTTOM_PX);
}

/**
 * Sets the positioning and the offset of an overlay from where its anchor is on the map now and
 * the size of its element, so it stays in view. Call it after the content and the position are
 * set, and again when the view moves. Nothing changes while the element has no size yet (not laid out).
 * @param {import('ol/Map').default} map
 * @param {import('ol/Overlay').default} overlay  positioned (setPosition)
 * @param {HTMLElement} element  the overlay's element
 * @param {Placement} base  the placement the overlay prefers (not the one it has now, which may be a flipped one)
 * @returns {Placement | null}  what was set, null when nothing could be decided
 */
export function keepOverlayInView(map, overlay, element, base) {
    const coordinate = overlay.getPosition();
    const mapSize = map.getSize();
    if (!coordinate || !mapSize) return null;
    const pixel = map.getPixelFromCoordinate(coordinate);
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    if (!pixel || !(width > 0) || !(height > 0)) return null;
    const railReserve = mapRailReserve(map);
    const placement = placeOverlay({ pixel, size: [width, height], mapSize, railReserve, base });
    overlay.setPositioning(/** @type {any} */ (placement.positioning));
    overlay.setOffset(placement.offset);
    return placement;
}
