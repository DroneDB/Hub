// @ts-check
/**
 * Toolbar zones of the dataset map: flex columns
 * inside the map's stop-event overlay container, so controls stack without overlapping
 * and clicks on them never reach the map. Vue toolbars teleport into them; OpenLayers
 * controls are moved in with `moveToZone`.
 */

/**
 * @param {import('ol').Map} map
 * @returns {{ topLeft: HTMLElement, topRight: HTMLElement, topCenter: HTMLElement, bottomLeft: HTMLElement }}
 */
export function createControlZones(map) {
    const stop = map.getOverlayContainerStopEvent();
    /** @param {string} cls */
    const make = cls => {
        const el = document.createElement('div');
        el.className = 'ol-zone ' + cls;
        stop.appendChild(el);
        return el;
    };
    return {
        topLeft: make('ol-zone-top-left'),
        topRight: make('ol-zone-top-right'),
        topCenter: make('ol-zone-top-center'),
        bottomLeft: make('ol-zone-bottom-left')
    };
}

/**
 * Moves an OpenLayers control's element into a zone.
 * @param {{ element?: HTMLElement } | null | undefined} control
 * @param {HTMLElement} zone
 */
export function moveToZone(control, zone) {
    if (control && control.element && zone) zone.appendChild(control.element);
}
