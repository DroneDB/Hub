import { describe, it, expect } from 'vitest';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import { fromExtent } from 'ol/geom/Polygon';
import { featureAt, toggleSelectionAt, filesInPolygon } from './fileSelection';
import { formatSpeed } from '@/libs/format';

// A map whose pixel holds the given [feature, layer] pairs, top-most first
const mapWith = hits => ({
    forEachFeatureAtPixel(pixel, cb, opts) {
        for (const [feature, layer] of hits) {
            if (opts && opts.layerFilter && !opts.layerFilter(layer)) continue;
            if (cb(feature, layer)) return;
        }
    }
});
const cluster = files => ({ get: k => (k === 'features' ? files.map(file => ({ file })) : undefined) });
const item = (selected = false) => ({ selected });

describe('featureAt', () => {
    it('returns the top-most hit the filter accepts', () => {
        const a = {}, b = {}, la = { id: 'a' }, lb = { id: 'b' };
        expect(featureAt(mapWith([[a, la], [b, lb]]), [0, 0]).feature).toBe(a);
        expect(featureAt(mapWith([[a, la], [b, lb]]), [0, 0], l => l === lb).feature).toBe(b);
        expect(featureAt(mapWith([]), [0, 0])).toBeNull();
    });
});

describe('toggleSelectionAt', () => {
    it('toggles a vector file before anything under it', () => {
        const file = item();
        const layer = { file };
        const shot = item();
        const map = mapWith([[{}, layer], [cluster([shot]), {}]]);
        expect(toggleSelectionAt(map, [0, 0], [layer])).toBe(file);
        expect(file.selected).toBe(true);
        expect(shot.selected).toBe(false);
        expect(toggleSelectionAt(map, [0, 0], [layer])).toBeNull();
        expect(file.selected).toBe(false);
    });

    it('selects a whole cluster, or clears it when any shot was selected', () => {
        const shots = [item(), item()];
        const map = mapWith([[cluster(shots), {}]]);
        expect(toggleSelectionAt(map, [0, 0], [])).toBe(shots[0]);
        expect(shots.every(s => s.selected)).toBe(true);
        shots[1].selected = false;
        expect(toggleSelectionAt(map, [0, 0], [])).toBeNull();
        expect(shots.some(s => s.selected)).toBe(false);
    });

    it('toggles a raster extent without scrolling to it', () => {
        const file = item();
        const extent = new Feature();
        extent.file = file;
        expect(toggleSelectionAt(mapWith([[extent, {}]]), [0, 0], [])).toBeNull();
        expect(file.selected).toBe(true);
    });
});

describe('filesInPolygon', () => {
    const at = (x, y, file) => { const f = new Feature(new Point([x, y])); f.file = file; return f; };
    const box = (ext, file) => { const f = new Feature(fromExtent(ext)); f.file = file; return f; };

    it('collects shots inside, extents and vector files that intersect, once each', () => {
        const inShot = item(), outShot = item(), raster = item(), vector = item();
        const vectorLayer = {
            file: vector,
            getSource: () => ({ forEachFeatureInExtent: (ext, cb) => cb(new Feature(new Point([5, 5]))) })
        };
        const polygon = fromExtent([0, 0, 10, 10]);
        const files = filesInPolygon(polygon, {
            shots: [at(1, 1, inShot), at(20, 20, outShot), at(2, 2, inShot)],
            extents: [box([8, 8, 30, 30], raster)],
            vectorLayers: [vectorLayer]
        });
        expect(files).toEqual([inShot, raster, vector]);
    });
});

describe('formatSpeed', () => {
    it('shows km/h or mph', () => {
        expect(formatSpeed(10)).toBe('36.0 km/h');
        expect(formatSpeed(10, 'imperial')).toBe('22.4 mph');
    });
});
