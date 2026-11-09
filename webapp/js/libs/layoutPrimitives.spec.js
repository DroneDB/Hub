/**
 * The CSS of the layout primitives (FR-XC-20, D-026) read from css/app.scss: one stacked-card renderer
 * below `sm` and one Select-overlay width rule. A browser measures the result (the Playwright pass of
 * AC-031); here the rules are pinned to the breakpoints of responsiveColumns.js and to what no page may do.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { BREAKPOINT_PX, STACKED_TABLE_CLASS } from './responsiveColumns';

const root = path.resolve(__dirname, '../..');
const scss = fs.readFileSync(path.join(root, 'css/app.scss'), 'utf8');

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

describe('stacked cards', () => {
    const phone = `${BREAKPOINT_PX.sm - 0.02}px`;
    const start = scss.indexOf(`@media only screen and (max-width: ${phone}) {\n    #{$stacked-table}`);
    const phoneBlock = start >= 0 ? blockAt(scss, start) : '';

    it('stack below sm, the width responsiveColumns.js calls a phone', () => {
        expect(start).toBeGreaterThan(0);
        expect(phone).toBe('575.98px');
    });

    it('apply to a plain table and a DataTable that carry the one class', () => {
        expect(STACKED_TABLE_CLASS).toBe('stacked-table');
        expect(scss).toContain("$stacked-table: '.ui.table.stacked-table, .stacked-table.p-datatable .p-datatable-table';");
    });

    it('make a row a card, a cell a labelled line, and hide the header without removing it', () => {
        expect(phoneBlock).toMatch(/tbody > tr \{[^}]*display: flex;[^}]*flex-direction: column;/);
        expect(phoneBlock).toMatch(/tbody > tr > td\[data-label\] \{[\s\S]*content: attr\(data-label\);/);
        expect(phoneBlock).toMatch(/thead \{[^}]*clip: rect\(0, 0, 0, 0\);/);
        expect(phoneBlock).not.toMatch(/thead \{[^}]*display: none/);
        // A Column's own width does not shrink a line of the card
        expect(phoneBlock).toMatch(/width: auto !important;/);
    });

    it('hide a column that joins the table at md, lg, xl or xxl only between sm and that width', () => {
        for (const [name, px] of Object.entries({ md: 768, lg: 992, xl: 1200, xxl: 1400 })) {
            expect(px).toBe(BREAKPOINT_PX[name]);
        }
        expect(scss).toContain('@each $name, $px in (md: 768px, lg: 992px, xl: 1200px, xxl: 1400px)');
        expect(scss).toContain('@media only screen and (min-width: 576px) and (max-width: #{$px - 0.02px}) {\n        .stack-col-#{$name} { display: none; }');
    });

    it('give an actions cell its content width and keep its buttons on one line', () => {
        expect(scss).toMatch(/\.ui\.table td\.cell-actions \{\s*width: 1%;\s*white-space: nowrap;/);
        expect(scss).toMatch(/\.ui\.table td\.cell-slug \{\s*overflow-wrap: normal;\s*word-break: normal;/);
    });
});

describe('the Select overlay width rule', () => {
    const at = scss.indexOf('.p-select-overlay {');
    const rule = at >= 0 ? blockAt(scss, at) : '';

    it('caps every Select list at the viewport and wraps its options', () => {
        expect(at).toBeGreaterThan(0);
        expect(rule).toContain('max-width: calc(100vw - 1rem);');
        expect(rule).toMatch(/\.p-select-option \{\s*white-space: normal;\s*overflow-wrap: anywhere;/);
    });

    it('is the only rule: no Select sets the width of its own list', () => {
        const offenders = [];
        const walk = dir => {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const file = path.join(dir, entry.name);
                if (entry.isDirectory()) walk(file);
                else if (/\.vue$/.test(entry.name)) {
                    const text = fs.readFileSync(file, 'utf8');
                    if (/overlay-?style|panel-?style|\.p-select-overlay|overlayClass|panelClass/i.test(text)) offenders.push(path.relative(root, file));
                }
            }
        };
        walk(path.join(root, 'js'));
        expect(offenders).toEqual([]);
    });
});
