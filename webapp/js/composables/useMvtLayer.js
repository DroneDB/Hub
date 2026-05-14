/**
 * Helpers shared between Map.vue and SingleMap.vue for rendering MVT vector layers
 * backed by the precomputed `/mvt/{hash}/{z}/{x}/{y}.pbf` tile pyramid served by Registry.
 *
 * Kept as plain JS helpers (not a Vue mixin) because the surrounding logic in the two
 * components — selection tracking, listener bookkeeping, zoom-to-extent — differs
 * enough that a mixin would be more confusing than helpful.
 */
import { VectorTile as VectorTileLayer } from 'ol/layer';
import { VectorTile as VectorTileSource } from 'ol/source';
import MVT from 'ol/format/MVT';
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style';
import { markRaw } from 'vue';
import { extractFeatureDisplayName } from '@/libs/propertiesUtils';

const SELECTED_COLOR_DEFAULT = 'rgba(255, 158, 103, 0.8)';

/**
 * Build the styles bundle for a vector layer (normal + selected variants).
 */
export function createMvtVectorStyles(color, selectedColor = SELECTED_COLOR_DEFAULT) {
    return {
        point: new Style({
            image: new CircleStyle({
                radius: 5,
                fill: new Fill({ color }),
                stroke: new Stroke({ color: 'rgba(255, 255, 255, 0.8)', width: 1.5 })
            })
        }),
        line: new Style({
            stroke: new Stroke({ color, width: 3 })
        }),
        polygon: new Style({
            fill: new Fill({ color: color.replace('0.8', '0.3') }),
            stroke: new Stroke({ color, width: 2 })
        }),
        pointSelected: new Style({
            image: new CircleStyle({
                radius: 6,
                fill: new Fill({ color: selectedColor }),
                stroke: new Stroke({ color: 'rgba(255, 255, 255, 0.8)', width: 2 })
            })
        }),
        lineSelected: new Style({
            stroke: new Stroke({ color: selectedColor, width: 4 })
        }),
        polygonSelected: new Style({
            fill: new Fill({ color: selectedColor.replace('0.8', '0.3') }),
            stroke: new Stroke({ color: selectedColor, width: 3 })
        })
    };
}

function pickStyle(styles, geometryType, selected) {
    const suffix = selected ? 'Selected' : '';
    if (geometryType.includes('Point')) return styles[`point${suffix}`];
    if (geometryType.includes('LineString')) return styles[`line${suffix}`];
    if (geometryType.includes('Polygon')) return styles[`polygon${suffix}`];
    return styles[`point${suffix}`];
}

/**
 * Build a style function compatible with RenderFeature emitted by MVT.
 *
 * @param {object} opts
 * @param {object} opts.styles    Result of createMvtVectorStyles().
 * @param {() => number} opts.getZoom         Returns the current map zoom (for labels).
 * @param {() => boolean} [opts.isSelected]   Optional, when omitted features are always
 *                                            rendered with the base styles.
 * @param {number} [opts.labelMinZoom=16]     Zoom threshold above which labels are drawn.
 */
export function createMvtStyleFunction({ styles, getZoom, isSelected, labelMinZoom = 16 }) {
    return function styleFn(feature) {
        const geometryType = feature.getType
            ? feature.getType()
            : (feature.getGeometry ? feature.getGeometry().getType() : 'Point');
        const selected = typeof isSelected === 'function' ? !!isSelected() : false;
        const base = pickStyle(styles, geometryType, selected);
        const style = base.clone();

        const zoom = typeof getZoom === 'function' ? getZoom() : 0;
        if (zoom >= labelMinZoom) {
            const label = extractFeatureDisplayName(feature.getProperties(), null);
            if (label && label !== 'Unknown feature') {
                style.setText(new Text({
                    text: label,
                    font: 'bold 0.75rem Arial, Helvetica, sans-serif',
                    fill: new Fill({ color: '#000' }),
                    stroke: new Stroke({ color: '#fff', width: 3 }),
                    offsetY: -15,
                    textAlign: 'center',
                    overflow: true,
                    maxAngle: 45
                }));
            }
        }

        return style;
    };
}

/**
 * Build a VectorTileLayer + VectorTileSource backed by the given MVT URL template.
 *
 * @returns {{ layer: VectorTileLayer, source: VectorTileSource }}
 */
export function createMvtVectorLayer({ urlTemplate, styleFunction, useMarkRaw = false }) {
    const source = new VectorTileSource({
        format: new MVT(),
        url: urlTemplate,
        minZoom: 0,
        maxZoom: 18,
        overlaps: false
    });

    const layerInstance = new VectorTileLayer({
        source,
        declutter: true,
        style: styleFunction
    });

    const layer = useMarkRaw ? markRaw(layerInstance) : layerInstance;
    return { layer, source };
}
