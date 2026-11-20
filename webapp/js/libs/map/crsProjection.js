// @ts-check
/**
 * From the coordinates of a CRS to longitude, latitude and height (and back), through proj4, which knows
 * the UTM zones of WGS84 (EPSG:326xx north, EPSG:327xx south, and the "WGS84 UTM 15N" form ODM
 * writes) from the zone alone and any definition given as a proj string or as WKT. Another EPSG
 * code has no definition in the Hub (it does not fetch any): its points are not reprojected.
 *
 * proj4 reads neither a compound CRS (a horizontal CRS and a vertical one, which the COPC of a cloud
 * with a vertical datum carries) nor a geocentric WKT, so the definition it gets is the one of the
 * horizontal part (horizontalDefinition): the x and y of a compound CRS are those of its horizontal
 * CRS, and its heights are not changed (the vertical datum is not handled). A geocentric CRS (x, y, z
 * from the centre of the Earth) is transformed in 3-D: its z becomes the height above the ellipsoid.
 */
import proj4 from 'proj4';
import { EPSG } from '@/libs/constants';

/**
 * The proj4 definition of a UTM zone of WGS84, from the code of its CRS, or null when the text is
 * not one: EPSG:326xx (north), EPSG:327xx (south) or "WGS84 UTM 15N" (what ODM writes).
 * @param {string} crs
 * @returns {string | null}
 */
export function utmDefinition(crs) {
    const text = crs.trim();
    const epsg = /^EPSG:(326|327)(\d{2})$/i.exec(text);
    const odm = /^WGS ?84 UTM (\d{1,2})([NS])$/i.exec(text);
    if (!epsg && !odm) return null;
    const zone = Number(epsg ? epsg[2] : odm?.[1]);
    const south = epsg ? epsg[1] === '327' : odm?.[2].toUpperCase() === 'S';
    if (zone < 1 || zone > 60) return null;
    return `+proj=utm +zone=${zone}${south ? ' +south' : ''} +datum=WGS84 +units=m +no_defs`;
}

/** The geocentric CRS of WGS84 (EPSG:4978) as proj4 takes it. */
const WGS84_GEOCENTRIC = '+proj=geocent +datum=WGS84 +units=m +no_defs';

/**
 * The keyword of a WKT node and its members at the top level (as written), or null for text that is
 * not WKT (a proj string, a code). Quoted names may hold brackets and commas ("" is a quote in one).
 * @param {string} text
 * @returns {{ keyword: string, members: string[] } | null}
 */
