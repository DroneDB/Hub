/**
 * FR-MAP-15 / D-032: lengths and areas on the WGS84 ellipsoid. The expected values come from the
 * construction of each shape in a transverse Mercator grid whose scale is 1 on the central meridian
 * (a UTM zone without the 0.9996 factor, as SWEREF99 is): a side of 100 grid metres is 100 ground
 * metres, so the shapes measure 100 m and 10,000 m2 whatever the latitude. These grids are named after
 * the UTM zone whose central meridian they share (TM_32 / TM_33), but they are not UTM: one case below
 * uses real UTM (k0 = 0.9996) and turns its grid metres into ground metres with the point scale factor.
 */
import { describe, it, expect } from 'vitest';
import proj4 from 'proj4';
import { fromLonLat } from 'ol/proj';
import { LineString, Polygon, Point, MultiPolygon } from 'ol/geom';
import { geodesicLength, geodesicArea } from './geodesic';

/** Transverse Mercator, k = 1, on the UTM 32N central meridian (9°E) */
const TM_32 = '+proj=tmerc +lat_0=0 +lon_0=9 +k=1 +x_0=500000 +y_0=0 +ellps=WGS84 +units=m +no_defs';
/** Transverse Mercator, k = 1, on the UTM 33N central meridian (15°E) */
const TM_33 = '+proj=tmerc +lat_0=0 +lon_0=15 +k=1 +x_0=500000 +y_0=0 +ellps=WGS84 +units=m +no_defs';
/** Real UTM 32N: k0 = 0.9996 on the central meridian */
const UTM32N = '+proj=utm +zone=32 +ellps=WGS84 +units=m +no_defs';
const WGS84 = '+proj=longlat +datum=WGS84 +no_defs';

/** The map (Web Mercator) coordinate of a grid easting / northing */
const mapPoint = (utm, e, n) => fromLonLat(proj4(utm, WGS84, [e, n]));

/** The origin of a shape: the easting / northing of a latitude on the central meridian, plus a little east */
const originAt = (utm, lat) => {
    const [e, n] = proj4(WGS84, utm, [utm === TM_32 ? 9.001 : 15.001, lat]);
    return [e, n];
};

/** A square of `side` metres from its south-west corner, counter-clockwise, closed */
const squareAt = (utm, [e, n], side = 100) => [
    mapPoint(utm, e, n), mapPoint(utm, e + side, n), mapPoint(utm, e + side, n + side),
    mapPoint(utm, e, n + side), mapPoint(utm, e, n)
];

