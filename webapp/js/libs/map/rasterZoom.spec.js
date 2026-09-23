import { describe, it, expect } from 'vitest';
import {
    INITIAL_RESOLUTION,
    FALLBACK_NATIVE_ZOOM,
    SOURCE_MIN_ZOOM,
    HARD_MAX_ZOOM,
    OL_DEFAULT_MAX_ZOOM,
    computeNativeZoom,
    sourceMaxZoom,
    viewMaxZoom
} from '@/libs/map/rasterZoom';

/**
 * rasterZoom.spec - zoom math contract owned by rasterZoom.js and consumed
 * by Map.vue, SingleMap.vue and usePlantHealth.js (ImproveCOG plan).
 *
 * Expectations are derived from the spec in DroneDB-Roadmap WORKING/ImproveCOG/PLAN.md,
 * not from existing implementation behaviour, so production regressions fail loudly.
 */

function makePolygonFromMeters3857(width3857, height3857, latCenter = 46.0) {
    const r = 6378137;
    const lonHalf = ((width3857 / 2) / r) * (180 / Math.PI);
    const yCenter = r * Math.log(Math.tan(Math.PI / 4 + ((latCenter * Math.PI) / 180) / 2));
    const y0 = yCenter - height3857 / 2;
    const y1 = yCenter + height3857 / 2;
    const lat0 = (2 * Math.atan(Math.exp(y0 / r)) - Math.PI / 2) * (180 / Math.PI);
    const lat1 = (2 * Math.atan(Math.exp(y1 / r)) - Math.PI / 2) * (180 / Math.PI);
    return {
        type: 'Feature',
        properties: {},
        geometry: {
            type: 'Polygon',
            coordinates: [[
                [-lonHalf, lat0],
                [lonHalf, lat0],
                [lonHalf, lat1],
                [-lonHalf, lat1],
                [-lonHalf, lat0]
            ]]
        }
    };
}

function entryFrom(width, height, width3857, height3857) {
    return {
        properties: { width, height },
        polygon_geom: makePolygonFromMeters3857(width3857, height3857)
    };
}

describe('rasterZoom constants', () => {
    it('exposes the values the spec pins', () => {
        expect(FALLBACK_NATIVE_ZOOM).toBe(22);
        expect(SOURCE_MIN_ZOOM).toBe(14);
        expect(HARD_MAX_ZOOM).toBe(26);
        expect(OL_DEFAULT_MAX_ZOOM).toBe(28);
        // ~156543 m/px at zoom 0, the 256 px Web Mercator equator resolution.
        expect(INITIAL_RESOLUTION).toBeCloseTo(156543.0339280410, 4);
    });
});

