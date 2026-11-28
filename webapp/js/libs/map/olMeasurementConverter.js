/**
 * Utility to convert OpenLayers measurements to GeoJSON and vice versa
 */

import { LineString, Polygon } from 'ol/geom';
import Feature from 'ol/Feature';
import Overlay from 'ol/Overlay';
import GeoJSON from 'ol/format/GeoJSON';
import { toLonLat } from 'ol/proj';
import { showPointPopup } from './pointPopup';
import { escapeHtml } from '@/libs/sanitize';
import { areaParts, lengthParts, stockpileLabel } from '@/libs/format';
import { EPSG } from '@/libs/constants';
import { geodesicArea, geodesicLength } from './geodesic';
import { STOCKPILE_PROPERTIES } from './stockpileStorage';
import { contourLevelText, CONTOUR_PROPERTIES, UNSAVED_FLAG } from './contourStorage';
import { write, sectionOf, VIEW } from './measurementFormat';
import { ANALYSIS_MEASUREMENT_TYPES, currentAnalysisColour } from './analysisStyles';
import { ANNOTATION_KEYS, annotationProperties, unknownProperties } from './annotationIds';
import { safeColour } from './measurementColour';

/**
 * The property of a feature that holds what its file says that the map does not know: it is written back as it
 * was, so a save does not lose what another tool (or a later version of the Hub) put in the file.
 */
const EXTRA_PROPERTIES = 'extraProperties';

// What the map computes itself from the geometry when it writes a measurement
const CALCULATED_PROPERTIES = ['area', 'areaValue', 'length', 'lengthValue', 'unit', 'displayValue', 'latitude', 'longitude'];

// What the map reads and writes of every measurement; a feature may have more, which it keeps (unknownProperties)
const KNOWN_PROPERTIES = new Set([
    'measurementType', 'unitPreference', 'name', 'description', 'tooltipText', 'createdAt',
    'stroke', 'stroke-width', 'stroke-opacity', 'fill', 'fill-opacity', 'groupId',
    ...CALCULATED_PROPERTIES, ...ANNOTATION_KEYS
]);
// A stockpile has its own: its metrics, and the `notes` that an earlier version called its description
const KNOWN_STOCKPILE_PROPERTIES = new Set([...KNOWN_PROPERTIES, ...STOCKPILE_PROPERTIES, 'notes']);
// A contour has its level and the unit of it, and the flag of one not saved yet, which a file never holds
const KNOWN_CONTOUR_PROPERTIES = new Set([...KNOWN_PROPERTIES, ...CONTOUR_PROPERTIES, UNSAVED_FLAG]);

/** @param {any} measurementType @returns {ReadonlySet<string>} the properties the map knows of a measurement of that type */
const knownProperties = measurementType => {
    if (measurementType === 'stockpile') return KNOWN_STOCKPILE_PROPERTIES;
    return measurementType === 'contour' ? KNOWN_CONTOUR_PROPERTIES : KNOWN_PROPERTIES;
};

/**
 * Convert an OpenLayers feature to a GeoJSON Feature
 * @param {ol.Feature} feature - OpenLayers feature
 * @param {string} unitPref - Unit preference ('metric' or 'imperial')
 * @returns {Object} GeoJSON Feature
 */
