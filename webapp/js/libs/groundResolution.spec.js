import { describe, it, expect } from 'vitest';
import { footprintGroundSize, formatGroundResolution } from './groundResolution';

// Metres per degree of latitude on the sphere haversineMeters uses
const M_PER_DEG = 6371000 * Math.PI / 180;

// A north-up footprint of width x height metres centred at lat, as DroneDB stores it:
// upper left, upper right, lower right, lower left, upper left
function footprint(width, height, lat = 46.84, lon = -91.99) {
    const dLon = width / (M_PER_DEG * Math.cos(lat * Math.PI / 180)) / 2;
    const dLat = height / M_PER_DEG / 2;
    const ring = [[lon - dLon, lat + dLat], [lon + dLon, lat + dLat], [lon + dLon, lat - dLat], [lon - dLon, lat - dLat], [lon - dLon, lat + dLat]];
    return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: {} };
}

describe('footprintGroundSize', () => {
    it('measures the ground width and height of the footprint', () => {
        const size = footprintGroundSize(footprint(90, 88));
        expect(size.width).toBeCloseTo(90, 1);
        expect(size.height).toBeCloseTo(88, 1);
    });

    it('is null without a footprint', () => {
        expect(footprintGroundSize(null)).toBeNull();
        expect(footprintGroundSize({ type: 'Point', coordinates: [0, 0] })).toBeNull();
    });
});

describe('formatGroundResolution', () => {
    it('shows the pixel size in cm with the ground extent and area', () => {
        expect(formatGroundResolution(footprint(90, 88), 1800, 1760)).toBe('5.0 cm/px\n90 x 88 m (7920 m²)');
    });

    it('shows both sides of a pixel that is not square on the ground', () => {
        expect(formatGroundResolution(footprint(86, 124), 2000, 2000)).toBe('4.3 x 6.2 cm/px\n86 x 124 m (1.1 ha)');
    });

    it('switches to km, hectares, m/px and km² for large rasters', () => {
        expect(formatGroundResolution(footprint(2000, 1500), 20000, 15000)).toBe('10.0 cm/px\n2.00 x 1.50 km (300.0 ha)');
        expect(formatGroundResolution(footprint(20000, 20000), 2000, 2000)).toBe('10.0 m/px\n20.00 x 20.00 km (400 km²)');
    });

    it('keeps two decimals for sub-centimetre pixels and small extents', () => {
        expect(formatGroundResolution(footprint(5, 4), 1000, 800)).toBe('0.50 cm/px\n5.0 x 4.0 m (20 m²)');
    });

    it('follows the imperial units', () => {
        expect(formatGroundResolution(footprint(90, 88), 1800, 1760, 'imperial')).toBe('2.0 in/px\n295 x 289 ft (1.96 acres)');
    });

    it('is null without a footprint or a pixel count', () => {
        expect(formatGroundResolution(null, 100, 100)).toBeNull();
        expect(formatGroundResolution(footprint(90, 88), 0, 1760)).toBeNull();
        expect(formatGroundResolution(footprint(90, 88), undefined, 1760)).toBeNull();
    });
});
