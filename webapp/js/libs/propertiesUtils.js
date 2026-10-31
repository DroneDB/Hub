/**
 * Utility functions for handling properties from geo features
 */
import ddb from 'ddb';
import { getTypeDisplayName } from '@/libs/entryTypes';
import { bytesToSize, formatTimeAgo } from '@/libs/utils';
import { formatGroundResolution } from '@/libs/groundResolution';
import { fixedLengthParts, formatSpeed } from '@/libs/format';
import { COMPARISONS_KEY } from '@/libs/compare/comparisonStore';
import { pointLonLat } from '@/libs/ddb/pointGeom';

// Meta keys that hold app data (saved map comparisons are raw JSON), not something to show users
export const HIDDEN_META_KEYS = [COMPARISONS_KEY];

/** The meta of an entry without the keys that are not for users to read. */
export function visibleMeta(meta) {
    return Object.fromEntries(Object.entries(meta ?? {}).filter(([key]) => !HIDDEN_META_KEYS.includes(key)));
}

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
 * How long ago an entry was modified, e.g. "2 minutes ago"
 * @param {number} mtime - Unix timestamp (seconds)
 * @returns {string} empty when there is no timestamp
 */
export function formatModifiedTimeAgo(mtime) {
    return mtime ? formatTimeAgo(mtime * 1000) : '';
}

const hasAltitude = coords => typeof coords[2] === 'number';

/**
 * The coordinates of a point_geom to paste elsewhere: "latitude, longitude" or
 * "latitude, longitude, altitude" (altitude with two decimals). Latitude comes first, as
 * Google Maps and the OpenStreetMap search read a pasted pair; the row shows GeoJSON order.
 * @param {Object} pointGeom - The point_geom object
 * @returns {string|null}
 */
export function pointCoordinatesText(pointGeom) {
    const coords = pointLonLat(pointGeom);
    if (!coords) return null;
    const parts = [coords[1], coords[0]];
    if (hasAltitude(coords)) parts.push(coords[2].toFixed(2));
    return parts.join(', ');
}

/**
 * Format coordinates from point_geom geometry: "EPSG:4326 lon, lat, altm", the altitude
 * in the user's units ("altft" for imperial)
 * @param {Object} pointGeom - The point_geom object
 * @param {string} [units] - 'metric' or 'imperial'
 * @returns {string|null}
 */
function formatCoordinates(pointGeom, units) {
    const coords = pointLonLat(pointGeom);
    if (!coords) return null;
    const crsName = pointGeom.crs && pointGeom.crs.properties && pointGeom.crs.properties.name;
    let text = (crsName ? crsName + ' ' : '') + coords[0] + ', ' + coords[1];
    if (hasAltitude(coords)) {
        const { value, unit } = fixedLengthParts(coords[2], units);
        text += `, ${value}${unit}`;
    }
    return text;
}

// EPSG and ESRI codes ("EPSG:32633", "ESRI:102100", the "EPSG::4326" of an OGC URN).
// epsg.io serves both authorities at https://epsg.io/<code>; the prefixed form is a 404.
const CRS_CODE_RE = /\b(EPSG|ESRI)::?(\d+)\b/gi;

/**
 * Splits a text into parts, where each EPSG or ESRI code is a part with the
 * epsg.io page that describes it. Text without a code is one part without href.
 * @param {string} text
 * @returns {{ text: string, href?: string }[]}
 */
export function linkCrsCodes(text) {
    if (typeof text !== 'string' || !text) return [{ text: text ?? '' }];
    const parts = [];
    let last = 0;
    for (const m of text.matchAll(CRS_CODE_RE)) {
        if (m.index > last) parts.push({ text: text.slice(last, m.index) });
        parts.push({ text: m[0], href: `https://epsg.io/${m[2]}` });
        last = m.index + m[0].length;
    }
    if (last < text.length) parts.push({ text: text.slice(last) });
    return parts;
}

/**
 * The values the properties table copies, by row key: the size row copies the
 * file hash, the coordinates row the latitude, longitude (and altitude).
 * @param {Object} file - The file object with entry property
 * @returns {Object<string, { text: string, label: string }>}
 */
