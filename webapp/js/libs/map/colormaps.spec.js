import { describe, it, expect } from 'vitest';
import { colormap, colormapList, colorAt, colormapGradient, THERMAL_COLORMAPS, GENERIC_COLORMAPS, INDEX_COLORMAPS } from './colormaps';

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

describe('colormapGradient (the bar of the picker and of the map legend)', () => {
    it('is a smooth gradient from the first stop to the last', () => {
        expect(colormapGradient(colormap('ironbow').colors))
            .toBe('linear-gradient(to right, #000000, #570f6a, #bd3754, #f97808, #ffe344, #ffffff)');
        expect(colormapGradient(['#000000', '#ffffff'])).toBe('linear-gradient(to right, #000000, #ffffff)');
    });

    it('has hard stops for a discrete colormap: one block per colour', () => {
        expect(colormapGradient(['#111111', '#222222', '#333333', '#444444'], true)).toBe(
            'linear-gradient(to right, #111111 0%, #111111 25%, #222222 25%, #222222 50%, #333333 50%, #333333 75%, #444444 75%, #444444 100%)');
        // The five classes of the contrast NDVI map are a fifth each
        expect(colormapGradient(colormap('discrete_ndvi').colors, colormap('discrete_ndvi').discrete))
            .toContain('#ff4500 20%, #ff4500 40%');
    });

    it('is empty without colours and a flat bar for one', () => {
        expect(colormapGradient([])).toBe('');
        expect(colormapGradient(null)).toBe('');
        expect(colormapGradient(['#123456'])).toBe('linear-gradient(to right, #123456, #123456)');
    });
});

