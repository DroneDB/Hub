/**
 * The one formatter: numbers in the browser's locale with one precision table, typed
 * numbers read by the decimal sign rule, sizes, dates (UNKNOWN when not known), and the units of a pile
 * of material and the amounts of money: metric values shown in the user's units, and back without drift.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
    bulkUnits, stockpileLabel, distinctLabels, middleEllipsis, countOf, currencyChoices, formatMoney, normalizeCurrency, pluralize,
    formatNumber, formatNumberList, formatInputNumber, joinNumberTexts, decimalSeparator, localiseNumberText, parseNumber, formatBytes, formatDateTime, formatTime, formatTimeAgo, utcClockToLocal,
    lengthParts, areaParts, fixedLengthParts, formatVolume, formatWeight, formatDensity, formatSpeed,
    PRECISION, UNKNOWN, EMPTY_CELL, displayLocale, latLonText, latLonDmsText, parseLatLon
} from './format';
import { bytesToSize, formatTimeAgo as utilsTimeAgo } from './utils';
import { formatModifiedDate } from './propertiesUtils';

/** Sets navigator.language for the test (afterEach puts the default back) */
function inLocale(locale) {
    Object.defineProperty(navigator, 'language', { value: locale, configurable: true });
}
afterEach(() => {
    delete navigator.language;
});

describe('formatNumber', () => {
    it('writes the decimal sign and the group separator of the browser locale', () => {
        inLocale('it-IT');
        expect(displayLocale()).toBe('it-IT');
        expect(formatNumber(127445, 'count')).toBe('127.445');
        expect(formatNumber(59090002.25, 2)).toBe('59.090.002,25');
        inLocale('en-US');
        expect(formatNumber(127445, 'count')).toBe('127,445');
        expect(formatNumber(59090002.25, 2)).toBe('59,090,002.25');
    });

    it('keeps the decimals, or drops trailing zeros with trim, or rounds to significant digits', () => {
        inLocale('en-US');
        expect(formatNumber(1.5, 3)).toBe('1.500');
        expect(formatNumber(1.5, 3, { trim: true })).toBe('1.5');
        expect(formatNumber(0.012345, 0, { significant: 3 })).toBe('0.0123');
        expect(formatNumber(-0.0001, 2)).toBe('0.00');
    });

    it('takes the decimals of a quantity from the one precision table', () => {
        inLocale('en-US');
        expect(PRECISION).toMatchObject({ count: 0, length: 2, longLength: 3, temperature: 1, density: 3 });
        expect(formatNumber(1234.5678, 'count')).toBe('1,235');
        expect(formatNumber(29.14, 'temperature')).toBe('29.1');
    });

    it('shows an en dash for no number and passes other values through as text', () => {
        expect(EMPTY_CELL).toBe('\u2013');
        for (const empty of [null, undefined, '', NaN, Infinity]) expect(formatNumber(empty)).toBe('\u2013');
        expect(formatNumber(null, 2, { placeholder: UNKNOWN })).toBe('Unknown');
        expect(formatNumber('n/d')).toBe('n/d');
    });

    it('writes a list of numbers with "; " where the decimal sign is a comma', () => {
        inLocale('en-US');
        expect(formatNumberList([45.5, 9.25], 2)).toBe('45.50, 9.25');
        inLocale('it-IT');
        expect(formatNumberList([45.5, 9.25], 2)).toBe('45,50; 9,25');
        expect(joinNumberTexts(['9,1234', '45,678'])).toBe('9,1234; 45,678');
        expect(formatNumber(1234567.5, 1, { grouping: false })).toBe('1234567,5');
    });
});