export function buildCopyableValues(file) {
    const entry = file && file.entry;
    if (!entry) return {};
    const values = {};
    if (entry.hash) values.size = { text: entry.hash, label: 'hash' };
    const coordinates = pointCoordinatesText(entry.point_geom);
    if (coordinates) {
        const altitude = hasAltitude(pointLonLat(entry.point_geom)) ? ', altitude' : '';
        values.coordinates = { text: coordinates, label: `latitude, longitude${altitude}` };
    }
    return values;
}

/**
 * The notes shown under the values of the rows of a file's properties table:
 * { rowKey: text }. The modified row shows how long ago that was.
 * @param {Object} file - The file object with entry property
 * @returns {Object}
 */
export function buildRowNotes(file) {
    const entry = file && file.entry;
    if (!entry || !entry.mtime) return {};
    return { modified: formatModifiedTimeAgo(entry.mtime) };
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

/**
 * The rows of the properties table of a file: its type, path, size, dates, coordinates
 * and entry properties, with lengths, speeds and areas in the user's units.
 * @param {Object} file - The file object with entry property
 * @param {string} [units] - 'metric' or 'imperial' (the measurement units preference)
 * @returns {Object|null}
 */
export function buildAllProperties(file, units = 'metric') {
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
    const coordStr = formatCoordinates(entry.point_geom, units);
    if (coordStr) {
        props['coordinates'] = coordStr;
    }
    const cadCrs = formatCadCrs(entry);
    if (cadCrs) {
        props['coordinate system'] = cadCrs;
    }
    const meta = visibleMeta(entry.properties?.meta);
    if (Object.keys(meta).length) {
        props['metadata'] = meta;
    }

    // Extended properties (exclude meta and permissions)
    if (entry.properties) {
        const excluded = ['meta', 'permissions'];
        for (const key in entry.properties) {
            if (!excluded.includes(key)) {
                props[key] = entry.properties[key];
            }
        }
        formatMeasuredProperties(props, units);
        // A georaster's resolution in ground units; tidyProperties falls back to its geotransform
        if (entry.properties.geotransform) {
            const resolution = formatGroundResolution(entry.polygon_geom, entry.properties.width, entry.properties.height, units);
            if (resolution) props['resolution'] = resolution;
        }
    }

    return Object.keys(props).length > 0 ? props : null;
}

// Image properties DroneDB stores in m/s and in metres
const SPEED_PROPERTIES = ['flightSpeed', 'flightSpeed3D', 'flightSpeedX', 'flightSpeedY', 'flightSpeedZ'];
const LENGTH_PROPERTIES = ['gpsXYAccuracy', 'gpsZAccuracy'];

// Shows the speeds and lengths of the properties in the user's units, in place
function formatMeasuredProperties(props, units) {
    for (const key of SPEED_PROPERTIES) {
        if (typeof props[key] === 'number') props[key] = formatSpeed(props[key], units);
    }
    for (const key of LENGTH_PROPERTIES) {
        if (typeof props[key] === 'number') props[key] = fixedLengthParts(props[key], units).text;
    }
}

/**
 * Width and height in pixels with the megapixels they make: "3581 x 3854 ~ 13.8Mpx".
 * The megapixels are left out when either side is not a positive number.
 * @param {number} width
 * @param {number} height
 * @returns {string}
 */
export function formatDimensions(width, height) {
    const text = `${width} x ${height}`;
    const pixels = Number(width) * Number(height);
    if (!(pixels > 0)) return text;
    return `${text} ~ ${(pixels / 1e6).toFixed(1)}Mpx`;
}

/**
 * Tidies an object of entry or feature properties for display, in place: a geotransform
 * becomes a resolution (unless buildAllProperties gave one in ground units), width and height one "Dimensions" row, internal fields
 * are dropped and the sensor is upper-cased.
 * @param {Object} props  a copy of the properties (it is changed)
 * @returns {Object} props
 */
export function tidyProperties(props) {
    if (props.geotransform) {
        // Without a footprint the pixel size is only known in the units of the coordinate system
        if (props.resolution === undefined && Array.isArray(props.geotransform) && typeof props.geotransform[1] === 'number') {
            props.resolution = `${Number(props.geotransform[1].toPrecision(3))} per pixel, in coordinate system units`;
        }
        delete props.geotransform;
    }
    if (props.width !== undefined && props.height !== undefined) {
        props['Dimensions'] = formatDimensions(props.width, props.height);
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
