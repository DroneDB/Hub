// @ts-check
/**
 * HTML of the popup shown over a measured or imported map point: the optional
 * name, the coordinates in DMS and decimal degrees, the description and, for imported
 * points, edit/copy/delete buttons. Shared by the measure control and the importer.
 */
import Overlay from 'ol/Overlay';
import { toDms } from '@/libs/format';
import { escapeHtml } from '@/libs/sanitize';
import { PRIMARY } from '@/libs/palette';
import { placeOverlay, mapRailReserve } from '@/libs/map/overlayPlacement';
import { unByKey } from 'ol/Observable';

const DEFAULT_ACCENT = PRIMARY[500];

// The popup is above its point; placeOverlay puts it below when there is no room above (FR-MAP-26)
const POPUP_PLACEMENT = Object.freeze({ positioning: 'bottom-center', offset: [0, -12] });
/** The class of a popup below its point: its arrow points up */
export const POPUP_BELOW_CLASS = 'ol-point-popup-below';

/**
 * @param {number} lat
 * @param {number} lon
 */
export function pointCoordinates(lat, lon) {
    return { dmsLat: toDms(lat, 'lat'), dmsLon: toDms(lon, 'lon'), ddLat: lat.toFixed(6), ddLon: lon.toFixed(6) };
}

/**
 * @param {{ lat: number, lon: number, name?: string, accent?: string, description?: string, actions?: boolean }} point
 * @returns {string}
 */
export function pointPopupHtml({ lat, lon, name, accent, description, actions = false }) {
    const { dmsLat, dmsLon, ddLat, ddLon } = pointCoordinates(lat, lon);
    const color = escapeHtml(accent || DEFAULT_ACCENT);
    const headerHtml = name
        ? `<div class="ol-point-popup-header" style="border-left-color:${color}">
                <i class="fa-solid fa-location-dot" style="color:${color}" aria-hidden="true"></i>
                <span class="ol-point-popup-title">${escapeHtml(name)}</span>
           </div>`
        : '';
    const descHtml = description
        ? `<div class="ol-point-popup-description">${escapeHtml(description)}</div>`
        : '';
    const actionsHtml = actions
        ? `<div class="ol-point-popup-actions">
                <button class="image-popup-btn ol-point-popup-edit" title="Edit annotation" aria-label="Edit annotation"><i style="margin: 0" class="fa-solid fa-pencil" aria-hidden="true"></i></button>
                <button class="image-popup-btn ol-point-popup-copy" title="Copy coordinates" aria-label="Copy coordinates"><i style="margin: 0" class="fa-regular fa-copy" aria-hidden="true"></i></button>
                <button class="image-popup-btn ol-point-popup-delete" title="Delete point" aria-label="Delete point"><i style="margin: 0" class="fa-solid fa-trash" aria-hidden="true"></i></button>
            </div>`
        : '';
    return `
        ${headerHtml}
        <div class="ol-point-popup-body">
            <div class="ol-point-popup-coords">
                <span class="ol-point-popup-dms" title="Degrees Minutes Seconds">
                    <i class="fa-solid fa-compass ol-point-popup-coord-icon" aria-hidden="true"></i>${dmsLat} / ${dmsLon}
                </span>
                <span class="ol-point-popup-dd" title="Decimal Degrees">
                    <i class="fa-solid fa-hashtag ol-point-popup-coord-icon" aria-hidden="true"></i>${ddLat} / ${ddLon}
                </span>
                ${descHtml}
            </div>
            ${actionsHtml}
        </div>
    `;
}

/**
 * The popups a map shows now, and the listeners that keep them in view: one `moveend` listener and
 * one listener of the map's overlays for the whole map, however many popups there are (FR-MAP-26).
 * @typedef {{ popups: Map<Overlay, HTMLElement>, pending: Set<Overlay>, keys: import('ol/events').EventsKey[], renderKey: any }} MapPopups
 */
/** @type {WeakMap<import('ol/Map').default, MapPopups>} */
const popupsOfMap = new WeakMap();

/**
 * Puts each popup above its point, or below it when there is no room above. Every size and pixel is
 * read before any placement is written, so hundreds of popups cost one layout, not one each.
 * @param {import('ol/Map').default} map
 * @param {Iterable<[Overlay, HTMLElement]>} popups
 * @returns {Overlay[]}  the popups that could not be placed (the map or the popup has no size yet)
 */
