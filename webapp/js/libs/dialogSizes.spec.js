/**
 * The size classes of the windows (FR-XC-20, FR-XC-33) read from css/app.scss and css/_variables.scss: a class gives a
 * stable width, min(<class width>, 100vw - 2rem), not only a maximum, so a dialog keeps its width while its content
 * changes (FR-ORG-19, FR-SHR-06, FR-UPL-08). dialog-xl and dialog-wide read the width tokens of FR-XC-33. A browser
 * measures the result (the Playwright pass of AC-031).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../..');
const scss = fs.readFileSync(path.join(root, 'css/app.scss'), 'utf8');
const variables = fs.readFileSync(path.join(root, 'css/_variables.scss'), 'utf8');

/** The text of the block that starts at `start` (up to its matching brace) */
function blockAt(text, start) {
    const open = text.indexOf('{', start);
    let depth = 0;
    for (let i = open; i < text.length; i++) {
        if (text[i] === '{') depth++;
        if (text[i] === '}' && --depth === 0) return text.slice(open + 1, i);
    }
    throw new Error('unbalanced');
}

describe('the dialog width tokens (FR-XC-33)', () => {
    it('--ddb-dialog-form-max is 47rem and --ddb-dialog-wide-max is 120rem, once, in :root', () => {
        expect(variables.match(/--ddb-dialog-form-max: 47rem;/g)).toHaveLength(1);
        expect(variables.match(/--ddb-dialog-wide-max: 120rem;/g)).toHaveLength(1);
        // not in the dark theme block: a width is not a colour
        const dark = variables.slice(variables.lastIndexOf(':root.app-dark'));
        expect(dark).not.toContain('--ddb-dialog');
    });
});

describe('the size classes', () => {
    const classes = {
        'dialog-xs': '17.5rem',
        'dialog-sm': '25rem',
        'dialog-md': '31.25rem',
        'dialog-lg': '37.5rem',
        'dialog-xl': 'var(--ddb-dialog-form-max)',
        'dialog-wide': 'var(--ddb-dialog-wide-max)'
    };

    it('each one gives a width, not only a maximum: min(<class width>, 100vw - 2rem)', () => {
        for (const [name, width] of Object.entries(classes)) {
            const at = scss.indexOf(`.${name}`);
            expect(at, name).toBeGreaterThan(0);
            expect(scss.slice(at, scss.indexOf('\n', at)), name).toContain(`@include dialog-width(${width})`);
        }
        const mixin = blockAt(scss, scss.indexOf('@mixin dialog-width'));
        expect(mixin).toContain('--window-width: min(#{$width}, calc(100vw - #{$window-margin-wide}));');
        expect(mixin).toContain('--window-max-width: #{$width};');
        expect(scss).toContain('$window-margin-wide: 2rem;');
    });

    it('the window takes that width (not auto) from --window-width', () => {
        const rule = blockAt(scss, scss.indexOf('.p-dialog.window-dialog {'));
        expect(rule).toContain('width: var(--window-width, auto);');
    });

    it('a phone gets the whole screen less the margin, whatever the class', () => {
        const phone = scss.slice(scss.indexOf('@media only screen and (max-width: 575.98px) {\n    .p-dialog.window-dialog'));
        expect(phone.slice(0, 600)).toContain('--window-width: calc(100vw - #{$window-margin});');
    });
});

describe('the footer of a window', () => {
    it('sticks to the bottom of the scrolling content, so the buttons stay in view (FR-UPL-08)', () => {
        const rule = blockAt(scss, scss.indexOf('.window-footer {'));
        // at the edge of the scrolling content: a sticky box sticks inside the padding, so bottom: 0 held it over the last row
        expect(rule).toMatch(/position: sticky;\s*bottom: calc\(-1 \* var\(--window-pad\)\);/);
        // it takes the space of the content's bottom padding: the buttons do not move at the end of the content
        expect(rule).toContain('margin-bottom: calc(-1 * var(--window-pad));');
        expect(rule).toContain('padding-bottom: var(--window-pad);');
    });
});
