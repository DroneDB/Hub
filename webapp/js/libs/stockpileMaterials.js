// @ts-check
/**
 * The materials a stockpile is weighed and priced with, and the one rule that turns a volume
 * into a weight and a cost.
 *
 * The built-in catalog holds typical values. Each user adapts it in their preferences
 * (PREF.STOCKPILE_MATERIALS): a different density or price for a built-in material, a built-in
 * material hidden from the list, materials of their own, and the currency the prices are in.
 * The currency is a label: changing it does not convert any price.
 *
 * Densities are in t/m³ and prices per metric tonne, whatever units the user reads them in.
 */

/**
 * @typedef {{ slug: string, name: string, category: string, densityTonPerM3: number, costPerTon: number }} BuiltInMaterial
 * @typedef {{ densityTonPerM3?: number, costPerTon?: number, hidden?: boolean }} MaterialOverride
 *   the changes of the user to a built-in material; a value left out is the built-in one
 * @typedef {{ id: string, name: string, category: string, densityTonPerM3: number, costPerTon: number }} CustomMaterial
 * @typedef {{ currency: string, overrides: Record<string, MaterialOverride>, custom: CustomMaterial[] }} StockpileSettings
 * @typedef {{ slug: string, name: string, category: string, densityTonPerM3: number, costPerTon: number,
 *             currency: string, builtIn: boolean, edited: boolean, hidden: boolean }} CatalogMaterial
 *   a material as the panel and the preferences show it; `edited`: a built-in material with a value
 *   of the user
 * @typedef {{ densityTonPerM3: number, costPerTon?: number, currency?: string }} PricedMaterial
 */

/** The material typed in the panel for one pile, not kept in the catalog. */
export const CUSTOM_MATERIAL_SLUG = '__custom__';
export const DEFAULT_CURRENCY = 'USD';
export const MAX_CUSTOM_MATERIALS = 100;
export const MAX_MATERIAL_TEXT = 64;
/** Above any bulk material (iron ore is about 2.5 t/m³, lead 11.3): a typing error, not a density. */
export const MAX_DENSITY_TON_PER_M3 = 30;
export const MAX_COST_PER_TON = 1e9;

// The ids of the user's materials can never be a built-in slug or the custom slug
const CUSTOM_ID = /^u-[a-z0-9]{1,32}$/;
const CURRENCY_CODE = /^[A-Z]{3}$/;

/** @type {readonly BuiltInMaterial[]} */
export const STOCKPILE_MATERIALS = Object.freeze([
    { slug: 'gravel',     name: 'Gravel',       category: 'Aggregate',  densityTonPerM3: 1.68, costPerTon: 15.0 },
    { slug: 'sand',       name: 'Sand',         category: 'Aggregate',  densityTonPerM3: 1.60, costPerTon: 12.0 },
    { slug: 'topsoil',    name: 'Topsoil',      category: 'Soil',       densityTonPerM3: 1.30, costPerTon: 20.0 },
    { slug: 'clay',       name: 'Clay',         category: 'Soil',       densityTonPerM3: 1.70, costPerTon: 10.0 },
    { slug: 'rock',       name: 'Crushed Rock', category: 'Aggregate',  densityTonPerM3: 1.60, costPerTon: 18.0 },
    { slug: 'asphalt',    name: 'Asphalt',      category: 'Paving',     densityTonPerM3: 2.24, costPerTon: 95.0 },
    { slug: 'concrete',   name: 'Concrete',     category: 'Paving',     densityTonPerM3: 2.40, costPerTon: 85.0 },
    { slug: 'coal',       name: 'Coal',         category: 'Mining',     densityTonPerM3: 0.85, costPerTon: 70.0 },
    { slug: 'iron_ore',   name: 'Iron Ore',     category: 'Mining',     densityTonPerM3: 2.50, costPerTon: 110.0 },
    { slug: 'limestone',  name: 'Limestone',    category: 'Aggregate',  densityTonPerM3: 1.55, costPerTon: 16.0 },
    { slug: 'wood_chips', name: 'Wood Chips',   category: 'Organic',    densityTonPerM3: 0.30, costPerTon: 40.0 },
    { slug: 'snow',       name: 'Snow',         category: 'Other',      densityTonPerM3: 0.30, costPerTon: 0.0 },
    { slug: 'waste',      name: 'Mixed Waste',  category: 'Waste',      densityTonPerM3: 0.80, costPerTon: 50.0 },
    { slug: 'compost',    name: 'Compost',      category: 'Organic',    densityTonPerM3: 0.55, costPerTon: 45.0 },
    { slug: 'fly_ash',    name: 'Fly Ash',      category: 'Industrial', densityTonPerM3: 1.00, costPerTon: 25.0 }
].map(m => Object.freeze(m)));