function featureToGeoJSON(feature, unitPref = 'metric') {
    const geometry = feature.getGeometry();
    const geometryType = geometry.getType();

    // Clone the feature to avoid modifying the original
    const clonedFeature = new Feature(geometry.clone());

    // Only copy safe properties (not circular references)
    // Includes GeoJSON styling conventions: stroke, stroke-width, stroke-opacity, fill, fill-opacity
    // and stockpile-specific metadata so saved stockpile features round-trip.
    const safeProperties = [
        'tooltipText', 'createdAt', 'measurementType',
        'name', 'description',
        'stroke', 'stroke-width', 'stroke-opacity',
        'fill', 'fill-opacity',
        'groupId',
        ...STOCKPILE_PROPERTIES
    ];
    safeProperties.forEach(prop => {
        const value = feature.get(prop);
        if (value !== undefined) {
            clonedFeature.set(prop, value);
        }
    });

    // Convert to GeoJSON using OpenLayers built-in formatter
    const format = new GeoJSON();
    const geoJsonFeature = JSON.parse(format.writeFeature(clonedFeature, {
        dataProjection: EPSG.WGS84,
        featureProjection: EPSG.WEB_MERCATOR
    }));

    // Determine measurement type and calculate values
    let measurementType = feature.get('measurementType');
    let calculatedValues = {};

    if (measurementType === 'stockpile') {
        // Stockpile features carry their own metrics; don't recompute geometry-derived values.
    } else if (measurementType === 'contour') {
        // A contour keeps its type and its level, in the unit of the raster (no length, whose unit would take its
        // place); the flag of one not saved yet is not written: a file holds saved contours
        CONTOUR_PROPERTIES.forEach(k => {
            const v = feature.get(k);
            if (v !== undefined) calculatedValues[k] = v;
        });
    } else if (measurementType === 'profile') {
        // Raster profile: keep the type and the saved tooltip; reuse length
        // calculations so we still record the polyline length for export.
        if (geometryType === 'LineString') {
            const length = geodesicLength(geometry);
            calculatedValues = calculateLengthValues(length, unitPref);
        }
    } else if (geometryType === 'Polygon') {
        // A polygon of another tool keeps its own type (a zone stays a zone): only one with none is an area
        measurementType = measurementType || 'area';
        const area = geodesicArea(geometry);
        calculatedValues = calculateAreaValues(area, unitPref);
    } else if (geometryType === 'LineString') {
        measurementType = measurementType || 'length';
        const length = geodesicLength(geometry);
        calculatedValues = calculateLengthValues(length, unitPref);
    } else if (geometryType === 'Point') {
        measurementType = 'point';
        // Convert point coordinates to WGS84 for storage
        const coords = geometry.getCoordinates();
        const [lon, lat] = toLonLat(coords);
        calculatedValues = {
            latitude: Math.round(lat * 1000000) / 1000000,
            longitude: Math.round(lon * 1000000) / 1000000
        };
    } else {
        measurementType = measurementType || 'unknown';
    }

    // Build properties
    const properties = {
        measurementType: measurementType,
        unitPreference: unitPref,
        ...calculatedValues,
        // Store name and description if available
        name: feature.get('name') || null,
        description: feature.get('description') || null,
        // Store the tooltip text if available
        tooltipText: feature.get('tooltipText') || null,
        createdAt: feature.get('createdAt') || new Date().toISOString(),
        // GeoJSON styling properties
        stroke: feature.get('stroke') || null,
        // An opacity of 0 is a value (a fill that is not drawn): only a missing one is left out
        'stroke-width': feature.get('stroke-width') ?? null,
        'stroke-opacity': feature.get('stroke-opacity') ?? null,
        fill: feature.get('fill') || null,
        'fill-opacity': feature.get('fill-opacity') ?? null,
        // Group assignment
        groupId: feature.get('groupId') || null
    };

    // The identity and the fields of the annotation (id, ref, category, ..., photos, snapshot)
    ANNOTATION_KEYS.forEach(k => {
        const v = feature.get(k);
        if (v !== undefined && v !== null) properties[k] = v;
    });

    // Stockpile features: persist all metadata fields without overwriting calculated values.
    if (measurementType === 'stockpile') {
        STOCKPILE_PROPERTIES.forEach(k => {
            const v = feature.get(k);
            if (v !== undefined && v !== null) properties[k] = v;
        });
    }

    // Remove null properties for cleaner GeoJSON
    Object.keys(properties).forEach(key => {
        if (properties[key] === null) {
            delete properties[key];
        }
    });

    // What the file said that the map does not know stays as it was (a value of null too), below what the map writes
    geoJsonFeature.properties = { ...feature.get(EXTRA_PROPERTIES), ...properties };
    // The GeoJSON id of a feature is its own, as the 3D viewer's are
    if (properties.id) geoJsonFeature.id = properties.id;

    return geoJsonFeature;
}

/**
 * The text of a measurement whose text is its size, from its geometry: an area or a length in the
 * user's units. Null for every other measurement (a stockpile summary, a profile, a point), whose
 * text is not derived from its size and is kept as it is.
 * @param {ol.geom.Geometry} geometry
 * @param {string} measurementType
 * @param {string} unitPref - 'metric' or 'imperial'
 * @returns {string|null}
 */
