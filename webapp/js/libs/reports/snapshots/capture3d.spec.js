/** The capture of a 3D item: where its file is, what the item stores, and the address the report reads it from. */
import { describe, it, expect } from 'vitest';
import { capturePath, snapshotOf, capture3dImageUrl, CAPTURE_SUFFIX } from './capture3d';
import { nextUploadPath } from '@/libs/reports/annotationPhotos';

describe('capturePath', () => {
    it('is <folder of the measurement file>/annotations/<id>-3d.webp', () => {
        expect(capturePath('site/cloud_measurements.geojson', 'abc-123')).toBe('site/annotations/abc-123-3d.webp');
        expect(capturePath('cloud_measurements.geojson', 'abc')).toBe('annotations/abc-3d.webp');
        expect(CAPTURE_SUFFIX).toBe('-3d.webp');
    });

    it('is the same path for every capture of an item, so a new capture replaces the old one', () => {
        expect(capturePath('a/m.geojson', 'x')).toBe(capturePath('a/m.geojson', 'x'));
    });

    it('has the id and never the ref, and does not clash with the numbered photos of the item', () => {
        const taken = [capturePath('a/m.geojson', 'x')];
        expect(nextUploadPath('a/m.geojson', 'x', 'webp', taken)).toBe('a/annotations/x-1.webp');
    });

    it('keeps an id that is not a file name out of the path, and refuses no id', () => {
        expect(capturePath('a/m.geojson', '../x/y')).toBe('a/annotations/.._x_y-3d.webp');
        expect(() => capturePath('a/m.geojson', '')).toThrow('needs an id');
    });
});

describe('snapshotOf', () => {
    it('stores the path and the camera with its position and target', () => {
        const camera = { position: [1, 2, 3], target: [4, 5, 6] };
        const snapshot = snapshotOf('a/annotations/x-3d.webp', camera, '2026-11-20T10:00:00.000Z');
        expect(snapshot).toEqual({ path: 'a/annotations/x-3d.webp', camera: { position: [1, 2, 3], target: [4, 5, 6] }, capturedAt: '2026-11-20T10:00:00.000Z' });
        // A copy: what the camera does next does not change what is stored
        camera.position[0] = 99;
        expect(snapshot.camera.position[0]).toBe(1);
    });
});

describe('capture3dImageUrl', () => {
    const dataset = { downloadUrl: (path, options) => `/dl/${path}?inline=${options.inline ? 1 : 0}` };

    it('is the address of the stored image in the dataset', () => {
        expect(capture3dImageUrl({ path: 'a/annotations/x-3d.webp' }, dataset)).toBe('/dl/a/annotations/x-3d.webp?inline=1');
    });

    it('changes with each capture of the item, and is the same for two renders of one capture', () => {
        const first = { path: 'a/annotations/x-3d.webp', capturedAt: '2026-11-20T10:00:00.000Z' };
        const again = { path: 'a/annotations/x-3d.webp', capturedAt: '2026-11-21T09:30:00.000Z' };
        expect(capture3dImageUrl(first, dataset)).toBe('/dl/a/annotations/x-3d.webp?inline=1&v=2026-11-20T10%3A00%3A00.000Z');
        expect(capture3dImageUrl(first, dataset)).toBe(capture3dImageUrl({ ...first }, dataset));
        expect(capture3dImageUrl(again, dataset)).not.toBe(capture3dImageUrl(first, dataset));
    });

    it('takes the time of the capture as a parameter of its own when the address has no query', () => {
        const bare = { downloadUrl: path => `/dl/${path}` };
        expect(capture3dImageUrl({ path: 'x-3d.webp', capturedAt: '2026-11-20' }, bare)).toBe('/dl/x-3d.webp?v=2026-11-20');
    });

    it('is null for an item with no capture and for a path that is not the dataset\'s', () => {
        expect(capture3dImageUrl({ path: null }, dataset)).toBeNull();
        expect(capture3dImageUrl({}, dataset)).toBeNull();
        expect(capture3dImageUrl({ path: 'https://evil.example/x.webp' }, dataset)).toBeNull();
        expect(capture3dImageUrl({ path: '../x.webp' }, dataset)).toBeNull();
    });
});
