/**
 * Unit tests for libs/openItemDefaults.js and the local-vector gate of
 * libs/build/fileAvailabilityChecker.js (CAD drawings without geolocation).
 * Run with: npx vitest run webapp/js/libs/openItemDefaults.spec.js
 */
import { describe, it, expect, vi } from 'vitest';
import ddb from 'ddb';
import { isLocalVector, defaultViewFor, VIEWERS, defaultViewerFor } from './openItemDefaults';

vi.mock('@/libs/build/buildManager', () => ({ default: {} }));
vi.mock('@/libs/tasks/taskMonitor', () => ({ default: {} }));

const T = ddb.entry.type;
const localDrawing = { type: T.VECTOR, path: 'site.dwg', properties: { georeferenced: false } };
const georefDrawing = { type: T.VECTOR, path: 'site.dwg', properties: { georeferenced: true } };
const geojson = { type: T.VECTOR, path: 'roads.geojson', properties: {} };

describe('isLocalVector', () => {
    it('is true only for vectors flagged georeferenced: false', () => {
        expect(isLocalVector(localDrawing)).toBe(true);
        expect(isLocalVector(georefDrawing)).toBe(false);
        expect(isLocalVector(geojson)).toBe(false);
        expect(isLocalVector({ type: T.MODEL, properties: { georeferenced: false } })).toBe(false);
        expect(isLocalVector(null)).toBe(false);
    });
});

describe('defaultViewFor', () => {
    it('opens local drawings in the unified (no globe) viewer', () => {
        expect(defaultViewFor(localDrawing)).toBe('unified');
    });

    it('keeps the type default otherwise', () => {
        expect(defaultViewFor(georefDrawing)).toBe('map');
        expect(defaultViewFor(geojson)).toBe('map');
        expect(defaultViewFor({ type: T.POINTCLOUD })).toBe('pointcloud');
        expect(defaultViewFor(undefined)).toBeUndefined();
    });
});

describe('FileAvailabilityChecker.getRequiredArtifact', () => {
    it('gates local drawings on the local metadata and georeferenced vectors on the MVT pyramid', async () => {
        const { default: checker } = await import('@/libs/build/fileAvailabilityChecker');
        const { ArtifactRole } = await import('@/libs/ddb/buildArtifacts');
        expect(checker.getRequiredArtifact(T.VECTOR, 'unified', localDrawing)).toBe(ArtifactRole.VECTOR_LOCAL);
        expect(checker.getRequiredArtifact(T.VECTOR, 'unified', georefDrawing)).toBe(ArtifactRole.VECTOR_MVT);
        expect(checker.getRequiredArtifact(T.VECTOR, 'unified')).toBe(ArtifactRole.VECTOR_MVT);
        expect(checker.getRequiredArtifact(T.VECTOR, 'map', localDrawing)).toBe(ArtifactRole.VECTOR_MVT);
    });
});

describe('the viewer table', () => {
    const viewersOf = entry => VIEWERS.filter(r => r.accepts(entry)).map(r => r.id);

    it('has one row per viewer, each with a Font Awesome icon', () => {
        const ids = VIEWERS.map(r => r.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const row of VIEWERS) expect(row.icon).toMatch(/^fa-(solid|regular) fa-/);
    });

    it('keeps the default views of the types', () => {
        const views = { [T.MARKDOWN]: 'markdown', [T.GEORASTER]: 'map', [T.POINTCLOUD]: 'pointcloud', [T.MODEL]: 'model',
            [T.PANORAMA]: 'panorama', [T.GEOPANORAMA]: 'panorama', [T.VECTOR]: 'map', [T.GAUSSIAN_SPLAT]: 'splat', [T.TILES3D]: 'unified',
            [T.IMAGE]: undefined, [T.GEOIMAGE]: undefined, [T.GENERIC]: undefined, [T.DIRECTORY]: undefined };
        for (const [type, view] of Object.entries(views)) expect(defaultViewFor({ type: Number(type), path: 'x', properties: {} })).toBe(view);
    });

    it('lists the viewers of a file, and its default one', () => {
        expect(viewersOf({ type: T.POINTCLOUD, path: 'c.laz' })).toEqual(['open-map', 'open-pointcloud']);
        expect(defaultViewerFor({ type: T.POINTCLOUD, path: 'c.laz' }).id).toBe('open-pointcloud');
        expect(viewersOf({ type: T.GEOIMAGE, path: 'a.jpg' })).toEqual(['open-map']);
        expect(defaultViewerFor({ type: T.GEOIMAGE, path: 'a.jpg' })).toBeNull();
        expect(defaultViewerFor({ type: T.GENERIC, path: 'r.PDF' })).toMatchObject({ id: 'open-pdf', label: 'Open', icon: 'fa-regular fa-file-pdf' });
        expect(viewersOf(localDrawing)).toEqual([]);
    });

    it('opens a .3tz indexed as a generic file in the 3D viewer', () => {
        expect(defaultViewFor({ type: T.GENERIC, path: 'old/site.3tz' })).toBe('unified');
        expect(defaultViewFor({ type: T.GENERIC, path: 'r.pdf' })).toBeUndefined();
    });
});
