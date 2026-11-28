// @ts-check
/**
 * The annotations a report snapshot draws: each item in the colour of its category with a callout, the badge of its
 * display reference that the tables and the item pages show too. An item snapshot draws its item at full strength and
 * the other items at 40 %; an overview draws every item at full strength. Only items that have a geometry in WGS84 are
 * drawn (the model leaves the ones that are not georeferenced out, and this does not draw one it was given).
 */
import Feature from 'ol/Feature';
import GeoJSON from 'ol/format/GeoJSON';
import Point from 'ol/geom/Point';
import { Vector as VectorLayer } from 'ol/layer';
import { Vector as VectorSource } from 'ol/source';
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from 'ol/style';
import { asArray } from 'ol/color';
import { EPSG } from '@/libs/constants';
import { PRIMARY } from '@/libs/palette';

/** How strongly the other items of an item snapshot are drawn. */
export const OTHER_ITEMS_OPACITY = 0.4;

const LINE_WIDTH = 4;
const HALO_WIDTH = 8;
const POINT_RADIUS = 8;
const FILL_ALPHA = 0.22;
const CALLOUT_FONT = 'bold 18px Roboto, Arial, sans-serif';
const CALLOUT_TEXT = '#111827';
const HALO = 'rgba(255, 255, 255, 0.95)';

const format = new GeoJSON();

/** A colour OpenLayers can read, else the DroneDB blue. @param {unknown} colour @returns {string} */
export function readableColour(colour) {
    try {
        asArray(/** @type {any} */ (colour));
        return /** @type {string} */ (colour);
    } catch {
        return PRIMARY[500];
    }
}

/** @param {string} colour @param {number} alpha */
function withAlpha(colour, alpha) {
    const [r, g, b] = asArray(colour);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Where the callout of a geometry is anchored (map projection): a point is its own anchor, a line its middle, an area its
 * interior point (a callout on the centroid of a C-shaped area would sit outside it).
 * @param {import('ol/geom/Geometry').default} geometry
 * @returns {number[] | null}
 */
export function calloutAnchor(geometry) {
    const g = /** @type {any} */ (geometry);
    switch (geometry.getType()) {
        case 'Point': return g.getCoordinates();
        case 'LineString': return g.getCoordinateAt(0.5);
        case 'Polygon': return g.getInteriorPoint().getCoordinates().slice(0, 2);
        case 'MultiPoint': return g.getPoint(0)?.getCoordinates() ?? null;
        case 'MultiLineString': return g.getLineString(0)?.getCoordinateAt(0.5) ?? null;
        case 'MultiPolygon': return g.getInteriorPoints().getPoint(0)?.getCoordinates().slice(0, 2) ?? null;
        case 'GeometryCollection': {
            const first = g.getGeometries()[0];
            return first ? calloutAnchor(first) : null;
        }
        default: return null;
    }
}

/**
 * The styles of an item: its geometry on a white halo, and its callout at the anchor.
 * @param {{ ref: string, colour: string }} item
 * @param {import('ol/geom/Geometry').default} geometry
 * @returns {Style[]}
 */
export function itemStyles(item, geometry) {
    const colour = readableColour(item.colour);
    const isPoint = geometry.getType().endsWith('Point');
    const styles = [
        new Style({ stroke: new Stroke({ color: HALO, width: HALO_WIDTH }), zIndex: 1 }),
        new Style({
            stroke: new Stroke({ color: colour, width: LINE_WIDTH }),
            fill: new Fill({ color: withAlpha(colour, FILL_ALPHA) }),
            image: new CircleStyle({ radius: POINT_RADIUS, fill: new Fill({ color: colour }), stroke: new Stroke({ color: '#ffffff', width: 3 }) }),
            zIndex: 2
        })
    ];
    const anchor = calloutAnchor(geometry);
    if (anchor && item.ref) {
        styles.push(new Style({
            geometry: new Point(anchor),
            text: new Text({
                text: item.ref,
                font: CALLOUT_FONT,
                fill: new Fill({ color: CALLOUT_TEXT }),
                backgroundFill: new Fill({ color: '#ffffff' }),
                backgroundStroke: new Stroke({ color: colour, width: 3 }),
                padding: [4, 7, 3, 7],
                // A point's badge sits above its marker; the badge of a line or an area is on it
                offsetY: isPoint ? -(POINT_RADIUS + 16) : 0,
                overflow: true
            }),
            zIndex: 3
        }));
    }
    return styles;
}

/**
 * The feature of an item in the map projection, styled, or null when its geometry cannot be read.
 * @param {{ id: string, ref: string, colour: string, geometry: any }} item  a drawn item of a snapshot block
 * @returns {Feature | null}
 */
export function itemFeature(item) {
    if (!item || !item.geometry) return null;
    try {
        const geometry = format.readGeometry(item.geometry, { dataProjection: EPSG.WGS84, featureProjection: EPSG.WEB_MERCATOR });
        const feature = new Feature({ geometry, id: item.id, ref: item.ref });
        feature.setStyle(itemStyles(item, geometry));
        return feature;
    } catch {
        return null;
    }
}

/** @param {Feature[]} features @param {number} opacity */
function layerOf(features, opacity) {
    return new VectorLayer({ source: new VectorSource({ features }), opacity, updateWhileAnimating: true, updateWhileInteracting: true });
}

/**
 * The vector layers of a snapshot, bottom first: with an `itemId` the other items at 40 % and the item above them at
 * full strength; without one every item at full strength.
 * @param {any[]} items  the drawn items of the block
 * @param {string | null} itemId
 * @returns {VectorLayer<any>[]}
 */
export function itemLayers(items, itemId) {
    const features = (items || []).map(item => ({ item, feature: itemFeature(item) })).filter(f => f.feature);
    const isFocus = (/** @type {any} */ item) => !!itemId && item.id === itemId;
    if (!itemId) return [layerOf(features.map(f => /** @type {Feature} */ (f.feature)), 1)];
    return [
        layerOf(features.filter(f => !isFocus(f.item)).map(f => /** @type {Feature} */ (f.feature)), OTHER_ITEMS_OPACITY),
        layerOf(features.filter(f => isFocus(f.item)).map(f => /** @type {Feature} */ (f.feature)), 1)
    ];
}
