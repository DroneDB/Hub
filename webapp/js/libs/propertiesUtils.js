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
function formatCoordinates(pointGeom) {
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
/**
 * Readable origin of a CAD drawing's coordinate system, from the
 * properties.vector.crs that DroneDB records at index time. Returns null for
 * entries without that information (non-CAD vectors, other types).
 */
export function formatCadCrs(entry) {
    const vector = entry && entry.properties && entry.properties.vector;
    const crs = vector && vector.crs;
    if (!crs || !crs.source) return null;
    const units = vector.units ? `, units: ${vector.units}` : '';
    switch (crs.source) {
        case 'prj':
            return crs.label === 'local'
                ? `None: local drawing coordinates, set by the .prj file${units}`
                : `${crs.label} (from the .prj file)`;
        case 'geodata':
            return `${crs.label} (stored in the drawing)`;
        case 'layer':
            return crs.label || 'From the file';
        case 'lonlat':
            return 'WGS84 (EPSG:4326), assumed: the file has no coordinate system. Change it with Tools › Set Coordinate System';
        case 'none':
            return `None: local drawing coordinates${units}. Place it on the map with Tools › Set Coordinate System`;
        default:
            return null;
    }
}

export function buildAllProperties(file) {
    if (!file) return null;
    const entry = file.entry;
    const props = {};

    props['type'] = getFileTypeName(entry.type);
    props['path'] = entry.path;
    if (!isDirectory(entry) && entry.size) {
        props['size'] = getFileSizeDisplay(entry);
    }
    if (entry.mtime) {
        props['modified'] = formatModifiedDate(entry.mtime);
    }
    const coordStr = formatCoordinates(entry.point_geom);
    if (coordStr) {
        props['coordinates'] = coordStr;
    }
    const cadCrs = formatCadCrs(entry);
    if (cadCrs) {
        props['coordinate system'] = cadCrs;
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

/**
 * Tidies an object of entry or feature properties for display, in place: the GeoImage
 * geotransform becomes a resolution, width and height one "Dimensions" row, internal fields
 * are dropped and the sensor is upper-cased.
 * @param {Object} props  a copy of the properties (it is changed)
 * @returns {Object} props
 */
export function tidyProperties(props) {
    if (props.geotransform && Array.isArray(props.geotransform) && props.geotransform.length > 1) {
        props.resolution = props.geotransform[1].toFixed(2) + ' meters';
        delete props.geotransform;
    }
    if (props.width !== undefined && props.height !== undefined) {
        props['Dimensions'] = `${props.width} x ${props.height}`;
        delete props.width;
        delete props.height;
    }
    delete props.projection;
    delete props.focalLength35;
    delete props.orientation;
    if (props.sensor) {
        props.sensor = props.sensor.toUpperCase();
    }
    return props;
}

/** A property key as a label: "focalLength" becomes "Focal Length". */
export function beautifyKey(name) {
    if (typeof name !== 'string') return name;
    return name[0].toUpperCase() + name.substring(1).replace(/([a-z])([A-Z0-9])/g, '$1 $2');
}

/** True for an absolute http or https URL (a value shown as a link). */
export function isUrl(str) {
    if (!str) return false;
    try {
        const url = new URL(str);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}