export function measurementSizeText(geometry, measurementType, unitPref) {
    if (measurementType === 'area' && geometry instanceof Polygon) return areaParts(geodesicArea(geometry), unitPref).text;
    if (measurementType === 'length' && geometry instanceof LineString) return lengthParts(geodesicLength(geometry), unitPref).text;
    return null;
}

/** @param {unknown} value @returns {boolean} whether a style property of a file has a value (0 is one) */
const hasValue = value => !!value || value === 0;

/** The size kind of an untyped geometry: 'area' for a polygon, 'length' for a line, else null */
function sizeKind(geometry) {
    if (geometry instanceof Polygon) return 'area';
    if (geometry instanceof LineString) return 'length';
    return null;
}

/**
 * Convert a GeoJSON Feature to an OpenLayers feature
 * @param {Object} geoJsonFeature - GeoJSON Feature
 * @param {string} unitPref - Unit preference the sizes are shown in ('metric' or 'imperial')
 * @returns {ol.Feature} OpenLayers feature
 */
function geoJSONToFeature(geoJsonFeature, unitPref) {
    const format = new GeoJSON();
    const feature = format.readFeature(geoJsonFeature, {
        dataProjection: EPSG.WGS84,
        featureProjection: EPSG.WEB_MERCATOR
    });

    const props = geoJsonFeature.properties;
    const geometry = feature.getGeometry();

    // Restore properties
    feature.set('measurementType', props.measurementType);
    feature.set('unitPreference', props.unitPreference);
    feature.set('createdAt', props.createdAt);

    // Restore the identity and the fields of the annotation, and what the file says that the map does not know
    Object.entries(annotationProperties(props)).forEach(([key, value]) => feature.set(key, value));
    const extra = unknownProperties(props, knownProperties(props.measurementType));
    if (Object.keys(extra).length) feature.set(EXTRA_PROPERTIES, extra);

    // Restore name and description
    if (props.name) feature.set('name', props.name);
    if (props.description) feature.set('description', props.description);

    // Restore stockpile-specific metadata so the panel can re-hydrate.
    if (props.measurementType === 'stockpile') {
        STOCKPILE_PROPERTIES.forEach(k => {
            if (props[k] !== undefined && props[k] !== null) feature.set(k, props[k]);
        });
        // Backwards compatibility: stockpiles persisted before the
        // notes->description rename used a `notes` property. Mirror it
        // into `description` so the panel surfaces the value, and so the
        // next round-trip drops the legacy key.
        if (!props.description && props.notes) {
            feature.set('description', props.notes);
        }
    }

    // Restore GeoJSON styling properties; a stockpile or a profile saved in the orange of the
    // earlier analysis overlays takes today's yellow
    const colour = ANALYSIS_MEASUREMENT_TYPES.includes(props.measurementType) ? currentAnalysisColour : c => c;
    // A colour of the file is used only when it is a hexadecimal one (it reaches style attributes); any other is the default
    // (the reader of the file copies every property onto the feature as it is: an unusable colour is taken off it)
    const stroke = safeColour(props.stroke);
    const fill = safeColour(props.fill);
    if (!stroke) feature.unset('stroke');
    if (!fill) feature.unset('fill');
    if (stroke) feature.set('stroke', colour(stroke));
    if (props['stroke-width']) feature.set('stroke-width', props['stroke-width']);
    if (hasValue(props['stroke-opacity'])) feature.set('stroke-opacity', props['stroke-opacity']);
    if (fill) feature.set('fill', colour(fill));
    if (hasValue(props['fill-opacity'])) feature.set('fill-opacity', props['fill-opacity']);
    // Restore group assignment
    if (props.groupId) feature.set('groupId', props.groupId);

    // An area or a length shows its size in today's units, not the text it was saved with (which
    // may be in other units or an older format); a stockpile builds its label from its stored metric
    // properties in today's units; a contour shows its level (an older Hub saved its length); other
    // measurements keep their text. A feature saved without text gets its size, as its geometry gives it.
    const tooltipText = measurementSizeText(geometry, props.measurementType, unitPref)
        || (props.measurementType === 'contour' ? contourLevelText(props) : null)
        || (props.measurementType === 'stockpile' && typeof props.netVolume === 'number' ? stockpileLabel(props, unitPref) : null)
        || props.tooltipText
        || measurementSizeText(geometry, sizeKind(geometry), unitPref);

    feature.set('tooltipText', tooltipText);

    return feature;
}