describe('geodesicLength', () => {
    it.each([
        ['transverse Mercator, k=1, on the UTM 32N central meridian', TM_32],
        ['transverse Mercator, k=1, on the UTM 33N central meridian', TM_33]
    ])('measures a 100 m east-west line at 56°N built from %s as 100.00 m (ol/sphere gave 99.66 m)', (_, utm) => {
        const [e, n] = originAt(utm, 56);
        const line = new LineString([mapPoint(utm, e, n), mapPoint(utm, e + 100, n)]);
        expect(geodesicLength(line)).toBeCloseTo(100, 2);
        expect(Math.abs(geodesicLength(line) - 100)).toBeLessThan(0.01);
    });

    // Real UTM: a grid metre is 1/k of a ground metre, k the point scale factor, 0.9996 on the central
    // meridian and more than 1 three degrees east of it. A side of 100 ground metres is 100 x k grid
    // metres, k from the transverse Mercator series (Snyder, Map Projections - A Working Manual, 8-25)
    // at the middle of the side.
    it.each([
        ['near the central meridian (9.001°E, k = 0.9996)', 9.001],
        ['three degrees east of it (12°E, k = 1.00003)', 12]
    ])('measures a 100 m east-west line at 56°N built from real UTM 32N (k0 = 0.9996) %s as 100.00 m', (_, lon) => {
        const f = 1 / 298.257223563;
        const e2 = f * (2 - f);
        const ep2 = e2 / (1 - e2);
        const k0 = 0.9996;
        /** The point scale factor of UTM 32N at a longitude / latitude */
        const scaleAt = ([lonDeg, latDeg]) => {
            const phi = latDeg * Math.PI / 180;
            const A = ((lonDeg - 9) * Math.PI / 180) * Math.cos(phi);
            const T = Math.tan(phi) ** 2;
            const C = ep2 * Math.cos(phi) ** 2;
            return k0 * (1 + (1 + C) * A ** 2 / 2 + (5 - 4 * T + 42 * C + 13 * C ** 2 - 28 * ep2) * A ** 4 / 24
                + (61 - 148 * T + 16 * T ** 2) * A ** 6 / 720);
        };
        const [e, n] = proj4(WGS84, UTM32N, [lon, 56]);
        const k = scaleAt(proj4(UTM32N, WGS84, [e + 50, n]));
        const gridSide = 100 * k;
        const line = new LineString([mapPoint(UTM32N, e, n), mapPoint(UTM32N, e + gridSide, n)]);
        expect(Math.abs(geodesicLength(line) - 100)).toBeLessThan(0.01);
    });

    it('measures a north-south line and a line of several segments', () => {
        const [e, n] = originAt(TM_32, 56);
        expect(geodesicLength(new LineString([mapPoint(TM_32, e, n), mapPoint(TM_32, e, n + 100)]))).toBeCloseTo(100, 2);
        const bent = new LineString([mapPoint(TM_32, e, n), mapPoint(TM_32, e + 100, n), mapPoint(TM_32, e + 100, n + 50)]);
        expect(Math.abs(geodesicLength(bent) - 150)).toBeLessThan(0.01);
    });

    it('does not use the Web Mercator metres, which are 1/cos(lat) too long', () => {
        const [e, n] = originAt(TM_32, 56);
        const a = mapPoint(TM_32, e, n);
        const b = mapPoint(TM_32, e + 100, n);
        const planar = Math.hypot(b[0] - a[0], b[1] - a[1]);
        expect(planar).toBeGreaterThan(170);
        expect(geodesicLength(new LineString([a, b]))).toBeLessThan(100.01);
    });

    it('measures the quadrant of the WGS84 meridian from the equator to the pole (10,001,965.729 m)', () => {
        expect(geodesicLength([[10, 0], [10, 90]])).toBeCloseTo(10001965.729, 2);
    });

    it('takes longitude / latitude coordinates as well as a geometry, with the same result', () => {
        const lonLat = [[9.001, 56], [9.0016, 56.0004], [9.003, 56.001]];
        const line = new LineString(lonLat.map((c) => fromLonLat(c)));
        expect(geodesicLength(lonLat)).toBeCloseTo(geodesicLength(line), 4);
        expect(geodesicLength(lonLat)).toBeGreaterThan(100);
    });

    it('measures a line over the antimeridian, in a map coordinate past the world edge or as -180..180', () => {
        // 0.01° of longitude at the equator = 1113.195 m
        const eastOfLine = new LineString([fromLonLat([179.995, 0]), fromLonLat([180.005, 0])]);
        expect(geodesicLength(eastOfLine)).toBeCloseTo(1113.195, 2);
        expect(geodesicLength([[179.995, 0], [-179.995, 0]])).toBeCloseTo(1113.195, 2);
        expect(geodesicLength([[-179.995, 0], [179.995, 0]])).toBeCloseTo(1113.195, 2);
    });

    it('is 0 for a degenerate geometry and for anything that is not a line', () => {
        expect(geodesicLength(null)).toBe(0);
        expect(geodesicLength([])).toBe(0);
        expect(geodesicLength([[9, 56]])).toBe(0);
        expect(geodesicLength(new LineString([fromLonLat([9, 56]), fromLonLat([9, 56])]))).toBe(0);
        expect(geodesicLength(new Point(fromLonLat([9, 56])))).toBe(0);
        expect(geodesicLength([[9, 56], [NaN, NaN]])).toBe(0);
    });

    it('measures the perimeter of a polygon', () => {
        const [e, n] = originAt(TM_32, 56);
        const square = new Polygon([squareAt(TM_32, [e, n])]);
        expect(Math.abs(geodesicLength(square) - 400)).toBeLessThan(0.01);
    });
});

