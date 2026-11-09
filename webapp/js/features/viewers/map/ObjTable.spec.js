/**
 * ObjTable writes numbers and dates with the one formatter (libs/format.js, FR-XC-08): the
 * browser's locale, at most 3 decimals; the capture time as every date (FR-EXP-26).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import ObjTable from './ObjTable.vue';
import { formatDateTime } from '@/libs/format';

afterEach(() => {
    delete navigator.language;
});

describe('ObjTable', () => {
    it('writes a number in the browser locale', () => {
        Object.defineProperty(navigator, 'language', { value: 'it-IT', configurable: true });
        expect(mount(ObjTable, { props: { obj: { focal: 1234.5678 } } }).find('tbody td:last-child').text()).toBe('1.234,568');
    });

    it('writes the capture time as every date, and "Unknown" for 0', () => {
        const ms = new Date(2016, 5, 23, 23, 32, 13).getTime();
        expect(mount(ObjTable, { props: { obj: { captureTime: ms } } }).find('tbody td:last-child').text())
            .toBe(formatDateTime(ms, { seconds: true }));
        expect(mount(ObjTable, { props: { obj: { captureTime: 0 } } }).find('tbody td:last-child').text()).toBe('Unknown');
    });
});
