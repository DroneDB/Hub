/**
 * The user's stockpile materials: what is stored reads as valid settings whatever it holds, the
 * catalog the panel offers follows the user's changes, and the weight and the cost of a pile come
 * from one rule.
 */
import { describe, it, expect } from 'vitest';
import {
    CUSTOM_MATERIAL_SLUG,
    DEFAULT_CURRENCY,
    MAX_CUSTOM_MATERIALS,
    MAX_MATERIAL_TEXT,
    STOCKPILE_MATERIALS,
    computeMaterialEstimate,
    materialNameProblem,
    materialOfSavedPile,
    newCustomMaterialId,
    normalizeCurrency,
    normalizeStockpileSettings,
    resolveStockpileCatalog,
    samePricing,
    shownMaterialValue,
    storedMaterialValue,
    withCustomMaterialAdded,
    withCustomMaterialRemoved,
    withMaterialHidden,
    withMaterialReset,
    withMaterialText,
    withMaterialValue
} from './stockpileMaterials';
import { PREF, PREF_DEFAULTS } from './preferences';
import { bulkUnits } from './format';

const EMPTY = normalizeStockpileSettings(null);
const custom = (id, extra = {}) => ({ id, name: `Mat ${id}`, category: '', densityTonPerM3: 1.2, costPerTon: 3, ...extra });
const find = (settings, slug) => resolveStockpileCatalog(settings).find(m => m.slug === slug);

describe('normalizeStockpileSettings', () => {
    it('reads the preference default as the built-in catalog in US dollars', () => {
        expect(normalizeStockpileSettings(PREF_DEFAULTS[PREF.STOCKPILE_MATERIALS]))
            .toEqual({ currency: 'USD', overrides: {}, custom: [] });
    });

    it.each([undefined, null, 'gravel', 42, [], { overrides: 'x', custom: {} }])('reads %j as the defaults', raw => {
        expect(normalizeStockpileSettings(raw)).toEqual({ currency: DEFAULT_CURRENCY, overrides: {}, custom: [] });
    });

    it('keeps a currency code, upper-cased, and falls back to USD for anything else', () => {
        expect(normalizeCurrency('eur')).toBe('EUR');
        expect(normalizeCurrency(' GBP ')).toBe('GBP');
        for (const bad of ['EURO', 'E1R', '', null, 7]) expect(normalizeCurrency(bad)).toBe('USD');
    });

    it('keeps the valid values of an override and drops the rest', () => {
        const settings = normalizeStockpileSettings({
            overrides: {
                gravel: { densityTonPerM3: 1.75, costPerTon: 14, hidden: true },
                sand: { densityTonPerM3: 0, costPerTon: -1, hidden: 'yes' },     // nothing valid
                clay: { densityTonPerM3: Infinity, costPerTon: 0 },              // a free material is valid
                rock: { densityTonPerM3: 31 },                                   // a typing error
                unobtainium: { densityTonPerM3: 1 },                             // not a built-in material
                topsoil: 'cheap'
            }
        });
        expect(settings.overrides).toEqual({
            gravel: { densityTonPerM3: 1.75, costPerTon: 14, hidden: true },
            clay: { costPerTon: 0 }
        });
    });

    it('keeps the user materials with an id, a name and a density, once each, in their order', () => {
        const settings = normalizeStockpileSettings({
            custom: [
                custom('u-a'),
                custom('u-a', { name: 'repeated id' }),
                custom('gravel'),                                    // a built-in slug is not a user id
                custom(CUSTOM_MATERIAL_SLUG),
                custom('u-b', { name: '   ' }),
                custom('u-c', { densityTonPerM3: -2 }),
                custom('u-d', { costPerTon: 'free', category: 7 }),  // the price falls back to 0
                'not a material'
            ]
        });
        expect(settings.custom).toEqual([custom('u-a'), custom('u-d', { costPerTon: 0, category: '' })]);
    });

    it('cuts names short, and keeps at most MAX_CUSTOM_MATERIALS materials', () => {
        const many = Array.from({ length: MAX_CUSTOM_MATERIALS + 5 }, (_, i) => custom(`u-${i}`));
        many[0].name = 'x'.repeat(200);
        const settings = normalizeStockpileSettings({ custom: many });
        expect(settings.custom).toHaveLength(MAX_CUSTOM_MATERIALS);
        expect(settings.custom[0].name).toHaveLength(MAX_MATERIAL_TEXT);
    });

    it('fits the account preferences budget at the cap (64 KB for every section)', () => {
        const many = Array.from({ length: MAX_CUSTOM_MATERIALS }, (_, i) =>
            custom(`u-${'a'.repeat(30)}${i}`, { name: 'n'.repeat(MAX_MATERIAL_TEXT), category: 'c'.repeat(MAX_MATERIAL_TEXT) }));
        const overrides = Object.fromEntries(STOCKPILE_MATERIALS.map(m => [m.slug, { densityTonPerM3: 1.23456789, costPerTon: 123.456789, hidden: true }]));
        const size = JSON.stringify(normalizeStockpileSettings({ currency: 'EUR', overrides, custom: many })).length;
        expect(size).toBeLessThan(32 * 1024);
    });
});