const BUILT_IN = new Map(STOCKPILE_MATERIALS.map(m => [m.slug, m]));

/** @param {unknown} value @returns {value is Record<string, any>} */
const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);

/** @param {unknown} value */
export const isValidDensity = value => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= MAX_DENSITY_TON_PER_M3;

/** @param {unknown} value */
export const isValidCost = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_COST_PER_TON;

/** Trimmed, at most MAX_MATERIAL_TEXT characters; '' for anything that is not text. @param {unknown} value */
const text = value => (typeof value === 'string' ? value.trim().slice(0, MAX_MATERIAL_TEXT) : '');

/** @param {unknown} value @returns {string} an ISO 4217 code; the default for anything else */
export function normalizeCurrency(value) {
    const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
    return CURRENCY_CODE.test(code) ? code : DEFAULT_CURRENCY;
}

/** @param {unknown} raw @returns {MaterialOverride|null} */
function normalizeOverride(raw) {
    if (!isObject(raw)) return null;
    /** @type {MaterialOverride} */
    const override = {};
    if (isValidDensity(raw.densityTonPerM3)) override.densityTonPerM3 = raw.densityTonPerM3;
    if (isValidCost(raw.costPerTon)) override.costPerTon = raw.costPerTon;
    if (raw.hidden === true) override.hidden = true;
    return Object.keys(override).length ? override : null;
}

/** @param {unknown} raw @returns {CustomMaterial|null} */
function normalizeCustom(raw) {
    if (!isObject(raw) || typeof raw.id !== 'string' || !CUSTOM_ID.test(raw.id)) return null;
    const name = text(raw.name);
    if (!name || !isValidDensity(raw.densityTonPerM3)) return null;
    return {
        id: raw.id,
        name,
        category: text(raw.category),
        densityTonPerM3: raw.densityTonPerM3,
        costPerTon: isValidCost(raw.costPerTon) ? raw.costPerTon : 0
    };
}

/**
 * The stockpile settings as the views use them, from whatever is stored: a value written by hand,
 * by a newer Hub or cut short reads as the nearest valid settings instead of failing. Unknown
 * built-in slugs, densities that are not positive, negative prices, materials without a name or
 * with a repeated id are left out; the user's materials are capped at MAX_CUSTOM_MATERIALS.
 * @param {unknown} raw
 * @returns {StockpileSettings}
 */
export function normalizeStockpileSettings(raw) {
    const source = isObject(raw) ? raw : {};
    /** @type {Record<string, MaterialOverride>} */
    const overrides = {};
    if (isObject(source.overrides)) {
        for (const [slug, value] of Object.entries(source.overrides)) {
            const override = BUILT_IN.has(slug) ? normalizeOverride(value) : null;
            if (override) overrides[slug] = override;
        }
    }
    /** @type {CustomMaterial[]} */
    const custom = [];
    const ids = new Set();
    for (const value of Array.isArray(source.custom) ? source.custom : []) {
        const material = normalizeCustom(value);
        if (!material || ids.has(material.id)) continue;
        ids.add(material.id);
        custom.push(material);
        if (custom.length === MAX_CUSTOM_MATERIALS) break;
    }
    return { currency: normalizeCurrency(source.currency), overrides, custom };
}

/**
 * Every material of the user: the built-in ones (with the user's values, hidden ones included)
 * then the user's own, in their order. All are priced in the user's currency.
 * @param {StockpileSettings} settings  normalized
 * @returns {CatalogMaterial[]}
 */
export function resolveStockpileCatalog(settings) {
    const { currency } = settings;
    const builtIn = STOCKPILE_MATERIALS.map(m => {
        const override = settings.overrides[m.slug] ?? {};
        return {
            slug: m.slug,
            name: m.name,
            category: m.category,
            densityTonPerM3: override.densityTonPerM3 ?? m.densityTonPerM3,
            costPerTon: override.costPerTon ?? m.costPerTon,
            currency,
            builtIn: true,
            edited: override.densityTonPerM3 !== undefined || override.costPerTon !== undefined,
            hidden: override.hidden === true
        };
    });
    const own = settings.custom.map(m => ({
        slug: m.id,
        name: m.name,
        category: m.category,
        densityTonPerM3: m.densityTonPerM3,
        costPerTon: m.costPerTon,
        currency,
        builtIn: false,
        edited: false,
        hidden: false
    }));
    return [...builtIn, ...own];
}

/** The decimals a density and a price are shown and typed with */
export const MATERIAL_DECIMALS = Object.freeze({ densityTonPerM3: 3, costPerTon: 2 });

