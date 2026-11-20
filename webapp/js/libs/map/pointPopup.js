// @ts-check
/**
 * The popup shown over a measured or imported map point: the optional name, the coordinates in
 * DMS and decimal degrees, the description and the edit/copy/delete buttons. Shared by the measure
 * control and the importer, so a point drawn, imported, edited or moved has the same popup.
 */
import Overlay from 'ol/Overlay';
import { toLonLat } from 'ol/proj';
import { copyText } from '@/composables/useCopyText';
import { latLonText, latLonDmsText } from '@/libs/format';
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
 * The class of a map (on its viewport) whose point popups show only while their point is hovered or
 * tapped (css/ol-controls.css); the popup shown then has POPUP_SHOWN_CLASS
 */
export const CALLOUTS_ON_HOVER_CLASS = 'ol-point-callouts-hover';
export const POPUP_SHOWN_CLASS = 'ol-point-popup-shown';

/**
 * The popup of a point: the optional name (a header in the point's colour), the description and the
 * move/edit/copy/delete buttons when asked for. The coordinates are not shown: the copy button names them in its
 * tooltip. Only a point with neither a name nor a description shows them, in decimal degrees ("latitude,
 * longitude", as they are copied; the same point in degrees, minutes, seconds is their tooltip), so that its
 * popup still says something.
 * @param {{ lat: number, lon: number, name?: string, accent?: string, description?: string, actions?: boolean }} point
 * @returns {string}
 */