describe('parseNumber', () => {
    it('reads a lone "." or "," as the decimal sign in every locale', () => {
        for (const locale of ['en-US', 'it-IT']) {
            inLocale(locale);
            expect(parseNumber('12.5')).toBe(12.5);
            expect(parseNumber('12,5')).toBe(12.5);
            expect(parseNumber(' 12 ')).toBe(12);
            expect(parseNumber('-0,25')).toBe(-0.25);
            expect(parseNumber('+3')).toBe(3);
            expect(parseNumber(',5')).toBe(0.5);
        }
    });

    it('reads grouped numbers with the browser locale first, then the other convention', () => {
        inLocale('it-IT');
        expect(parseNumber('1.234,5')).toBe(1234.5);
        expect(parseNumber('1.234.567')).toBe(1234567);
        expect(parseNumber('1,234.5')).toBe(1234.5);
        expect(parseNumber('1 234,5')).toBe(1234.5);
        inLocale('en-US');
        expect(parseNumber('1,234.5')).toBe(1234.5);
        expect(parseNumber('1,234,567')).toBe(1234567);
        expect(parseNumber('1.234,5')).toBe(1234.5);
    });

    it('is NaN for text that is not a number', () => {
        inLocale('en-US');
        for (const bad of ['', ' ', 'abc', '12a', '1.2.3', '1,2,3', '.', '-', '1,2345.6', '12..5', null, undefined, {}]) {
            expect(parseNumber(bad)).toBeNaN();
        }
        expect(parseNumber(7)).toBe(7);
    });

    it('reads the Indian grouping and the apostrophes of de-CH', () => {
        inLocale('en-IN');
        expect(parseNumber('12,34,567.5')).toBe(1234567.5);
        expect(parseNumber('1,23,45,67,890.25')).toBe(1234567890.25);
        inLocale('de-CH');
        expect(parseNumber('1\u2019234.5')).toBe(1234.5);
        expect(parseNumber("1'234'567.5")).toBe(1234567.5);
        expect(parseNumber('12,5')).toBe(12.5);
    });

    const LOCALES = ['en-US', 'it-IT', 'de-DE', 'de-CH', 'fr-FR', 'en-IN'];

    it('reads back what formatNumber writes, in every locale (with decimals or two group separators)', () => {
        for (const locale of LOCALES) {
            inLocale(locale);
            for (const x of [59090002.25, 1234567.5, 1234.5, -98765.43, 0.5, 12.5]) {
                expect(parseNumber(formatNumber(x, 2, { trim: true })), `${locale} ${x}`).toBe(x);
            }
        }
    });

    it('reads back what formatInputNumber writes for a field, in every locale', () => {
        for (const locale of LOCALES) {
            inLocale(locale);
            for (const x of [1234, 1234.5, 59090002.25, -0.125, 7]) {
                expect(parseNumber(formatInputNumber(x)), `${locale} ${x}`).toBe(x);
            }
        }
        inLocale('it-IT');
        expect(formatInputNumber(1234.5)).toBe('1234,5');
        inLocale('en-US');
        expect(formatInputNumber(1234.5)).toBe('1234.5');
        expect(formatInputNumber(null)).toBe('');
    });

    // Arabic, Persian and Hebrew write a direction mark before the sign, and Persian the minus sign U+2212: an NDVI
    // minimum of -0.2 in a field read back as no number
    it('writes a negative number for a field as the user types it, and reads it back, in right-to-left locales', () => {
        for (const locale of ['ar-EG', 'fa-IR', 'he-IL', 'de-DE', 'fr-FR']) {
            inLocale(locale);
            for (const x of [-0.2, -1234.5, -7, 0.2]) {
                const text = formatInputNumber(x);
                expect(text, `${locale} ${x}`).toMatch(/^-?[\d.,]+$/);
                expect(parseNumber(text), `${locale} ${x}`).toBe(x);
            }
        }
        inLocale('en-US');
    });

    it('reads a number with the direction marks a right-to-left text puts around it', () => {
        expect(parseNumber('\u200E-0.2')).toBe(-0.2);
        expect(parseNumber('\u200F\u22120,5')).toBe(-0.5);
        expect(parseNumber('\u061C-3')).toBe(-3);
        expect(parseNumber('\u2066-3\u2069')).toBe(-3);
    });
});