function placePopups(map, popups) {
    const mapSize = map.getSize();
    const railReserve = mapSize ? mapRailReserve(map) : 0;
    const measured = [];
    for (const [overlay, element] of popups) {
        const coordinate = overlay.getPosition();
        const pixel = mapSize && coordinate ? map.getPixelFromCoordinate(coordinate) : null;
        measured.push({ overlay, element, pixel, size: pixel ? [element.offsetWidth, element.offsetHeight] : [0, 0] });
    }
    /** @type {Overlay[]} */
    const unplaced = [];
    for (const { overlay, element, pixel, size } of measured) {
        if (!mapSize || !pixel || !(size[0] > 0) || !(size[1] > 0)) {
            unplaced.push(overlay);
            continue;
        }
        const placement = placeOverlay({ pixel, size, mapSize, railReserve, base: POPUP_PLACEMENT });
        overlay.setPositioning(/** @type {any} */ (placement.positioning));
        overlay.setOffset(placement.offset);
        element.classList.toggle(POPUP_BELOW_CLASS, placement.positioning.startsWith('top'));
    }
    return unplaced;
}

/**
 * Drops a popup whose overlay left the map; the last one takes the map's listeners with it.
 * @param {import('ol/Map').default} map
 * @param {Overlay} overlay
 */
function forgetPopup(map, overlay) {
    const entry = popupsOfMap.get(map);
    if (!entry || !entry.popups.delete(overlay)) return;
    entry.pending.delete(overlay);
    if (entry.popups.size) return;
    unByKey(entry.keys);
    if (entry.renderKey) unByKey(entry.renderKey);
    popupsOfMap.delete(map);
}

/**
 * Keeps the popup in the visible map: below its point when there is no room above it, and again
 * every time the view moves (the point may come near an edge) until its overlay leaves the map. A
 * popup that has no size yet (the map is not laid out) is placed on the first render.
 * @param {import('ol/Map').default} map
 * @param {Overlay} overlay
 * @param {HTMLElement} element
 */
function keepPopupInView(map, overlay, element) {
    let entry = popupsOfMap.get(map);
    if (!entry) {
        /** @type {MapPopups} */
        const created = { popups: new Map(), pending: new Set(), keys: [], renderKey: null };
        // lifetime: paired (removed by forgetPopup with the last popup of the map)
        created.keys.push(
            map.on('moveend', () => placePopups(map, created.popups)),
            map.getOverlays().on('remove', event => forgetPopup(map, event.element))
        );
        popupsOfMap.set(map, created);
        entry = created;
    }
    const live = entry;
    live.popups.set(overlay, element);
    if (!placePopups(map, [[overlay, element]]).length) return;
    live.pending.add(overlay);
    if (live.renderKey) return;
    // lifetime: paired (one render; dropped by forgetPopup when the last popup goes first)
    live.renderKey = map.once('postrender', () => {
        live.renderKey = null;
        const waiting = [...live.pending].filter(o => live.popups.has(o));
        live.pending.clear();
        placePopups(map, waiting.map(o => /** @type {[Overlay, HTMLElement]} */ ([o, live.popups.get(o)])));
    });
}

/**
 * Puts the popup of a point on the map, over its feature, and keeps the element and the
 * overlay on the feature (`measureTooltipElement`, `measureTooltip`) for later cleanup.
 * @param {import('ol/Map').default} map
 * @param {import('ol/Feature').default} feature  the point; its name, stroke and description fill the popup
 * @param {{ lat: number, lon: number, coords: number[], actions?: boolean }} where  coords are the map coordinates of the point
 * @returns {{ popupEl: HTMLElement, popupOverlay: Overlay }}
 */
export function showPointPopup(map, feature, { lat, lon, coords, actions = false }) {
    const popupEl = document.createElement('div');
    popupEl.className = 'ol-point-popup';
    popupEl.innerHTML = pointPopupHtml({
        lat, lon, name: feature.get('name'), accent: feature.get('stroke'),
        description: feature.get('description') || '', actions
    });

    const popupOverlay = new Overlay({
        element: popupEl,
        offset: [...POPUP_PLACEMENT.offset],
        positioning: POPUP_PLACEMENT.positioning,
        stopEvent: true,
        insertFirst: false,
    });
    popupOverlay.setPosition(coords);
    map.addOverlay(popupOverlay);
    keepPopupInView(map, popupOverlay, popupEl);

    feature.set('measureTooltipElement', popupEl);
    feature.set('measureTooltip', popupOverlay);
    return { popupEl, popupOverlay };
}
