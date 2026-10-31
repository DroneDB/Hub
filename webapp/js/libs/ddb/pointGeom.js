// @ts-check
/**
 * The place of an entry: its `point_geom`. Registry sends it as a GeoJSON Feature (with the CRS
 * of the index) whose geometry is the Point; a bare Point geometry is read the same way.
 */

/**
 * The [longitude, latitude, altitude?] of a point_geom, or null when there is none or it is not
 * a point with finite coordinates.
 * @param {any} pointGeom  a GeoJSON Feature of a Point, or a Point geometry
 * @returns {number[] | null}
 */
export function pointLonLat(pointGeom) {
    const geometry = pointGeom?.type === 'Feature' ? pointGeom.geometry : pointGeom;
    if (geometry?.type !== 'Point') return null;
    const coordinates = geometry.coordinates;
    return Array.isArray(coordinates) && coordinates.length >= 2
        && Number.isFinite(coordinates[0]) && Number.isFinite(coordinates[1]) ? coordinates : null;
}