describe('localiseNumberText', () => {
    const SAMPLES = ['-0.5', '194.66', '5', '1e-7', '1.5e-7', '1e+21', '0.123456789012345678', '0', '-1234567.25'];

    it('writes the decimal sign of the browser locale, with no grouping', () => {
        inLocale('it-IT');
        expect(decimalSeparator()).toBe(',');
        expect(localiseNumberText('194.66')).toBe('194,66');
        expect(localiseNumberText('-1234567.25')).toBe('-1234567,25');
        inLocale('en-US');
        expect(decimalSeparator()).toBe('.');
        expect(localiseNumberText('194.66')).toBe('194.66');
    });

    it('is read back by parseNumber as the same number, in every locale', () => {
        for (const locale of ['en-US', 'it-IT', 'de-DE', 'de-CH', 'fr-FR', 'en-IN']) {
            inLocale(locale);
            for (const s of SAMPLES) {
                expect(parseNumber(localiseNumberText(s)), `${locale} ${s}`).toBe(Number(s));
            }
        }
    });

    it('keeps every digit: no rounding, and an exponent is written out as digits', () => {
        inLocale('it-IT');
        expect(localiseNumberText('0.123456789012345678')).toBe('0,123456789012345678');
        expect(localiseNumberText('1e-7')).toBe('0,0000001');
        expect(localiseNumberText('1.5e-7')).toBe('0,00000015');
        expect(localiseNumberText('1e+21')).toBe('1000000000000000000000');
        expect(localiseNumberText('12.5e1')).toBe('125');
        expect(localiseNumberText('1.25E2')).toBe('125');
        expect(localiseNumberText('2.50')).toBe('2,50');
    });

    it('is Latin digits and "," or "." in a locale that writes its own digits and decimal sign (Arabic, Persian)', () => {
        for (const locale of ['ar-EG', 'fa-IR', 'ar-SA']) {
            inLocale(locale);
            expect(decimalSeparator(), locale).toMatch(/^[.,]$/);
            expect(localiseNumberText('194.66'), locale).toMatch(/^194[.,]66$/);
            expect(formatInputNumber(1234.5), locale).toMatch(/^1234[.,]5$/);
            for (const s of SAMPLES) {
                expect(parseNumber(localiseNumberText(s)), `${locale} ${s}`).toBe(Number(s));
            }
            expect(parseNumber(formatInputNumber(0.0000012345, 12)), locale).toBeCloseTo(0.0000012345, 12);
        }
    });

    it('returns empty and non-numeric text as it is', () => {
        inLocale('it-IT');
        for (const text of ['', 'abc', '1.2.3', '12,5', '.', '-', '1e', '1e999']) {
            expect(localiseNumberText(text), text).toBe(text);
        }
    });
});

describe('parseNumber of native digits', () => {
    it('reads the Arabic-Indic and Persian digits and decimal signs a keyboard of those locales types', () => {
        inLocale('ar-EG');
        expect(parseNumber('\u0663\u066B\u0665')).toBe(3.5);
        expect(parseNumber('\u06F1\u06F2\u066C\u06F3\u06F4\u06F5\u066B\u06F6')).toBe(12345.6);
        expect(parseNumber('-\u0661\u0662')).toBe(-12);
    });
});

describe('formatBytes', () => {
    it('writes binary sizes with at most the given decimals, in the browser locale', () => {
        inLocale('en-US');
        expect(formatBytes(0)).toBe('0 B');
        expect(formatBytes(1024)).toBe('1 KB');
        expect(formatBytes(1536000)).toBe('1.46 MB');
        expect(formatBytes(1536000, { decimals: 0 })).toBe('1 MB');
        expect(formatBytes(1024 * 1024 * 1024 * 1500)).toBe('1.46 TB');
        expect(formatBytes(null)).toBe(EMPTY_CELL);
        inLocale('it-IT');
        expect(formatBytes(1610612736)).toBe('1,5 GB');
    });

    it('is what bytesToSize returns (one definition), and utils.formatTimeAgo is this module\'s', () => {
        inLocale('it-IT');
        expect(bytesToSize(1536000, 3)).toBe(formatBytes(1536000, { decimals: 3 }));
        expect(utilsTimeAgo).toBe(formatTimeAgo);
    });
});

describe('formatDateTime', () => {
    const when = new Date(2016, 5, 23, 23, 32, 13);

    it('writes local date and time with 2-digit fields in the browser locale', () => {
        inLocale('it-IT');
        expect(formatDateTime(when, { seconds: true })).toBe('23/06/2016, 23:32:13');
        expect(formatDateTime(when.getTime())).toBe('23/06/2016, 23:32');
        inLocale('en-US');
        expect(formatDateTime(when, { seconds: true })).toBe('06/23/2016, 11:32:13 PM');
    });

    it('shows the placeholder for a date that is not known: none, not a date, or 0', () => {
        for (const missing of [null, undefined, '', 'not a date', 0, new Date(0)]) {
            expect(formatDateTime(missing, { placeholder: UNKNOWN })).toBe('Unknown');
        }
        expect(formatDateTime(null)).toBe('');
    });

    it('is how Modified is written (propertiesUtils.formatModifiedDate delegates)', () => {
        inLocale('it-IT');
        const seconds = Math.floor(when.getTime() / 1000);
        expect(formatModifiedDate(seconds)).toBe(formatDateTime(when, { seconds: true }));
        expect(formatModifiedDate(0)).toBe('Unknown');
        expect(formatModifiedDate(undefined)).toBe('Unknown');
    });
});

