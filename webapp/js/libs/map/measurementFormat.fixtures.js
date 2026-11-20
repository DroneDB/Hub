/**
 * Measurements files in the shapes the writers before format 2.0 wrote them (the 2D map's export, the
 * 3D viewer's export, the stockpile panel), for the specs of the format, the storage and the
 * converters. Every function returns a new object.
 *
 * The 3D viewer's geometry in these files is what the old converter wrote: the local coordinates (already
 * in the CRS of the cloud) went through the scale and offset of the COPC header once more, so it is off.
 * The corrected positions are the ones in `CLOUD` (worked out with gdaltransform, not with the code).
 */
import { crsToWgs84 } from './crsProjection';

/** WKT of EPSG:32618 as the COPC header carries it (gdalsrsinfo -o wkt1 EPSG:32618) */
export const UTM_18N_WKT = 'PROJCS["WGS 84 / UTM zone 18N",GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563,AUTHORITY["EPSG","7030"]],AUTHORITY["EPSG","6326"]],PRIMEM["Greenwich",0,AUTHORITY["EPSG","8901"]],UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]],AUTHORITY["EPSG","4326"]],PROJECTION["Transverse_Mercator"],PARAMETER["latitude_of_origin",0],PARAMETER["central_meridian",-75],PARAMETER["scale_factor",0.9996],PARAMETER["false_easting",500000],PARAMETER["false_northing",0],UNIT["metre",1,AUTHORITY["EPSG","9001"]],AXIS["Easting",EAST],AXIS["Northing",NORTH],AUTHORITY["EPSG","32618"]]';

/** The COPC header's scale and offset of the cloud (positions in the viewer have them applied already) */
export const COPC_SCALE = [0.001, 0.001, 0.001];
export const COPC_OFFSET = [500000, 4500000, 100];

/**
 * Measured points: the position in the CRS of the cloud (EPSG:32618) and [longitude, latitude, height] as
 * `echo "x y z" | gdaltransform -s_srs EPSG:32618 -t_srs EPSG:4326` gives them.
 */
export const CLOUD = Object.freeze({
    A: { local: [583000.123, 4507000.456, 123.456], geo: [-74.0174014310951, 40.7097397626555, 123.456] },
    B: { local: [583010.123, 4507020.456, 125.456], geo: [-74.017280413874, 40.7099189022989, 125.456] },
    C: { local: [583020.123, 4507000.456, 124], geo: [-74.0171646938564, 40.7097377471897, 124] },
    D: { local: [583020.123, 4507030.456, 126.5], geo: [-74.0171607204709, 40.7100079681514, 126.5] }
});

/** A position the way the old code wrote it: through the scale and offset of the header again */
function oldGeometryPoint([x, y, z]) {
    const toLonLat = crsToWgs84(UTM_18N_WKT);
    const [lon, lat] = toLonLat(x * COPC_SCALE[0] + COPC_OFFSET[0], y * COPC_SCALE[1] + COPC_OFFSET[1]);
    return [lon, lat, z * COPC_SCALE[2] + COPC_OFFSET[2]];
}

export const CREATED = '2025-03-01T10:00:00.000Z';
export const MODIFIED = '2025-03-02T11:30:00.000Z';
export const GROUPS = [{ id: 'g1', name: 'Fence', color: '#ff0000', visible: true, collapsed: false }];
const WGS84_CRS = { type: 'name', properties: { name: 'EPSG:4326' } };

const mapFeatures = () => [
    {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [[9.1, 45.1], [9.1005, 45.1005]] },
        properties: { measurementType: 'length', unitPreference: 'metric', length: 78.6, lengthValue: 78.6, unit: 'm', displayValue: '78.6 m', name: 'Fence line', tooltipText: '78.6 m', createdAt: CREATED, groupId: 'g1' }
    },
    {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [[[9.2, 45.2], [9.201, 45.2], [9.201, 45.201], [9.2, 45.2]]] },
        properties: { measurementType: 'area', unitPreference: 'metric', area: 4880.12, tooltipText: '0.49 ha', createdAt: CREATED }
    },
    {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [9.3, 45.3] },
        properties: { measurementType: 'point', unitPreference: 'metric', latitude: 45.3, longitude: 9.3, name: 'Gate', createdAt: CREATED }
    }
];

/** The 2D map's file, 1.0: no groups */
export function mapFile10() {
    const features = mapFeatures();
    delete features[0].properties.groupId;
    return {
        type: 'FeatureCollection',
        crs: WGS84_CRS,
        metadata: { version: '1.0', kind: 'measurements', orthophotoFile: 'ortho.tif', createdAt: CREATED, modifiedAt: MODIFIED, application: 'DroneDB Registry', unitPreference: 'metric' },
        features
    };
}

/** The 2D map's file, 1.1: with the groups at the top of the metadata */
export function mapFile11() {
    const file = mapFile10();
    file.metadata.version = '1.1';
    file.metadata.groups = GROUPS.map(g => ({ ...g }));
    file.features = mapFeatures();
    return file;
}

/** The coordinate system the 3D viewer wrote: SRS, scale, offset and bounds of the cloud */
export const cloudCoordinateSystem = (srs = UTM_18N_WKT) => ({
    srs, scale: [...COPC_SCALE], offset: [...COPC_OFFSET], bounds: { minx: 583000, miny: 4507000, minz: 120, maxx: 583100, maxy: 4507100, maxz: 130 }
});