describe('geodesicArea', () => {
    it.each([
        [0, 'the equator'],
        [56, '56°N'],
        [70, '70°N']
    ])('measures a 100 x 100 m square built from transverse Mercator, k=1 (UTM 32N / 33N central meridians), at %i° (%s) as 10,000 m2', (lat) => {
        for (const utm of [TM_32, TM_33]) {
            const [e, n] = originAt(utm, lat);
            const area = geodesicArea(new Polygon([squareAt(utm, [e, n])]));
            expect(Math.abs(area - 10000)).toBeLessThan(1);
        }
    });

    it('does not depend on the winding order', () => {
        const [e, n] = originAt(TM_32, 56);
        const ccw = squareAt(TM_32, [e, n]);
        const cw = ccw.slice().reverse();
        expect(Math.abs(geodesicArea(new Polygon([cw])) - 10000)).toBeLessThan(1);
        expect(geodesicArea(new Polygon([cw]))).toBeCloseTo(geodesicArea(new Polygon([ccw])), 6);
        expect(geodesicArea(new Polygon([cw]))).toBeGreaterThan(0);
    });

    it('does not depend on a duplicated closing vertex', () => {
        const [e, n] = originAt(TM_32, 56);
        const closed = squareAt(TM_32, [e, n]);
        const open = closed.slice(0, -1);
        expect(geodesicArea(new Polygon([closed]))).toBeCloseTo(geodesicArea(new Polygon([open])), 6);
        // Repeating the closing vertex twice changes nothing either
        const twice = [...closed, closed[0]];
        expect(geodesicArea(new Polygon([twice]))).toBeCloseTo(geodesicArea(new Polygon([closed])), 6);
    });

    // A grid of scale 1 near its central meridian: a hole of 50 x 50 grid metres in a 100 x 100 square
    // leaves 100^2 - 50^2 = 7,500 m2, as ol/sphere took holes off
    it('takes a hole off: 100 x 100 m less a 50 x 50 m hole is 7,500 m2, whatever the winding', () => {
        const [e, n] = originAt(TM_32, 56);
        const outer = squareAt(TM_32, [e, n]);
        const hole = squareAt(TM_32, [e + 25, n + 25], 50);
        expect(Math.abs(geodesicArea(new Polygon([outer, hole])) - 7500)).toBeLessThan(1);
        // A hole wound clockwise, as GeoJSON wants it, is taken off just the same
        const cwHole = hole.slice().reverse();
        expect(Math.abs(geodesicArea(new Polygon([outer, cwHole])) - 7500)).toBeLessThan(1);
        // And the same rings as longitude / latitude coordinates
        const lonLat = [outer, hole].map((ring) => ring.map((c) => proj4('EPSG:3857', WGS84, c)));
        expect(Math.abs(geodesicArea(lonLat) - 7500)).toBeLessThan(1);
    });

    it('takes longitude / latitude coordinates as a ring or as the rings of a polygon, like the geometry', () => {
        const [e, n] = originAt(TM_32, 56);
        const mapRing = squareAt(TM_32, [e, n]);
        const lonLatRing = mapRing.map((c) => proj4('EPSG:3857', WGS84, c));
        const fromGeometry = geodesicArea(new Polygon([mapRing]));
        expect(geodesicArea(lonLatRing)).toBeCloseTo(fromGeometry, 4);
        expect(geodesicArea([lonLatRing])).toBeCloseTo(fromGeometry, 4);
    });

    it('measures the same area for a polygon one world to the east (longitudes past 180 are normalised)', () => {
        const [e, n] = originAt(TM_32, 56);
        const ring = squareAt(TM_32, [e, n]);
        const world = 2 * 20037508.342789244;
        const shifted = ring.map(([x, y]) => [x + world, y]);
        expect(geodesicArea(new Polygon([shifted]))).toBeCloseTo(geodesicArea(new Polygon([ring])), 4);
        const shiftedBack = ring.map(([x, y]) => [x - 3 * world, y]);
        expect(geodesicArea(new Polygon([shiftedBack]))).toBeCloseTo(geodesicArea(new Polygon([ring])), 4);
    });

    describe('across the antimeridian', () => {
        // A 0.01° x 0.01° quadrangle between the parallels 0° and 0.01° and the meridians 179.995° and
        // 180.005°. Its area from the closed form for the area between two parallels on the
        // ellipsoid (the authalic latitude): A = a2 / 2 x (q2 - q1) x dLon, with q(phi) =
        // (1 - e2) x [sin(phi) / (1 - e2 sin2(phi)) - ln((1 - e sin(phi)) / (1 + e sin(phi))) / 2e]
        const a = 6378137;
        const f = 1 / 298.257223563;
        const e2 = f * (2 - f);
        const e = Math.sqrt(e2);
        const q = (deg) => {
            const s = Math.sin(deg * Math.PI / 180);
            return (1 - e2) * (s / (1 - e2 * s * s) - Math.log((1 - e * s) / (1 + e * s)) / (2 * e));
        };
        const expected = (a * a / 2) * (q(0.01) - q(0)) * (0.01 * Math.PI / 180);

        it('is about 1.23 km2, the closed-form value', () => {
            expect(expected).toBeGreaterThan(1.2e6);
            expect(expected).toBeLessThan(1.26e6);
        });

        it('measures a quadrangle over the antimeridian drawn east of it (x past the world edge)', () => {
            const ring = [[179.995, 0], [180.005, 0], [180.005, 0.01], [179.995, 0.01], [179.995, 0]].map((c) => fromLonLat(c));
            expect(Math.abs(geodesicArea(new Polygon([ring])) - expected)).toBeLessThan(1);
        });

        it('measures it as -180..180 longitudes, in both winding orders', () => {
            const ring = [[179.995, 0], [-179.995, 0], [-179.995, 0.01], [179.995, 0.01], [179.995, 0]];
            expect(Math.abs(geodesicArea(ring) - expected)).toBeLessThan(1);
            expect(Math.abs(geodesicArea(ring.slice().reverse()) - expected)).toBeLessThan(1);
        });

        it('equals the same quadrangle far from the antimeridian', () => {
            const ring = [[9, 0], [9.01, 0], [9.01, 0.01], [9, 0.01], [9, 0]];
            expect(Math.abs(geodesicArea(ring) - expected)).toBeLessThan(1);
        });
    });

    it('sums the outer rings of a multi-polygon', () => {
        const [e, n] = originAt(TM_32, 56);
        const one = squareAt(TM_32, [e, n]);
        const two = squareAt(TM_32, [e + 500, n]);
        const multi = new MultiPolygon([[one], [two]]);
        expect(Math.abs(geodesicArea(multi) - 20000)).toBeLessThan(2);
    });

    // Each polygon less its own holes: (100^2 - 50^2) + (100^2 - 2 x 20^2) = 7,500 + 9,200 = 16,700 m2
    it('takes the holes of each polygon of a multi-polygon off that polygon', () => {
        const [e, n] = originAt(TM_32, 56);
        const one = [squareAt(TM_32, [e, n]), squareAt(TM_32, [e + 25, n + 25], 50)];
        const two = [
            squareAt(TM_32, [e + 500, n]),
            squareAt(TM_32, [e + 510, n + 10], 20),
            squareAt(TM_32, [e + 560, n + 60], 20).slice().reverse()
        ];
        expect(Math.abs(geodesicArea(new MultiPolygon([one, two])) - 16700)).toBeLessThan(2);
    });

    it('is 0 for a degenerate geometry and for anything that is not a polygon', () => {
        expect(geodesicArea(null)).toBe(0);
        expect(geodesicArea([])).toBe(0);
        expect(geodesicArea([[9, 56]])).toBe(0);
        expect(geodesicArea([[9, 56], [9.001, 56]])).toBe(0);
        // Closing vertex only: two distinct positions
        expect(geodesicArea([[9, 56], [9.001, 56], [9, 56]])).toBe(0);
        // The same position three times
        expect(geodesicArea(new Polygon([[fromLonLat([9, 56]), fromLonLat([9, 56]), fromLonLat([9, 56]), fromLonLat([9, 56])]]))).toBe(0);
        // Collinear: no area (well under a square centimetre)
        expect(geodesicArea([[9, 0], [9.001, 0], [9.002, 0], [9, 0]])).toBeLessThan(1e-4);
        expect(geodesicArea(new Point(fromLonLat([9, 56])))).toBe(0);
        expect(geodesicArea(new LineString([fromLonLat([9, 56]), fromLonLat([9.001, 56])]))).toBe(0);
        expect(geodesicArea([[9, 56], [9.001, 56], [NaN, NaN]])).toBe(0);
    });
});