describe('utcClockToLocal', () => {
    it('shows a UTC time of day of a log in local time, on the latest day it is not in the future', () => {
        const now = new Date(Date.UTC(2026, 10, 9, 12, 0, 0));
        expect(utcClockToLocal('10:15:30', now)).toBe(formatTime(Date.UTC(2026, 10, 9, 10, 15, 30)));
        // Later than now: the day before
        expect(utcClockToLocal('23:59:00', now)).toBe(formatTime(Date.UTC(2026, 10, 8, 23, 59, 0)));
        expect(utcClockToLocal('not a time', now)).toBe('not a time');
        expect(utcClockToLocal('25:00:00', now)).toBe('25:00:00');
    });
});

describe('lengthParts', () => {
    it('stays in metres below 1 km with 2 decimals, then km with 3', () => {
        inLocale('en-US');
        expect(lengthParts(110.4).text).toBe('110.4 m');
        expect(lengthParts(999.994).text).toBe('999.99 m');
        // Switches on the rounded value: never "1,000 m"
        expect(lengthParts(999.996).text).toBe('1 km');
        expect(lengthParts(-999.996).text).toBe('-1 km');
        expect(lengthParts(1234.5)).toEqual({ value: 1.235, unit: 'km', text: '1.235 km' });
        expect(lengthParts(1500).text).toBe('1.5 km');
        inLocale('it-IT');
        expect(lengthParts(1234.5).text).toBe('1,235 km');
        expect(lengthParts(110.4).text).toBe('110,4 m');
    });

    it('writes every measure through the formatter, in the browser locale', () => {
        inLocale('it-IT');
        expect(areaParts(15000).text).toBe('1,5 ha');
        expect(areaParts(9999).text).toBe('9.999 m²');
        expect(fixedLengthParts(1300.456).text).toBe('1.300,46 m');
        expect(formatSpeed(10)).toBe('36,0 km/h');
        expect(countOf(1234, 'file')).toBe('1.234 files');
    });
});

describe('bulk quantities', () => {
    it('writes volumes, weights and densities in the user units with the decimals of the table', () => {
        inLocale('en-US');
        expect(formatVolume(1234.567)).toBe('1,234.57 m³');
        expect(formatVolume(100, 'imperial')).toBe('130.8 yd³');
        expect(formatWeight(2074.2)).toBe('2,074.2 t');
        expect(formatDensity(1.68, 'imperial')).toBe('1.416 ST/yd³');
        expect(formatVolume(undefined)).toBe(EMPTY_CELL);
        inLocale('it-IT');
        expect(formatVolume(59090002.25)).toBe('59.090.002,25 m³');
    });
});

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