function wktNode(text) {
    const open = /^\s*([A-Z][A-Z0-9_]*)\s*[[(]/i.exec(text);
    if (!open) return null;
    /** @type {string[]} */
    const members = [];
    let depth = 0;
    let quoted = false;
    let start = open[0].length;
    for (let i = start; i < text.length; i++) {
        const c = text[i];
        if (quoted) {
            if (c === '"' && text[i + 1] === '"') i++;
            else if (c === '"') quoted = false;
        } else if (c === '"') {
            quoted = true;
        } else if (c === '[' || c === '(') {
            depth++;
        } else if (c === ']' || c === ')') {
            if (depth === 0) {
                members.push(text.slice(start, i).trim());
                return { keyword: open[1].toUpperCase(), members };
            }
            depth--;
        } else if (c === ',' && depth === 0) {
            members.push(text.slice(start, i).trim());
            start = i + 1;
        }
    }
    return null;
}

// The WKT 1 and WKT 2 keywords of a CRS that can be the horizontal part of a compound one
const HORIZONTAL_KEYWORDS = new Set(['PROJCS', 'PROJCRS', 'PROJECTEDCRS', 'GEOGCS', 'GEOGCRS', 'GEOGRAPHICCRS', 'GEODCRS', 'GEODETICCRS']);
const COMPOUND_KEYWORDS = new Set(['COMPD_CS', 'COMPOUNDCRS']);

/**
 * The proj4 definition of a geocentric WKT (WKT 1 GEOCCS, or a WKT 2 geodetic CRS with a Cartesian
 * coordinate system), from its ellipsoid; null for any other WKT node.
 * @param {string} text
 * @param {{ keyword: string, members: string[] }} node
 * @returns {string | null}
 */
function geocentricDefinition(text, node) {
    const geocentric = node.keyword === 'GEOCCS'
        || ((node.keyword === 'GEODCRS' || node.keyword === 'GEODETICCRS') && node.members.some(m => /^CS\s*\[\s*Cartesian/i.test(m)));
    if (!geocentric) return null;
    const ellipsoid = /(?:SPHEROID|ELLIPSOID)\s*\[\s*"[^"]*"\s*,\s*([-+\d.eE]+)\s*,\s*([-+\d.eE]+)/i.exec(text);
    if (!ellipsoid) return WGS84_GEOCENTRIC;
    const a = Number(ellipsoid[1]);
    const rf = Number(ellipsoid[2]);
    if (!(a > 0) || !Number.isFinite(rf)) return null;
    // An inverse flattening of 0 is a sphere
    return `+proj=geocent +a=${a} ${rf > 0 ? `+rf=${rf}` : `+b=${a}`} +units=m +no_defs`;
}

/**
 * The definition proj4 is given for a CRS: the definition of a UTM code (utmDefinition), the horizontal
 * CRS of a compound one (WKT 1 COMPD_CS, WKT 2 COMPOUNDCRS), a proj string for a geocentric CRS, or
 * the text as it is. Null for a compound CRS with no horizontal part.
 * @param {string} crs  an EPSG code, a proj string or WKT
 * @returns {string | null}
 */
export function horizontalDefinition(crs) {
    const text = crs.trim();
    if (/^EPSG:4978$/i.test(text)) return WGS84_GEOCENTRIC;
    const utm = utmDefinition(text);
    if (utm) return utm;
    const node = wktNode(text);
    if (!node) return text;
    if (COMPOUND_KEYWORDS.has(node.keyword)) {
        const horizontal = node.members.find(m => HORIZONTAL_KEYWORDS.has(wktNode(m)?.keyword ?? ''));
        return horizontal ? horizontalDefinition(horizontal) : null;
    }
    return geocentricDefinition(text, node) ?? text;
}

/**
 * Whether a definition horizontalDefinition gives is geocentric (its x, y, z are transformed together).
 * @param {string} definition
 */
export const isGeocentricDefinition = definition => /\+proj=geocent\b/.test(definition);

/**
 * A function from the x, y, z of a CRS to [longitude, latitude, height], or null when proj4 has no
 * definition of the CRS (an EPSG code it does not know and the Hub does not fetch) or cannot use the
 * text. The height is z as it is, except for a geocentric CRS (the height above its ellipsoid).
 * @param {string} crs  an EPSG code, a proj string or WKT
 * @returns {((x: number, y: number, z?: number) => number[]) | null}
 */
export function crsToWgs84(crs) {
    try {
        const definition = horizontalDefinition(crs);
        if (!definition) return null;
        const converter = proj4(definition, EPSG.WGS84);
        if (isGeocentricDefinition(definition)) return (x, y, z = 0) => converter.forward([x, y, z]).slice(0, 3);
        return (x, y, z = 0) => {
            const [lon, lat] = converter.forward([x, y]);
            return [lon, lat, z];
        };
    } catch {
        return null;
    }
}

/**
 * The opposite of crsToWgs84: a function from [longitude, latitude, height] to the x, y, z of the CRS, or null.
 * @param {string} crs  an EPSG code, a proj string or WKT
 * @returns {((lon: number, lat: number, height?: number) => number[]) | null}
 */
export function wgs84ToCrs(crs) {
    try {
        const definition = horizontalDefinition(crs);
        if (!definition) return null;
        const converter = proj4(EPSG.WGS84, definition);
        if (isGeocentricDefinition(definition)) return (lon, lat, height = 0) => converter.forward([lon, lat, height]).slice(0, 3);
        return (lon, lat, height = 0) => {
            const [x, y] = converter.forward([lon, lat]);
            return [x, y, height];
        };
    } catch {
        return null;
    }
}

/**
 * A unit of length of a CRS: `symbol` is what a label shows, `code` names it in a saved file.
 * @typedef {{ code: string, symbol: string, name: string, metresPerUnit: number }} LinearUnit
 */

/** @type {Readonly<Record<'METRE' | 'FOOT' | 'US_FOOT', Readonly<LinearUnit>>>} */
export const LINEAR_UNITS = Object.freeze({
    METRE: Object.freeze({ code: 'm', symbol: 'm', name: 'metre', metresPerUnit: 1 }),
    FOOT: Object.freeze({ code: 'ft', symbol: 'ft', name: 'foot', metresPerUnit: 0.3048 }),
    // 1200/3937 m exactly: the foot of the US state plane systems
    US_FOOT: Object.freeze({ code: 'ftUS', symbol: 'ft', name: 'US survey foot', metresPerUnit: 1200 / 3937 })
});

// Two factors closer than this are the same unit (a WKT writes 1200/3937 rounded to 15 digits)
const UNIT_TOLERANCE = 1e-9;

/**
 * The unit of length of the x and y of a CRS: metres, feet, US survey feet, or another unit that a WKT
 * or a proj string names with its factor to metres. Metres when the CRS has no linear unit proj4 can
 * read: a cloud with no CRS (its coordinates are taken as metres, as everywhere in the Hub), a CRS proj4
 * does not know, a geocentric CRS (metres) and a geographic one (its x and y are degrees, which are no
 * length; such a cloud gets its COPC built in a projected CRS, and its heights are metres).
 * @param {any} crs  an EPSG code, a proj string or WKT; anything else (null) is no CRS
 * @returns {Readonly<LinearUnit>}
 */
export function linearUnitOf(crs) {
    if (typeof crs !== 'string' || !crs.trim()) return LINEAR_UNITS.METRE;
    try {
        const definition = horizontalDefinition(crs);
        if (!definition) return LINEAR_UNITS.METRE;
        const projection = /** @type {any} */ (proj4.Proj(definition));
        const factor = Number(projection.to_meter);
        if (projection.projName === 'longlat' || !Number.isFinite(factor) || factor <= 0) return LINEAR_UNITS.METRE;
        return unitOfFactor(factor, projection.units);
    } catch {
        return LINEAR_UNITS.METRE;
    }
}

/**
 * The unit of a factor to metres: a known one, or one named after what the CRS calls it.
 * @param {number} factor
 * @param {unknown} name
 * @returns {Readonly<LinearUnit>}
 */
function unitOfFactor(factor, name) {
    const known = Object.values(LINEAR_UNITS).find(u => Math.abs(u.metresPerUnit - factor) < UNIT_TOLERANCE);
    if (known) return known;
    const label = typeof name === 'string' && name ? name : `${factor} m`;
    return Object.freeze({ code: label, symbol: label, name: label, metresPerUnit: factor });
}

// The WKT 1 and WKT 2 keywords of the vertical CRS of a compound one
const VERTICAL_KEYWORDS = new Set(['VERT_CS', 'VERTCRS', 'VERTICALCRS']);

/**
 * The unit of the heights of a compound CRS, from its vertical CRS (the last UNIT or LENGTHUNIT in it: the one of
 * its axis), or null for a CRS that is not compound or a vertical CRS that names no linear unit.
 * @param {string} crs
 * @returns {Readonly<LinearUnit> | null}
 */
function verticalUnitOf(crs) {
    const node = wktNode(crs.trim());
    if (!node || !COMPOUND_KEYWORDS.has(node.keyword)) return null;
    const vertical = node.members.find(m => VERTICAL_KEYWORDS.has(wktNode(m)?.keyword ?? ''));
    if (!vertical) return null;
    const units = [...vertical.matchAll(/(?:LENGTHUNIT|UNIT)\s*\[\s*"([^"]*)"\s*,\s*([-+\d.eE]+)/gi)];
    const last = units[units.length - 1];
    const factor = last ? Number(last[2]) : NaN;
    return Number.isFinite(factor) && factor > 0 ? unitOfFactor(factor, last[1]) : null;
}

/**
 * The units of the coordinates of a point cloud: of x and y (linearUnitOf) and of z. The heights of a compound CRS are in
 * the unit of its vertical CRS, which can differ from the horizontal one (UTM in metres with NAVD88 heights in US survey
 * feet); without a vertical CRS they are in the horizontal unit, as the coordinates of a LAS file are. `mixed` when the
 * two differ: a length along z is then not in the unit of a length along x, and `metresPerAxis` gives the metres in a
 * unit of each axis (x, y, z) to measure in.
 * @param {any} crs  an EPSG code, a proj string or WKT; anything else (null) is no CRS
 * @returns {{ horizontal: Readonly<LinearUnit>, vertical: Readonly<LinearUnit>, mixed: boolean, metresPerAxis: number[] }}
 */
export function cloudUnitsOf(crs) {
    const horizontal = linearUnitOf(crs);
    const vertical = (typeof crs === 'string' && verticalUnitOf(crs)) || horizontal;
    const mixed = Math.abs(horizontal.metresPerUnit - vertical.metresPerUnit) >= UNIT_TOLERANCE;
    return { horizontal, vertical, mixed, metresPerAxis: [horizontal.metresPerUnit, horizontal.metresPerUnit, vertical.metresPerUnit] };
}