/**
 * Update the tooltip content for a feature (e.g., after editing properties)
 * @param {ol.Feature} feature - Feature to update tooltip for
 */
export function updateFeatureTooltip(feature) {
    const tooltipElement = feature.get('measureTooltipElement');
    if (!tooltipElement) return;

    tooltipElement.innerHTML = measurementTooltipHtml(feature.get('name'), feature.get('tooltipText'));
}

/**
 * The HTML of the label of a measurement: its name (when it has one) above its text. Both are plain
 * text, and may come from a saved measurements file (the name, a stockpile's material in the text),
 * so both are escaped: a name such as `<img src=x onerror=...>` shows as it is written.
 * @param {unknown} name
 * @param {unknown} text
 * @returns {string}
 */
export function measurementTooltipHtml(name, text) {
    let html = '';
    if (name) html += `<div class="ol-tooltip-name">${escapeHtml(name)}</div>`;
    if (text) html += `<div class="ol-tooltip-value">${escapeHtml(text)}</div>`;
    return html;
}

/**
 * Whether the map can draw and write back a measurement of this geometry type: a point only when it is a point
 * measurement (a Point with no type is a plain feature of another tool), a line or a polygon of any type. What it
 * cannot is carried through a save as it is (see importMeasurements).
 * @param {string | undefined} geometryType  a GeoJSON geometry type
 * @param {unknown} measurementType
 * @returns {boolean}
 */
function isMapMeasurement(geometryType, measurementType) {
    if (geometryType === 'Point') return measurementType === 'point';
    return geometryType === 'LineString' || geometryType === 'Polygon';
}

/**
 * Export all measurements in GeoJSON format: the document of the map's measurements (its features and
 * its section of the file, with the groups), which the storage merges into the file next to the 3D
 * viewer's.
 * @param {ol.source.Vector} source - OpenLayers vector source
 * @param {string} orthophotoPath - Orthophoto file path
 * @param {string} unitPref - Unit preference
 * @param {Array} [groups] - Measurement groups (optional, for serialization)
 * @param {Set<ol.Feature>|null} [only] - Only these features (a part of the measurements downloaded on its own): the
 *   groups are then the ones they belong to
 * @param {Object[]} [carried] - The features of the file that the map cannot draw (importMeasurements gives them),
 *   written as they were read; left out when `only` is given
 * @returns {Object} GeoJSON FeatureCollection
 */
export function exportMeasurements(source, orthophotoPath, unitPref = 'metric', groups = [], only = null, carried = []) {
    const kept = only ? source.getFeatures().filter(f => only.has(f)) : source.getFeatures();
    if (only) {
        const used = new Set(kept.map(f => f.get('groupId')).filter(Boolean));
        groups = groups.filter(g => used.has(g.id));
    }
    const features = kept
        .filter(f => {
            // Only export actual measurement features (not temporary draw features)
            const geom = f.getGeometry();
            return !!geom && isMapMeasurement(geom.getType(), f.get('measurementType'));
        })
        .map(f => featureToGeoJSON(f, unitPref));

    return write(null, VIEW.MAP, only ? features : [...features, ...carried], { orthophotoFile: orthophotoPath, unitPreference: unitPref, groups });
}

/**
 * Import measurements from GeoJSON into the source
 * @param {Object} geojson - GeoJSON FeatureCollection
 * @param {ol.source.Vector} source - OpenLayers vector source
 * @param {string} unitPref - Unit preference the sizes are shown in ('metric' or 'imperial')
 * @param {ol.Map} map - OpenLayers map instance
 * @param {import('./pointPopup').PointPopupActions} [pointActions] - The handlers of the edit and delete
 *   buttons of the popups of the points
 * @returns {{ features: ol.Feature[], groups: Array, carried: Object[] }} The imported features, the groups of the map's section,
 *   and `carried`: the features of the file that the map cannot draw or write back (a point with no type, a geometry
 *   other than a point, a line or a polygon, no geometry, a feature that cannot be read). They are not put on the
 *   map; exportMeasurements writes them as they are, so a save does not lose what another tool put in the file.
 */
