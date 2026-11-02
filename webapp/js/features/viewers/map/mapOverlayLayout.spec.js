import { describe, it, expect } from 'vitest';
import { readSource, ruleOf, mediaBlock } from '@/specs/cssSource';

// The panels over the map must keep out of the toolbar rail on the right, and on a phone the
// analysis panels are sheets inside the map that fold; the layout is CSS, so the rules are read
const css = readSource(__dirname, '../../../../css/ol-controls.css');
const scss = readSource(__dirname, '../../../../css/_analysis-panel.scss');
const PHONE = 'max-width: 767.98px';

describe('the panels over the bottom of the map', () => {
    it('define the width of the toolbar rail once, on the map', () => {
        expect(css.match(/--map-rail-reserve:/g)).toHaveLength(1);
        expect(ruleOf(css, '.map-container')).toMatch(/--map-rail-reserve:\s*4rem/);
        expect(scss).not.toMatch(/--map-rail-reserve:/);
    });

    it('define the height of the bottom-left controls once, on the map', () => {
        expect(css.match(/--map-bottom-reserve:/g)).toHaveLength(1);
        expect(ruleOf(css, '.map-container')).toMatch(/--map-bottom-reserve:\s*4rem/);
        expect(scss).not.toMatch(/--map-bottom-reserve:/);
    });

    it('keep the bottom panel and the sheet, open or folded, above the map settings button on a phone', () => {
        const phone = mediaBlock(scss, PHONE);
        expect(ruleOf(mediaBlock(css, 'max-width: 575.98px'), '.map-bottom-panel')).toMatch(/bottom:\s*var\(--map-bottom-reserve\)/);
        expect(ruleOf(phone, '.analysis-panel')).toMatch(/bottom:\s*var\(--map-bottom-reserve\)/);
        expect(ruleOf(phone, '.map-container:has(> .analysis-panel.is-minimised) > .map-bottom-panel'))
            .toMatch(/bottom:\s*calc\(var\(--map-bottom-reserve\) \+ var\(--map-sheet-peek\) \+ 0\.5rem\)/);
    });

    it('keep the bottom panel out of the rail at any width', () => {
        expect(ruleOf(css, '.map-bottom-panel')).toMatch(/max-width:\s*calc\(100% - 2 \* var\(--map-rail-reserve\)\)/);
    });

    it('stretch the bottom panel from the left edge to the rail on a phone, not centred', () => {
        const panel = ruleOf(mediaBlock(css, 'max-width: 575.98px'), '.map-bottom-panel');
        expect(panel).toMatch(/left:\s*0\.5rem/);
        expect(panel).toMatch(/right:\s*var\(--map-rail-reserve\)/);
        expect(panel).toMatch(/transform:\s*none/);
        expect(panel).toMatch(/width:\s*auto/);
        expect(panel).toMatch(/max-width:\s*none/);
    });

    it('turn the analysis panels into sheets inside the map at the phone breakpoint of the Hub', () => {
        expect(scss).not.toMatch(/max-width:\s*768px/);
        const sheet = ruleOf(mediaBlock(scss, PHONE), '.analysis-panel');
        expect(sheet).toMatch(/position:\s*absolute/);
        expect(sheet).not.toMatch(/position:\s*fixed/);
        expect(sheet).toMatch(/right:\s*var\(--map-rail-reserve\)/);
        expect(sheet).toMatch(/max-height:\s*50%/);
        expect(sheet).toMatch(/background:\s*var\(--panel-bg-solid\)/);
    });

    it('paint the sheet opaque', () => {
        const token = scss.match(/--panel-bg-solid:\s*([^;]+);/);
        expect(token).not.toBeNull();
        expect(token[1]).not.toMatch(/rgba|hsla|\/|transparent/);
    });

    it('fold the sheet to its header and show the fold button only on a phone', () => {
        const phone = mediaBlock(scss, PHONE);
        expect(ruleOf(phone, '&.is-minimised')).toMatch(/max-height:\s*var\(--map-sheet-peek\)/);
        expect(phone).toMatch(/> :not\(\.panel-header\)\s*\{\s*display:\s*none/);
        expect(phone).toMatch(/\.sheet-toggle\s*\{[^}]*display:\s*inline-flex/);
        expect(scss.replace(phone, '')).toMatch(/\.sheet-toggle\s*\{\s*display:\s*none/);
    });

    it('hide the layer panel behind an open sheet and lift it above a folded one', () => {
        const phone = mediaBlock(scss, PHONE);
        expect(ruleOf(phone, '.map-container:has(> .analysis-panel:not(.is-minimised)) > .map-bottom-panel'))
            .toMatch(/display:\s*none/);
        expect(ruleOf(phone, '.map-container:has(> .analysis-panel.is-minimised) > .map-bottom-panel'))
            .toMatch(/bottom:\s*calc\(.*var\(--map-sheet-peek\)/);
    });
});
