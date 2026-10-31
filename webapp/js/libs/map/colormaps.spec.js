import { describe, it, expect } from 'vitest';
import { colormap, colormapList, colorAt, THERMAL_COLORMAPS, GENERIC_COLORMAPS, INDEX_COLORMAPS } from './colormaps';

describe('colormaps', () => {
    it('knows every colormap the panels offer', () => {
        for (const id of [...THERMAL_COLORMAPS, ...GENERIC_COLORMAPS, ...INDEX_COLORMAPS]) {
            expect(colormap(id).colors.length, id).toBeGreaterThan(1);
        }
        expect(colormapList(['viridis'])[0]).toMatchObject({ id: 'viridis', name: 'Viridis' });
        expect(colormap('nope')).toEqual({ id: 'nope', name: 'nope', colors: [] });
    });

    it('interpolates between stops like the server (ironbow at 0.2 steps)', () => {
        expect(colorAt('ironbow', 0)).toBe('rgb(0,0,0)');
        expect(colorAt('ironbow', 0.2)).toBe('rgb(87,15,106)');
        expect(colorAt('ironbow', 1)).toBe('rgb(255,255,255)');
        expect(colorAt('whitehot', 0.5)).toBe('rgb(128,128,128)');
    });

    it('keeps the discrete NDVI classes hard-edged, and falls back to grayscale', () => {
        expect(colorAt('discrete_ndvi', 0.39)).toBe('rgb(255,69,0)');
        expect(colorAt('discrete_ndvi', 0.41)).toBe('rgb(255,215,0)');
        expect(colorAt('discrete_ndvi', 1)).toBe('rgb(0,100,0)');
        expect(colorAt(null, 1)).toBe('rgb(255,255,255)');
    });
});
