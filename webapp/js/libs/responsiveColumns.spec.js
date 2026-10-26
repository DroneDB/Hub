import { describe, it, expect } from 'vitest';
import { showFrom, columnFrom } from './responsiveColumns';

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