describe('stockpileLabel', () => {
    const pile = { title: 'North pile', netVolume: 8097.19, materialName: 'Gravel', materialDensity: 1.68, unitSystem: 'metric' };
    // Worked out by hand, not with the formatter:
    //   8097.19 m³ x 1.307950619 yd³/m³ = 10,590.7247 yd³ -> "10,590.72 yd³" (2 decimals)
    //   1.68 t/m³ x (0.764554858 m³/yd³ / 0.90718474 t/ST = 0.8427774) = 1.415866 ST/yd³ -> "1.416 ST/yd³" (3 decimals)
    // The title is the name heading above the label on the map and in the list, so the label does not repeat it
    const METRIC = '8,097.19 m³ - Gravel - 1.68 t/m³';
    const IMPERIAL = '10,590.72 yd³ - Gravel - 1.416 ST/yd³';

    it('is built from the metric properties in the units asked for', () => {
        inLocale('en-US');
        expect(stockpileLabel(pile, 'metric')).toBe(METRIC);
    });

    it('shows yd³ and ST/yd³ for imperial from netVolume 8097.19 m³ and 1.68 t/m³', () => {
        inLocale('en-US');
        expect(stockpileLabel(pile, 'imperial')).toBe(IMPERIAL);
    });

    it('follows the units asked for over the units the pile was saved in, and falls back to them', () => {
        inLocale('en-US');
        expect(stockpileLabel({ ...pile, unitSystem: 'imperial' })).toBe(IMPERIAL);
        expect(stockpileLabel({ ...pile, unitSystem: 'imperial' }, 'metric')).toBe(METRIC);
        expect(stockpileLabel(pile)).toBe(METRIC);
    });

    it('leaves out what the pile does not have', () => {
        inLocale('en-US');
        expect(stockpileLabel({ netVolume: 8097.19 }, 'imperial')).toBe('10,590.72 yd³');
        expect(stockpileLabel({ title: 'North pile', materialName: 'Gravel' }, 'imperial')).toBe('Gravel');
    });

    it('never has the title in it, whatever the title is', () => {
        inLocale('en-US');
        expect(stockpileLabel({ ...pile, title: 'North pile' }, 'metric')).not.toContain('North pile');
        expect(stockpileLabel({ title: 'North pile' }, 'metric')).toBe('Stockpile');
    });

    it('is the word Stockpile for a pile with nothing to say', () => {
        expect(stockpileLabel({}, 'metric')).toBe('Stockpile');
        expect(stockpileLabel(undefined)).toBe('Stockpile');
    });
});

describe('distinctLabels', () => {
    // The two mosaics of r3thermal/hat-creek and the masked variant of the first one
    const A = 'Hat_Creek_Fire_Thermal_08242018_16bit.tif';
    const B = 'Hat_Creek_Fire_Thermal_08252018_16bit.tif';
    const C = 'Hat_Creek_Fire_Thermal_08242018_16bit_masked.tif';

    it('drops the start the names share, so the two dates tell the layers apart', () => {
        expect(distinctLabels([A, B], 40)).toEqual(['08242018_16bit.tif', '08252018_16bit.tif']);
    });

    it('keeps the date of the masked variant too', () => {
        expect(distinctLabels([A, B, C], 40)).toEqual(['08242018_16bit.tif', '08252018_16bit.tif', '08242018_16bit_masked.tif']);
    });

    it('cuts a label that is still too long in the middle, keeping its end and its extension', () => {
        // 16 characters: the first 8 (the date), the ellipsis, the last 7
        expect(distinctLabels([A, B, C], 16)).toEqual(['08242018\u2026bit.tif', '08252018\u2026bit.tif', '08242018\u2026ked.tif']);
    });

    it('keeps the whole name of a single layer, or of names that are all the same', () => {
        expect(distinctLabels([A], 60)).toEqual([A]);
        expect(distinctLabels([A, A], 60)).toEqual([A, A]);
        expect(distinctLabels([], 10)).toEqual([]);
    });

    it('does not cut a word in half and never leaves a label empty', () => {
        expect(distinctLabels(['ortho1.tif', 'ortho2.tif'], 20)).toEqual(['ortho1.tif', 'ortho2.tif']);
        expect(distinctLabels(['site_a.tif', 'site_b.tif'], 20)).toEqual(['a.tif', 'b.tif']);
        // One name is the start of the other: the shorter keeps its whole text
        expect(distinctLabels(['site.tif', 'site.tif.aux'], 20)).toEqual(['site.tif', 'site.tif.aux']);
    });
});

