// @ts-check
/**
 * Small pure helpers of the 3D viewer.
 */
import { PRIMARY, primaryRgba } from '@/libs/palette';
import { areaParts, lengthParts } from '@/libs/format';
import { getPref, PREF, PREF_DEFAULTS } from '@/libs/preferences';

/**
 * [minLon, minLat, maxLon, maxLat] of a GeoJSON Feature or geometry (DroneDB footprints are
 * Features, so the coordinates live under .geometry).
 * @param {any} geom
 * @returns {number[]}
 */
export function geojsonBbox(geom) {
    const coordinates = geom.geometry ? geom.geometry.coordinates : geom.coordinates;
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    /** @param {any} c */
    const visit = c => {
        if (typeof c[0] === 'number') {
            minx = Math.min(minx, c[0]); maxx = Math.max(maxx, c[0]);
            miny = Math.min(miny, c[1]); maxy = Math.max(maxy, c[1]);
        } else {
            c.forEach(visit);
        }
    };
    if (coordinates) visit(coordinates);
    return [minx, miny, maxx, maxy];
}

/**
 * Whether a Box3 is finite (no NaN / Infinity) and not inverted.
 * @param {{ min: { x: number, y: number, z: number }, max: { x: number, y: number, z: number } }} box
 */
export function isFiniteBox(box) {
    const v = [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z];
    return v.every(Number.isFinite) && box.max.x >= box.min.x && box.max.y >= box.min.y && box.max.z >= box.min.z;
}

/**
 * Distance at which a camera sees a sphere whole, whatever the shape of the screen: the
 * vertical field of view limits a landscape view, the horizontal one a portrait view.
 * @param {number} radius Radius of the sphere
 * @param {number} fovDeg Vertical field of view in degrees
 * @param {number} aspect Width / height of the view (1 when not known yet)
 * @param {number} [margin] Room left around the sphere (1 = touching the narrower edges)
 */
export function fitDistance(radius, fovDeg, aspect, margin = 1.1) {
    const halfVertical = fovDeg * Math.PI / 360;
    const halfHorizontal = Math.atan(Math.tan(halfVertical) * (aspect > 0 ? aspect : 1));
    return margin * radius / Math.sin(Math.min(halfVertical, halfHorizontal));
}

/**
 * Whether a canvas has to be resized to the size it has on the page. The drawing buffer is the
 * page size times the pixel ratio, so that is what it is compared with (comparing it with the
 * page size alone resizes the canvas on every frame on a screen with a ratio other than 1). A
 * canvas with no size on the page (hidden) is left as it is.
 * @param {{ width: number, height: number, clientWidth: number, clientHeight: number }} canvas
 * @param {number} pixelRatio The ratio the renderer draws at (renderer.getPixelRatio())
 */
export function canvasNeedsResize(canvas, pixelRatio) {
    if (!canvas.clientWidth || !canvas.clientHeight) return false;
    return canvas.width !== Math.floor(canvas.clientWidth * pixelRatio)
        || canvas.height !== Math.floor(canvas.clientHeight * pixelRatio);
}

/** Low to high elevation colours (blue, cyan, green, yellow, red). */
export const ELEVATION_RAMP = [0x2c7bb6, 0x00a6ca, 0x00ccbc, 0x90eb9d, 0xffff8c, 0xf9d057, 0xf29e2e, 0xe76818, 0xd7191c];

/** The colour of the shapes drawn by the measurement tools of the 3D viewers. */
export const MEASURE_COLOR = '#f2a51a';

/**
 * The units of the measurement labels below the scales of the map (libs/format.js), largest
 * first: a value is written in the first unit it reaches (`min`, in metres or square metres),
 * with the unit's decimals. A metric length is in kilometres from 1 km, metres from 1 m, then
 * centimetres and millimetres; an area below a square metre is in square centimetres (square
 * millimetres below one), below a square foot in square inches. So the short lengths of a small
 * scene, such as a splat given a scale, do not read "0.0 m" or "0 m²".
 * @typedef {{ min: number, size: number, unit: string, digits: number }} SmallUnit
 */
