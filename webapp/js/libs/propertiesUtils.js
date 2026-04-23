/**
 * Utility functions for handling properties from geo features
 */
import ddb from 'ddb';
import { getTypeDisplayName } from '@/libs/entryTypes';
import { bytesToSize } from '@/libs/utils';

/**
 * Extracts the best display name from a feature's properties, checking various property names
 * and handling localization
 * @param {Object} properties - The properties object from a feature
 * @param {string} defaultValue - The default value to return if no suitable property is found
 * @returns {string} The best display name for the feature
 */
export function extractFeatureDisplayName(properties, defaultValue = 'Unknown feature') {
    if (!properties) return defaultValue;

    // Check for a name or label property in current language if available
    const userLang = navigator.language || navigator.userLanguage;
    const langPrefix = userLang.split('-')[0].toLowerCase();

    // 1. Localized name (name:en, name:it, etc.)
    if (properties[`name:${langPrefix}`]) {
        return properties[`name:${langPrefix}`];
    }

    // 2. Generic name/label/title
    if (properties.name) return properties.name;
    if (properties.Name) return properties.Name;
    if (properties.label) return properties.label;
    if (properties.Label) return properties.Label;
    if (properties.title) return properties.title;

    // 3. Special display or tooltip properties
    if (properties.displayValue) return properties.displayValue;
    if (properties.tooltipText) return properties.tooltipText;

    // 4. ID as a last resort
    if (properties.id) return `ID: ${properties.id}`;

    // Fallback to default
    return defaultValue;
}

/**
 * Check if an entry is a directory
 * @param {Object} entry - The entry object
 * @returns {boolean}
 */
export function isDirectory(entry) {
    return ddb.entry.isDirectory(entry);
}

/**
 * Get human-readable file type name
 * @param {number} type - The entry type code
 * @returns {string}
 */
export function getFileTypeName(type) {
    return getTypeDisplayName(type);
}

/**
 * Format file size for display (-- for directories/missing)
 * @param {Object} entry - The entry object
 * @returns {string}
 */
export function getFileSizeDisplay(entry) {
    if (isDirectory(entry)) return '--';
    if (!entry.size) return '--';
    return bytesToSize(entry.size);
}

/**
 * Format modification timestamp to locale string
 * @param {number} mtime - Unix timestamp (seconds)
 * @returns {string}
 */
export function formatModifiedDate(mtime) {
    if (!mtime) return '--';
    return new Date(mtime * 1000).toLocaleString();
}

/**
 * Format coordinates from point_geom geometry
 * @param {Object} pointGeom - The point_geom object
 * @returns {string|null}
 */
export function formatCoordinates(pointGeom) {
    if (!pointGeom || !pointGeom.geometry || !pointGeom.geometry.coordinates) return null;
    const coords = pointGeom.geometry.coordinates;
    let coordStr = '';
    if (pointGeom.crs && pointGeom.crs.properties && pointGeom.crs.properties.name) {
        coordStr += pointGeom.crs.properties.name + ' ';
    }
    coordStr += coords[0] + ', ' + coords[1];
    if (coords[2] !== undefined) {
        coordStr += ', ' + coords[2].toFixed(2) + 'm';
    }
    return coordStr;
}

/**
 * Build the complete properties object for display (same logic as DetailPanel)
 * @param {Object} file - The file object with entry property
 * @returns {Object|null}
 */
export function buildAllProperties(file) {
    if (!file) return null;
    const entry = file.entry;
    const props = {};

    props['type'] = getFileTypeName(entry.type);
    props['path'] = entry.path;
    if (!isDirectory(entry) && entry.size) {
        props['size'] = getFileSizeDisplay(entry);
    }
    if (entry.hash) {
        props['hash'] = entry.hash;
    }
    if (entry.mtime) {
        props['modified'] = formatModifiedDate(entry.mtime);
    }
    const coordStr = formatCoordinates(entry.point_geom);
    if (coordStr) {
        props['coordinates'] = coordStr;
    }
    if (entry.properties && entry.properties.meta) {
        props['metadata'] = entry.properties.meta;
    }

    // Extended properties (exclude meta and permissions)
    if (entry.properties) {
        const excluded = ['meta', 'permissions'];
        for (const key in entry.properties) {
            if (!excluded.includes(key)) {
                props[key] = entry.properties[key];
            }
        }
    }

    return Object.keys(props).length > 0 ? props : null;
}