/**
 * A density or a price as the user reads it: converted to their units (`units` from bulkUnits)
 * and rounded to MATERIAL_DECIMALS, without the noise of the conversion (1.2000000001).
 * @param {number} value  t/m³, or a price per tonne
 * @param {'densityTonPerM3'|'costPerTon'} field
 * @param {import('./format').BulkUnits} units
 */
export function shownMaterialValue(value, field, units) {
    const factor = field === 'densityTonPerM3' ? units.density.factor : units.perWeight.factor;
    const scale = 10 ** MATERIAL_DECIMALS[field];
    return Math.round(value * factor * scale) / scale;
}

/**
 * The stored (metric) value of a density or a price the user typed in their units.
 * @param {number} shown @param {'densityTonPerM3'|'costPerTon'} field
 * @param {import('./format').BulkUnits} units
 */
export function storedMaterialValue(shown, field, units) {
    return shown / (field === 'densityTonPerM3' ? units.density.factor : units.perWeight.factor);
}

/** @param {string} slug @returns {BuiltInMaterial|null} */
export const builtInMaterial = slug => BUILT_IN.get(slug) ?? null;

// ---- Changes to the settings: each returns new settings and leaves the given ones as they are ----

/**
 * The settings with a density or a price of a material changed. For a built-in material the
 * override keeps only what differs from the built-in value, so a value set back to the default
 * follows the catalog again. An invalid value changes nothing.
 * @param {StockpileSettings} settings
 * @param {string} slug
 * @param {'densityTonPerM3'|'costPerTon'} field
 * @param {number} value
 * @returns {StockpileSettings}
 */
export function withMaterialValue(settings, slug, field, value) {
    const valid = field === 'densityTonPerM3' ? isValidDensity(value) : isValidCost(value);
    if (!valid) return settings;
    const builtIn = builtInMaterial(slug);
    if (builtIn) {
        const override = { ...settings.overrides[slug] };
        if (value === builtIn[field]) delete override[field];
        else override[field] = value;
        return withOverride(settings, slug, override);
    }
    return withCustom(settings, slug, m => ({ ...m, [field]: value }));
}

/**
 * The settings with a built-in material shown in, or hidden from, the panel's list.
 * @param {StockpileSettings} settings @param {string} slug @param {boolean} hidden
 * @returns {StockpileSettings}
 */
export function withMaterialHidden(settings, slug, hidden) {
    if (!builtInMaterial(slug)) return settings;
    const override = { ...settings.overrides[slug] };
    if (hidden) override.hidden = true;
    else delete override.hidden;
    return withOverride(settings, slug, override);
}

/**
 * The settings with the density and the price of a built-in material back to the built-in ones
 * (whether it is shown does not change).
 * @param {StockpileSettings} settings @param {string} slug
 * @returns {StockpileSettings}
 */
export function withMaterialReset(settings, slug) {
    const override = { ...settings.overrides[slug] };
    delete override.densityTonPerM3;
    delete override.costPerTon;
    return withOverride(settings, slug, override);
}

/**
 * The settings with a material of the user renamed or given another category.
 * @param {StockpileSettings} settings @param {string} id
 * @param {'name'|'category'} field @param {string} value
 * @returns {StockpileSettings}
 */
export function withMaterialText(settings, id, field, value) {
    const cleaned = text(value);
    if (field === 'name' && !cleaned) return settings;
    return withCustom(settings, id, m => ({ ...m, [field]: cleaned }));
}

/**
 * The settings with a new material of the user at the end, unless there are already
 * MAX_CUSTOM_MATERIALS. The name is made unique ("Material 2").
 * @param {StockpileSettings} settings
 * @param {Partial<Omit<CustomMaterial, 'id'>>} [values]
 * @returns {{ settings: StockpileSettings, id: string|null }}
 */
