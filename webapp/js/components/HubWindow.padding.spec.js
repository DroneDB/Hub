/**
 * The sticky footer of a window (FR-UPL-08, FR-XC-20) takes the space under the content with a negative margin of
 * --window-pad: the content's padding must be that same --window-pad, on a desktop as on a phone, else a window that
 * fits overflows by the difference. css/app.scss is compiled (sass, as webpack does) and read by jsdom.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import * as sass from 'sass';

const cssDir = path.resolve(__dirname, '../../css');
let css;
let style;

beforeAll(() => {
    css = sass.compile(path.join(cssDir, 'app.scss'), { loadPaths: [cssDir], silenceDeprecations: ['import'], logger: sass.Logger.silent }).css;
    style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
});
afterAll(() => style.remove());

/** The declarations of `selector` in the rules of `rules` (the top level, or a media rule's) */
function declarations(rules, selector) {
    return [...rules].filter(r => r.selectorText === selector).map(r => r.style);
}

describe('the content padding of a window', () => {
    it('comes from --window-pad (1.5rem) on a desktop, as the footer\'s negative margin does', () => {
        const dialog = document.createElement('div');
        dialog.className = 'p-dialog window-dialog';
        document.body.appendChild(dialog);

        const computed = getComputedStyle(dialog);
        expect(computed.getPropertyValue('--window-pad').trim()).toBe('1.5rem');
        // the padding PrimeVue gives .p-dialog-content (var(--p-dialog-content-padding)), resolved on the window
        expect(computed.getPropertyValue('--p-dialog-content-padding').trim()).toBe('0 1.5rem 1.5rem 1.5rem');
        // the footer's rule (its calc() of a variable, which jsdom does not parse, read from the compiled text)
        const footerRule = css.slice(css.indexOf('.p-dialog.window-dialog .window-footer {'));
        expect(footerRule.slice(0, footerRule.indexOf('}'))).toMatch(/margin-bottom: calc\(-1 \* var\(--window-pad\)\);[\s\S]*padding-bottom: var\(--window-pad\);/);
        dialog.remove();
    });

    it('follows --window-pad (1rem) on a phone, with no padding of its own there', () => {
        const phone = [...style.sheet.cssRules].find(r => r.media && r.media.mediaText.includes('max-width: 575.98px')
            && declarations(r.cssRules, '.p-dialog.window-dialog').length);
        const rules = declarations(phone.cssRules, '.p-dialog.window-dialog');
        expect(rules.map(r => r.getPropertyValue('--window-pad').trim()).filter(Boolean)).toEqual(['1rem']);
        expect(rules.map(r => r.getPropertyValue('--p-dialog-content-padding')).filter(Boolean)).toEqual([]);
    });

    it('is also the offset the footer sticks at, so the footer never covers the end of the content', () => {
        // A sticky box sticks inside the scroll container's padding: with bottom: 0 the footer stood --window-pad
        // above the bottom edge, over the last row of a window that fits (the Verify button of Import, which could
        // not be scrolled out from under it). bottom: -<padding> puts it on the edge, after the content.
        const footerRule = css.slice(css.indexOf('.p-dialog.window-dialog .window-footer {'));
        const body = footerRule.slice(0, footerRule.indexOf('}'));
        expect(body).toMatch(/position: sticky;/);
        expect(body).toMatch(/bottom: calc\(-1 \* var\(--window-pad\)\);/);
        expect(body).not.toMatch(/bottom: 0;/);
    });

    it('is set once, in the stylesheet of the windows (not by a theme override)', () => {
        expect(css.match(/--p-dialog-content-padding:/g)).toHaveLength(1);
        expect(css).toContain('--p-dialog-content-padding: 0 var(--window-pad) var(--window-pad) var(--window-pad);');
        expect(fs.readFileSync(path.resolve(__dirname, '../theme.js'), 'utf8')).not.toMatch(/dialog:\s*\{[^}]*content/);
    });
});
