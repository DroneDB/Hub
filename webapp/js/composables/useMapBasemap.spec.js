/**
 * The basemap of the map viewer: a basemap the user picks is their preference, one a saved view
 * carries is drawn without touching it.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { effectScope, shallowRef } from 'vue';
import { Collection } from 'ol';
import { Tile as TileLayer } from 'ol/layer';
import { useMapBasemap } from './useMapBasemap';
import { PREF, getPref, setPref, applyAccountValue, safeStorage, _resetPrefListenersForTests } from '@/libs/preferences';

let scope;

function start() {
    const layers = new Collection([new TileLayer(), new TileLayer()]);
    const map = shallowRef({ getLayers: () => layers });
    let basemap;
    scope = effectScope();
    scope.run(() => { basemap = useMapBasemap(map); });
    // The map builds its basemap as layer 0, as MapCore does
    layers.setAt(0, basemap.createBasemapLayer());
    return { basemap, layers };
}

const stored = () => getPref(PREF.BASEMAP, 'satellite');
const urlOf = layers => layers.item(0).getSource().getUrls()[0];

beforeEach(() => {
    _resetPrefListenersForTests();
    safeStorage.removeItem(PREF.BASEMAP);
});
afterEach(() => {
    scope?.stop();
    _resetPrefListenersForTests();
    safeStorage.removeItem(PREF.BASEMAP);
});

describe('the basemap of the map viewer', () => {
    it('starts from the preference', () => {
        setPref(PREF.BASEMAP, 'osm');
        expect(start().basemap.selectedBasemap.value).toBe('osm');
    });

    it('saves the basemap the user picks as the preference, and draws it', () => {
        const { basemap, layers } = start();
        const before = urlOf(layers);
        basemap.handleBasemapChanged('osm');
        expect(stored()).toBe('osm');
        expect(basemap.selectedBasemap.value).toBe('osm');
        expect(urlOf(layers)).not.toBe(before);
    });

    it('draws the basemap of a view without saving it', () => {
        setPref(PREF.BASEMAP, 'satellite');
        const { basemap, layers } = start();
        const before = urlOf(layers);
        basemap.applyBasemap('osm');
        expect(basemap.selectedBasemap.value).toBe('osm');
        expect(urlOf(layers)).not.toBe(before);
        expect(stored()).toBe('satellite');
    });

    it('draws the preference when a view has no basemap, after the basemap of another view', () => {
        setPref(PREF.BASEMAP, 'satellite');
        const { basemap } = start();
        basemap.applyBasemap('osm');
        basemap.applyBasemap(null);
        expect(basemap.selectedBasemap.value).toBe('satellite');
        expect(stored()).toBe('satellite');
    });

    it('saves a pick made over the basemap of a view', () => {
        const { basemap } = start();
        basemap.applyBasemap('osm');
        basemap.handleBasemapChanged('satellite');
        expect(stored()).toBe('satellite');
        expect(basemap.selectedBasemap.value).toBe('satellite');
        // The preference is the pick now: a view without basemap draws it
        basemap.applyBasemap(null);
        expect(basemap.selectedBasemap.value).toBe('satellite');
    });

    it('follows a preference that changes elsewhere (the account, another tab)', () => {
        const { basemap } = start();
        applyAccountValue(PREF.BASEMAP, 'osm');
        expect(basemap.selectedBasemap.value).toBe('osm');
    });

    it('keeps the basemap of a view when the preference changes elsewhere', () => {
        setPref(PREF.BASEMAP, 'satellite');
        const { basemap, layers } = start();
        basemap.applyBasemap('osm');
        const drawn = urlOf(layers);
        applyAccountValue(PREF.BASEMAP, 'hybrid');
        expect(basemap.selectedBasemap.value).toBe('osm');
        expect(urlOf(layers)).toBe(drawn);
    });

    it('follows the preference again after a view without basemap, or after a pick', () => {
        setPref(PREF.BASEMAP, 'satellite');
        const { basemap } = start();
        basemap.applyBasemap('osm');
        basemap.applyBasemap(null);
        applyAccountValue(PREF.BASEMAP, 'hybrid');
        expect(basemap.selectedBasemap.value).toBe('hybrid');

        basemap.applyBasemap('osm');
        basemap.handleBasemapChanged('satellite');
        expect(stored()).toBe('satellite');
        applyAccountValue(PREF.BASEMAP, 'osm');
        expect(basemap.selectedBasemap.value).toBe('osm');
    });
});
