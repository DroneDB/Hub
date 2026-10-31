/**
 * The units of a pile of material and the amounts of money: metric values shown in the user's
 * units, and back without drift.
 */
import { describe, it, expect } from 'vitest';
import { bulkUnits, countOf, currencyChoices, formatMoney, normalizeCurrency, pluralize } from './format';

describe('bulkUnits', () => {
    it('is the metric units as they are', () => {
        const { volume, weight, density, perWeight } = bulkUnits('metric');
        expect([volume, weight, density, perWeight].map(u => [u.factor, u.unit]))
            .toEqual([[1, 'm³'], [1, 't'], [1, 't/m³'], [1, 't']]);
    });

    it('converts to cubic yards and short tons for imperial (and any other units)', () => {
        const units = bulkUnits('imperial');
        expect(bulkUnits('something else')).toBe(units);
        expect(100 * units.volume.factor).toBeCloseTo(130.795, 3);
        expect(100 * units.weight.factor).toBeCloseTo(110.231, 3);
        // 1.68 t/m³ of gravel is about 1.416 short tons per cubic yard
        expect(1.68 * units.density.factor).toBeCloseTo(1.4159, 4);
        // 15 per tonne is about 13.61 per short ton
        expect(15 * units.perWeight.factor).toBeCloseTo(13.6078, 4);
        expect([units.volume.unit, units.weight.unit, units.density.unit, units.perWeight.unit]).toEqual(['yd³', 'ST', 'ST/yd³', 'ST']);
    });

    it('a weight from a converted density and volume is the converted weight', () => {
        const { volume, weight, density } = bulkUnits('imperial');
        const tons = 250 * 1.68;
        expect((250 * volume.factor) * (1.68 * density.factor)).toBeCloseTo(tons * weight.factor, 9);
    });
});

describe('formatMoney', () => {
    // As the locale of the browser writes it: "$10.00" in en-US, "10,00 USD" in it-IT
    it('writes the amount in the currency, with its decimals', () => {
        expect(formatMoney(1234.5, 'EUR')).toMatch(/1.?234[.,]50/);
        expect(formatMoney(1234.5, 'EUR')).toMatch(/€/);
        expect(formatMoney(10, 'USD')).toMatch(/\$|USD/);
        expect(formatMoney(10, 'JPY')).not.toMatch(/[.,]00/);
    });

    it('writes an unknown code after the number instead of failing', () => {
        expect(formatMoney(12.345, 'X1')).toBe(`${(12.35).toLocaleString()} X1`);
    });
});

describe('normalizeCurrency', () => {
    it('keeps a currency code, upper-cased, and falls back to USD for anything else', () => {
        expect(normalizeCurrency('eur')).toBe('EUR');
        expect(normalizeCurrency(' GBP ')).toBe('GBP');
        for (const bad of ['EURO', 'E1R', '', null, 7, undefined]) expect(normalizeCurrency(bad)).toBe('USD');
    });
});

describe('currencyChoices', () => {
    it('offers the common currencies first, every code once, with its name', () => {
        const choices = currencyChoices();
        expect(choices.slice(0, 3).map(c => c.value)).toEqual(['USD', 'EUR', 'GBP']);
        expect(new Set(choices.map(c => c.value)).size).toBe(choices.length);
        expect(choices.find(c => c.value === 'EUR').label).toMatch(/^EUR - /);
    });
});

describe('pluralize and countOf', () => {
    it('use the singular for one only', () => {
        expect([0, 1, 2].map(n => countOf(n, 'file'))).toEqual(['0 files', '1 file', '2 files']);
        expect([1, 2].map(n => pluralize(n, 'has', 'have'))).toEqual(['has', 'have']);
    });
});
