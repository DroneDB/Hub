// @ts-check
/**
 * Where a point of a georeferenced splat is on the Earth. A splat with a local frame is in metres
 * from a known place (see the `georef` property of its entry): the scene coordinates of a picked
 * point are east, north and up from an origin on the WGS84 ellipsoid ('enu'), or the coordinates
 * of a projected CRS minus an offset ('projected'). This turns such a point into the coordinates
 * of the dataset CRS and into longitude, latitude and height, and writes them for a label.
 *
 * Projected coordinates reach WGS84 through proj4, which knows the UTM zones of WGS84 (EPSG:326xx
 * north, EPSG:327xx south, and the "WGS84 UTM 15N" form ODM writes) from the zone alone and any
 * definition given as a proj string or as WKT. Another EPSG code has no definition in the Hub (it
 * does not fetch any): such a splat shows its projected coordinates and no WGS84 ones.
 */
import proj4 from 'proj4';
import { EPSG } from '@/libs/constants';

/** What the coordinates of a point are shown in. */
export const COORD_MODE = Object.freeze({ CRS: 'crs', WGS84: 'wgs84' });

// The WGS84 ellipsoid: semi-major axis (m) and first eccentricity squared
const WGS84_A = 6378137;
const WGS84_E2 = 0.0066943799901413165;

const RAD = Math.PI / 180;

/**
 * @typedef {object} GeorefFrame
 * @property {'enu' | 'projected'} kind
 * @property {string} crsLabel                 what the coordinates of the dataset CRS are called
 * @property {(p: number[]) => number[]} toCrs  scene coordinates -> east, north, up (enu) or x, y, z of the CRS (projected)
 * @property {((p: number[]) => number[]) | null} toWgs84  scene coordinates -> [longitude, latitude, height], null when it cannot be told
 */

/**
 * ENU (east, north, up in metres) around an origin -> [longitude, latitude, height] in degrees and
 * metres: through earth-centred coordinates, so it is exact at any distance from the origin.
 * @param {number[]} origin  [latitude, longitude, height]
 * @returns {(p: number[]) => number[]}
 */
export function enuToWgs84(origin) {
    const [lat0, lon0, h0 = 0] = origin;
    const [sinP, cosP, sinL, cosL] = [Math.sin(lat0 * RAD), Math.cos(lat0 * RAD), Math.sin(lon0 * RAD), Math.cos(lon0 * RAD)];
    const n0 = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinP * sinP);
    const x0 = (n0 + h0) * cosP * cosL;
    const y0 = (n0 + h0) * cosP * sinL;
    const z0 = (n0 * (1 - WGS84_E2) + h0) * sinP;

    return ([e, n, u]) => {
        const x = x0 - sinL * e - sinP * cosL * n + cosP * cosL * u;
        const y = y0 + cosL * e - sinP * sinL * n + cosP * sinL * u;
        const z = z0 + cosP * n + sinP * u;

        // Earth-centred -> geodetic: the latitude by fixed-point iteration (it settles in a few steps)
        const p = Math.hypot(x, y);
        let lat = Math.atan2(z, p * (1 - WGS84_E2));
        let h = 0;
        for (let i = 0; i < 6; i++) {
            const sin = Math.sin(lat);
            const radius = WGS84_A / Math.sqrt(1 - WGS84_E2 * sin * sin);
            // p / cos(lat) is not usable near the poles, where z / sin(lat) is
            h = Math.abs(lat) < Math.PI / 4 ? p / Math.cos(lat) - radius : z / sin - radius * (1 - WGS84_E2);
            lat = Math.atan2(z, p * (1 - (WGS84_E2 * radius) / (radius + h)));
        }
        return [Math.atan2(y, x) / RAD, lat / RAD, h];
    };
}

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

/**
 * A function from the x, y of a CRS to [longitude, latitude], or null when proj4 has no definition
 * of the CRS (an EPSG code it does not know and the Hub does not fetch) or cannot use the text.
 * @param {string} crs  an EPSG code, a proj string or WKT
 * @returns {((x: number, y: number) => number[]) | null}
 */
