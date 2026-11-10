/**
 * FR-MAP-24: one icon per meaning. The pile has its own (not the stacked layers of a raster layer, a merge or the
 * Contours button), and the saved views have theirs (not the split of "Compare").
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { STOCKPILE_ICON, VIEWS_ICON } from './icons';

const source = file => readFileSync(path.resolve(__dirname, file), 'utf8');

describe('the icons of the map and the explorer', () => {
    it('are a mountain for a pile and a bookmark for the saved views', () => {
        expect(STOCKPILE_ICON).toBe('fa-solid fa-mountain');
        expect(VIEWS_ICON).toBe('fa-solid fa-bookmark');
    });

    it('are not the icon of another meaning: layers, the split compare', () => {
        for (const icon of [STOCKPILE_ICON, VIEWS_ICON]) {
            expect(icon).not.toMatch(/layer-group|table-columns/);
        }
    });

    it.each([
        ['the map toolbar', '../features/viewers/map/MapToolbar.vue', 'STOCKPILE_ICON'],
        ['the Stockpile panel', '../features/viewers/map/StockpileVolumePanel.vue', 'STOCKPILE_ICON'],
        ['the Measurement List', '../features/viewers/map/MeasurementListDialog.vue', 'STOCKPILE_ICON'],
        ['the Preferences tab', '../features/account/PreferencesDialog.vue', 'STOCKPILE_ICON'],
        ['the saved views of the explorer', '../features/dataset/explorer/SavedViews.vue', 'VIEWS_ICON']
    ])('are the ones %s uses', (name, file, constant) => {
        const text = source(file);
        expect(text).toContain(constant);
    });

    it.each([
        '../features/viewers/map/StockpileVolumePanel.vue',
        '../features/viewers/map/MeasurementListDialog.vue',
        '../features/account/PreferencesDialog.vue',
        '../features/dataset/explorer/SavedViews.vue'
    ])('are not written as the icon of another meaning in %s', file => {
        expect(source(file)).not.toMatch(/fa-layer-group|fa-table-columns/);
    });

    it('leave the Compare button its split icon, which no longer is the icon of the views', () => {
        expect(source('../features/viewers/map/MapToolbar.vue')).toContain('fa-solid fa-table-columns');
    });
});
