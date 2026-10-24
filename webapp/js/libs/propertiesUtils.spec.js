/**
 * Unit tests for the CAD coordinate-system row of libs/propertiesUtils.js (DDB-12).
 * Run with: npx vitest run webapp/js/libs/propertiesUtils.spec.js
 */
import { describe, it, expect } from 'vitest';
import { formatCadCrs } from './propertiesUtils';

const entry = (crs, units = 'm') => ({ properties: { vector: { crs, units } } });

describe('formatCadCrs', () => {
    it('says when WGS84 was assumed', () => {
        expect(formatCadCrs(entry({ source: 'lonlat', label: 'EPSG:4326' })))
            .toMatch(/^WGS84 \(EPSG:4326\), assumed/);
    });

    it('names the origin of a real coordinate system', () => {
        expect(formatCadCrs(entry({ source: 'geodata', label: 'EPSG:2193' }))).toBe('EPSG:2193 (stored in the drawing)');
        expect(formatCadCrs(entry({ source: 'prj', label: 'EPSG:32632' }))).toBe('EPSG:32632 (from the .prj file)');
    });

    it('describes local drawings, with units', () => {
        expect(formatCadCrs(entry({ source: 'none', label: '' }))).toMatch(/^None: local drawing coordinates, units: m\./);
        expect(formatCadCrs(entry({ source: 'prj', label: 'local' }, 'mm')))
            .toBe('None: local drawing coordinates, set by the .prj file, units: mm');
    });

    it('returns null without CAD CRS information', () => {
        expect(formatCadCrs({ properties: { vector: { layers: [] } } })).toBeNull();
        expect(formatCadCrs({ properties: {} })).toBeNull();
        expect(formatCadCrs(null)).toBeNull();
    });
});