/** @type {SmallUnit[]} */
const METRIC_LENGTHS = [
    { min: 1000, size: 1000, unit: 'km', digits: 2 },
    { min: 1, size: 1, unit: 'm', digits: 1 },
    { min: 0.01, size: 0.01, unit: 'cm', digits: 1 },
    { min: 0, size: 0.001, unit: 'mm', digits: 1 }
];
const M_PER_FOOT = 0.3048;
const M_PER_INCH = 0.0254;
/** @type {SmallUnit[]} */
const SMALL_METRIC_AREAS = [
    { min: 1e-4, size: 1e-4, unit: 'cm²', digits: 0 },
    { min: 0, size: 1e-6, unit: 'mm²', digits: 0 }
];
/** @type {SmallUnit[]} */
const SMALL_IMPERIAL_AREAS = [{ min: 0, size: M_PER_INCH * M_PER_INCH, unit: 'in²', digits: 1 }];

/** A value in the first of these units it reaches. @param {number} v @param {SmallUnit[]} units */
function formatIn(v, units) {
    const { size, unit, digits } = units.find(u => Math.abs(v) >= u.min) ?? units[units.length - 1];
    return `${(v / size).toFixed(digits)} ${unit}`;
}

/** The units the user reads measurements in ('metric' or 'imperial'), at call time */
const preferredUnits = () => getPref(PREF.MEASURE_UNIT, PREF_DEFAULTS[PREF.MEASURE_UNIT]);

/**
 * A length in metres in the user's units: metric as METRIC_LENGTHS, imperial in feet as the map
 * writes them, in inches below a foot.
 * @param {number} meters @param {string} units
 */
function groundLength(meters, units) {
    if (units === 'metric') return formatIn(meters, METRIC_LENGTHS);
    return Math.abs(meters) >= M_PER_FOOT ? lengthParts(meters, units).text : `${(meters / M_PER_INCH).toFixed(1)} in`;
}

/**
 * An area in square metres in the user's units, on the area scale of the map (m², ha, km²; ft²,
 * acres) from 1 m² or 1 ft², below that in SMALL_METRIC_AREAS or SMALL_IMPERIAL_AREAS.
 * @param {number} squareMeters @param {string} units
 */
function groundArea(squareMeters, units) {
    const metric = units === 'metric';
    const smallest = metric ? 1 : M_PER_FOOT * M_PER_FOOT;
    if (Math.abs(squareMeters) >= smallest) return areaParts(squareMeters, units).text;
    return formatIn(squareMeters, metric ? SMALL_METRIC_AREAS : SMALL_IMPERIAL_AREAS);
}

/**
 * Measurement labels. `scale` corrects Web Mercator lengths to ground lengths (cos latitude;
 * 1 in metric CRSs) and is read at call time. `unit` names what the lengths are in: metres, or
 * (a scene with no known scale) anything else, which is written as it is and never turned into
 * another unit. Lengths in metres are written in `units` ('metric' or 'imperial'; the user's
 * preference by default). Both are read at call time too.
 * @param {() => number} scale
 * @param {() => string} [unit]
 * @param {() => string} [units]
 */
export function measureFormatters(scale, unit = () => 'm', units = preferredUnits) {
    return {
        /** @param {{ length: number }} m */
        length: ({ length }) => {
            const v = length * scale();
            const u = unit();
            return u === 'm' ? groundLength(v, units()) : `${v.toFixed(2)} ${u}`;
        },
        /** @param {{ area: number }} m */
        area: ({ area }) => {
            const v = area * scale() * scale();
            const u = unit();
            return u === 'm' ? groundArea(v, units()) : `${v.toFixed(2)} ${u}²`;
        }
    };
}

/**
 * OpenLayers style function for MVT features (points, lines, polygons).
 * @param {any} olStyle  the ol/style module
 */
export function vectorStyle({ Style, Fill, Stroke, Circle }) {
    const stroke = new Stroke({ color: PRIMARY[500], width: 2 });
    const polygon = new Style({ stroke, fill: new Fill({ color: primaryRgba(0.25) }) });
    const line = new Style({ stroke });
    const point = new Style({ image: new Circle({ radius: 4, fill: new Fill({ color: PRIMARY[500] }), stroke }) });
    /** @param {any} feature */
    return feature => {
        const type = feature.getGeometry().getType();
        if (type.indexOf('Polygon') >= 0) return polygon;
        if (type.indexOf('LineString') >= 0) return line;
        return point;
    };
}