describe('computeNativeZoom', () => {
    it('falls back to FALLBACK_NATIVE_ZOOM when width/height/polygon_geom are missing', () => {
        expect(computeNativeZoom({})).toBe(FALLBACK_NATIVE_ZOOM);
        expect(computeNativeZoom({ properties: {} })).toBe(FALLBACK_NATIVE_ZOOM);
        expect(computeNativeZoom({ properties: { width: 100 } })).toBe(FALLBACK_NATIVE_ZOOM);
        expect(computeNativeZoom({ properties: { height: 100 } })).toBe(FALLBACK_NATIVE_ZOOM);
        expect(computeNativeZoom({ properties: { width: 0, height: 0 } })).toBe(FALLBACK_NATIVE_ZOOM);
        expect(computeNativeZoom({ properties: { width: -5, height: 10 } })).toBe(FALLBACK_NATIVE_ZOOM);
        // Geometry missing: width and height set, polygon_geom absent/null.
        expect(computeNativeZoom({ properties: { width: 100, height: 100 } }))
            .toBe(FALLBACK_NATIVE_ZOOM);
        expect(computeNativeZoom(null)).toBe(FALLBACK_NATIVE_ZOOM);
        expect(computeNativeZoom(undefined)).toBe(FALLBACK_NATIVE_ZOOM);
    });

    it('falls back when GSD is zero or non-finite (degenerate geometry / bad pixel size)', () => {
        // Degenerate 0 extent → gsd collapses to 0.
        expect(computeNativeZoom({
            properties: { width: 100, height: 100 },
            polygon_geom: { type: 'Point', coordinates: [0, 0] }
        })).toBe(FALLBACK_NATIVE_ZOOM);

        // Infinity dimensions produce NaN gsd (Infinity/Infinity).
        expect(computeNativeZoom({
            properties: { width: Infinity, height: Infinity },
            polygon_geom: makePolygonFromMeters3857(100, 100)
        })).toBe(FALLBACK_NATIVE_ZOOM);
    });

    it('clamps to HARD_MAX_ZOOM for sub-cm GSD with huge pixel dimensions (never exceeds)', () => {
        // A 1 m x 1 m extent across 1,000,000 x 1,000,000 px → gsd 1e-6 → far past 26.
        const entry = entryFrom(1_000_000, 1_000_000, 1, 1);
        const native = computeNativeZoom(entry);
        expect(native).toBe(HARD_MAX_ZOOM);
        expect(native).toBeLessThanOrEqual(HARD_MAX_ZOOM);
        // And a second, even more absurd fixture still saturates at 26, not 27+.
        const submm = entryFrom(10_000_000, 10_000_000, 1, 1);
        expect(computeNativeZoom(submm)).toBe(HARD_MAX_ZOOM);
    });

    it('computes the expected native for a test-ortho-like 83990x112839 raster', () => {
        // 83990 px across an 839.9 m extent in EPSG:3857 (and 112839 across 1128.39 m)
        // yields gsd = 0.01 m/px. ceil(log2(156543.0339280410 / 0.01)) = ceil(23.898…) = 24.
        const entry = {
            properties: { width: 83990, height: 112839 },
            polygon_geom: makePolygonFromMeters3857(839.9, 1128.39, 46.0)
        };
        expect(computeNativeZoom(entry)).toBe(24);
    });

    it('derives zoom deterministically from a coarse raster', () => {
        // 1000 px across 1000 m → 1 m/px → ceil(log2(156543.0339280410)) = ceil(17.257) = 18
        // (one axis governs via Math.max in production, so give both axes the same gsd).
        const entry = entryFrom(1000, 1000, 1000, 1000);
        const expected = Math.ceil(Math.log2(INITIAL_RESOLUTION / 1));
        expect(computeNativeZoom(entry)).toBe(expected);
    });

    it('computes native from anisotropic GSD pinning Math.max and the width↔width axis pairing', () => {
        // Anisotropic fixture: gsdX = getWidth(ext)/pxW, gsdY = getHeight(ext)/pxH,
        // deliberately different per axis (all four quantities distinct), so that a
        // swapped pairing (getWidth/pxH, getHeight/pxW) yields a DIFFERENT native zoom
        // and would be caught by this test.
        const PX_W = 1500;
        const PX_H = 2000;
        const W_3857 = 30; // m/px on X = 30/1500 = 0.02
        const H_3857 = 20; // m/px on Y = 20/2000 = 0.01
        const GSD_X = W_3857 / PX_W; // 0.02
        const GSD_Y = H_3857 / PX_H; // 0.01
        expect(GSD_X).not.toBe(GSD_Y);

        // Expected independently of the implementation: gsd = max(gsdX, gsdY) = 0.02
        // → ceil(log2(156543.0339280410 / 0.02)) = ceil(22.898…) = 23.
        const gsd = Math.max(GSD_X, GSD_Y);
        const expected = Math.ceil(Math.log2(INITIAL_RESOLUTION / gsd));
        expect(expected).toBe(23);

        // Sanity: the swapped-pairing gsd (getWidth/pxH vs getHeight/pxW) would give a
        // different native zoom, proving this fixture discriminates the axis mapping.
        const swappedGsd = Math.max(W_3857 / PX_H, H_3857 / PX_W);
        const swapped = Math.ceil(Math.log2(INITIAL_RESOLUTION / swappedGsd));
        expect(swapped).not.toBe(expected);

        expect(computeNativeZoom(entryFrom(PX_W, PX_H, W_3857, H_3857))).toBe(expected);
    });
});

