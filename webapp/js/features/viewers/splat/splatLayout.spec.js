import { describe, it, expect } from 'vitest';
import { readSource, ruleOf, mediaBlock } from '@/specs/cssSource';

// The rules that keep the overlays apart
const read = file => readSource(__dirname, file);

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

describe('the movement pad and the bottom bar of the splat viewer on a phone (FR-VWR-14)', () => {
    const pad = read('SplatNavPad.vue');

    it('size the bar of buttons from one variable of the viewer', () => {
        const scss = read('Splat.scss');
        expect(ruleOf(scss, '#splat')).toMatch(/--splat-bar-height:\s*2\.25rem/);
        expect(scss).toMatch(/\$size:\s*var\(--splat-bar-height\)/);
    });

    it('lifts the pad above the bar below sm, by the height of the bar and the spacing tokens', () => {
        const phone = mediaBlock(pad, 'max-width: 575.98px');
        expect(ruleOf(phone, '.nav-controls')).toMatch(/bottom:\s*calc\(var\(--splat-bar-height\) \+ 2 \* var\(--ddb-spacing-md\)\)/);
    });

    it('leaves the pad at the corner, as it was, from sm up', () => {
        expect(ruleOf(pad.replace(mediaBlock(pad, 'max-width: 575.98px'), ''), '.nav-controls')).toMatch(/bottom:\s*var\(--ddb-spacing-md\)/);
    });
});