describe('middleEllipsis', () => {
    it('returns a text that fits as it is', () => {
        expect(middleEllipsis('ortho.tif', 9)).toBe('ortho.tif');
    });

    it('is as long as asked, with the start and the end of the text around the ellipsis', () => {
        expect(middleEllipsis('abcdefghijklmnopqrstuvwxyz', 10)).toBe('abcde\u2026wxyz');
        expect(middleEllipsis('abcdefghijklmnopqrstuvwxyz', 10)).toHaveLength(10);
    });

    it('takes the first characters of a very short limit', () => {
        expect(middleEllipsis('abcdef', 3)).toBe('abc');
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
        expect(formatMoney(12.345, 'X1')).toBe(`${(12.35).toLocaleString(navigator.language)} X1`);
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

describe('the text of a point', () => {
    it('is "latitude, longitude" in decimal degrees with six decimals, as it is pasted elsewhere', () => {
        expect(latLonText(-23.9401761234, 31.1386581)).toBe('-23.940176, 31.138658');
        expect(latLonText(0, 0)).toBe('0.000000, 0.000000');
    });

    it('in degrees, minutes, seconds names the hemispheres', () => {
        expect(latLonDmsText(-23.940176, 31.138658)).toBe(`23\u00B056'24.63" S / 31\u00B008'19.17" E`);
        expect(latLonDmsText(45.5, -9.25)).toBe(`45\u00B030'00.00" N / 9\u00B015'00.00" W`);
    });

    it('in degrees, minutes, seconds carries seconds that round to 60 into the minute and the minute into the degree', () => {
        // 45 deg 29 min 59.999 s is 45 deg 30 min 00.00 s, not 29'60.00"
        expect(latLonDmsText(45 + 29 / 60 + 59.999 / 3600, 10 + 59 / 60 + 59.999 / 3600))
            .toBe(`45\u00B030'00.00" N / 11\u00B000'00.00" E`);
        expect(latLonDmsText(-(12 + 59 / 60 + 59.9999 / 3600), 0)).toBe(`13\u00B000'00.00" S / 0\u00B000'00.00" E`);
    });
});

describe('a point typed or pasted by a user', () => {
    it('reads "latitude, longitude" in decimal degrees, as it is copied, with a comma or a space between them', () => {
        expect(parseLatLon('-23.940176, 31.138658')).toEqual({ lat: -23.940176, lon: 31.138658 });
        expect(parseLatLon('  45.5 9.25 ')).toEqual({ lat: 45.5, lon: 9.25 });
        expect(parseLatLon('+45,-9')).toEqual({ lat: 45, lon: -9 });
        expect(parseLatLon('.5, -.25')).toEqual({ lat: 0.5, lon: -0.25 });
    });

    it('reads a comma as the decimal mark when a semicolon separates the two', () => {
        expect(parseLatLon('45,5; 9,25')).toEqual({ lat: 45.5, lon: 9.25 });
    });

    it('reads the pair in degrees, minutes, seconds, as the popup shows it and as map sites write it', () => {
        const { lat, lon } = /** @type {{ lat: number, lon: number }} */ (parseLatLon(`23\u00B056'24.63" S / 31\u00B008'19.17" E`));
        expect(lat).toBeCloseTo(-23.940175, 6);
        expect(lon).toBeCloseTo(31.138658, 6);
        expect(parseLatLon(`31\u00B008'19.17" E 23\u00B056'24.63" S`)).toEqual(parseLatLon(`23\u00B056'24.63" S, 31\u00B008'19.17" E`));
        expect(parseLatLon('45\u00B0 30\u2032 N 9\u00B0 15\u2032 W')).toEqual({ lat: 45.5, lon: -9.25 });
        expect(parseLatLon(`45\u00B030'00.00'' n 9\u00B015'00.00'' e`)).toEqual({ lat: 45.5, lon: 9.25 });
    });

    it('refuses text that is not one pair, and says how to write it', () => {
        const format = 'Write the point as "latitude, longitude", for example 45.5, 9.25';
        for (const text of ['45.5', '45.5, 9.25, 100', 'north, east', '45.5,, 9.25', '45.5 9.25 m', '1e3, 2', `45\u00B0 N 46\u00B0 N`]) {
            expect(parseLatLon(text)).toEqual({ error: format });
        }
        expect(parseLatLon('  ')).toEqual({ error: 'Enter the latitude and the longitude of the point' });
    });

    it('refuses a latitude the map cannot show and a longitude past 180, and names a pair written longitude first', () => {
        expect(parseLatLon('86, 9').error).toBe('The latitude must be between -85.05 and 85.05 (is the longitude first? Latitude comes first)');
        expect(parseLatLon('120, 45').error).toBe('The latitude must be between -85.05 and 85.05 (is the longitude first? Latitude comes first)');
        expect(parseLatLon('-95, 181').error).toBe('The latitude must be between -85.05 and 85.05');
        expect(parseLatLon('45, 180.5').error).toBe('The longitude must be between -180 and 180');
        expect(parseLatLon('85.05, -180')).toEqual({ lat: 85.05, lon: -180 });
    });
});
