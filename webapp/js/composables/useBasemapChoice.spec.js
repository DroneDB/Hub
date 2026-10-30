import { describe, it, expect, beforeEach } from 'vitest';
import { ref } from 'vue';
import { useBasemapChoice } from './useBasemapChoice';
import { PREF, setPref } from '@/libs/preferences';

const SOURCE = { sourceType: 'xyz', url: 'https://tiles.example.com/{z}/{x}/{y}.png', layerName: '' };

let selected;
beforeEach(() => {
    setPref(PREF.CUSTOM_BASEMAP, null);
    selected = ref('satellite');
});

describe('useBasemapChoice', () => {
    it('shows the stored selection and writes another basemap at once', () => {
        const { choice, editingCustom } = useBasemapChoice(selected);
        expect(choice.value).toBe('satellite');
        choice.value = 'osm';
        expect(selected.value).toBe('osm');
        expect(editingCustom.value).toBe(false);
    });

    it('Custom without a custom source opens the editor and writes nothing', () => {
        const { choice, editingCustom } = useBasemapChoice(selected);
        choice.value = 'custom';
        expect(choice.value).toBe('custom');
        expect(editingCustom.value).toBe(true);
        expect(selected.value).toBe('satellite');
    });

    it('a saved source writes Custom', () => {
        const { choice, onApplied } = useBasemapChoice(selected);
        choice.value = 'custom';
        onApplied();
        expect(selected.value).toBe('custom');
        expect(choice.value).toBe('custom');
    });

    it('Custom with a usable source is written at once', () => {
        setPref(PREF.CUSTOM_BASEMAP, SOURCE);
        const { choice } = useBasemapChoice(selected);
        choice.value = 'custom';
        expect(selected.value).toBe('custom');
    });

    it('another basemap chosen while Custom waits ends the wait', () => {
        const { choice, editingCustom } = useBasemapChoice(selected);
        choice.value = 'custom';
        choice.value = 'osm';
        expect(selected.value).toBe('osm');
        expect(editingCustom.value).toBe(false);
    });

    it('a selection made elsewhere (Reset section) ends the wait', () => {
        const { choice } = useBasemapChoice(selected);
        choice.value = 'custom';
        selected.value = 'hybrid';
        expect(choice.value).toBe('hybrid');
    });

    it('clearing the source of a custom selection returns to the default basemap', () => {
        selected.value = 'custom';
        const { choice, onCleared } = useBasemapChoice(selected);
        onCleared();
        expect(selected.value).toBe('satellite');
        expect(choice.value).toBe('satellite');
    });

    it('clearing the source leaves another selection alone', () => {
        selected.value = 'osm';
        const { onCleared } = useBasemapChoice(selected);
        onCleared();
        expect(selected.value).toBe('osm');
    });

    it('a stored Custom without a source shows Custom with the editor', () => {
        selected.value = 'custom';
        const { choice, editingCustom } = useBasemapChoice(selected);
        expect(choice.value).toBe('custom');
        expect(editingCustom.value).toBe(true);
    });
});