export function withCustomMaterialAdded(settings, values = {}) {
    if (settings.custom.length >= MAX_CUSTOM_MATERIALS) return { settings, id: null };
    const taken = new Set(resolveStockpileCatalog(settings).map(m => m.name.toLowerCase()));
    const base = text(values.name) || 'Material';
    let name = base;
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base} ${n}`;
    const material = {
        id: newCustomMaterialId(settings),
        name,
        category: text(values.category),
        densityTonPerM3: isValidDensity(values.densityTonPerM3) ? /** @type {number} */ (values.densityTonPerM3) : 1.5,
        costPerTon: isValidCost(values.costPerTon) ? /** @type {number} */ (values.costPerTon) : 0
    };
    return { settings: { ...settings, custom: [...settings.custom, material] }, id: material.id };
}

/**
 * The settings without a material of the user.
 * @param {StockpileSettings} settings @param {string} id
 * @returns {StockpileSettings}
 */
export function withCustomMaterialRemoved(settings, id) {
    return { ...settings, custom: settings.custom.filter(m => m.id !== id) };
}

/**
 * Why a name cannot be the name of a material of the user, or null when it can: it is empty,
 * or another material (built-in ones included) has it, whatever the case.
 * @param {StockpileSettings} settings @param {string} id  the material being named
 * @param {string} name
 * @returns {string|null}
 */
export function materialNameProblem(settings, id, name) {
    const cleaned = text(name).toLowerCase();
    if (!cleaned) return 'A name is required.';
    const clash = resolveStockpileCatalog(settings).some(m => m.slug !== id && m.name.toLowerCase() === cleaned);
    return clash ? 'Another material has this name.' : null;
}

/** @param {StockpileSettings} settings @param {string} slug @param {MaterialOverride} override */
function withOverride(settings, slug, override) {
    const overrides = { ...settings.overrides };
    if (Object.keys(override).length) overrides[slug] = override;
    else delete overrides[slug];
    return { ...settings, overrides };
}

/** @param {StockpileSettings} settings @param {string} id @param {(m: CustomMaterial) => CustomMaterial} change */
function withCustom(settings, id, change) {
    return { ...settings, custom: settings.custom.map(m => (m.id === id ? change(m) : m)) };
}

/**
 * A new id for a material of the user, not used by any of `settings`.
 * @param {StockpileSettings} [settings]
 */
export function newCustomMaterialId(settings) {
    const used = new Set(settings?.custom.map(m => m.id));
    let id;
    do {
        id = `u-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    } while (used.has(id));
    return id;
}

/**
 * What a saved pile was weighed and priced with, from its properties: the material's name, its
 * density, its price per tonne and the currency. A pile saved before the price was stored gets it
 * back from its cost and its weight. Null when the pile has no valid density.
 * @param {Record<string, any>} properties  of a saved stockpile feature
 * @returns {{ name: string, densityTonPerM3: number, costPerTon: number, currency: string }|null}
 */
export function materialOfSavedPile(properties) {
    const density = Number(properties.materialDensity);
    if (!isValidDensity(density)) return null;
    let cost = Number(properties.costPerTon);
    if (properties.costPerTon == null || !isValidCost(cost)) {
        const tons = Number(properties.weightEstimate?.tons);
        const amount = Number(properties.costEstimate?.amount);
        cost = tons > 0 && isValidCost(amount / tons) ? amount / tons : 0;
    }
    const slug = typeof properties.material === 'string' ? properties.material : '';
    const name = text(properties.materialName) || builtInMaterial(slug)?.name || text(slug) || 'Material';
    return {
        name,
        densityTonPerM3: density,
        costPerTon: cost,
        currency: normalizeCurrency(properties.currency ?? properties.costEstimate?.currency)
    };
}

/** Whether two numbers are the same value, but for the rounding of a division. @param {number} a @param {number} b */
const nearlyEqual = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

/**
 * Whether two materials give the same weight and cost: same density, price and currency.
 * @param {Required<PricedMaterial>} a @param {Required<PricedMaterial>} b
 */
export function samePricing(a, b) {
    return nearlyEqual(a.densityTonPerM3, b.densityTonPerM3) && nearlyEqual(a.costPerTon, b.costPerTon)
        && a.currency === b.currency;
}

/**
 * The weight and the cost of a pile of a material: the volume of the pile is the larger of its
 * cut volume and its net volume (a pit has a negative net volume), times the density, times the
 * price per tonne. `basedOn` says which volume it was.
 *
 * This is the only rule: the panel shows it and a saved pile stores it.
 * @param {{ cutVolume?: unknown, netVolume?: unknown }|null|undefined} volume
 * @param {PricedMaterial|null|undefined} material
 * @returns {{ weightEstimate: { tons: number, basedOn: 'cutVolume'|'netVolume' },
 *             costEstimate: { amount: number, currency: string } }|null}  null without a valid material
 */
export function computeMaterialEstimate(volume, material) {
    if (!material) return null;
    const density = Number(material.densityTonPerM3);
    if (!isFinite(density) || density <= 0) return null;
    const costPerTon = Number(material.costPerTon);
    const safeCost = isFinite(costPerTon) ? costPerTon : 0;
    const currency = material.currency || DEFAULT_CURRENCY;

    const netVolume = volume && isFinite(Number(volume.netVolume)) ? Number(volume.netVolume) : 0;
    const cutVolume = volume && isFinite(Number(volume.cutVolume)) ? Number(volume.cutVolume) : 0;
    const absNet = Math.abs(netVolume);
    const basedOn = cutVolume >= absNet ? 'cutVolume' : 'netVolume';
    const tons = Math.max(cutVolume, absNet) * density;

    return {
        weightEstimate: { tons, basedOn },
        costEstimate: { amount: tons * safeCost, currency }
    };
}
