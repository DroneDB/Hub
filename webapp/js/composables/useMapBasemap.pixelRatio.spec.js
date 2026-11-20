/**
 * FR-MAP-29, FR-XC-32: on a screen above ratio 1 the basemap comes from 2x tiles (512 px in 256 px slots) when it has a
 * 2x source: Google satellite and hybrid (`scale=2`), a custom XYZ URL with `{r}` (`@2x`). OpenStreetMap and a custom URL
 * without `{r}` have none and stay at 1x.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { effectScope, shallowRef } from 'vue';
import { Collection } from 'ol';
import { Tile as TileLayer } from 'ol/layer';
import { useMapBasemap } from './useMapBasemap';
import { PREF, setPref, safeStorage, _resetPrefListenersForTests } from '@/libs/preferences';

let scope;

function start() {
    const layers = new Collection([new TileLayer()]);
    const map = shallowRef({ getLayers: () => layers });
    let basemap;
    scope = effectScope();
    scope.run(() => { basemap = useMapBasemap(map); });
    layers.setAt(0, basemap.createBasemapLayer());
    return { basemap, layers };
}

const sourceOf = layers => layers.item(0).getSource();
const urlOf = layers => sourceOf(layers).getUrls()[0];

beforeEach(() => {
    _resetPrefListenersForTests();
    safeStorage.removeItem(PREF.BASEMAP);
    safeStorage.removeItem(PREF.CUSTOM_BASEMAP);
});
afterEach(() => {
    scope?.stop();
    vi.unstubAllGlobals();
    _resetPrefListenersForTests();
    safeStorage.removeItem(PREF.BASEMAP);
    safeStorage.removeItem(PREF.CUSTOM_BASEMAP);
});

describe('basemap tiles at the screen ratio (FR-MAP-29)', () => {
    it('at ratio 2 the satellite source has tilePixelRatio 2 and a URL with scale=2', () => {
        vi.stubGlobal('devicePixelRatio', 2);
        setPref(PREF.BASEMAP, 'satellite');
        const { layers } = start();
        expect(sourceOf(layers).getTilePixelRatio(2)).toBe(2);
        expect(urlOf(layers)).toBe('https://mt0.google.com/vt/lyrs=s&hl=en&x={x}&y={y}&z={z}&scale=2');
    });

    it('at ratio 1 it has tilePixelRatio 1 and the plain URL', () => {
        vi.stubGlobal('devicePixelRatio', 1);
        setPref(PREF.BASEMAP, 'satellite');
        const { layers } = start();
        expect(sourceOf(layers).getTilePixelRatio(1)).toBe(1);
        expect(urlOf(layers)).toBe('https://mt0.google.com/vt/lyrs=s&hl=en&x={x}&y={y}&z={z}');
    });

    it('the hybrid basemap takes 2x tiles too, at a ratio of 1.5', () => {
        vi.stubGlobal('devicePixelRatio', 1.5);
        setPref(PREF.BASEMAP, 'hybrid');
        const { layers } = start();
        expect(sourceOf(layers).getTilePixelRatio(1.5)).toBe(2);
        expect(urlOf(layers)).toBe('https://mt0.google.com/vt/lyrs=y&hl=en&x={x}&y={y}&z={z}&scale=2');
    });

    it('OpenStreetMap has no 2x source: it stays at 1x on a screen of ratio 2', () => {
        vi.stubGlobal('devicePixelRatio', 2);
        setPref(PREF.BASEMAP, 'osm');
        const { layers } = start();
        expect(sourceOf(layers).getTilePixelRatio(2)).toBe(1);
        expect(urlOf(layers)).toBe('https://tile.openstreetmap.org/{z}/{x}/{y}.png');
    });

    it('a custom XYZ URL with {r} gets @2x and tilePixelRatio 2 at ratio 2, and nothing at ratio 1', () => {
        const config = { sourceType: 'xyz', url: 'https://tiles.test/{z}/{x}/{y}{r}.png' };
        setPref(PREF.BASEMAP, 'custom');
        setPref(PREF.CUSTOM_BASEMAP, config);
        vi.stubGlobal('devicePixelRatio', 2);
        let started = start();
        expect(urlOf(started.layers)).toBe('https://tiles.test/{z}/{x}/{y}@2x.png');
        expect(sourceOf(started.layers).getTilePixelRatio(2)).toBe(2);
        scope.stop();
        vi.stubGlobal('devicePixelRatio', 1);
        started = start();
        expect(urlOf(started.layers)).toBe('https://tiles.test/{z}/{x}/{y}.png');
        expect(sourceOf(started.layers).getTilePixelRatio(1)).toBe(1);
    });

    it('a custom XYZ URL without {r} stays at 1x on a screen of ratio 2', () => {
        setPref(PREF.BASEMAP, 'custom');
        setPref(PREF.CUSTOM_BASEMAP, { sourceType: 'xyz', url: 'https://tiles.test/{z}/{x}/{y}.png' });
        vi.stubGlobal('devicePixelRatio', 2);
        const { layers } = start();
        expect(urlOf(layers)).toBe('https://tiles.test/{z}/{x}/{y}.png');
        expect(sourceOf(layers).getTilePixelRatio(2)).toBe(1);
    });

    it('draws the tiles of the new ratio when the window moves to another screen', () => {
        let onChange;
        vi.stubGlobal('matchMedia', () => ({
            addEventListener: (type, fn) => { onChange = fn; },
            removeEventListener: () => {}
        }));
        vi.stubGlobal('devicePixelRatio', 1);
        setPref(PREF.BASEMAP, 'satellite');
        const { layers } = start();
        expect(urlOf(layers)).not.toContain('scale=2');
        vi.stubGlobal('devicePixelRatio', 2);
        onChange();
        expect(urlOf(layers)).toContain('scale=2');
        expect(sourceOf(layers).getTilePixelRatio(2)).toBe(2);
    });
});
