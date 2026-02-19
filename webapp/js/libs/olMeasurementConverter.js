/**
 * Utility to convert OpenLayers measurements to GeoJSON and vice versa
 */

import { getArea, getLength } from 'ol/sphere';
import { LineString, Polygon, Point } from 'ol/geom';
import Feature from 'ol/Feature';
import GeoJSON from 'ol/format/GeoJSON';
import { toLonLat } from 'ol/proj';

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
    const safeProperties = [
        'tooltipText', 'createdAt', 'measurementType',
        'name', 'description',
        'stroke', 'stroke-width', 'stroke-opacity',
        'fill', 'fill-opacity'
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
        dataProjection: 'EPSG:4326',
        featureProjection: 'EPSG:3857'
    }));

    // Determine measurement type and calculate values
    let measurementType;
    let calculatedValues = {};

    if (geometryType === 'Polygon') {
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
        measurementType = 'unknown';
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
        'fill-opacity': feature.get('fill-opacity') || null
    };

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
        dataProjection: 'EPSG:4326',
        featureProjection: 'EPSG:3857'
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

    // Restore GeoJSON styling properties
    if (props.stroke) feature.set('stroke', props.stroke);
    if (props['stroke-width']) feature.set('stroke-width', props['stroke-width']);
    if (props['stroke-opacity']) feature.set('stroke-opacity', props['stroke-opacity']);
    if (props.fill) feature.set('fill', props.fill);
    if (props['fill-opacity']) feature.set('fill-opacity', props['fill-opacity']);

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
 * @returns {Object} GeoJSON FeatureCollection
 */
export function exportMeasurements(source, orthophotoPath, unitPref = 'metric') {
    const features = source.getFeatures();

    const geojson = {
        type: 'FeatureCollection',
        crs: {
            type: 'name',
            properties: {
                name: 'EPSG:4326' // Output is always in WGS84
            }
        },
        metadata: {
            version: '1.0',
            orthophotoFile: orthophotoPath,
            createdAt: new Date().toISOString(),
            modifiedAt: new Date().toISOString(),
            application: 'Registry-Orthophoto',
            unitPreference: unitPref
        },
        features: features
            .filter(f => {
                // Only export actual measurement features (not temporary draw features)
                const geom = f.getGeometry();
                const hasType = f.get('measurementType');
                return geom && (geom instanceof Polygon || geom instanceof LineString || (geom instanceof Point && hasType === 'point'));
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
export function importMeasurements(geojson, source, formatArea, formatLength, map) {
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
                createPointPopup(feature, map, source);
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
    return imported;
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
    measureTooltipElement.className = 'ol-tooltip ol-tooltip-static';

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
        const Overlay = require('ol/Overlay').default;
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
 * Create a point location popup for an imported point feature
 * @param {ol.Feature} feature - Point feature
 * @param {ol.Map} map - OpenLayers map instance
 * @param {ol.source.Vector} source - Vector source for cleanup
 */
function createPointPopup(feature, map, source) {
    const geometry = feature.getGeometry();
    if (!geometry) return;

    const coords = geometry.getCoordinates();
    const lat = feature.get('pointLatitude');
    const lon = feature.get('pointLongitude');

    if (lat === undefined || lon === undefined) return;

    const ddToDms = (coordinate, posSymbol, negSymbol) => {
        const dd = Math.abs(coordinate);
        const d = Math.floor(dd);
        const m = Math.floor((dd - d) * 60);
        const s = Math.round((dd - d - m / 60) * 3600 * 100) / 100;
        const dir = coordinate >= 0 ? posSymbol : negSymbol;
        return d + '\u00B0' + (m < 10 ? '0' : '') + m + "'" + (s < 10 ? '0' : '') + s.toFixed(2) + '" ' + dir;
    };

    const dmsLat = ddToDms(lat, 'N', 'S');
    const dmsLon = ddToDms(lon, 'E', 'W');
    const ddLat = lat.toFixed(6);
    const ddLon = lon.toFixed(6);

    const popupEl = document.createElement('div');
    popupEl.className = 'ol-point-popup';
    popupEl.innerHTML = `
        <div class="ol-point-popup-coords">
            <span class="ol-point-popup-dms">${dmsLat} / ${dmsLon}</span>
            <span class="ol-point-popup-dd">${ddLat} / ${ddLon}</span>
        </div>
        <div class="ol-point-popup-actions">
            <button class="image-popup-btn ol-point-popup-copy" title="Copy coordinates"><i style="margin: 0" class="icon copy outline"></i></button>
            <button class="image-popup-btn ol-point-popup-delete" title="Delete point"><i style="margin: 0" class="icon trash"></i></button>
        </div>
    `;

    const Overlay = require('ol/Overlay').default;
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

    popupEl.querySelector('.ol-point-popup-copy').addEventListener('click', (e) => {
        e.preventDefault();
        const text = `${ddLat}, ${ddLon}`;
        navigator.clipboard.writeText(text).then(() => {
            const icon = popupEl.querySelector('.ol-point-popup-copy i');
            if (icon) { icon.className = 'icon check'; }
            setTimeout(() => { if (icon) { icon.className = 'icon copy outline'; } }, 1500);
        });
    });

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
    let value, unit, displayValue;

    if (unitPref === 'metric') {
        if (area > 10000) {
            value = area / 1000000;
            unit = 'km²';
            displayValue = Math.round(value * 100) / 100 + ' km²';
        } else {
            value = area;
            unit = 'm²';
            displayValue = Math.round(value * 100) / 100 + ' m²';
        }
    } else {
        // Imperial: convert to acres
        const f = 0.00024710538146717; // m² to acres
        value = area * f;
        unit = 'acres';
        displayValue = Math.round(value * 100) / 100 + ' acres';
    }

    return {
        area: Math.round(area * 100) / 100, // Always store raw m² value
        areaValue: Math.round(value * 100) / 100,
        unit: unit,
        displayValue: displayValue
    };
}

/**
 * Calculate and format length values
 * @param {number} length - Length in meters
 * @param {string} unitPref - Unit preference
 * @returns {Object} Calculated values
 */
function calculateLengthValues(length, unitPref) {
    let value, unit, displayValue;

    if (unitPref === 'metric') {
        if (length > 100) {
            value = length / 1000;
            unit = 'km';
            displayValue = Math.round(value * 100) / 100 + ' km';
        } else {
            value = length;
            unit = 'm';
            displayValue = Math.round(value * 100) / 100 + ' m';
        }
    } else {
        // Imperial: convert to feet
        const f = 3.28084; // meters to feet
        value = length * f;
        unit = 'ft';
        displayValue = Math.round(value * 100) / 100 + ' ft';
    }

    return {
        length: Math.round(length * 100) / 100, // Always store raw meters value
        lengthValue: Math.round(value * 100) / 100,
        unit: unit,
        displayValue: displayValue
    };
}