export function pointPopupHtml({ lat, lon, name, accent, description, actions = false }) {
    const color = escapeHtml(accent || DEFAULT_ACCENT);
    const headerHtml = name
        ? `<div class="ol-point-popup-header" style="border-left-color:${color}">
                <i class="fa-solid fa-location-dot" style="color:${color}" aria-hidden="true"></i>
                <span class="ol-point-popup-title">${escapeHtml(name)}</span>
           </div>`
        : '';
    const coordinates = latLonText(lat, lon);
    let textHtml = '';
    if (description) textHtml = `<div class="ol-point-popup-description">${escapeHtml(description)}</div>`;
    else if (!name) textHtml = `<span class="ol-point-popup-coords" title="${escapeHtml(latLonDmsText(lat, lon))}">${coordinates}</span>`;
    const actionsHtml = actions
        ? `<div class="ol-point-popup-actions">
                <button class="image-popup-btn ol-point-popup-move" title="Move point: drag this handle to the new place" aria-label="Move point"><i style="margin: 0" class="fa-solid fa-up-down-left-right" aria-hidden="true"></i></button>
                <button class="image-popup-btn ol-point-popup-edit" title="Edit annotation" aria-label="Edit annotation"><i style="margin: 0" class="fa-solid fa-pencil" aria-hidden="true"></i></button>
                <button class="image-popup-btn ol-point-popup-copy" title="Copy coordinates: ${coordinates}" aria-label="Copy coordinates"><i style="margin: 0" class="fa-regular fa-copy" aria-hidden="true"></i></button>
                <button class="image-popup-btn ol-point-popup-delete" title="Delete point" aria-label="Delete point"><i style="margin: 0" class="fa-solid fa-trash" aria-hidden="true"></i></button>
            </div>`
        : '';
    return `
        ${headerHtml}
        <div class="ol-point-popup-body">
            ${textHtml ? `<div class="ol-point-popup-text">${textHtml}</div>` : ''}
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
 * Takes the label or popup a measurement keeps on its feature (`measureTooltip`,
 * `measureTooltipElement`) off the map.
 * @param {import('ol/Map').default} map
 * @param {import('ol/Feature').default} feature
 */
export function removeMeasureTooltip(map, feature) {
    const overlay = feature.get('measureTooltip');
    if (overlay && map) map.removeOverlay(overlay);
    const element = feature.get('measureTooltipElement');
    if (element && element.parentNode) element.parentNode.removeChild(element);
}

/**
 * Shows or hides the popup of a point on a map whose popups show on hover only (CALLOUTS_ON_HOVER_CLASS);
 * a popup shown is put in view as it appears (above its point, or below it near the top edge). A
 * feature without a point popup (a measurement with a label) is left as it is.
 * @param {import('ol/Map').default | null} map
 * @param {import('ol/Feature').default} feature
 * @param {boolean} shown
 */
export function setPointPopupShown(map, feature, shown) {
    const element = feature.get('measureTooltipElement');
    if (!element || !element.classList || !element.classList.contains('ol-point-popup')) return;
    element.classList.toggle(POPUP_SHOWN_CLASS, shown);
    const overlay = feature.get('measureTooltip');
    if (shown && map && overlay) placePopups(map, [[overlay, element]]);
}

/** How long the copy button shows its check mark after a copy */
const COPIED_FEEDBACK_MS = 1500;

/** The class of a popup whose point is being dragged by its move handle */
export const POPUP_MOVING_CLASS = 'ol-point-popup-moving';

/**
 * @typedef {import('ol/Feature').default} OlFeature
 * @typedef {{ onEdit: (feature: OlFeature) => void, onDelete: (feature: OlFeature) => void, onMoved: (feature: OlFeature, from: number[]) => void }} PointPopupActions
 * onMoved: the point was dragged to another place by the move handle (`from`: its map coordinates before)
 */

/**
 * The move handle of a point's popup: dragging it moves the point by the distance the pointer moves, so the popup,
 * which hangs from its point, stays under the pointer. The point is at its new place when the handle is released
 * (`onMoved`); Esc or a cancelled pointer put it back. The pointer is captured by the handle while it drags, so the
 * map does not pan and the moves keep coming when the pointer leaves the handle.
 * @param {import('ol/Map').default} map
 * @param {HTMLElement} popupEl
 * @param {Overlay} overlay  the overlay of the popup, at the point
 * @param {OlFeature} feature
 * @param {PointPopupActions['onMoved']} onMoved
 */
function wireMoveHandle(map, popupEl, overlay, feature, onMoved) {
    const handle = /** @type {HTMLElement} */ (popupEl.querySelector('.ol-point-popup-move'));
    const point = () => /** @type {import('ol/geom/Point').default} */ (feature.getGeometry());
    /** @type {{ pointerId: number, from: number[], start: number[], moved: boolean } | null} */
    let drag = null;

    const place = (/** @type {number[]} */ coordinate) => {
        point().setCoordinates(coordinate);
        overlay.setPosition(coordinate);
    };
    const end = (/** @type {boolean} */ keep) => {
        if (!drag) return;
        const { pointerId, from, moved } = drag;
        drag = null;
        document.removeEventListener('keydown', onKey, true);
        popupEl.classList.remove(POPUP_MOVING_CLASS);
        if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
        if (!moved) return;
        if (keep) onMoved(feature, from);
        else place(from);
    };
    const onKey = (/** @type {KeyboardEvent} */ e) => {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation();
        end(false);
    };

    // lifetime: element (the handle of this popup goes with it)
    handle.addEventListener('pointerdown', e => {
        if (e.button !== 0 || drag) return;
        e.preventDefault();
        e.stopPropagation();
        drag = { pointerId: e.pointerId, from: point().getCoordinates(), start: map.getEventCoordinate(e), moved: false };
        handle.setPointerCapture(e.pointerId);
        popupEl.classList.add(POPUP_MOVING_CLASS);
        // Esc while dragging puts the point back; removed by end()
        document.addEventListener('keydown', onKey, true);
    });
    // lifetime: element (the handle of this popup goes with it)
    handle.addEventListener('pointermove', e => {
        if (!drag || e.pointerId !== drag.pointerId) return;
        const at = map.getEventCoordinate(e);
        drag.moved = true;
        place([drag.from[0] + at[0] - drag.start[0], drag.from[1] + at[1] - drag.start[1]]);
    });
    // lifetime: element (the handle of this popup goes with it)
    handle.addEventListener('pointerup', e => { if (drag && e.pointerId === drag.pointerId) end(true); });
    // lifetime: element (the handle of this popup goes with it)
    handle.addEventListener('pointercancel', e => { if (drag && e.pointerId === drag.pointerId) end(false); });
    // A press is a drag, not a click
    // lifetime: element (the handle of this popup goes with it)
    handle.addEventListener('click', e => e.preventDefault());
}

/**
 * @param {import('ol/Map').default} map
 * @param {HTMLElement} popupEl
 * @param {Overlay} overlay  the overlay of the popup
 * @param {OlFeature} feature
 * @param {string} copied  the coordinates the copy button puts on the clipboard
 * @param {PointPopupActions} actions
 */
function wireActions(map, popupEl, overlay, feature, copied, { onEdit, onDelete, onMoved }) {
    const button = (/** @type {string} */ action) => /** @type {HTMLElement} */ (popupEl.querySelector(`.ol-point-popup-${action}`));
    wireMoveHandle(map, popupEl, overlay, feature, onMoved);
    // lifetime: element (the buttons of this popup go with it)
    button('edit').addEventListener('click', e => { e.preventDefault(); onEdit(feature); });
    // lifetime: element (the buttons of this popup go with it)
    button('copy').addEventListener('click', e => {
        e.preventDefault();
        copyText(copied).then(() => {
            const icon = button('copy').querySelector('i');
            if (!icon) return;
            icon.className = 'fa-solid fa-check';
            // lifetime: defer (restores the icon of a button that may be gone; harmless then)
            setTimeout(() => { icon.className = 'fa-regular fa-copy'; }, COPIED_FEEDBACK_MS);
        });
    });
    // lifetime: element (the buttons of this popup go with it)
    button('delete').addEventListener('click', e => { e.preventDefault(); onDelete(feature); });
}

/**
 * Puts the popup of a point on the map, over its feature, in place of the popup it had (a point has
 * one popup: showing it again after its name, colour, description or place changed replaces it), and
 * keeps the element and the overlay on the feature (`measureTooltipElement`, `measureTooltip`) for
 * later cleanup. The coordinates are read from the point's geometry (map coordinates, Web Mercator).
 * @param {import('ol/Map').default} map
 * @param {import('ol/Feature').default} feature  the point; its name, stroke and description fill the popup
 * @param {PointPopupActions | null} [actions]  the handlers of the move, edit and delete buttons; without
 *   them the popup has no buttons
 * @returns {{ popupEl: HTMLElement, popupOverlay: Overlay }}
 */
export function showPointPopup(map, feature, actions = null) {
    removeMeasureTooltip(map, feature);
    const coords = /** @type {import('ol/geom/Point').default} */ (feature.getGeometry()).getCoordinates();
    const [lon, lat] = toLonLat(coords);

    const popupEl = document.createElement('div');
    popupEl.className = 'ol-point-popup';
    popupEl.innerHTML = pointPopupHtml({
        lat, lon, name: feature.get('name'), accent: feature.get('stroke'),
        description: feature.get('description') || '', actions: !!actions
    });
    const popupOverlay = new Overlay({
        element: popupEl,
        offset: [...POPUP_PLACEMENT.offset],
        positioning: POPUP_PLACEMENT.positioning,
        stopEvent: true,
        insertFirst: false,
    });
    if (actions) wireActions(map, popupEl, popupOverlay, feature, latLonText(lat, lon), actions);
    popupOverlay.setPosition(coords);
    map.addOverlay(popupOverlay);
    keepPopupInView(map, popupOverlay, popupEl);

    feature.set('measureTooltipElement', popupEl);
    feature.set('measureTooltip', popupOverlay);
    return { popupEl, popupOverlay };
}
