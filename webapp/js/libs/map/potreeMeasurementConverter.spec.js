/**
 * The 3D viewer's measurements as GeoJSON. The positions of a Potree point cloud are in the CRS of the
 * cloud already (the decoder applies the scale and offset of the COPC header), so the geometry is those
 * positions reprojected and nothing else. Expected longitude, latitude and height are literals from
 * `echo "x y z" | gdaltransform -s_srs EPSG:32618 -t_srs EPSG:4326` (GDAL 3.12), not computed by the code.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { exportMeasurements, importMeasurements } from './potreeMeasurementConverter';
import { VIEW, sectionOf, read } from './measurementFormat';
import { UTM_18N_WKT, COPC_SCALE, COPC_OFFSET, CLOUD, cloudCoordinateSystem } from './measurementFormat.fixtures';

// 0.01 m is about 9e-8 degrees of latitude: 1e-7 degree is the tolerance
const DEGREES = 1e-7;

class Vec {
    constructor(x, y, z) { this.x = x; this.y = y; this.z = z; }
    distanceTo(o) { return Math.hypot(this.x - o.x, this.y - o.y, this.z - o.z); }
}
const colour = hex => ({ getHexString: () => hex });

function measure(overrides, locals) {
    return {
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
        ], [{ uuid: 'ann', title: 'Crack', description: '', position: new Vec(...c.local) }]), 'cloud.laz', coordinateSystem('EPSG:32618'));
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

    it('is the 3D viewer\'s document: 2.0, its features and its section', () => {
        const doc = exportMeasurements(viewerWith([measure({}, [CLOUD.A.local, CLOUD.B.local])]), 'cloud.laz', coordinateSystem('EPSG:32618'));
        expect(doc.metadata).toMatchObject({ version: '2.0', application: 'DroneDB Registry' });
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

    it('puts a measurement back at its local coordinates', () => {
        const { viewer, added } = stubPotree();
        const doc = exportMeasurements(viewerWith([measure({}, [CLOUD.A.local, CLOUD.B.local])]), 'cloud.laz', coordinateSystem('EPSG:32618'));
        importMeasurements(doc, viewer, coordinateSystem('EPSG:32618'));
        expect(added[0].points.map(p => [p.x, p.y, p.z])).toEqual([CLOUD.A.local, CLOUD.B.local]);
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
