import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// The layout is CSS (no layout engine in the tests): the rules that keep the overlays apart
const read = file => fs.readFileSync(path.join(__dirname, file), 'utf8');
const ruleOf = (source, selector) => {
    const start = source.indexOf(`${selector} {`);
    return start < 0 ? '' : source.slice(start, source.indexOf('}', start));
};

describe('the overlays of the splat viewer', () => {
    it('size the camera rail from the variables of the viewer', () => {
        const viewer = ruleOf(read('Splat.scss'), '#splat');
        expect(viewer).toMatch(/--splat-rail-width:\s*calc\(var\(--splat-rail-button\) \+ 2 \* var\(--splat-rail-padding\)\)/);
        const rail = read('SplatCameraRail.vue');
        expect(ruleOf(rail, '.camera-rail')).toMatch(/padding:\s*[^;]*var\(--splat-rail-padding\)/);
        expect(rail).toMatch(/\$size:\s*var\(--splat-rail-button\)/);
    });

    it('put the panel about the splat beside the rail, not over it, and inside a phone screen', () => {
        const panel = ruleOf(read('SplatInfoPanel.vue'), '.info-panel');
        expect(panel).toMatch(/left:\s*calc\(var\(--splat-rail-width\) \+ [^;]+\)/);
        expect(panel).toMatch(/width:\s*min\(24rem, calc\(100% - var\(--splat-rail-width\)[^;]*\)\)/);
    });
});
