/**
 * The CRS of a point cloud in the 3D viewer: the horizontal CRS of a compound CRS, and a custom transverse Mercator with no
 * authority code, are registered with proj4 and OpenLayers so the scene keeps its OSM basemap; a definition proj4 cannot
 * use is never given to it (it would break the registration of every CRS after it). Lengths are measured in the unit of
 * the cloud's coordinates. Giro3D's CoordinateSystem, proj4 and OpenLayers are the real ones; the rest of Giro3D is stubbed.
 */
import { describe, it, expect, vi } from 'vitest';
import proj4 from 'proj4';
import { get as olGet } from 'ol/proj.js';
import ddb from 'ddb';
import { UnifiedScene } from './unifiedScene';
import { LOADERS } from './loaders';
import { measureFormatters } from './sceneUtils';
import {
    COMPOUND_WKT, COMPOUND_WKT2, CUSTOM_TM_WKT, UTM_33N_WKT, US_FOOT_COMPOUND_WKT, FOOT_WKT, GEOCENTRIC_WKT, METRE_US_FOOT_HEIGHT_WKT
} from '@/libs/map/crs.fixtures';

// Giro3D's modules include the code of its web workers, which sets the worker's onmessage
vi.hoisted(() => { globalThis.onmessage = null; });
const { default: CoordinateSystem } = await import('@giro3d/giro3d/core/geographic/CoordinateSystem.js');

const sceneWith = (libs = {}) => new UnifiedScene({ CoordinateSystem, ...libs }, null, { settings: {}, view: { layers: [] }, notify: { info() {} } });
// OpenLayers can reproject the basemap (EPSG:3857) into the registered CRS
const reprojects = id => !!olGet(id) && Number.isFinite(proj4('EPSG:4326', id, [-82.6, 27.52])[0]);

describe('registerCrs', () => {
    it('registers the projected CRS of a compound CRS (WKT 1), under its EPSG code', () => {
        const crs = sceneWith().registerCrs(CoordinateSystem.fromWkt(COMPOUND_WKT));
        expect(crs).toBeTruthy();
        expect(crs.id).toBe('EPSG:6346');
        expect(crs.definition).not.toContain('VERT_CS');
        expect(reprojects('EPSG:6346')).toBe(true);
    });

    it('registers the projected CRS of a WKT 2 compound CRS given with its definition', () => {
        // Giro3D 2.0 keeps neither a code nor the definition of a WKT 2 compound CRS it reads (the COPC of a compound
        // CRS that WKT 1 can write has WKT 1): with its definition, the projected CRS in it is registered
        expect(CoordinateSystem.fromWkt(COMPOUND_WKT2).definition).toBeUndefined();
        const crs = sceneWith().registerCrs({ id: '<unknown>', definition: COMPOUND_WKT2 });
        expect(crs?.id).toBe('EPSG:6346');
    });

    it('registers a custom transverse Mercator under a code of its own (not the "unknown" of no CRS)', () => {
        const scene = sceneWith();
        const crs = scene.registerCrs(CoordinateSystem.fromWkt(CUSTOM_TM_WKT));
        expect(crs).toBeTruthy();
        expect(crs).not.toBe(CoordinateSystem.unknown);
        expect(crs.id).toMatch(/^DDB:CUSTOM-[0-9a-f]{8}$/);
        expect(reprojects(crs.id)).toBe(true);
        // The same definition, the same code
        expect(scene.registerCrs(CoordinateSystem.fromWkt(CUSTOM_TM_WKT)).id).toBe(crs.id);
    });

    it('registers a compound CRS in feet', () => {
        expect(sceneWith().registerCrs(CoordinateSystem.fromWkt(US_FOOT_COMPOUND_WKT))?.id).toBe('EPSG:2264');
    });

    it('gives nothing for no CRS, a geocentric CRS and a CRS proj4 cannot use, and the next CRS still registers', () => {
        const scene = sceneWith();
        expect(scene.registerCrs(CoordinateSystem.unknown)).toBeNull();
        expect(scene.registerCrs(CoordinateSystem.fromWkt(GEOCENTRIC_WKT))).toBeNull();
        expect(scene.registerCrs({ id: 'X:1', definition: 'COMPD_CS["heights only",VERT_CS["h",VERT_DATUM["d",2005],UNIT["metre",1]]]' })).toBeNull();
        expect(scene.registerCrs({ id: 'X:2', definition: 'PROJCS["broken",PROJECTION["No_Such_Projection"]]' })).toBeNull();
        expect(proj4.defs('X:1')).toBeUndefined();
        expect(proj4.defs('X:2')).toBeUndefined();
        expect(scene.registerCrs(CoordinateSystem.fromWkt(UTM_33N_WKT))?.id).toBe('EPSG:32633');
        expect(reprojects('EPSG:32633')).toBe(true);
    });

    it('keeps Web Mercator as it is', () => {
        expect(sceneWith().registerCrs(CoordinateSystem.epsg3857)).toBe(CoordinateSystem.epsg3857);
    });
});

