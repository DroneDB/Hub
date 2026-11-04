/**
 * Unit tests for libs/openItemDefaults.js and the local-vector gate of
 * libs/build/fileAvailabilityChecker.js (CAD drawings without geolocation).
 * Run with: npx vitest run webapp/js/libs/openItemDefaults.spec.js
 */
import { describe, it, expect, vi } from 'vitest';
import ddb from 'ddb';
import { OpenItemDefaults, isLocalVector, defaultViewFor } from './openItemDefaults';

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
        expect(defaultViewFor(georefDrawing)).toBe(OpenItemDefaults[T.VECTOR]);
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
