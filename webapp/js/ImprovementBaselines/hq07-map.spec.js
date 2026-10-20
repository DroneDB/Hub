/**
 * HQ-07 acceptance: OpenLayers controls live in libs/map/controls, a shared
 * MapCore exists, the map wrappers are thin. Fails today on all counts.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MAP = path.resolve(__dirname, '../features/viewers/map');
const lines = f => fs.readFileSync(path.join(MAP, f), 'utf8').split('\n').length;

describe('map family structure', () => {
    it('has no OpenLayers controls in .vue files', () => {
        for (const f of ['olMeasure.vue', 'olSelection.vue', 'olSettings.vue']) {
            expect(fs.existsSync(path.join(MAP, f))).toBe(false);
        }
        expect(fs.existsSync(path.resolve(__dirname, '../libs/map/controls/measureControl.js'))).toBe(true);
    });

    it('shares one MapCore between the dataset map and the single map', () => {
        expect(fs.existsSync(path.join(MAP, 'MapCore.vue'))).toBe(true);
        expect(lines('Map.vue')).toBeLessThanOrEqual(300);
        expect(lines('SingleMap.vue')).toBeLessThanOrEqual(200);
        for (const f of ['Map.vue', 'SingleMap.vue']) {
            expect(fs.readFileSync(path.join(MAP, f), 'utf8')).not.toMatch(/\bmixins\s*:/);
        }
    });

    it('mounts no separate Vue apps for map dialogs', () => {
        const offenders = fs.readdirSync(MAP).filter(f => /\.(vue|js)$/.test(f))
            .filter(f => /createApp\(/.test(fs.readFileSync(path.join(MAP, f), 'utf8')));
        expect(offenders).toEqual([]);
    });
});