describe('resolveStockpileCatalog', () => {
    it('lists the built-in materials, then the user ones, all priced in the user currency', () => {
        const catalog = resolveStockpileCatalog({ currency: 'EUR', overrides: {}, custom: [custom('u-x')] });
        expect(catalog.map(m => m.slug)).toEqual([...STOCKPILE_MATERIALS.map(m => m.slug), 'u-x']);
        expect(new Set(catalog.map(m => m.currency))).toEqual(new Set(['EUR']));
        expect(catalog.at(-1)).toMatchObject({ name: 'Mat u-x', builtIn: false, edited: false, hidden: false });
    });

    it('takes the user values over the built-in ones, and marks the material as edited', () => {
        const gravel = find({ ...EMPTY, overrides: { gravel: { costPerTon: 9 } } }, 'gravel');
        expect(gravel).toMatchObject({ densityTonPerM3: 1.68, costPerTon: 9, edited: true, hidden: false });
        expect(find(EMPTY, 'sand').edited).toBe(false);
    });

    it('keeps a hidden material, marked hidden and not edited', () => {
        expect(find({ ...EMPTY, overrides: { snow: { hidden: true } } }, 'snow')).toMatchObject({ hidden: true, edited: false });
    });

    it('a currency is a label: the prices keep their numbers', () => {
        expect(find({ ...EMPTY, currency: 'JPY' }, 'gravel')).toMatchObject({ costPerTon: 15, currency: 'JPY' });
    });
});

describe('changes to the settings', () => {
    it('stores only what differs from a built-in value, so the default is followed again', () => {
        let settings = withMaterialValue(EMPTY, 'gravel', 'densityTonPerM3', 1.8);
        expect(settings.overrides).toEqual({ gravel: { densityTonPerM3: 1.8 } });
        settings = withMaterialValue(settings, 'gravel', 'densityTonPerM3', 1.68);
        expect(settings.overrides).toEqual({});
    });

    it('does not store an invalid value, and does not change the given settings', () => {
        const before = normalizeStockpileSettings({ overrides: { gravel: { costPerTon: 3 } } });
        const copy = structuredClone(before);
        expect(withMaterialValue(before, 'gravel', 'densityTonPerM3', 0)).toBe(before);
        expect(withMaterialValue(before, 'gravel', 'costPerTon', -5)).toBe(before);
        expect(withMaterialValue(before, 'gravel', 'costPerTon', NaN)).toBe(before);
        withMaterialValue(before, 'gravel', 'costPerTon', 4);
        expect(before).toEqual(copy);
    });

    it('hides and shows a built-in material without touching its values', () => {
        let settings = withMaterialValue(EMPTY, 'snow', 'costPerTon', 2);
        settings = withMaterialHidden(settings, 'snow', true);
        expect(settings.overrides.snow).toEqual({ costPerTon: 2, hidden: true });
        settings = withMaterialHidden(settings, 'snow', false);
        expect(settings.overrides.snow).toEqual({ costPerTon: 2 });
        expect(withMaterialHidden(settings, 'u-x', true)).toBe(settings);
    });

    it('a reset sets the density and the price back and keeps the material hidden', () => {
        const settings = normalizeStockpileSettings({ overrides: { coal: { densityTonPerM3: 0.9, costPerTon: 1, hidden: true }, sand: { costPerTon: 1 } } });
        expect(withMaterialReset(settings, 'coal').overrides).toEqual({ coal: { hidden: true }, sand: { costPerTon: 1 } });
        expect(withMaterialReset(settings, 'sand').overrides).toEqual({ coal: { densityTonPerM3: 0.9, costPerTon: 1, hidden: true } });
    });

    it('adds a user material with a unique name and a new id, up to the cap', () => {
        const first = withCustomMaterialAdded(EMPTY);
        const second = withCustomMaterialAdded(first.settings);
        expect(first.settings.custom[0]).toMatchObject({ id: first.id, name: 'Material', densityTonPerM3: 1.5, costPerTon: 0 });
        expect(second.settings.custom[1].name).toBe('Material 2');
        expect(second.id).not.toBe(first.id);
        // The new id is valid: the material survives a round trip through storage
        expect(normalizeStockpileSettings(JSON.parse(JSON.stringify(second.settings)))).toEqual(second.settings);

        const named = withCustomMaterialAdded(EMPTY, { name: 'gravel' });
        expect(named.settings.custom[0].name).toBe('gravel 2');

        const full = normalizeStockpileSettings({ custom: Array.from({ length: MAX_CUSTOM_MATERIALS }, (_, i) => custom(`u-${i}`)) });
        expect(withCustomMaterialAdded(full)).toEqual({ settings: full, id: null });
    });

    it('edits and removes a user material', () => {
        const settings = normalizeStockpileSettings({ custom: [custom('u-a'), custom('u-b')] });
        expect(withMaterialValue(settings, 'u-a', 'costPerTon', 8).custom[0].costPerTon).toBe(8);
        expect(withMaterialText(settings, 'u-a', 'name', '  Ballast ').custom[0].name).toBe('Ballast');
        expect(withMaterialText(settings, 'u-a', 'name', ' ')).toBe(settings);
        expect(withCustomMaterialRemoved(settings, 'u-a').custom.map(m => m.id)).toEqual(['u-b']);
    });

    it('a name must be given and must not be another material name, whatever the case', () => {
        const settings = normalizeStockpileSettings({ custom: [custom('u-a', { name: 'Ballast' }), custom('u-b')] });
        expect(materialNameProblem(settings, 'u-b', '')).toMatch(/required/);
        expect(materialNameProblem(settings, 'u-b', 'GRAVEL')).toMatch(/Another material/);
        expect(materialNameProblem(settings, 'u-b', 'ballast')).toMatch(/Another material/);
        expect(materialNameProblem(settings, 'u-a', 'Ballast')).toBeNull();
        expect(materialNameProblem(settings, 'u-b', 'Rail ballast')).toBeNull();
    });

    it('new ids never repeat one in use', () => {
        const ids = new Set(Array.from({ length: 200 }, () => newCustomMaterialId(EMPTY)));
        expect(ids.size).toBe(200);
        for (const id of ids) expect(id).toMatch(/^u-[a-z0-9]+$/);
    });
});