export function crsToWgs84(crs) {
    try {
        const converter = proj4(utmDefinition(crs) ?? crs, EPSG.WGS84);
        return (x, y) => converter.forward([x, y]);
    } catch {
        return null;
    }
}

/** @param {unknown} v */
const isCoordinate = v => typeof v === 'number' && Number.isFinite(v);

/**
 * The frame of a georeferenced splat from the `properties` of its entry, or null when the splat is
 * not georeferenced or its `georef` is not usable (its points then read as metres from the origin
 * of the file, as before).
 * @param {any} properties  entry.properties
 * @returns {GeorefFrame | null}
 */
export function createGeorefFrame(properties) {
    if (properties?.georeferenced !== true) return null;
    const georef = properties.georef;

    if (georef?.kind === 'enu' && Array.isArray(georef.origin) && isCoordinate(georef.origin[0]) && isCoordinate(georef.origin[1])
        && Math.abs(georef.origin[0]) <= 90 && Math.abs(georef.origin[1]) <= 180) {
        const origin = [georef.origin[0], georef.origin[1], isCoordinate(georef.origin[2]) ? georef.origin[2] : 0];
        return { kind: 'enu', crsLabel: 'Local east-north-up', toCrs: p => p.slice(), toWgs84: enuToWgs84(origin) };
    }

    if (georef?.kind === 'projected' && typeof georef.crs === 'string' && georef.crs.trim()
        && Array.isArray(georef.offset) && georef.offset.length >= 2 && georef.offset.every(isCoordinate)) {
        const [ox, oy, oz = 0] = georef.offset;
        /** @type {(p: number[]) => number[]} */
        const toCrs = p => [p[0] + ox, p[1] + oy, p[2] + oz];
        const toWgs84 = crsToWgs84(georef.crs);
        const crsLabel = georef.crs.length > 40 ? 'Projected CRS' : georef.crs;
        return { kind: 'projected', crsLabel, toCrs, toWgs84: toWgs84 && (p => {
            const [x, y, z] = toCrs(p);
            return [...toWgs84(x, y), z];
        }) };
    }
    return null;
}

/**
 * Which modes a frame can show: its own CRS always, WGS84 when it can be worked out.
 * @param {GeorefFrame} frame
 * @returns {string[]}
 */
export function availableModes(frame) {
    return frame.toWgs84 ? [COORD_MODE.CRS, COORD_MODE.WGS84] : [COORD_MODE.CRS];
}

/**
 * The text of a point in a mode: "x, y, z m" of the CRS ("E, N, U" for a local frame), or
 * "latitude, longitude, height" of WGS84. A mode the frame cannot show falls back to its CRS.
 * @param {GeorefFrame} frame
 * @param {string} mode  a COORD_MODE
 * @returns {(p: number[]) => string}
 */
export function coordinateFormatter(frame, mode) {
    if (mode === COORD_MODE.WGS84 && frame.toWgs84) {
        const toWgs84 = frame.toWgs84;
        return p => {
            const [lon, lat, height] = toWgs84(p);
            return `${lat.toFixed(6)}°, ${lon.toFixed(6)}°, ${height.toFixed(2)} m`;
        };
    }
    return p => {
        const [x, y, z] = frame.toCrs(p).map(v => v.toFixed(2));
        return frame.kind === 'enu' ? `E ${x}, N ${y}, U ${z} m` : `${x}, ${y}, ${z} m`;
    };
}

/** What a mode is called on its button: the name of the CRS of the frame, or WGS84. @param {GeorefFrame} frame @param {string} mode */
export const modeLabel = (frame, mode) => (mode === COORD_MODE.WGS84 ? 'WGS84' : frame.crsLabel);

/** The mode after this one, going round the modes the frame can show. @param {GeorefFrame} frame @param {string} mode */
export function nextMode(frame, mode) {
    const modes = availableModes(frame);
    return modes[(modes.indexOf(mode) + 1) % modes.length];
}
