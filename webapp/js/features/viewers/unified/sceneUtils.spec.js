import { describe, it, expect } from 'vitest';
import { geojsonBbox, isFiniteBox, measureFormatters, fitDistance } from './sceneUtils';

describe('3D viewer helpers', () => {
    it('bounds a Feature or a bare geometry', () => {
        const poly = { type: 'Polygon', coordinates: [[[1, 2], [3, -1], [0, 5], [1, 2]]] };
        expect(geojsonBbox(poly)).toEqual([0, -1, 3, 5]);
        expect(geojsonBbox({ type: 'Feature', geometry: { type: 'Point', coordinates: [7, 8] } })).toEqual([7, 8, 7, 8]);
    });

    it('rejects infinite or inverted boxes', () => {
        const box = (a, b) => ({ min: { x: a, y: a, z: a }, max: { x: b, y: b, z: b } });
        expect(isFiniteBox(box(0, 1))).toBe(true);
        expect(isFiniteBox(box(-Infinity, 1))).toBe(false);
        expect(isFiniteBox(box(2, 1))).toBe(false);
    });

    it('labels lengths and areas corrected by the Mercator scale', () => {
        let scale = 0.5;
        const f = measureFormatters(() => scale);
        expect(f.length({ length: 100 })).toBe('50.0 m');
        expect(f.length({ length: 4000 })).toBe('2.00 km');
        expect(f.area({ area: 400 })).toBe('100 m²');
        scale = 1;
        expect(f.area({ area: 3e6 })).toBe('3.00 km²');
    });

    it('keeps a sphere inside a portrait view as well as a landscape one', () => {
        // Landscape: the vertical field of view limits (45 degrees: 1 / sin(22.5 degrees))
        expect(fitDistance(1, 45, 2, 1)).toBeCloseTo(1 / Math.sin(Math.PI / 8), 6);
        // Portrait: the horizontal half angle tan(22.5) * 0.5 limits, so it stands farther
        const portrait = fitDistance(1, 45, 0.5, 1);
        expect(portrait).toBeGreaterThan(fitDistance(1, 45, 2, 1));
        expect(1 / portrait).toBeCloseTo(Math.sin(Math.atan(Math.tan(Math.PI / 8) * 0.5)), 6);
        // Not measured yet: square, with the margin around
        expect(fitDistance(2, 45, 0, 1.5)).toBeCloseTo(3 / Math.sin(Math.PI / 8), 6);
    });
});
