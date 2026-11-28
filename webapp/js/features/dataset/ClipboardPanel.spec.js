/**
 * The clipboard panel is fixed over the dataset page. A viewer in full screen (the map, a viewer shell) fills the page
 * at a lower z-index, under the overlays of PrimeVue: the panel would be drawn over the viewer's corner, so it is not
 * shown in full screen.
 */
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { readSource, ruleOf } from '@/specs/cssSource';

const zOf = rule => Number(/z-index:\s*(\d+)/.exec(rule)?.[1]);
const panel = readSource(__dirname, 'ClipboardPanel.vue');

describe('ClipboardPanel in full screen', () => {
    it('is hidden while a viewer fills the page, which it would otherwise cover', () => {
        const fullscreenViewers = [
            ruleOf(readSource(path.join(__dirname, '../viewers/map'), 'MapCore.vue'), 'html:fullscreen #map'),
            ruleOf(readSource(path.join(__dirname, '../../components'), 'ViewerShell.vue'), 'html:fullscreen .viewer-shell')
        ].map(zOf);
        // Above the page, so above a viewer in full screen too
        expect(fullscreenViewers.every(z => zOf(ruleOf(panel, '.clipboard-panel')) > z)).toBe(true);

        expect(ruleOf(panel, 'html:fullscreen .clipboard-panel')).toMatch(/display:\s*none/);
    });
});
