// @ts-check
/**
 * The map's measurements as a CSV table, one row per measurement: its group, name, type, value
 * and unit (in the units the map shows), longitude and latitude (points), the geometry as WKT in
 * WGS84 (every measurement), the description, then every other property the measurements carry.
 *
 * It reads the GeoJSON export of the map (exportMeasurements), so the values and the units are
 * those of the GeoJSON export and of the labels on the map.
 */
import { bulkUnits } from '@/libs/format';
import { toCsv } from '@/libs/csv';

const COLUMNS = ['group', 'name', 'type', 'value', 'unit', 'longitude', 'latitude', 'wkt', 'description'];

// Properties that a column above already shows, or that only style the measurement on the map
const SHOWN = new Set([
    'measurementType', 'name', 'description', 'groupId', 'latitude', 'longitude',
    'areaValue', 'lengthValue', 'unit', 'displayValue', 'unitPreference', 'tooltipText',
    'stroke', 'stroke-width', 'stroke-opacity', 'fill', 'fill-opacity'
]);

// Stored properties whose name does not say their unit (they are always metric)
const PROPERTY_HEADERS = Object.freeze({ area: 'area_m2', length: 'length_m' });

const round2 = (/** @type {number} */ v) => Math.round(v * 100) / 100;

/** @param {number[]} p */
const wktPoint = p => `${p[0]} ${p[1]}`;
/** @param {number[][]} ring */
const wktRing = ring => `(${ring.map(wktPoint).join(', ')})`;

/**
 * A GeoJSON geometry as WKT (two dimensions: a height is left out); '' for a type a measurement
 * never has.
 * @param {{ type: string, coordinates: any } | null | undefined} geometry
 * @returns {string}
 */
export function geometryToWkt(geometry) {
    if (!geometry) return '';
    const c = geometry.coordinates;
    switch (geometry.type) {
        case 'Point': return `POINT (${wktPoint(c)})`;
        case 'LineString': return `LINESTRING ${wktRing(c)}`;
        case 'Polygon': return `POLYGON (${c.map(wktRing).join(', ')})`;
        default: return '';
    }
}

/**
 * The value of a measurement and its unit: a length or an area as the export wrote it, the net
 * volume of a stockpile (stored in m³) in the volume unit of `units`; none for a point.
 * @param {Record<string, any>} p  the properties of the exported feature
 * @param {string} units  'metric' or 'imperial'
 * @returns {[number|null, string]}
 */
function valueOf(p, units) {
    if (typeof p.areaValue === 'number') return [p.areaValue, p.unit || ''];
    if (typeof p.lengthValue === 'number') return [p.lengthValue, p.unit || ''];
    if (p.measurementType === 'stockpile' && typeof p.netVolume === 'number') {
        const { factor, unit } = bulkUnits(units).volume;
        return [round2(p.netVolume * factor), unit];
    }
    return [null, ''];
}

/**
 * The CSV text of the exported measurements.
 * @param {{ features?: any[] }} geojson  the map's GeoJSON export
 * @param {{ id: string, name: string }[]} [groups]  the measurement groups, for their names
 * @param {string} [units]  the units the values are shown in ('metric' or 'imperial')
 * @returns {string}
 */
export function measurementsToCsv(geojson, groups = [], units = 'metric') {
    const features = (geojson && geojson.features) || [];
    const groupNames = new Map(groups.map(g => [g.id, g.name]));

    // The other properties, in the order they first appear
    /** @type {string[]} */
    const extra = [];
    features.forEach(f => Object.keys(f.properties || {}).forEach(k => {
        if (!SHOWN.has(k) && !extra.includes(k)) extra.push(k);
    }));

    const rows = features.map(f => {
        const p = f.properties || {};
        const [value, unit] = valueOf(p, units);
        const isPoint = f.geometry && f.geometry.type === 'Point';
        return [
            groupNames.get(p.groupId) ?? '',
            p.name ?? '',
            p.measurementType ?? '',
            value,
            unit,
            isPoint ? p.longitude ?? f.geometry.coordinates[0] : null,
            isPoint ? p.latitude ?? f.geometry.coordinates[1] : null,
            geometryToWkt(f.geometry),
            p.description ?? '',
            ...extra.map(k => {
                const v = p[k];
                return v !== null && typeof v === 'object' ? JSON.stringify(v) : v;
            })
        ];
    });

    return toCsv([...COLUMNS, ...extra.map(k => PROPERTY_HEADERS[k] || k)], rows);
}
