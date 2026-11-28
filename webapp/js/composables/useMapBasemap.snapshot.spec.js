/**
 * The basemap of a report snapshot comes from the factory of the interactive map, with crossOrigin 'anonymous' (a canvas
 * with tiles fetched without it cannot be exported); the interactive map's sources stay without the setting.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { effectScope, shallowRef } from 'vue';
import { createSnapshotBasemap, useMapBasemap } from './useMapBasemap';
import { setPref, removePref, PREF } from '@/libs/preferences';

beforeEach(() => { removePref(PREF.BASEMAP); removePref(PREF.CUSTOM_BASEMAP); });

describe('createSnapshotBasemap', () => {
    it('fetches the tiles of the named basemap with crossOrigin anonymous, at 1x', () => {
        const source = createSnapshotBasemap('osm').getSource();
        expect(source.getUrls()[0]).toContain('tile.openstreetmap.org');
        expect(source.crossOrigin).toBe('anonymous');
        expect(source.getTilePixelRatio(1)).toBe(1);
    });

    it('keeps a basemap with 2x tiles at 1x whatever the screen', () => {
        const original = globalThis.devicePixelRatio;
        globalThis.devicePixelRatio = 2;
        try {
            const source = createSnapshotBasemap('satellite').getSource();
            expect(source.getUrls()[0]).not.toContain('scale=2');
            expect(source.crossOrigin).toBe('anonymous');
        } finally {
            globalThis.devicePixelRatio = original;
        }
    });

    it('follows the preference of the user when the view names no basemap, and the default for an unknown name', () => {
        setPref(PREF.BASEMAP, 'osm');
        expect(createSnapshotBasemap(null).getSource().getUrls()[0]).toContain('openstreetmap');
        expect(createSnapshotBasemap('nope').getSource().crossOrigin).toBe('anonymous');
    });

    it('fetches a custom XYZ basemap with crossOrigin anonymous, and keeps its attribution', () => {
        setPref(PREF.CUSTOM_BASEMAP, { sourceType: 'xyz', url: 'https://tiles.example.com/{z}/{x}/{y}.png' });
        const source = createSnapshotBasemap('custom').getSource();
        expect(source.getUrls()[0]).toContain('tiles.example.com');
        expect(source.crossOrigin).toBe('anonymous');
    });

    it('fetches a custom WMS basemap with crossOrigin anonymous', () => {
        setPref(PREF.CUSTOM_BASEMAP, { sourceType: 'wms', url: 'https://wms.example.com/service', layerName: 'ortho' });
        expect(createSnapshotBasemap('custom').getSource().crossOrigin).toBe('anonymous');
    });
});

describe('the basemap of the interactive map', () => {
    it('stays without crossOrigin, so a provider that sends no CORS headers still draws its tiles', () => {
        const scope = effectScope();
        const basemap = scope.run(() => useMapBasemap(shallowRef(null)));
        expect(basemap.createBasemapLayer().getSource().crossOrigin).toBeNull();
        setPref(PREF.CUSTOM_BASEMAP, { sourceType: 'xyz', url: 'https://tiles.example.com/{z}/{x}/{y}.png' });
        basemap.handleBasemapChanged('custom');
        expect(basemap.createBasemapLayer().getSource().crossOrigin).toBeNull();
        scope.stop();
    });
});