describe('computeMaterialEstimate', () => {
    const gravel = { densityTonPerM3: 1.5, costPerTon: 10, currency: 'EUR' };

    it('weighs the cut volume of a pile and prices the weight', () => {
        expect(computeMaterialEstimate({ cutVolume: 100, netVolume: 100 }, gravel)).toEqual({
            weightEstimate: { tons: 150, basedOn: 'cutVolume' },
            costEstimate: { amount: 1500, currency: 'EUR' }
        });
    });

    it('weighs the net volume when it is the larger (a pit has a negative one)', () => {
        expect(computeMaterialEstimate({ cutVolume: 10, netVolume: -40 }, gravel).weightEstimate).toEqual({ tons: 60, basedOn: 'netVolume' });
    });

    it('is null without a material or with an invalid density; a missing price is free', () => {
        expect(computeMaterialEstimate({ cutVolume: 1 }, null)).toBeNull();
        expect(computeMaterialEstimate({ cutVolume: 1 }, { densityTonPerM3: 0 })).toBeNull();
        expect(computeMaterialEstimate({ cutVolume: 2 }, { densityTonPerM3: 1 }).costEstimate).toEqual({ amount: 0, currency: 'USD' });
    });
});

describe('a saved pile', () => {
    it('gives back the material it was priced with', () => {
        expect(materialOfSavedPile({ material: 'u-x', materialName: 'Ballast', materialDensity: 1.8, costPerTon: 22, currency: 'EUR' }))
            .toEqual({ name: 'Ballast', densityTonPerM3: 1.8, costPerTon: 22, currency: 'EUR' });
    });

    it('saved before the price was stored: the price from the cost and the weight, the name from the catalog', () => {
        expect(materialOfSavedPile({
            material: 'gravel', materialDensity: 1.68,
            weightEstimate: { tons: 168 }, costEstimate: { amount: 2520, currency: 'USD' }
        })).toEqual({ name: 'Gravel', densityTonPerM3: 1.68, costPerTon: 15, currency: 'USD' });
    });

    it('is null without a valid density', () => {
        expect(materialOfSavedPile({ material: 'gravel' })).toBeNull();
        expect(materialOfSavedPile({ material: 'gravel', materialDensity: 'heavy' })).toBeNull();
    });

    it('prices the same as a material with the same values, but for rounding', () => {
        const a = { densityTonPerM3: 1.68, costPerTon: 15, currency: 'USD' };
        expect(samePricing(a, { ...a, costPerTon: 2520 / 168 })).toBe(true);
        expect(samePricing(a, { ...a, costPerTon: 15.01 })).toBe(false);
        expect(samePricing(a, { ...a, currency: 'EUR' })).toBe(false);
    });
});

describe('a density and a price in the user units', () => {
    it('are the stored values in metric units', () => {
        expect(shownMaterialValue(1.68, 'densityTonPerM3', bulkUnits('metric'))).toBe(1.68);
        expect(shownMaterialValue(15, 'costPerTon', bulkUnits('metric'))).toBe(15);
    });

    it('are converted and rounded in imperial units (3 decimals for a density, 2 for a price)', () => {
        const imperial = bulkUnits('imperial');
        expect(shownMaterialValue(1.68, 'densityTonPerM3', imperial)).toBe(1.416);
        expect(shownMaterialValue(15, 'costPerTon', imperial)).toBe(13.61);
        expect(storedMaterialValue(13.61, 'costPerTon', imperial)).toBeCloseTo(15.0025, 4);
    });

    it('a stored value typed back as shown gives the same value shown', () => {
        const imperial = bulkUnits('imperial');
        for (const m of STOCKPILE_MATERIALS) {
            for (const field of ['densityTonPerM3', 'costPerTon']) {
                const shown = shownMaterialValue(m[field], field, imperial);
                expect(shownMaterialValue(storedMaterialValue(shown, field, imperial), field, imperial)).toBe(shown);
            }
        }
    });
});
