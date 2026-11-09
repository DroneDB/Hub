import { describe, it, expect } from 'vitest';
import { showFrom, columnFrom, stackedFrom, stackedCell, stackedColumn, STACK_BELOW, STACKED_TABLE_CLASS, STACKED_MEDIA_QUERY, sortableHeaderPt, BREAKPOINT_PX, breakAfterHyphens } from './responsiveColumns';

describe('responsiveColumns', () => {
    it('hides a cell below the breakpoint and shows it as a table cell from it up', () => {
        expect(showFrom('sm')).toBe('d-none d-sm-table-cell');
        expect(showFrom('md')).toBe('d-none d-md-table-cell');
        expect(showFrom('lg')).toBe('d-none d-lg-table-cell');
        expect(showFrom('xl')).toBe('d-none d-xl-table-cell');
        expect(showFrom('xxl')).toBe('d-none d-xxl-table-cell');
    });

    it('gives a Column the same classes for its header and its body', () => {
        expect(columnFrom('lg')).toEqual({ headerClass: 'd-none d-lg-table-cell', bodyClass: 'd-none d-lg-table-cell' });
    });

    it('refuses a breakpoint Bootstrap does not have, which would hide the column on every screen', () => {
        expect(() => showFrom(/** @type {any} */ ('xs'))).toThrow('Unknown breakpoint: xs');
        expect(() => columnFrom(/** @type {any} */ ('medium'))).toThrow('Unknown breakpoint: medium');
    });
});

describe('responsiveColumns: stacked cards (D-026)', () => {
    it('has the media query of the card renderer, below 576 px', () => {
        expect(STACKED_MEDIA_QUERY).toBe('(max-width: 575.98px)');
    });

    it('takes a sortable header out of the tab order only while the table is cards', () => {
        expect(sortableHeaderPt(true)).toEqual({ headerCell: { tabindex: '-1' } });
        expect(sortableHeaderPt(false)).toEqual({});
    });

    it('stacks below sm, the 576 px of the phone layout', () => {
        expect(STACK_BELOW).toBe('sm');
        expect(BREAKPOINT_PX[STACK_BELOW]).toBe(576);
        expect(STACKED_TABLE_CLASS).toBe('stacked-table');
    });

    it('keeps a cell on every phone card and joins it to the table at its breakpoint', () => {
        expect(stackedFrom()).toBe('stack-col');
        expect(stackedFrom('sm')).toBe('stack-col');
        expect(stackedFrom('md')).toBe('stack-col stack-col-md');
        expect(stackedFrom('xxl')).toBe('stack-col stack-col-xxl');
        expect(() => stackedFrom(/** @type {any} */ ('xs'))).toThrow('Unknown breakpoint: xs');
    });

    it('labels a cell for the card, or leaves it unlabelled', () => {
        expect(stackedCell('Email', 'lg')).toEqual({ class: 'stack-col stack-col-lg', 'data-label': 'Email' });
        expect(stackedCell(undefined)).toEqual({ class: 'stack-col' });
    });

    it('gives a Column its classes and the label of its body cell', () => {
        expect(stackedColumn('Email', 'lg')).toEqual({
            headerClass: 'stack-col stack-col-lg', bodyClass: 'stack-col stack-col-lg', pt: { bodyCell: { 'data-label': 'Email' } }
        });
        expect(stackedColumn(undefined, undefined, { style: 'text-align: center' }).pt.bodyCell).toEqual({ style: 'text-align: center' });
    });

    it('breaks a slug after its hyphens, never inside a word (FR-ADM-11)', () => {
        expect(breakAfterHyphens('my-org-x')).toEqual(['my-', 'org-', 'x']);
        expect(breakAfterHyphens('long-organization-name--2')).toEqual(['long-', 'organization-', 'name--', '2']);
        expect(breakAfterHyphens('acme')).toEqual(['acme']);
        expect(breakAfterHyphens('')).toEqual([]);
    });
});