describe('a point cloud with a compound CRS in the 3D viewer', () => {
    it('is set up in its projected CRS and gets the OSM basemap', async () => {
        const crs = CoordinateSystem.fromWkt(COMPOUND_WKT);
        const box = { min: { x: 342000, y: 3045000, z: 3 }, max: { x: 342100, y: 3045100, z: 20 } };
        class COPCSource {
            addEventListener() {}
            async initialize() {}
            async getMetadata() { return { crs }; }
        }
        class PointCloud {
            getBoundingBox() { return box; }
            get displayedPointCount() { return 1; }
        }
        class Extent { constructor(...args) { this.args = args; } }
        const scene = sceneWith({ COPCSource, PointCloud, Extent });
        scene.view.loadingText = '';
        scene.setupInstance = vi.fn(() => { scene.instance = { add: async () => {}, renderingOptions: {} }; });
        Object.assign(scene, {
            colorizePointCloud: vi.fn(), setPointSize: vi.fn(), registerLayer: vi.fn(), frameBox: vi.fn(),
            waitForFirstRender: vi.fn(async () => {}), addBasemap: vi.fn()
        });
        const entry = { type: ddb.entry.type.POINTCLOUD, path: 'florida.laz', point_geom: { type: 'Point', coordinates: [-82.6, 27.52, 10] } };
        const dataset = { Entry: () => ({ getCopc: () => '/florida.copc.laz' }) };

        await LOADERS[ddb.entry.type.POINTCLOUD](scene, entry, dataset);

        const sceneCrs = scene.setupInstance.mock.calls[0][0];
        expect(sceneCrs.id).toBe('EPSG:6346');
        expect(scene.setupInstance.mock.calls[0][1]).toEqual({ nav: 'constrained' });
        expect(scene.addBasemap).toHaveBeenCalledTimes(1);
        expect(scene.addBasemap.mock.calls[0][0].args).toEqual([sceneCrs, 342000, 342100, 3045000, 3045100]);
        expect(scene.view.isLocalPointCloud).toBe(false);
    });
});

describe('the lengths of a scene in feet', () => {
    it('are metres times the unit of the coordinates: 100 ft of a cloud in feet is 30.5 m, or 100 ft', () => {
        const scene = sceneWith();
        scene.setUnitsFrom(FOOT_WKT);
        expect(scene.lengthScale).toEqual([0.3048, 0.3048, 0.3048]);
        const metric = measureFormatters(() => scene.lengthScale, () => 'm', () => 'metric');
        const imperial = measureFormatters(() => scene.lengthScale, () => 'm', () => 'imperial');
        expect(metric.length({ length: 100 })).toBe('30.5 m');
        expect(imperial.length({ length: 100 })).toBe('100 ft');
        expect(imperial.area({ area: 1000 })).toBe('1,000 ft²');
    });

    it('a cloud in US survey feet, and one in metres or with no CRS', () => {
        const scene = sceneWith();
        scene.setUnitsFrom(US_FOOT_COMPOUND_WKT);
        expect(scene.lengthScale[2]).toBeCloseTo(1200 / 3937, 12);
        scene.setUnitsFrom(UTM_33N_WKT);
        expect(scene.lengthScale).toEqual([1, 1, 1]);
        scene.setUnitsFrom(undefined);
        expect(scene.lengthScale).toEqual([1, 1, 1]);
    });
});

describe('the lengths of a scene with its heights in another unit (metres across, US survey feet up)', () => {
    const v = (x, y, z) => ({ x, y, z });
    const scene = sceneWith();
    scene.setUnitsFrom(METRE_US_FOOT_HEIGHT_WKT);
    const metric = measureFormatters(() => scene.lengthScale, () => 'm', () => 'metric');

    it('measures a height of 100 ft as 30.5 m and a level line of 100 m as 100 m, from the ends of the segment', () => {
        // Giro3D's length is in scene units: 100 for both
        expect(metric.length({ length: 100, start: v(0, 0, 0), end: v(0, 0, 100) })).toBe('30.5 m');
        expect(metric.length({ length: 100, start: v(0, 0, 0), end: v(100, 0, 0) })).toBe('100.0 m');
    });

    it('measures a sloped surface with its heights in metres', () => {
        // 10 m by 10 m, rising 10 m (32.8 ft) across: 141.42 m², not the 341 Giro3D gives in scene units
        const points = [v(0, 0, 0), v(10, 0, 0), v(10, 10, 10 * 3937 / 1200), v(0, 10, 10 * 3937 / 1200)];
        expect(metric.area({ area: 341.4, shape: { points } })).toBe('141.42 m²');
    });
});