export function importMeasurements(geojson, source, unitPref, map, pointActions) {
    if (!geojson || !geojson.features) {
        console.warn('Invalid GeoJSON data');
        return [];
    }

    const imported = [];
    /** @type {Object[]} */
    const carried = [];

    geojson.features.forEach(geoJsonFeature => {
        const readable = geoJsonFeature && geoJsonFeature.geometry && geoJsonFeature.properties;
        if (!readable || !isMapMeasurement(geoJsonFeature.geometry.type, geoJsonFeature.properties.measurementType)) {
            carried.push(geoJsonFeature);
            return;
        }
        let feature;
        try {
            feature = geoJSONToFeature(geoJsonFeature, unitPref);
        } catch (e) {
            console.error('Error importing measurement:', e, geoJsonFeature);
            carried.push(geoJsonFeature);
            return;
        }
        try {
            // Add the feature to the source
            source.addFeature(feature);

            // Create tooltip or popup for the feature
            if (feature.get('measurementType') === 'point' && map) {
                showPointPopup(map, feature, pointActions);
            } else {
                const tooltipText = feature.get('tooltipText');
                if (tooltipText && map) {
                    createStaticTooltip(feature, tooltipText, map);
                }
            }

            imported.push(feature);
        } catch (e) {
            console.error('Error importing measurement:', e, geoJsonFeature);
        }
    });

    console.log(`Imported ${imported.length} measurements`);

    // Return imported features AND the map's groups from metadata.views.map (for group state restoration)
    const { groups } = sectionOf(geojson, VIEW.MAP);
    return { features: imported, groups: Array.isArray(groups) ? groups : [], carried };
}

/**
 * Create a static tooltip for a measurement feature
 * @param {ol.Feature} feature - Feature to add tooltip to
 * @param {string} text - Tooltip text
 * @param {ol.Map} map - OpenLayers map instance
 */
function createStaticTooltip(feature, text, map) {
    const geometry = feature.getGeometry();
    const name = feature.get('name');

    // Create tooltip element
    const measureTooltipElement = document.createElement('div');
    // ol-tooltip-hidden makes the label invisible until the host toggles the
    // class off on hover - this keeps the map readable when many measurements
    // (especially many contour LineStrings) are present at once.
    measureTooltipElement.className = 'ol-tooltip ol-tooltip-static ol-tooltip-hidden';

    // Build tooltip content with optional name
    measureTooltipElement.innerHTML = measurementTooltipHtml(name, text);

    // Determine tooltip position based on geometry type
    let position;
    if (geometry instanceof Polygon) {
        position = geometry.getInteriorPoint().getCoordinates();
    } else if (geometry instanceof LineString) {
        position = geometry.getLastCoordinate();
    }

    if (position) {
        const measureTooltip = new Overlay({
            element: measureTooltipElement,
            offset: [0, -7],
            positioning: 'bottom-center',
            stopEvent: false,
            insertFirst: false,
        });
        measureTooltip.setPosition(position);
        map.addOverlay(measureTooltip);

        // Save reference for later cleanup
        feature.set('measureTooltipElement', measureTooltipElement);
        feature.set('measureTooltip', measureTooltip);
    }
}

// ============================================================================
// Helper Functions for Calculations
// ============================================================================

/**
 * Calculate and format area values
 * @param {number} area - Area in square meters
 * @param {string} unitPref - Unit preference
 * @returns {Object} Calculated values
 */
function calculateAreaValues(area, unitPref) {
    const { value, unit, text } = areaParts(area, unitPref);
    return { area: Math.round(area * 100) / 100, areaValue: value, unit, displayValue: text };
}

/**
 * Calculate and format length values
 * @param {number} length - Length in meters
 * @param {string} unitPref - Unit preference
 * @returns {Object} Calculated values
 */
function calculateLengthValues(length, unitPref) {
    const { value, unit, text } = lengthParts(length, unitPref);
    return { length: Math.round(length * 100) / 100, lengthValue: value, unit, displayValue: text };
}
