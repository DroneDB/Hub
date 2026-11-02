/**
 * OpenLayers controls live in libs/map/controls, one MapCore is shared by the dataset map and
 * the map viewer, and the viewer is thin: its logic is in composables.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const JS = path.resolve(__dirname, '..');
const MAP = path.join(JS, 'features/viewers/map');
const read = f => fs.readFileSync(path.join(MAP, f), 'utf8');
const lines = f => read(f).split('\n').length;

describe('map family structure', () => {
    it('has no OpenLayers controls in .vue files', () => {
        for (const f of ['olMeasure.vue', 'olSelection.vue', 'olSettings.vue']) {
            expect(fs.existsSync(path.join(MAP, f))).toBe(false);
        }
        expect(fs.existsSync(path.join(JS, 'libs/map/controls/measureControl.js'))).toBe(true);
    });

    it('shares one MapCore between the dataset map and the map viewer', () => {
        expect(fs.existsSync(path.join(MAP, 'MapCore.vue'))).toBe(true);
        expect(lines('DatasetMap.vue')).toBeLessThanOrEqual(300);
        for (const f of ['MapViewer.vue', 'MapViewerPage.vue']) {
            expect(lines(f)).toBeLessThanOrEqual(200);
        }
        for (const f of ['DatasetMap.vue', 'MapViewer.vue', 'MapViewerPage.vue', 'ViewBar.vue']) {
            expect(read(f)).not.toMatch(/\bmixins\s*:/);
        }
    });

    it('has one map viewer and none of the maps and helpers it replaced', () => {
        expect(fs.existsSync(path.join(MAP, 'MapViewer.vue'))).toBe(true);
        for (const f of [
            'features/viewers/map/SingleMap.vue', 'features/viewers/map/CompareMap.vue', 'features/viewers/map/CompareToolbar.vue',
            'composables/useAddedLayers.js', 'composables/useComparison.js', 'composables/useMapComparison.js', 'libs/map/layerQuery.js'
        ]) {
            expect(fs.existsSync(path.join(JS, f)), f).toBe(false);
        }
    });

    it('has a MapCore that knows no comparison', () => {
        expect(read('MapCore.vue')).not.toMatch(/comparison/i);
    });

    it('routes the file and the saved view to the map viewer, and has no compare route', () => {
        const router = fs.readFileSync(path.join(JS, 'router.js'), 'utf8');
        expect(router).toMatch(/path: '\/r\/:org\/:ds\/view\/:encodedPath\/map'[^\n]*viewsFor\(MapViewer\)/);
        expect(router).toMatch(/path: '\/r\/:org\/:ds\/views\/:uid'[^\n]*viewsFor\(MapViewer\)/);
        expect(router).not.toMatch(/\/compare\b/);
    });

    it('mounts no separate Vue apps for map dialogs', () => {
        const offenders = fs.readdirSync(MAP).filter(f => /\.(vue|js)$/.test(f))
            .filter(f => /createApp\(/.test(read(f)));
        expect(offenders).toEqual([]);
    });
});
