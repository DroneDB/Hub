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

const DEFAULT_ACCENT = PRIMARY[500];

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
                <i class="fa-solid fa-location-dot" style="color:${color}"></i>
                <span class="ol-point-popup-title">${escapeHtml(name)}</span>
           </div>`
        : '';
    const descHtml = description
        ? `<div class="ol-point-popup-description">${escapeHtml(description)}</div>`
        : '';
    const actionsHtml = actions
        ? `<div class="ol-point-popup-actions">
                <button class="image-popup-btn ol-point-popup-edit" title="Edit annotation" aria-label="Edit annotation"><i style="margin: 0" class="fa-solid fa-pencil"></i></button>
                <button class="image-popup-btn ol-point-popup-copy" title="Copy coordinates" aria-label="Copy coordinates"><i style="margin: 0" class="fa-regular fa-copy"></i></button>
                <button class="image-popup-btn ol-point-popup-delete" title="Delete point" aria-label="Delete point"><i style="margin: 0" class="fa-solid fa-trash"></i></button>
            </div>`
        : '';
    return `
        ${headerHtml}
        <div class="ol-point-popup-body">
            <div class="ol-point-popup-coords">
                <span class="ol-point-popup-dms" title="Degrees Minutes Seconds">
                    <i class="fa-solid fa-compass ol-point-popup-coord-icon"></i>${dmsLat} / ${dmsLon}
                </span>
                <span class="ol-point-popup-dd" title="Decimal Degrees">
                    <i class="fa-solid fa-hashtag ol-point-popup-coord-icon"></i>${ddLat} / ${ddLon}
                </span>
                ${descHtml}
            </div>
            ${actionsHtml}
        </div>
    `;
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
        offset: [0, -12],
        positioning: 'bottom-center',
        stopEvent: true,
        insertFirst: false,
    });
    popupOverlay.setPosition(coords);
    map.addOverlay(popupOverlay);

    feature.set('measureTooltipElement', popupEl);
    feature.set('measureTooltip', popupOverlay);
    return { popupEl, popupOverlay };
}
