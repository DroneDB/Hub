/**
 * The 3D viewer's measurements as GeoJSON. The positions of a Potree point cloud are in the CRS of the
 * cloud already (the decoder applies the scale and offset of the COPC header), so the geometry is those
 * positions reprojected and nothing else. Expected longitude, latitude and height are literals from
 * `echo "x y z" | gdaltransform -s_srs EPSG:32618 -t_srs EPSG:4326` (GDAL 3.12), not computed by the code.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { exportMeasurements, importMeasurements } from './potreeMeasurementConverter';
import { VIEW, sectionOf, read } from './measurementFormat';
import { loadPotree } from '@/libs/potree/potreeLibs.fixtures';
import { UTM_18N_WKT, COPC_SCALE, COPC_OFFSET, CLOUD, cloudCoordinateSystem } from './measurementFormat.fixtures';
import { WGS84_WKT, GEOCENTRIC_WKT, UTM_33N_WKT, UTM_33N_WKT2, FOOT_WKT, US_FOOT_COMPOUND_WKT } from './crs.fixtures';

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
const annotation = (local, uuid = 'ann') => ({ uuid, title: 'Crack', description: '', position: new Vec(...local) });
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

    it('keeps the local coordinates when the COPC now has no CRS proj4 can use (nothing better is known)', () => {
        const { viewer, added } = stubPotree();
        const saved = exportMeasurements(viewerWith([measure({}, [P.A.geo, P.B.geo])]), 'cloud.laz', coordinateSystem(WGS84_WKT));
        importMeasurements(onDisk(saved), viewer, coordinateSystem(null));
        expect(added[0].points.map(xyz)).toEqual([P.A.geo, P.B.geo]);
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
