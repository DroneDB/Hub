/**
 * The coordinate system of a point cloud's COPC as the build states it (the `crs` of its artifact), and what the Hub says
 * of it: only for a COPC built in another CRS than its file; nothing when the build or the server predates the field.
 */
import { describe, it, expect } from 'vitest';
import { copcCrsOf, copcSrsOf, streamedInText, copcDownloadNote, unstatedMeasurementCrs } from './pointCloudCrs';
import { ArtifactRole } from '@/libs/ddb/buildArtifacts';

const SOURCE_WKT = 'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],UNIT["degree",0.0174532925199433]]';
const cloud = (crs, properties = {}) => ({
    path: 'cloud.laz', properties,
    artifacts: [{ role: ArtifactRole.POINTCLOUD_COPC, url: '/b/copc/cloud.copc.laz', downloadName: 'cloud.copc.laz', ...(crs === undefined ? {} : { crs }) }]
});
const UTM = { name: 'WGS 84 / UTM zone 33N', epsg: 32633, transformed: true };

describe('copcCrsOf', () => {
    it('reads the crs of the COPC artifact', () => {
        expect(copcCrsOf(cloud(UTM))).toEqual(UTM);
        expect(copcCrsOf(cloud({ name: 'unknown', epsg: null, transformed: false }))).toEqual({ name: 'unknown', epsg: null, transformed: false });
    });

    it('is null without it: an older build or server, no artifacts, a shape it does not know', () => {
        expect(copcCrsOf(cloud(undefined))).toBeNull();
        expect(copcCrsOf({ path: 'cloud.laz' })).toBeNull();
        expect(copcCrsOf(null)).toBeNull();
        expect(copcCrsOf(cloud('EPSG:32633'))).toBeNull();
        expect(copcCrsOf(cloud({ epsg: 32633 }))).toBeNull();
        // An EPSG code that is not one is no code
        expect(copcCrsOf(cloud({ name: 'x', epsg: '32633', transformed: 'yes' }))).toEqual({ name: 'x', epsg: null, transformed: false });
    });
});

describe('what the Hub says of a COPC built in another CRS', () => {
    it('names the CRS and its code, and says the uploaded file is unchanged', () => {
        expect(streamedInText(cloud(UTM))).toBe('WGS 84 / UTM zone 33N (EPSG:32633) (the uploaded file is unchanged)');
        expect(copcDownloadNote(cloud(UTM))).toBe('The COPC is in WGS 84 / UTM zone 33N (EPSG:32633), the coordinate system it is streamed in. The uploaded file is unchanged.');
        expect(streamedInText(cloud({ name: 'Custom TM', epsg: null, transformed: true }))).toBe('Custom TM (the uploaded file is unchanged)');
    });

    it('says nothing of a COPC in the CRS of its file, or when the build does not say', () => {
        for (const entry of [cloud({ ...UTM, transformed: false }), cloud(undefined), { path: 'x.laz' }]) {
            expect(streamedInText(entry)).toBeNull();
            expect(copcDownloadNote(entry)).toBeNull();
        }
    });
});

describe('unstatedMeasurementCrs: the CRS of a measurements file that states none', () => {
    const copc = { srs: 'UTM WKT' };

    it('is the CRS of the file for a COPC built in another CRS (the COPC was in it when the file was saved)', () => {
        expect(unstatedMeasurementCrs(cloud(UTM, { projection: SOURCE_WKT }), copc)).toBe(SOURCE_WKT);
        // Before the build says so: the CRS status libddb gives the file
        expect(unstatedMeasurementCrs(cloud(undefined, { projection: SOURCE_WKT, crsStatus: 'geographic' }), copc)).toBe(SOURCE_WKT);
        expect(unstatedMeasurementCrs(cloud(undefined, { projection: SOURCE_WKT, crsStatus: 'geocentric' }), copc)).toBe(SOURCE_WKT);
    });

    it('is the COPC\'s otherwise', () => {
        expect(unstatedMeasurementCrs(cloud(undefined, { projection: SOURCE_WKT, crsStatus: 'projected' }), copc)).toBe(copc);
        expect(unstatedMeasurementCrs(cloud(undefined, { projection: SOURCE_WKT, crsStatus: 'implausible' }), copc)).toBe(copc);
        expect(unstatedMeasurementCrs(cloud(UTM, {}), copc)).toBe(copc);
        expect(unstatedMeasurementCrs(null, copc)).toBe(copc);
    });
});

describe('copcSrsOf: the CRS of the COPC, for what reads no COPC', () => {
    it('is the EPSG code the build states for a COPC built in another CRS than the file', () => {
        expect(copcSrsOf(cloud(UTM, { projection: SOURCE_WKT, crsStatus: 'geographic' }))).toBe('EPSG:32633');
    });

    it('is the CRS of the file when the COPC is in it', () => {
        expect(copcSrsOf(cloud({ ...UTM, transformed: false }, { projection: SOURCE_WKT }))).toBe(SOURCE_WKT);
        expect(copcSrsOf(cloud(undefined, { projection: SOURCE_WKT, crsStatus: 'projected' }))).toBe(SOURCE_WKT);
    });

    it('is null when it cannot be told: built in another CRS with no EPSG code stated, or no CRS at all', () => {
        expect(copcSrsOf(cloud(undefined, { projection: SOURCE_WKT, crsStatus: 'geographic' }))).toBeNull();
        expect(copcSrsOf(cloud({ ...UTM, epsg: null }, { projection: SOURCE_WKT }))).toBeNull();
        expect(copcSrsOf(cloud(undefined, {}))).toBeNull();
        expect(copcSrsOf(null)).toBeNull();
    });
});
