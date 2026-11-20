// @ts-check
import { defaults } from 'ol/control/defaults';
import { iconElement } from './controlButton';
import { ATTRIBUTION_ICON, COLLAPSE_ICON, NORTH_ICON, ZOOM_IN_ICON, ZOOM_OUT_ICON } from '@/libs/glyphs';

/**
 * The controls every OpenLayers map has (zoom, reset rotation, attribution), with glyphs of the Hub's set in their
 * buttons: OpenLayers writes characters of the page font there ("+", "−", "⇧", "i", "›"), which are smaller and
 * lighter than the glyphs of the buttons beside them.
 * @returns {import('ol/Collection').default<import('ol/control/Control').default>}
 */
export function defaultMapControls() {
    return defaults({
        zoomOptions: { zoomInLabel: iconElement(ZOOM_IN_ICON), zoomOutLabel: iconElement(ZOOM_OUT_ICON) },
        // OpenLayers turns the label with the map: the arrow points north
        rotateOptions: { label: iconElement(NORTH_ICON) },
        attributionOptions: { label: iconElement(ATTRIBUTION_ICON), collapseLabel: iconElement(COLLAPSE_ICON) }
    });
}
