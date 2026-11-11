// @ts-check
/**
 * From the x, y of a projected CRS to longitude and latitude (and back), through proj4, which knows
 * the UTM zones of WGS84 (EPSG:326xx north, EPSG:327xx south, and the "WGS84 UTM 15N" form ODM
 * writes) from the zone alone and any definition given as a proj string or as WKT. Another EPSG
 * code has no definition in the Hub (it does not fetch any): its points are not reprojected.
 * The height of a point is not changed by either direction (the vertical datum is not handled).
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

/**
 * The opposite of crsToWgs84: a function from [longitude, latitude] to the x, y of the CRS, or null.
 * @param {string} crs  an EPSG code, a proj string or WKT
 * @returns {((lon: number, lat: number) => number[]) | null}
 */
export function wgs84ToCrs(crs) {
    try {
        const converter = proj4(EPSG.WGS84, utmDefinition(crs) ?? crs);
        return (lon, lat) => converter.forward([lon, lat]);
    } catch {
        return null;
    }
}
