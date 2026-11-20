/**
 * The selected tile (FR-EXP-10): a primary tint, a 2px primary outline and a check badge, not a
 * grey that is almost the hover grey. The layout is CSS and the tests have no layout engine, so
 * the rules are read from the component's source; the contrast of the outline against the page,
 * the hover grey and the tint is in specs/colorTokens.spec.js.
 */
import { describe, it, expect } from 'vitest';
import { readSource, ruleOf } from '@/specs/cssSource';

const source = readSource(__dirname, 'EntryThumbnail.vue');
const tableSource = readSource(__dirname, 'TableView.vue');

describe('a selected tile', () => {
    it('has the selected tint and a 2px primary outline, not the grey of the hover', () => {
        const rule = ruleOf(source, '.thumbnail.selected');
        expect(rule).toContain('background: var(--ddb-selected-bg);');
        expect(rule).toContain('outline: 2px solid var(--ddb-primary);');
        expect(rule).not.toContain('--ddb-border');
        expect(ruleOf(source, '.thumbnail:hover')).toContain('background: var(--ddb-bg-hover);');
    });

    it('keeps its tint under the pointer: its rule comes after the hover rule', () => {
        expect(source.indexOf('.thumbnail.selected {')).toBeGreaterThan(source.indexOf('.thumbnail:hover {'));
    });

    it('has a check badge on the primary fill', () => {
        const rule = ruleOf(source, '.thumbnail .selected-badge');
        expect(rule).toContain('background: var(--ddb-primary);');
        expect(rule).toContain('color: var(--ddb-text-on-color);');
    });
});

describe('a selected row of the table', () => {
    it('has the selected tint and a bar of the primary colour on its left edge', () => {
        expect(ruleOf(tableSource, 'tr.row-selected')).toContain('background-color: var(--ddb-selected-bg) !important;');
        expect(ruleOf(tableSource, 'tr.row-selected > td:first-child')).toContain('inset 0.25rem 0 0 var(--ddb-primary)');
    });
});
