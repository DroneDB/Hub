/**
 * Utility to convert OpenLayers measurements to GeoJSON and vice versa
 */

import { getArea, getLength } from 'ol/sphere';
import { LineString, Polygon, Point } from 'ol/geom';
import Feature from 'ol/Feature';
import Overlay from 'ol/Overlay';
import GeoJSON from 'ol/format/GeoJSON';
import { toLonLat } from 'ol/proj';
import { pointCoordinates, pointPopupHtml } from './pointPopup';
import { copyText } from '@/composables/useCopyText';
import { areaParts, lengthParts } from '@/libs/format';
import { EPSG } from '@/libs/constants';

/**
 * Convert an OpenLayers feature to a GeoJSON Feature
 * @param {ol.Feature} feature - OpenLayers feature
 * @param {string} unitPref - Unit preference ('metric' or 'imperial')
 * @returns {Object} GeoJSON Feature
 */
export function featureToGeoJSON(feature, unitPref = 'metric') {
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
        // Stockpile metadata
        'id', 'title', 'material', 'materialDensity',
        'netVolume', 'cutVolume', 'fillVolume',
        'area2d', 'area3d', 'baseElevation', 'confidence',
        'weightEstimate', 'costEstimate', 'unitSystem', 'savedAt'
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
    } else if (measurementType === 'profile') {
        // Raster profile: keep the type and the saved tooltip; reuse length
        // calculations so we still record the polyline length for export.
        if (geometryType === 'LineString') {
            const length = getLength(geometry);
            calculatedValues = calculateLengthValues(length, unitPref);
        }
    } else if (geometryType === 'Polygon') {
        measurementType = 'area';
        const area = getArea(geometry);
        calculatedValues = calculateAreaValues(area, unitPref);
    } else if (geometryType === 'LineString') {
        measurementType = 'length';
        const length = getLength(geometry);
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
        'stroke-width': feature.get('stroke-width') || null,
        'stroke-opacity': feature.get('stroke-opacity') || null,
        fill: feature.get('fill') || null,
        'fill-opacity': feature.get('fill-opacity') || null,
        // Group assignment
        groupId: feature.get('groupId') || null
    };

    // Stockpile features: persist all metadata fields without overwriting calculated values.
    if (measurementType === 'stockpile') {
        const stockpileFields = [
            'id', 'title', 'material', 'materialDensity',
            'netVolume', 'cutVolume', 'fillVolume',
            'area2d', 'area3d', 'baseElevation', 'confidence',
            'weightEstimate', 'costEstimate', 'unitSystem', 'savedAt'
        ];
        stockpileFields.forEach(k => {
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

    geoJsonFeature.properties = properties;

    return geoJsonFeature;
}

/**
 * Convert a GeoJSON Feature to an OpenLayers feature
 * @param {Object} geoJsonFeature - GeoJSON Feature
 * @param {Function} formatArea - Function to format area values
 * @param {Function} formatLength - Function to format length values
 * @returns {ol.Feature} OpenLayers feature
 */
export function geoJSONToFeature(geoJsonFeature, formatArea, formatLength) {
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

    // Restore name and description
    if (props.name) feature.set('name', props.name);
    if (props.description) feature.set('description', props.description);

    // Restore stockpile-specific metadata so the panel can re-hydrate.
    if (props.measurementType === 'stockpile') {
        const stockpileFields = [
            'id', 'title', 'material', 'materialDensity',
            'netVolume', 'cutVolume', 'fillVolume',
            'area2d', 'area3d', 'baseElevation', 'confidence',
            'weightEstimate', 'costEstimate', 'unitSystem', 'savedAt'
        ];
        stockpileFields.forEach(k => {
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

    // Restore GeoJSON styling properties
    if (props.stroke) feature.set('stroke', props.stroke);
    if (props['stroke-width']) feature.set('stroke-width', props['stroke-width']);
    if (props['stroke-opacity']) feature.set('stroke-opacity', props['stroke-opacity']);
    if (props.fill) feature.set('fill', props.fill);
    if (props['fill-opacity']) feature.set('fill-opacity', props['fill-opacity']);
    // Restore group assignment
    if (props.groupId) feature.set('groupId', props.groupId);

    // Calculate and format the tooltip text
    let tooltipText = props.tooltipText;

    if (!tooltipText) {
        if (geometry instanceof Polygon && formatArea) {
            tooltipText = formatArea(geometry);
        } else if (geometry instanceof LineString && formatLength) {
            tooltipText = formatLength(geometry);
        }
    }

    feature.set('tooltipText', tooltipText);

    // Store point coordinate data for re-creating popup on import
    if (props.latitude !== undefined && props.longitude !== undefined) {
        feature.set('pointLatitude', props.latitude);
        feature.set('pointLongitude', props.longitude);
    }

    return feature;
}

/**
 * Update the tooltip content for a feature (e.g., after editing properties)
 * @param {ol.Feature} feature - Feature to update tooltip for
 */
export function updateFeatureTooltip(feature) {
    const tooltipElement = feature.get('measureTooltipElement');
    if (!tooltipElement) return;

    const name = feature.get('name');
    const tooltipText = feature.get('tooltipText');

    let tooltipContent = '';
    if (name) {
        tooltipContent += `<div class="ol-tooltip-name">${name}</div>`;
    }
    if (tooltipText) {
        tooltipContent += `<div class="ol-tooltip-value">${tooltipText}</div>`;
    }
    tooltipElement.innerHTML = tooltipContent;
}

/**
 * Export all measurements in GeoJSON format
 * @param {ol.source.Vector} source - OpenLayers vector source
 * @param {string} orthophotoPath - Orthophoto file path
 * @param {string} unitPref - Unit preference
 * @param {Array} [groups] - Measurement groups (optional, for serialization)
 * @returns {Object} GeoJSON FeatureCollection
 */
export function exportMeasurements(source, orthophotoPath, unitPref = 'metric', groups = []) {
    const features = source.getFeatures();

    const geojson = {
        type: 'FeatureCollection',
        crs: {
            type: 'name',
            properties: {
                name: EPSG.WGS84 // Output is always in WGS84
            }
        },
        metadata: {
            version: groups && groups.length > 0 ? '1.1' : '1.0',
            kind: 'measurements',
            orthophotoFile: orthophotoPath,
            createdAt: new Date().toISOString(),
            modifiedAt: new Date().toISOString(),
            // Standardized identifier across all DroneDB-Registry-written
            // measurement files. Older values ("Registry-Orthophoto",
            // "Registry-Stockpile") are still accepted by the importer.
            application: 'DroneDB Registry',
            unitPreference: unitPref,
            // Serialize groups only when they exist (retrocompat: omit when empty)
            ...(groups && groups.length > 0 ? { groups } : {})
        },
        features: features
            .filter(f => {
                // Only export actual measurement features (not temporary draw features)
                const geom = f.getGeometry();
                const hasType = f.get('measurementType');
                return geom && (
                    geom instanceof Polygon
                    || geom instanceof LineString
                    || (geom instanceof Point && hasType === 'point')
                );
            })
            .map(f => featureToGeoJSON(f, unitPref))
    };

    return geojson;
}

/**
 * Import measurements from GeoJSON into the source
 * @param {Object} geojson - GeoJSON FeatureCollection
 * @param {ol.source.Vector} source - OpenLayers vector source
 * @param {Function} formatArea - Function to format area values
 * @param {Function} formatLength - Function to format length values
 * @param {ol.Map} map - OpenLayers map instance
 * @returns {Array} Imported features
 */
export function importMeasurements(geojson, source, formatArea, formatLength, map, onPointEdit) {
    if (!geojson || !geojson.features) {
        console.warn('Invalid GeoJSON data');
        return [];
    }

    const imported = [];

    geojson.features.forEach(geoJsonFeature => {
        try {
            const feature = geoJSONToFeature(geoJsonFeature, formatArea, formatLength);

            // Add the feature to the source
            source.addFeature(feature);

            // Create tooltip or popup for the feature
            if (feature.get('measurementType') === 'point' && map) {
                createPointPopup(feature, map, source, onPointEdit);
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

    // Return imported features AND groups from metadata (for group state restoration)
    return {
        features: imported,
        groups: (geojson.metadata && Array.isArray(geojson.metadata.groups)) ? geojson.metadata.groups : []
    };
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
    let tooltipContent = '';
    if (name) {
        tooltipContent += `<div class="ol-tooltip-name">${name}</div>`;
    }
    tooltipContent += `<div class="ol-tooltip-value">${text}</div>`;
    measureTooltipElement.innerHTML = tooltipContent;

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

/**
 * Create a point annotation popup for an imported point feature
 * @param {ol.Feature} feature - Point feature
 * @param {ol.Map} map - OpenLayers map instance
 * @param {ol.source.Vector} source - Vector source for cleanup
 * @param {Function} [onEdit] - Optional callback when edit button is clicked, receives (feature, map)
 */
function createPointPopup(feature, map, source, onEdit) {
    const geometry = feature.getGeometry();
    if (!geometry) return;

    const coords = geometry.getCoordinates();
    const lat = feature.get('pointLatitude');
    const lon = feature.get('pointLongitude');

    if (lat === undefined || lon === undefined) return;

    const { ddLat, ddLon } = pointCoordinates(lat, lon);
    const popupEl = document.createElement('div');
    popupEl.className = 'ol-point-popup';
    popupEl.innerHTML = pointPopupHtml({
        lat, lon, name: feature.get('name'), accent: feature.get('stroke'),
        description: feature.get('description') || '', actions: true
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

    // Edit handler
    // lifetime: element (buttons of the popup created here)
    popupEl.querySelector('.ol-point-popup-edit').addEventListener('click', (e) => {
        e.preventDefault();
        if (onEdit) onEdit(feature, map);
    });

    // lifetime: element (buttons of the popup created here)
    popupEl.querySelector('.ol-point-popup-copy').addEventListener('click', (e) => {
        e.preventDefault();
        const text = `${ddLat}, ${ddLon}`;
        copyText(text).then(() => {
            const icon = popupEl.querySelector('.ol-point-popup-copy i');
            if (icon) { icon.className = 'fa-solid fa-check'; }
            setTimeout(() => { if (icon) { icon.className = 'fa-regular fa-copy'; } }, 1500);
        });
    });

    // lifetime: element (buttons of the popup created here)
    popupEl.querySelector('.ol-point-popup-delete').addEventListener('click', (e) => {
        e.preventDefault();
        map.removeOverlay(popupOverlay);
        if (popupEl.parentNode) popupEl.parentNode.removeChild(popupEl);
        source.removeFeature(feature);
    });
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
