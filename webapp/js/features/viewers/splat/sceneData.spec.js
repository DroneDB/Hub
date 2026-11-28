import { describe, it, expect } from 'vitest';
import { normalizeScale, normalizeAnnotation, normalizeMeasurement, isDatasetPath, tourStops } from './sceneData';

const view = x => ({ position: [x, 0, 0], quaternion: [0, 0, 0, 1], fov: 60, target: null });

describe('the order of the tour', () => {
    it('is the cameras as listed, then the pins that have a view as listed', () => {
        const cameras = [view(1), view(2)];
        const pins = [
            { title: 'a', view: view(10) },
            { title: 'no view', view: null },
            { title: 'c', view: view(30) }
        ];
        const stops = tourStops(cameras, pins);
        expect(stops.map(s => [s.cameraIndex, s.annotationIndex, s.view.position[0]])).toEqual([
            [0, null, 1], [1, null, 2], [null, 0, 10], [null, 2, 30]
        ]);
    });

    it('follows the list when the user moves a pin', () => {
        const a = { title: 'a', view: view(1) };
        const b = { title: 'b', view: view(2) };
        expect(tourStops([], [a, b]).map(s => s.view.position[0])).toEqual([1, 2]);
        expect(tourStops([], [b, a]).map(s => s.view.position[0])).toEqual([2, 1]);
    });

    it('is empty without cameras or pins with a view', () => {
        expect(tourStops([], [])).toEqual([]);
        expect(tourStops([], [{ view: null }])).toEqual([]);
    });
});

describe('what a pin may hold', () => {
    const pin = extra => normalizeAnnotation({ position: [1, 2, 3], ...extra }, 0);

    it('has a position', () => {
        expect(normalizeAnnotation({ title: 'x' }, 0)).toBeNull();
        expect(normalizeAnnotation({ position: [1, 2] }, 0)).toBeNull();
        expect(normalizeAnnotation({ position: [1, 2, NaN] }, 0)).toBeNull();
        expect(normalizeAnnotation(null, 0)).toBeNull();
    });

    it('is titled by its place in the list when it has no title', () => {
        expect(pin({}).title).toBe('Pin 1');
        expect(normalizeAnnotation({ position: [0, 0, 0] }, 4).title).toBe('Pin 5');
    });

    it('keeps a link only when it is a web address', () => {
        expect(pin({ link: 'https://example.com/a?b=1' }).link).toBe('https://example.com/a?b=1');
        expect(pin({ link: 'javascript:alert(1)' }).link).toBe('');
        expect(pin({ link: 'data:text/html,x' }).link).toBe('');
        expect(pin({ link: '/relative' }).link).toBe('');
    });

    it('keeps an image only as a path inside the dataset', () => {
        expect(pin({ image: 'photos/gate.jpg' }).image).toBe('photos/gate.jpg');
        for (const outside of ['../gate.jpg', 'a/../../b.jpg', '/etc/passwd', 'C:\\x.jpg', 'https://example.com/a.jpg', '']) {
            expect(pin({ image: outside }).image).toBe('');
        }
        expect(isDatasetPath(undefined)).toBe(false);
    });

    it('has a view with a position, or none', () => {
        expect(pin({ view: { fov: 50 } }).view).toBeNull();
        expect(pin({ view: { position: [0, 0, 5] } }).view).toEqual({ position: [0, 0, 5], quaternion: [0, 0, 0, 1], fov: 60, target: null });
    });
});

describe('measurements and the scale', () => {
    it('need a known kind and the points it takes', () => {
        const point = [0, 0, 0];
        expect(normalizeMeasurement({ kind: 'distance', points: [point, [1, 0, 0]] }, 0)).toMatchObject({ kind: 'distance' });
        expect(normalizeMeasurement({ kind: 'distance', points: [point] }, 0)).toBeNull();
        expect(normalizeMeasurement({ kind: 'height', points: [point, point, point] }, 0)).toBeNull();
        expect(normalizeMeasurement({ kind: 'area', points: [point, [1, 0, 0], [1, 1, 'x']] }, 0)).toBeNull();
        expect(normalizeMeasurement({ kind: 'volume', points: [point] }, 0)).toBeNull();
        expect(normalizeMeasurement({ kind: 'point' }, 0)).toBeNull();
    });

    it('have a scale that is a positive number', () => {
        expect(normalizeScale({ metersPerUnit: 0.02 })).toEqual({ metersPerUnit: 0.02 });
        for (const bad of [{ metersPerUnit: 0 }, { metersPerUnit: -1 }, { metersPerUnit: '2' }, { metersPerUnit: Infinity }, {}, null, undefined]) {
            expect(normalizeScale(bad)).toBeNull();
        }
    });
});
