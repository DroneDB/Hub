/**
 * The 3D viewer's measurements as GeoJSON. The positions of a Potree point cloud are in the CRS of the
 * cloud already (the decoder applies the scale and offset of the COPC header), so the geometry is those
 * positions reprojected and nothing else. Expected longitude, latitude and height are literals from
 * `echo "x y z" | gdaltransform -s_srs EPSG:32618 -t_srs EPSG:4326` (GDAL 3.12), not computed by the code.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { exportMeasurements, importMeasurements, measureValues, measurementFrame } from './potreeMeasurementConverter';
import { VIEW, sectionOf, read } from './measurementFormat';
import { loadPotree } from '@/libs/potree/potreeLibs.fixtures';
import { UTM_18N_WKT, COPC_SCALE, COPC_OFFSET, CLOUD, cloudCoordinateSystem } from './measurementFormat.fixtures';
import {
    WGS84_WKT, GEOCENTRIC_WKT, UTM_33N_WKT, UTM_33N_WKT2, FOOT_WKT, US_FOOT_COMPOUND_WKT, METRE_US_FOOT_HEIGHT_WKT, METRE_US_FOOT_HEIGHT_WKT2,
    US_FOOT_METRE_HEIGHT_WKT, EASE_GRID_WKT, EASE_GRID_WKT2, US_FOOT_WKT
} from './crs.fixtures';

// 0.01 m is about 9e-8 degrees of latitude: 1e-7 degree is the tolerance
const DEGREES = 1e-7;

class Vec {
    constructor(x, y, z) { this.x = x; this.y = y; this.z = z; }
    distanceTo(o) { return Math.hypot(this.x - o.x, this.y - o.y, this.z - o.z); }
}
const colour = hex => ({ getHexString: () => hex });

// A measure of the viewer has the id its feature has in the file: the uuid is the one of the session, and these specs
// name their measures by it
function measure(overrides, locals) {
    return {
        ddbProperties: { id: overrides?.uuid ?? 'm1' },
        uuid: 'm1', name: 'Measure', description: '', color: colour('ff0000'), strokeWidth: 2, strokeOpacity: 1, fillOpacity: 0.2,
        showDistances: true, showCoordinates: false, showArea: false, showAngles: false, showCircle: false, showHeight: false, showEdges: true, closed: false,
        points: locals.map(l => ({ position: new Vec(...l) })),
        ...overrides
    };
}

function viewerWith(measurements, annotations = []) {
    return { scene: { measurements, annotations: { traverse: fn => annotations.forEach(fn) } } };
}

const coordinateSystem = srs => ({ ...cloudCoordinateSystem(srs), scale: COPC_SCALE, offset: COPC_OFFSET });
const annotation = (local, uuid = 'ann') => ({ uuid, ddbProperties: { id: uuid }, title: 'Crack', description: '', position: new Vec(...local) });
// What a save puts in the file and a load reads back (through the format, as the storage does)
const onDisk = doc => read(JSON.parse(JSON.stringify(doc)));

describe('exportMeasurements: a UTM 18N point', () => {
    for (const [label, srs] of [['EPSG:32618', 'EPSG:32618'], ['the same CRS as WKT', UTM_18N_WKT]]) {
        it(`is within 0.01 m of the measured point (SRS as ${label}), at scale 0.001 with an offset, z kept`, () => {
            const viewer = viewerWith([measure({}, [CLOUD.A.local, CLOUD.B.local])]);
            const doc = exportMeasurements(viewer, 'cloud.laz', coordinateSystem(srs));
            const [first, second] = doc.features[0].geometry.coordinates;
            // echo "583000.123 4507000.456 123.456" | gdaltransform -s_srs EPSG:32618 -t_srs EPSG:4326
            expect(Math.abs(first[0] - -74.0174014310951)).toBeLessThan(DEGREES);
            expect(Math.abs(first[1] - 40.7097397626555)).toBeLessThan(DEGREES);
            expect(first[2]).toBeCloseTo(123.456, 9);
            // echo "583010.123 4507020.456 125.456" | gdaltransform ...
            expect(Math.abs(second[0] - -74.017280413874)).toBeLessThan(DEGREES);
            expect(Math.abs(second[1] - 40.7099189022989)).toBeLessThan(DEGREES);
            expect(second[2]).toBeCloseTo(125.456, 9);
            expect(doc.crs.properties.name).toBe('EPSG:4326');
            expect(doc.features[0].properties.localCoordinates).toEqual([CLOUD.A.local, CLOUD.B.local]);
        });
    }

    it('a position is not scaled or offset: a point at 583000, 4507000 stays near 74 W, 40.7 N', () => {
        const doc = exportMeasurements(viewerWith([measure({}, [[583000, 4507000, 10], [583001, 4507000, 10]])]), 'cloud.laz', coordinateSystem('EPSG:32618'));
        const [lon, lat] = doc.features[0].geometry.coordinates[0];
        expect(lon).toBeGreaterThan(-74.1);
        expect(lon).toBeLessThan(-73.9);
        expect(lat).toBeGreaterThan(40.6);
        expect(lat).toBeLessThan(40.8);
    });

    it('gives the geometry of every kind of measurement', () => {
        const [a, b, c, d] = [CLOUD.A, CLOUD.B, CLOUD.C, CLOUD.D];
        const doc = exportMeasurements(viewerWith([
            measure({ uuid: 'area', showArea: true, closed: true }, [a, c, d].map(p => p.local)),
            measure({ uuid: 'height', showHeight: true }, [a, b].map(p => p.local)),
            measure({ uuid: 'circle', showCircle: true }, [a, b].map(p => p.local)),
            measure({ uuid: 'point' }, [d.local])
        ], [annotation(c.local)]), 'cloud.laz', coordinateSystem('EPSG:32618'));
        const feature = id => doc.features.find(f => f.id === id);
        expect(feature('area').geometry.type).toBe('Polygon');
        expect(feature('area').geometry.coordinates[0]).toHaveLength(4);
        expect(feature('area').geometry.coordinates[0][0]).toEqual(feature('area').geometry.coordinates[0][3]);
        expect(feature('height').geometry.type).toBe('LineString');
        expect(feature('circle').geometry).toMatchObject({ type: 'Point' });
        expect(Math.abs(feature('circle').geometry.coordinates[0] - a.geo[0])).toBeLessThan(DEGREES);
        expect(Math.abs(feature('point').geometry.coordinates[1] - d.geo[1])).toBeLessThan(DEGREES);
        expect(Math.abs(feature('ann').geometry.coordinates[0] - c.geo[0])).toBeLessThan(DEGREES);
        expect(feature('ann').properties.localCoordinates).toEqual(c.local);
    });

    it('is the 3D viewer\'s document: 3.0, its features and its section', () => {
        const doc = exportMeasurements(viewerWith([measure({}, [CLOUD.A.local, CLOUD.B.local])]), 'cloud.laz', coordinateSystem('EPSG:32618'));
        expect(doc.metadata).toMatchObject({ version: '3.0', application: 'DroneDB Registry' });
        expect(sectionOf(doc, VIEW.POINT_CLOUD)).toMatchObject({ pointCloudFile: 'cloud.laz' });
        expect(sectionOf(doc, VIEW.POINT_CLOUD).coordinateSystem.srs).toBe('EPSG:32618');
        expect(doc.metadata.groups).toBeUndefined();
        // A second read of what was written changes nothing
        expect(read(doc)).toEqual(doc);
    });
});

describe('exportMeasurements: no usable CRS', () => {
    for (const [label, srs] of [['no SRS', null], ['an EPSG code proj4 does not know', 'EPSG:2056'], ['text that is no CRS', 'not a crs']]) {
        it(`${label}: only the local coordinates, no crs member, nothing labelled EPSG:4326`, () => {
            const doc = exportMeasurements(viewerWith([measure({}, [CLOUD.A.local, CLOUD.B.local])]), 'cloud.laz', coordinateSystem(srs));
            expect('crs' in doc).toBe(false);
            expect(JSON.stringify(doc)).not.toContain('EPSG:4326');
            expect(doc.features[0].properties.localCoordinates).toEqual([CLOUD.A.local, CLOUD.B.local]);
            expect(doc.features[0].geometry.coordinates).toEqual([CLOUD.A.local, CLOUD.B.local]);
        });
    }

    it('works with no coordinate system at all', () => {
        const doc = exportMeasurements(viewerWith([measure({}, [CLOUD.A.local, CLOUD.B.local])]), 'cloud.laz', null);
        expect('crs' in doc).toBe(false);
        expect(doc.features[0].properties.localCoordinates).toHaveLength(2);
    });
});

describe('importMeasurements', () => {
    afterEach(() => vi.unstubAllGlobals());

    function stubPotree() {
        const added = [];
        class Measure {
            constructor() { this.points = []; }
            addMarker({ position }) { this.points.push(position); }
        }
        class Annotation { constructor(options) { Object.assign(this, options); } }
        vi.stubGlobal('Potree', { Measure, Annotation });
        vi.stubGlobal('THREE', { Vector3: Vec, Color: class { constructor(c) { this.c = c; } } });
        const viewer = { scene: { addMeasurement: m => added.push(m), annotations: { add: a => added.push(a) } } };
        return { viewer, added };
    }

    it('puts a measurement back at its local coordinates when the COPC is in the CRS the file was saved in', () => {
        const { viewer, added } = stubPotree();
        const doc = exportMeasurements(viewerWith([measure({}, [CLOUD.A.local, CLOUD.B.local])]), 'cloud.laz', coordinateSystem('EPSG:32618'));
        importMeasurements(doc, viewer, coordinateSystem('EPSG:32618'));
        expect(added[0].points.map(p => [p.x, p.y, p.z])).toEqual([CLOUD.A.local, CLOUD.B.local]);
    });

    it('keeps the local coordinates exactly when the same CRS is written another way (WKT 1 saved, WKT 2 now)', () => {
        const { viewer, added } = stubPotree();
        const local = [[411295.168, 5170271.646, 600.5], [411381.959, 5170393.859, 610.25]];
        const doc = exportMeasurements(viewerWith([measure({}, local)], [annotation(local[0])]), 'cloud.laz', coordinateSystem(UTM_33N_WKT));
        importMeasurements(onDisk(doc), viewer, coordinateSystem(UTM_33N_WKT2));
        expect(added[0].points.map(p => [p.x, p.y, p.z])).toEqual(local);
        expect(added[1].position).toEqual(local[0]);
    });

    it('without local coordinates a position is worked back from the geometry through the CRS, with no scale or offset', () => {
        const { viewer, added } = stubPotree();
        const doc = exportMeasurements(viewerWith([measure({}, [CLOUD.A.local, CLOUD.B.local])]), 'cloud.laz', coordinateSystem('EPSG:32618'));
        delete doc.features[0].properties.localCoordinates;
        importMeasurements(doc, viewer, coordinateSystem('EPSG:32618'));
        added[0].points.forEach((p, i) => {
            const expected = [CLOUD.A, CLOUD.B][i].local;
            expect(Math.abs(p.x - expected[0])).toBeLessThan(0.01);
            expect(Math.abs(p.y - expected[1])).toBeLessThan(0.01);
            expect(p.z).toBeCloseTo(expected[2], 9);
        });
    });
});

describe('a COPC built again in another CRS than the one the measurements were saved in', () => {
    afterEach(() => vi.unstubAllGlobals());

    function stubPotree() {
        const added = [];
        class Measure {
            constructor() { this.points = []; }
            addMarker({ position }) { this.points.push(position); }
        }
        class Annotation { constructor(options) { Object.assign(this, options); } }
        vi.stubGlobal('Potree', { Measure, Annotation });
        vi.stubGlobal('THREE', { Vector3: Vec, Color: class { constructor(c) { this.c = c; } } });
        const viewer = { scene: { addMeasurement: m => added.push(m), annotations: { add: a => added.push(a) } } };
        return { viewer, added };
    }

    // Two points of a cloud in longitude and latitude (EPSG:4326, heights in metres), where they are in its COPC built
    // again in UTM 33N, and where they are in geocentric coordinates:
    // echo "lon lat h" | gdaltransform -s_srs EPSG:4326 -t_srs EPSG:32633; echo "lat lon h" | cs2cs EPSG:4979 EPSG:4978
    const P = {
        A: { geo: [13.8401234, 46.6801234, 600.5], utm: [411295.168136401, 5170271.64613447, 600.5], ecef: [4256756.969533, 1048721.126765, 4617877.373960] },
        B: { geo: [13.8412345, 46.6812345, 610.25], utm: [411381.958876673, 5170393.85921773, 610.25], ecef: [4256655.865261, 1048783.775353, 4617969.214704] }
    };
    const xyz = p => [p.x, p.y, p.z];
    // Within 1 cm of the UTM point GDAL gives
    const expectUtm = (actual, expected) => {
        expect(Math.hypot(actual[0] - expected[0], actual[1] - expected[1])).toBeLessThan(0.01);
        expect(Math.abs(actual[2] - expected[2])).toBeLessThan(0.01);
    };

    it('places a measure and an annotation saved in EPSG:4326 at their UTM points, within 1 cm', () => {
        const { viewer, added } = stubPotree();
        const saved = exportMeasurements(viewerWith([measure({}, [P.A.geo, P.B.geo])], [annotation(P.B.geo)]), 'cloud.laz', coordinateSystem(WGS84_WKT));
        importMeasurements(onDisk(saved), viewer, coordinateSystem(UTM_33N_WKT));
        const [restored, note] = added;
        expectUtm(xyz(restored.points[0]), P.A.utm);
        expectUtm(xyz(restored.points[1]), P.B.utm);
        expectUtm(note.position, P.B.utm);
    });

    it('places every point of a circle too (its geometry is its centre, its local coordinates are all its points)', () => {
        const { viewer, added } = stubPotree();
        const saved = exportMeasurements(viewerWith([measure({ uuid: 'circle', showCircle: true }, [P.A.geo, P.B.geo])]), 'cloud.laz', coordinateSystem(WGS84_WKT));
        importMeasurements(onDisk(saved), viewer, coordinateSystem(UTM_33N_WKT2));
        expect(added[0].points).toHaveLength(2);
        expectUtm(xyz(added[0].points[0]), P.A.utm);
        expectUtm(xyz(added[0].points[1]), P.B.utm);
    });

    it('a file saved on a geocentric COPC is placed in 3-D: the height above the ellipsoid becomes z', () => {
        const { viewer, added } = stubPotree();
        const saved = exportMeasurements(viewerWith([measure({}, [P.A.ecef, P.B.ecef])], [annotation(P.A.ecef)]), 'cloud.laz', coordinateSystem(GEOCENTRIC_WKT));
        importMeasurements(onDisk(saved), viewer, coordinateSystem(UTM_33N_WKT));
        expectUtm(xyz(added[0].points[0]), P.A.utm);
        expectUtm(xyz(added[0].points[1]), P.B.utm);
        expectUtm(added[1].position, P.A.utm);
    });

    it('a WGS84 file whose section states no CRS is placed from its geometry', () => {
        const { viewer, added } = stubPotree();
        const saved = onDisk(exportMeasurements(viewerWith([measure({}, [P.A.geo, P.B.geo])]), 'cloud.laz', coordinateSystem(WGS84_WKT)));
        delete sectionOf(saved, VIEW.POINT_CLOUD).coordinateSystem.srs;
        expect(saved.crs.properties.name).toBe('EPSG:4326');
        importMeasurements(saved, viewer, coordinateSystem(UTM_33N_WKT));
        expectUtm(xyz(added[0].points[0]), P.A.utm);
        expectUtm(xyz(added[0].points[1]), P.B.utm);
    });

    it('the next save writes the UTM positions and the CRS of the COPC, and the next load keeps them', () => {
        const { viewer, added } = stubPotree();
        const saved = exportMeasurements(viewerWith([measure({}, [P.A.geo, P.B.geo])]), 'cloud.laz', coordinateSystem(WGS84_WKT));
        importMeasurements(onDisk(saved), viewer, coordinateSystem(UTM_33N_WKT));
        const resaved = exportMeasurements(viewerWith([measure({}, added[0].points.map(xyz))]), 'cloud.laz', coordinateSystem(UTM_33N_WKT));
        expect(sectionOf(resaved, VIEW.POINT_CLOUD).coordinateSystem.srs).toBe(UTM_33N_WKT);
        expectUtm(resaved.features[0].properties.localCoordinates[0], P.A.utm);
        // Its geometry is where the first file's was: 1e-7 degree is about 1 cm
        const [lon, lat] = resaved.features[0].geometry.coordinates[0];
        expect(Math.abs(lon - P.A.geo[0])).toBeLessThan(1e-7);
        expect(Math.abs(lat - P.A.geo[1])).toBeLessThan(1e-7);
        // Loaded again on the same COPC: the local coordinates, as they are
        const second = stubPotree();
        importMeasurements(onDisk(resaved), second.viewer, coordinateSystem(UTM_33N_WKT2));
        expect(second.added[0].points.map(xyz)).toEqual(resaved.features[0].properties.localCoordinates);
    });

    it('does not draw what it cannot place: the COPC now has no CRS, or one proj4 cannot use', () => {
        const saved = exportMeasurements(viewerWith([measure({}, [P.A.geo, P.B.geo])], [annotation(P.A.geo)]), 'cloud.laz', coordinateSystem(WGS84_WKT));
        for (const srs of [null, 'EPSG:2056']) {
            const { viewer, added } = stubPotree();
            // Degrees in a metric scene would be far from the cloud, and a save would label them with its CRS
            expect(importMeasurements(onDisk(saved), viewer, coordinateSystem(srs))).toEqual({ imported: [], unplaced: 2 });
            expect(added).toEqual([]);
        }
    });

    it('does not draw what was saved in a CRS proj4 cannot use when the COPC is in another one', () => {
        const { viewer, added } = stubPotree();
        const saved = exportMeasurements(viewerWith([measure({}, [P.A.utm, P.B.utm])]), 'cloud.laz', coordinateSystem('EPSG:2056'));
        expect(importMeasurements(onDisk(saved), viewer, coordinateSystem(UTM_33N_WKT)).unplaced).toBe(1);
        expect(added).toEqual([]);
        // The same text is the same CRS: drawn as it was saved
        expect(importMeasurements(onDisk(saved), viewer, coordinateSystem('EPSG:2056')).imported).toHaveLength(1);
        expect(added[0].points.map(xyz)).toEqual([P.A.utm, P.B.utm]);
    });

    it('draws what was saved in a CRS proj4 cannot use on a COPC that states it in other words (WKT 1 saved, WKT 2 now)', () => {
        // Neither text can be compared with the other through proj4, and no build reprojects into such a CRS
        const local = [[1000, 2000, 10], [1030, 2040, 12]];
        const saved = exportMeasurements(viewerWith([measure({}, local)], [annotation(local[1])]), 'cloud.laz', coordinateSystem(EASE_GRID_WKT));
        const { viewer, added } = stubPotree();
        expect(importMeasurements(onDisk(saved), viewer, coordinateSystem(EASE_GRID_WKT2)).unplaced).toBe(0);
        expect(added).toHaveLength(2);
        expect(added[0].points.map(xyz)).toEqual(local);
        expect(added[1].position).toEqual(local[1]);
    });
});

describe('the unit of the lengths of a saved measurement', () => {
    it('is the unit of the CRS of the cloud: metres, feet or US survey feet', () => {
        const local = [[1000, 2000, 10], [1030, 2040, 10], [1030, 2000, 10]];
        const units = srs => {
            const doc = exportMeasurements(viewerWith([measure({ uuid: 'd' }, local.slice(0, 2)), measure({ uuid: 'a', showArea: true, closed: true }, local)]), 'cloud.laz', coordinateSystem(srs));
            return doc.features.map(f => [f.properties.unit, f.properties.distance ?? f.properties.area]);
        };
        expect(units(UTM_33N_WKT)).toEqual([['m', 50], ['m²', 600]]);
        expect(units(FOOT_WKT)).toEqual([['ft', 50], ['ft²', 600]]);
        expect(units(US_FOOT_COMPOUND_WKT)).toEqual([['ftUS', 50], ['ftUS²', 600]]);
        expect(units(null)).toEqual([['m', 50], ['m²', 600]]);
    });
});

describe('the lengths of a cloud whose heights are in another unit than its x and y', () => {
    const FT_US = 1200 / 3937;
    const props = (srs, overrides, local) => exportMeasurements(viewerWith([measure(overrides, local)]), 'cloud.laz', coordinateSystem(srs)).features[0].properties;

    it('metres across and US survey feet up: every axis in metres, and the unit is m', () => {
        // 3 m east, 4 m north, 10 ft up
        const p = props(METRE_US_FOOT_HEIGHT_WKT, {}, [[0, 0, 0], [3, 4, 10]]);
        expect(p.unit).toBe('m');
        expect(p.distance).toBe(parseFloat(Math.hypot(3, 4, 10 * FT_US).toFixed(2)));
        // A height of 100 ft is 30.48 m, not 100 m
        expect(props(METRE_US_FOOT_HEIGHT_WKT2, { showHeight: true }, [[0, 0, 0], [0, 0, 100]]).distance).toBe(30.48);
    });

    it('US survey feet across and metres up: the same', () => {
        const p = props(US_FOOT_METRE_HEIGHT_WKT, {}, [[0, 0, 0], [100, 0, 0]]);
        expect(p).toMatchObject({ unit: 'm', distance: 30.48 });
        expect(props(US_FOOT_METRE_HEIGHT_WKT, { showArea: true, closed: true }, [[0, 0, 0], [100, 0, 0], [100, 100, 0]]))
            .toMatchObject({ unit: 'm²', area: parseFloat((100 * FT_US * 100 * FT_US / 2).toFixed(2)) });
    });

    it('a height is the difference between the highest and the lowest point, as Potree shows it, not the slant length', () => {
        // 6 m east and 8 m north of the foot, 2.5 m up: the line is 10.3 m long, the height 2.5 m
        expect(props(UTM_33N_WKT, { showHeight: true }, [[0, 0, 10], [6, 8, 12.5]])).toMatchObject({ unit: 'm', distance: 2.5 });
        // The order of the points does not matter
        expect(props(UTM_33N_WKT, { showHeight: true }, [[6, 8, 12.5], [0, 0, 10]]).distance).toBe(2.5);
        // In US survey feet up and metres across, the height is in metres
        expect(props(METRE_US_FOOT_HEIGHT_WKT2, { showHeight: true }, [[0, 0, 0], [30, 40, 100]]).distance).toBe(30.48);
    });

    it('feet across and up stay in feet', () => {
        expect(props(US_FOOT_COMPOUND_WKT, { showHeight: true }, [[0, 0, 0], [0, 0, 100]])).toMatchObject({ unit: 'ftUS', distance: 100 });
    });
});

describe('the radius of a circle', () => {
    it('is the radius of the circle through its three points, the circle Potree draws', () => {
        const p = exportMeasurements(viewerWith([measure({ showCircle: true }, [[5, 0, 0], [0, 5, 0], [-5, 0, 0]])]), 'cloud.laz', coordinateSystem(UTM_33N_WKT))
            .features[0].properties;
        expect(p.radius).toBe(5);
        expect(p.circumference).toBeCloseTo(10 * Math.PI, 9);
        expect(p.area).toBeCloseTo(25 * Math.PI, 9);
        expect(p.unit).toBe('m');
    });

    it('has no radius before it has three points (Potree draws no circle)', () => {
        const p = exportMeasurements(viewerWith([measure({ showCircle: true }, [[5, 0, 0], [0, 5, 0]])]), 'cloud.laz', coordinateSystem(UTM_33N_WKT))
            .features[0].properties;
        expect(p.radius).toBeUndefined();
    });
});

describe('the title and the description of an annotation', () => {
    const MARKUP = '<img src=x onerror=alert(1)>';
    const feature = (name, description) => ({
        type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] },
        properties: { measurementType: 'annotation', name, description, localCoordinates: CLOUD.A.local }
    });
    const importAnnotation = (name, description) => {
        const added = [];
        const viewer = { scene: { addMeasurement: () => {}, annotations: { add: a => added.push(a) } } };
        importMeasurements({ features: [feature(name, description)] }, viewer, coordinateSystem('EPSG:32618'));
        return added[0];
    };

    afterEach(() => vi.unstubAllGlobals());

    it('is handed to Potree escaped, which keeps both as HTML', () => {
        // Potree's own Annotation stands in: it records what it is given
        class Annotation { constructor(options) { Object.assign(this, options); } }
        vi.stubGlobal('Potree', { Annotation });

        const annotation = importAnnotation(MARKUP, `${MARKUP} & more`);

        expect(annotation.title).toBe('&lt;img src=x onerror=alert(1)&gt;');
        expect(annotation.description).toBe('&lt;img src=x onerror=alert(1)&gt; &amp; more');
    });

    it('is saved as the text the user wrote', () => {
        class Annotation {
            constructor(options) { Object.assign(this, options); this.uuid = 'a1'; }
        }
        vi.stubGlobal('Potree', { Annotation });
        const written = importAnnotation(MARKUP, `${MARKUP} & more`);

        // Potree's panel hands back HTML: what it was given, as the browser serialises it
        const doc = exportMeasurements(viewerWith([], [{ ...written, position: new Vec(...CLOUD.A.local) }]), 'cloud.laz', coordinateSystem('EPSG:32618'));

        expect(doc.features[0].properties.name).toBe(MARKUP);
        expect(doc.features[0].properties.description).toBe(`${MARKUP} & more`);
    });

    it('shows the line breaks of a description, and reads back the lines the panel typed', () => {
        const Potree = loadPotree();
        vi.stubGlobal('Potree', Potree);
        const annotation = importAnnotation('Gate', 'first\nsecond');

        const content = annotation.domElement.find('.annotation-description-content');
        expect(content.find('br')).toHaveLength(1);
        expect(content.text()).toBe('firstsecond');

        // What the contenteditable panel hands back for lines typed there
        for (const typed of ['a<br>b', 'a<div>b</div>']) {
            annotation.description = typed;
            const doc = exportMeasurements(viewerWith([], [annotation]), 'cloud.laz', coordinateSystem('EPSG:32618'));
            expect(doc.features[0].properties.description).toBe('a\nb');
            const again = importAnnotation('Gate', doc.features[0].properties.description);
            const shown = again.domElement.find('.annotation-description-content');
            expect(shown.find('br')).toHaveLength(1);
            expect(shown.find('img')).toHaveLength(0);
        }
    });

    it('is the same text after the trip into Potree and back, with & < and newlines', () => {
        const Potree = loadPotree();
        vi.stubGlobal('Potree', Potree);
        for (const text of ['a & b', 'x < y > z', '<img src=x onerror=alert(1)>\nline 2', 'one\n\nthree', '&amp; &lt;b&gt;']) {
            const annotation = importAnnotation(text, text);
            const doc = exportMeasurements(viewerWith([], [annotation]), 'cloud.laz', coordinateSystem('EPSG:32618'));
            expect(doc.features[0].properties.name).toBe(text);
            expect(doc.features[0].properties.description).toBe(text);
            expect(annotation.domElement.find('.annotation-label img, .annotation-description-content img')).toHaveLength(0);
        }
    });

    it('shows the literal <br> of a file saved before as text: nothing in it is a tag', () => {
        const Potree = loadPotree();
        vi.stubGlobal('Potree', Potree);
        const annotation = importAnnotation('Old', 'first<br>second<img src=x onerror=alert(1)>');

        const content = annotation.domElement.find('.annotation-description-content');
        expect(content.find('br, img')).toHaveLength(0);
        expect(content.text()).toBe('first<br>second<img src=x onerror=alert(1)>');
    });

    it('creates no element in the label and the panel text of the real Potree annotation', () => {
        const Potree = loadPotree();
        vi.stubGlobal('Potree', Potree);

        const annotation = importAnnotation(MARKUP, MARKUP);

        expect(annotation.domElement.find('img[src="x"]')).toHaveLength(0);
        expect(annotation.domElement.find('.annotation-label').text()).toBe(MARKUP);
        expect(annotation.domElement.find('.annotation-description-content').text()).toBe(MARKUP);
        // The setters of the panel parse the value the same way
        annotation.title = '&lt;img src=y onerror=1&gt;';
        annotation.description = '&lt;img src=y onerror=1&gt;';
        expect(annotation.domElement.find('img[src="y"]')).toHaveLength(0);
        // and what the real annotation holds goes back to the file as it was written
        const doc = exportMeasurements(viewerWith([], [annotation]), 'cloud.laz', coordinateSystem('EPSG:32618'));
        expect(doc.features[0].properties.name).toBe('<img src=y onerror=1>');
    });
});

describe('the identity and the properties of a feature that the viewer does not know', () => {
    afterEach(() => vi.unstubAllGlobals());

    function stubPotree() {
        const added = [];
        class Measure {
            constructor() { this.points = []; }
            addMarker({ position }) { this.points.push(position); }
        }
        class Annotation { constructor(options) { Object.assign(this, options); } }
        vi.stubGlobal('Potree', { Measure, Annotation });
        vi.stubGlobal('THREE', { Vector3: Vec, Color: class { constructor(c) { this.c = c; } } });
        return { viewer: { scene: { addMeasurement: m => added.push(m), annotations: { add: a => added.push(a) } } }, added };
    }
    const FIELDS = {
        id: 'stable-id', ref: '7', category: 'defect', severity: 'high', status: 'open', assignee: 'Anna', dueDate: '2026-12-01', report: false,
        photos: [{ path: 'a/photo.jpg', source: 'dataset', caption: 'Crack' }], snapshot: { path: 'annotations/stable-id-3d.webp', camera: { position: [1, 2, 3], target: [4, 5, 6] } }
    };
    const withProperties = (feature, extra) => ({ ...feature, properties: { ...feature.properties, ...extra } });
    const exported = () => exportMeasurements(viewerWith([measure({}, [CLOUD.A.local, CLOUD.B.local])], [annotation(CLOUD.D.local)]), 'cloud.laz', coordinateSystem('EPSG:32618'));
    // Saved by this Hub, edited by another tool, loaded into the viewer and saved again
    function roundTrip(doc) {
        const { viewer, added } = stubPotree();
        importMeasurements(onDisk(doc), viewer, coordinateSystem('EPSG:32618'));
        const [loadedMeasure, loadedNote] = added;
        const savedAgain = measure({ ddbProperties: loadedMeasure.ddbProperties }, loadedMeasure.points.map(p => [p.x, p.y, p.z]));
        const again = exportMeasurements(viewerWith([savedAgain], [{ ...annotation(CLOUD.D.local), ddbProperties: loadedNote.ddbProperties }]),
            'cloud.laz', coordinateSystem('EPSG:32618'));
        return { again, loadedMeasure, loadedNote };
    }

    it('writes the GeoJSON id of a feature as its id property, which is stable (not the uuid of the session)', () => {
        // Made in the viewer: no bag yet, only the uuid Potree gives it
        const bare = locals => { const m = measure({}, locals); delete m.ddbProperties; return m; };
        const note = { ...annotation(CLOUD.D.local), ddbProperties: undefined };
        const viewer = viewerWith([bare([CLOUD.A.local, CLOUD.B.local])], [note]);
        const first = exportMeasurements(viewer, 'cloud.laz', coordinateSystem('EPSG:32618'));
        first.features.forEach(f => {
            expect(f.properties.id).toBeTruthy();
            expect(f.id).toBe(f.properties.id);
            expect(f.properties.createdAt).toBeTruthy();
        });
        expect(first.features.map(f => f.id)).not.toContain('m1');
        expect(first.features.map(f => f.id)).not.toContain('ann');
        expect(new Set(first.features.map(f => f.id)).size).toBe(2);
        // The same measure gives the same id at every save: it is kept on the measure
        const second = exportMeasurements(viewer, 'cloud.laz', coordinateSystem('EPSG:32618'));
        expect(second.features.map(f => f.id)).toEqual(first.features.map(f => f.id));
    });

    it('keeps a property it does not know through a load and a save, on a measure and on an annotation', () => {
        const [m, a] = exported().features;
        const { again } = roundTrip({ ...exported(), features: [withProperties(m, { customKey: 5, nested: { a: [1] }, nothing: null }), withProperties(a, { customKey: 5 })] });
        expect(again.features[0].properties).toMatchObject({ customKey: 5, nested: { a: [1] }, nothing: null });
        expect(again.features[1].properties).toMatchObject({ customKey: 5 });
    });

    it('keeps the id, the ref, the fields, the photos and the snapshot, and the time it was created at', () => {
        const [m, a] = exported().features;
        const { again, loadedMeasure } = roundTrip({ ...exported(), features: [withProperties(m, { ...FIELDS, createdAt: '2026-01-01T00:00:00.000Z' }), withProperties(a, { id: 'note-id', ref: 'A-1' })] });
        expect(again.features[0].properties).toMatchObject({ ...FIELDS, createdAt: '2026-01-01T00:00:00.000Z' });
        expect(again.features[0].id).toBe('stable-id');
        expect(again.features[1].properties).toMatchObject({ id: 'note-id', ref: 'A-1' });
        expect(loadedMeasure.ddbProperties).toMatchObject({ id: 'stable-id', ref: '7', category: 'defect' });
    });

    it('does not give a time to a feature that had none', () => {
        const [m] = exported().features;
        const rest = Object.fromEntries(Object.entries(m.properties).filter(([key]) => key !== 'createdAt'));
        const { again } = roundTrip({ ...exported(), features: [{ ...m, properties: rest }, exported().features[1]] });
        expect(again.features[0].properties.createdAt).toBeUndefined();
    });
});

describe('measureValues: the values of a measure from its local coordinates, its type and the unit of the cloud', () => {
    const METRES = measurementFrame(UTM_18N_WKT);
    const FEET = measurementFrame(US_FOOT_WKT);
    const SQUARE = [[0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0]];

    it('is the length along the points for a distance, with the unit of the cloud', () => {
        expect(measureValues('distance', [[0, 0, 0], [3, 4, 0], [3, 4, 12]], METRES)).toEqual({ distance: 17, unit: 'm' });
    });

    it('is the highest less the lowest point for a height', () => {
        expect(measureValues('height', [[0, 0, 2], [50, 50, 7.5]], METRES)).toEqual({ distance: 5.5, unit: 'm' });
    });

    it('is the area on the ground and the perimeter for an area, in the unit squared', () => {
        expect(measureValues('area', SQUARE, METRES)).toEqual({ area: 100, perimeter: 40, unit: 'm²' });
    });

    it('is the circle through the first three points for a circle', () => {
        const values = measureValues('circle', [[10, 0, 0], [0, 10, 0], [-10, 0, 0]], METRES);
        expect(values.radius).toBe(10);
        expect(values.circumference).toBeCloseTo(2 * Math.PI * 10, 9);
        expect(values.area).toBeCloseTo(Math.PI * 100, 9);
        expect(values.unit).toBe('m');
    });

    it('is the angle in degrees at the second point for an angle', () => {
        expect(measureValues('angle', [[10, 0, 0], [0, 0, 0], [0, 10, 0]], METRES)).toEqual({ angle: 90, unit: 'degrees' });
    });

    it('has nothing for a point, an unknown type, or a circle or an angle with too few points', () => {
        expect(measureValues('point', [[1, 2, 3]], METRES)).toEqual({});
        expect(measureValues('annotation', [[1, 2, 3]], METRES)).toEqual({});
        expect(measureValues('circle', [[0, 0, 0], [1, 0, 0]], METRES)).toEqual({});
        expect(measureValues('angle', [[0, 0, 0], [1, 0, 0]], METRES)).toEqual({});
    });

    it('takes the unit of the cloud: a cloud in US survey feet has its lengths in them', () => {
        expect(measureValues('distance', [[0, 0, 0], [30, 40, 0]], FEET)).toEqual({ distance: 50, unit: FEET.unit.code });
        expect(measureValues('area', SQUARE, FEET).unit).toBe(`${FEET.unit.code}²`);
    });

    it('works in metres per axis when the heights are in another unit than x and y', () => {
        const mixed = measurementFrame(METRE_US_FOOT_HEIGHT_WKT);
        expect(mixed.unit.code).toBe('m');
        // 10 US survey feet of height are 3.048 m
        expect(measureValues('height', [[0, 0, 0], [0, 0, 10]], mixed)).toEqual({ distance: 3.05, unit: 'm' });
    });

    it('takes points as { x, y, z } too, as the points of a Potree measure are', () => {
        expect(measureValues('distance', [{ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 }], METRES)).toEqual({ distance: 5, unit: 'm' });
    });

    it('is what the export writes into a feature', () => {
        const locals = [[1, 2, 3], [4, 6, 3]];
        const doc = exportMeasurements(viewerWith([measure({}, locals)]), 'cloud.laz', coordinateSystem(UTM_18N_WKT));
        expect(doc.features[0].properties).toMatchObject(measureValues('distance', locals, METRES));
    });
});
