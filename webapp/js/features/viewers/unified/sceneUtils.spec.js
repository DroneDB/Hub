import { describe, it, expect } from 'vitest';
import { geojsonBbox, isFiniteBox, measureFormatters, fitDistance, canvasNeedsResize } from './sceneUtils';

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

    it('writes a length below a metre in centimetres, and below a centimetre in millimetres', () => {
        const f = measureFormatters(() => 1);
        expect(f.length({ length: 1 })).toBe('1.0 m');
        expect(f.length({ length: 0.042 })).toBe('4.2 cm');
        expect(f.length({ length: 0.5 })).toBe('50.0 cm');
        expect(f.length({ length: 0.01 })).toBe('1.0 cm');
        expect(f.length({ length: 0.0035 })).toBe('3.5 mm');
        expect(f.length({ length: 0 })).toBe('0.0 mm');
    });

    it('writes an area below a square metre in square centimetres, and below one in square millimetres', () => {
        const f = measureFormatters(() => 1);
        expect(f.area({ area: 1 })).toBe('1 m²');
        expect(f.area({ area: 0.25 })).toBe('2500 cm²');
        expect(f.area({ area: 0.0012 })).toBe('12 cm²');
        expect(f.area({ area: 0.00005 })).toBe('50 mm²');
    });

    it('writes the lengths of a scene with no known scale in its own unit, however small', () => {
        const f = measureFormatters(() => 1, () => 'units');
        expect(f.length({ length: 0.042 })).toBe('0.04 units');
        expect(f.area({ area: 0.5 })).toBe('0.50 units²');
        expect(f.length({ length: 4000 })).toBe('4000.00 units');
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

describe('canvasNeedsResize', () => {
    const canvas = (width, height, clientWidth, clientHeight) => ({ width, height, clientWidth, clientHeight });

    it('compares the drawing buffer with the page size times the pixel ratio', () => {
        // A buffer of twice the page size is the right one at a ratio of 2: no resize on every frame
        expect(canvasNeedsResize(canvas(1600, 800, 800, 400), 2)).toBe(false);
        expect(canvasNeedsResize(canvas(800, 400, 800, 400), 1)).toBe(false);
        // A fractional page size rounds down, as the renderer's own buffer does
        expect(canvasNeedsResize(canvas(1201, 600, 600.7, 300), 2)).toBe(false);
    });

    it('asks for a resize when the page size or the ratio changed', () => {
        expect(canvasNeedsResize(canvas(1600, 800, 400, 800), 2)).toBe(true);
        expect(canvasNeedsResize(canvas(800, 400, 800, 400), 2)).toBe(true);
        expect(canvasNeedsResize(canvas(1600, 800, 800, 401), 2)).toBe(true);
    });

    it('leaves a canvas with no size on the page alone', () => {
        expect(canvasNeedsResize(canvas(300, 150, 0, 0), 1)).toBe(false);
        expect(canvasNeedsResize(canvas(300, 150, 800, 0), 1)).toBe(false);
    });
});
