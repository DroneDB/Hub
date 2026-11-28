/**
 * The colours a measurements file may carry: a hexadecimal colour or a plain rgb()/rgba(); anything else is style text.
 */
import { describe, it, expect } from 'vitest';
import { isSafeColour, safeColour } from './measurementColour';

describe('safeColour', () => {
    it.each(['#fff', '#FFAA00', '#ffaa0080', '  #0af ', 'rgb(1, 2, 3)', 'rgba(255, 152, 0, 0.20)', 'rgba(10,20,30,.5)', 'rgba(10, 20, 30, 50%)'])('accepts %s', value => {
        expect(isSafeColour(value)).toBe(true);
        expect(safeColour(value, 'fallback')).toBe(value.trim());
    });

    it.each([
        'red;position:fixed;inset:0',
        'red',
        '#ff',
        '#gggggg',
        'url(https://evil/x)',
        'rgb(1, 2, 3); background: red',
        'rgba(1, 2, 3, 0.5) url(x)',
        'expression(alert(1))',
        '#fff"><img src=x onerror=alert(1)>',
        '',
        null,
        undefined,
        5
    ])('refuses %s and gives the fallback', value => {
        expect(isSafeColour(value)).toBe(false);
        expect(safeColour(value, 'fallback')).toBe('fallback');
    });

    it('gives undefined without a fallback', () => {
        expect(safeColour('red;x')).toBeUndefined();
    });
});