const cloudFeatures = () => [
    {
        type: 'Feature',
        id: 'm-dist',
        geometry: { type: 'LineString', coordinates: [oldGeometryPoint(CLOUD.A.local), oldGeometryPoint(CLOUD.B.local)] },
        properties: {
            measurementType: 'distance', name: 'Ridge', description: '', color: '#ff0000', 'stroke-width': 2, 'stroke-opacity': 1, fill: '#ff0000', 'fill-opacity': 0.2,
            showDistances: true, showCoordinates: false, showArea: false, showAngles: false, showCircle: false, showHeight: false, showEdges: true, closed: false,
            localCoordinates: [CLOUD.A.local, CLOUD.B.local], groupId: null, distance: 22.38, unit: 'm'
        }
    },
    {
        type: 'Feature',
        id: 'm-area',
        geometry: { type: 'Polygon', coordinates: [[oldGeometryPoint(CLOUD.A.local), oldGeometryPoint(CLOUD.C.local), oldGeometryPoint(CLOUD.D.local), oldGeometryPoint(CLOUD.A.local)]] },
        properties: {
            measurementType: 'area', name: 'Pad', description: '', color: '#00ff00', 'stroke-width': 2, 'stroke-opacity': 1, fill: '#00ff00', 'fill-opacity': 0.2,
            showDistances: true, showCoordinates: false, showArea: true, showAngles: false, showCircle: false, showHeight: false, showEdges: true, closed: true,
            localCoordinates: [CLOUD.A.local, CLOUD.C.local, CLOUD.D.local], groupId: null, area: 300, perimeter: 80.5, unit: 'm²'
        }
    },
    {
        type: 'Feature',
        id: 'm-angle',
        geometry: { type: 'Point', coordinates: oldGeometryPoint(CLOUD.B.local) },
        properties: {
            measurementType: 'angle', name: 'Corner', description: '', color: '#0000ff', 'stroke-width': 2, 'stroke-opacity': 1, fill: '#0000ff', 'fill-opacity': 0.2,
            showDistances: true, showCoordinates: false, showArea: false, showAngles: true, showCircle: false, showHeight: false, showEdges: true, closed: false,
            localCoordinates: [CLOUD.A.local, CLOUD.B.local, CLOUD.C.local], vertices: [CLOUD.A.local, CLOUD.B.local, CLOUD.C.local], groupId: null, angle: 90, unit: 'degrees'
        }
    },
    {
        type: 'Feature',
        id: 'a-1',
        geometry: { type: 'Point', coordinates: oldGeometryPoint(CLOUD.D.local) },
        properties: { measurementType: 'annotation', name: 'Crack', description: 'Look here', localCoordinates: [...CLOUD.D.local] }
    }
];

/** The 3D viewer's file, 1.0 */
export function pointCloudFile10({ srs = UTM_18N_WKT } = {}) {
    return {
        type: 'FeatureCollection',
        crs: WGS84_CRS,
        metadata: { version: '1.0', pointCloudFile: 'cloud.laz', createdAt: CREATED, modifiedAt: MODIFIED, application: 'Registry-Potree', coordinateSystem: cloudCoordinateSystem(srs) },
        features: cloudFeatures()
    };
}

/** The 3D viewer's file, 1.1: with the groups it was given */
export function pointCloudFile11() {
    const file = pointCloudFile10();
    file.metadata.version = '1.1';
    file.metadata.groups = GROUPS.map(g => ({ ...g }));
    return file;
}

/** The 3D viewer's file of a cloud that has no SRS */
export function pointCloudFileNoSrs() {
    const file = pointCloudFile10({ srs: null });
    // The old converter wrote the raw coordinates and labelled them WGS84 (scale and offset applied)
    file.features.forEach(f => {
        const local = f.properties.localCoordinates;
        const toRaw = p => [p[0] * COPC_SCALE[0] + COPC_OFFSET[0], p[1] * COPC_SCALE[1] + COPC_OFFSET[1], p[2] * COPC_SCALE[2] + COPC_OFFSET[2]];
        const points = typeof local[0] === 'number' ? [local] : local;
        const raw = points.map(toRaw);
        if (f.geometry.type === 'Polygon') f.geometry.coordinates = [[...raw.slice(0, 3), raw[0]]];
        else if (f.geometry.type === 'LineString') f.geometry.coordinates = raw;
        else f.geometry.coordinates = f.properties.measurementType === 'angle' ? raw[1] : raw[0];
    });
    return file;
}

/** A file with the map's groups and measurements and the 3D viewer's: the map saved last over a 3D file (1.1) */
export function mixedFile() {
    const cloud = pointCloudFile10();
    return {
        type: 'FeatureCollection',
        crs: WGS84_CRS,
        metadata: {
            version: '1.1', kind: 'measurements', orthophotoFile: 'cloud.laz', createdAt: CREATED, modifiedAt: MODIFIED, application: 'DroneDB Registry', unitPreference: 'metric',
            groups: GROUPS.map(g => ({ ...g })), pointCloudFile: 'cloud.laz', coordinateSystem: cloud.metadata.coordinateSystem
        },
        features: [...mapFeatures(), ...cloud.features]
    };
}

/** A stockpile file of the stockpile panel before the shared format: a single untagged polygon, no version */
export function legacyStockpileFile() {
    return {
        type: 'FeatureCollection',
        metadata: { kind: 'stockpile', application: 'Registry-Stockpile', createdAt: CREATED },
        features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[9, 45], [9.001, 45], [9.001, 45.001], [9, 45]]] }, properties: { title: 'Old pile', netVolume: 100 } }]
    };
}

/** A tagged stockpile in a file of the orthophoto application id */
export function orthophotoStockpileFile() {
    const file = mapFile10();
    file.metadata.application = 'Registry-Orthophoto';
    file.features.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [[[9, 45], [9.001, 45], [9.001, 45.001], [9, 45]]] },
        properties: { id: 's1', measurementType: 'stockpile', title: 'North pile', netVolume: 8097.19, materialDensity: 1.8, createdAt: CREATED }
    });
    return file;
}