describe('sourceMaxZoom', () => {
    it('applies the retina -1 and clamps between SOURCE_MIN_ZOOM and HARD_MAX_ZOOM', () => {
        expect(sourceMaxZoom(24, true)).toBe(23);
        expect(sourceMaxZoom(24, false)).toBe(24);
        // Must clamp, NOT go below SOURCE_MIN_ZOOM.
        expect(sourceMaxZoom(14, true)).toBe(14);
        expect(sourceMaxZoom(14, false)).toBe(14);
        // Far below the floor: still clamped up to 14.
        expect(sourceMaxZoom(5, false)).toBe(14);
        expect(sourceMaxZoom(5, true)).toBe(14);
        // Above HARD_MAX_ZOOM: clamp to 26 in both retina modes.
        expect(sourceMaxZoom(30, false)).toBe(HARD_MAX_ZOOM);
        expect(sourceMaxZoom(30, true)).toBe(HARD_MAX_ZOOM);
    });

    it('uses FALLBACK_NATIVE_ZOOM when native is nullish', () => {
        // null → FALLBACK_NATIVE_ZOOM. retina=false → 22; true → 22-1=21.
        expect(sourceMaxZoom(null, false)).toBe(22);
        expect(sourceMaxZoom(null, true)).toBe(21);
        expect(sourceMaxZoom(undefined, false)).toBe(22);
    });

    it('clamps a very coarse native (8) up to SOURCE_MIN_ZOOM in both retina modes', () => {
        // Source-side coarse-raster floor contract: the view-side floor for coarse
        // rasters lives in Map.vue _applyViewCapNow (not a pure helper, so it is
        // covered only by manual/live test steps — see ImproveCOG plan).
        expect(sourceMaxZoom(8, false)).toBe(SOURCE_MIN_ZOOM);
        expect(sourceMaxZoom(8, false)).toBe(14);
        expect(sourceMaxZoom(8, true)).toBe(SOURCE_MIN_ZOOM);
        expect(sourceMaxZoom(8, true)).toBe(14);
    });
});

describe('viewMaxZoom', () => {
    it('returns OL_DEFAULT_MAX_ZOOM for empty / all-non-finite native lists', () => {
        expect(viewMaxZoom([])).toBe(OL_DEFAULT_MAX_ZOOM);
        expect(viewMaxZoom([])).toBe(28);
        expect(viewMaxZoom([undefined])).toBe(OL_DEFAULT_MAX_ZOOM);
        expect(viewMaxZoom([undefined, null, NaN, Infinity])).toBe(OL_DEFAULT_MAX_ZOOM);
        expect(viewMaxZoom(undefined)).toBe(OL_DEFAULT_MAX_ZOOM);
        expect(viewMaxZoom(null)).toBe(OL_DEFAULT_MAX_ZOOM);
    });

    it('returns max(natives) + VIEW_MAGNIFICATION (=1) without producing NaN', () => {
        expect(viewMaxZoom([undefined, 20])).toBe(21);
        expect(viewMaxZoom([20, undefined, 18])).toBe(21);
        expect(viewMaxZoom([24])).toBe(25);
        expect(viewMaxZoom([18, 14, 22])).toBe(23); // max=22 +1
    });

    it('clamps to HARD_MAX_ZOOM + 1 (=27) regardless of inputs', () => {
        expect(viewMaxZoom([24, 26])).toBe(HARD_MAX_ZOOM + 1);
        expect(viewMaxZoom([24, 26])).toBe(27);
        expect(viewMaxZoom([40])).toBe(27);
        expect(viewMaxZoom([30, 50, 100])).toBe(27);
    });

    it('returns the same value regardless of window.devicePixelRatio', () => {
        const original = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio');
        Object.defineProperty(window, 'devicePixelRatio', {
            configurable: true,
            value: 1
        });
        const dpr1 = viewMaxZoom([24]);
        Object.defineProperty(window, 'devicePixelRatio', {
            configurable: true,
            value: 2
        });
        const dpr2 = viewMaxZoom([24]);
        if (original) {
            Object.defineProperty(window, 'devicePixelRatio', original);
        } else {
            delete window.devicePixelRatio;
        }
        expect(dpr1).toBe(25);
        expect(dpr2).toBe(25);
        expect(dpr1).toBe(dpr2);
    });

    it('uses MAX across mixed raster GSDs (the multi-raster policy)', () => {
        expect(viewMaxZoom([18, 24])).toBe(25);
        expect(viewMaxZoom([24, 18, 20])).toBe(25);
    });
});
