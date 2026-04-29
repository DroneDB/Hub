/**
 * Built-in material catalog used to estimate stockpile weight and cost
 * from a computed volume. Values are reasonable defaults; projects that
 * need precise numbers should override them via the "Custom" entry.
 *
 * Densities expressed in t/m³; cost per ton in `currency`.
 */

// Reserved slug for inline-custom material entries (density+cost typed in the panel).
export const CUSTOM_MATERIAL_SLUG = '__custom__';

export const STOCKPILE_MATERIALS = Object.freeze([
    { slug: 'gravel',     name: 'Gravel',       category: 'Aggregate',  densityTonPerM3: 1.68, costPerTon: 15.0,  currency: 'USD' },
    { slug: 'sand',       name: 'Sand',         category: 'Aggregate',  densityTonPerM3: 1.60, costPerTon: 12.0,  currency: 'USD' },
    { slug: 'topsoil',    name: 'Topsoil',      category: 'Soil',       densityTonPerM3: 1.30, costPerTon: 20.0,  currency: 'USD' },
    { slug: 'clay',       name: 'Clay',         category: 'Soil',       densityTonPerM3: 1.70, costPerTon: 10.0,  currency: 'USD' },
    { slug: 'rock',       name: 'Crushed Rock', category: 'Aggregate',  densityTonPerM3: 1.60, costPerTon: 18.0,  currency: 'USD' },
    { slug: 'asphalt',    name: 'Asphalt',      category: 'Paving',     densityTonPerM3: 2.24, costPerTon: 95.0,  currency: 'USD' },
    { slug: 'concrete',   name: 'Concrete',     category: 'Paving',     densityTonPerM3: 2.40, costPerTon: 85.0,  currency: 'USD' },
    { slug: 'coal',       name: 'Coal',         category: 'Mining',     densityTonPerM3: 0.85, costPerTon: 70.0,  currency: 'USD' },
    { slug: 'iron_ore',   name: 'Iron Ore',     category: 'Mining',     densityTonPerM3: 2.50, costPerTon: 110.0, currency: 'USD' },
    { slug: 'limestone',  name: 'Limestone',    category: 'Aggregate',  densityTonPerM3: 1.55, costPerTon: 16.0,  currency: 'USD' },
    { slug: 'wood_chips', name: 'Wood Chips',   category: 'Organic',    densityTonPerM3: 0.30, costPerTon: 40.0,  currency: 'USD' },
    { slug: 'snow',       name: 'Snow',         category: 'Other',      densityTonPerM3: 0.30, costPerTon: 0.0,   currency: 'USD' },
    { slug: 'waste',      name: 'Mixed Waste',  category: 'Waste',      densityTonPerM3: 0.80, costPerTon: 50.0,  currency: 'USD' },
    { slug: 'compost',    name: 'Compost',      category: 'Organic',    densityTonPerM3: 0.55, costPerTon: 45.0,  currency: 'USD' },
    { slug: 'fly_ash',    name: 'Fly Ash',      category: 'Industrial', densityTonPerM3: 1.00, costPerTon: 25.0,  currency: 'USD' }
]);

/**
 * Look up a material descriptor by slug (case-insensitive). Returns null
 * for unknown / falsy slugs and for the reserved "custom" slug.
 */
export function findStockpileMaterialBySlug(slug) {
    if (!slug || slug === CUSTOM_MATERIAL_SLUG) return null;
    const needle = String(slug).toLowerCase();
    return STOCKPILE_MATERIALS.find(m => m.slug.toLowerCase() === needle) || null;
}

/**
 * Compute weight (tons) and monetary cost from a server-side volume result
 * and a material descriptor. Mirrors the previous server-side augmentation:
 *
 *   basedOn  = cutVolume >= |netVolume| ? 'cutVolume' : 'netVolume'
 *   tons     = max(cutVolume, |netVolume|) * density
 *   cost     = tons * costPerTon
 *
 * `material` may be either an entry from STOCKPILE_MATERIALS or any object
 * exposing `densityTonPerM3` / `costPerTon` / `currency` (e.g. a custom
 * inline material). Returns `null` when material is missing/invalid.
 */
export function computeMaterialEstimate(volume, material) {
    if (!material) return null;
    const density = Number(material.densityTonPerM3);
    if (!isFinite(density) || density <= 0) return null;
    const costPerTon = Number(material.costPerTon);
    const safeCost = isFinite(costPerTon) ? costPerTon : 0;
    const currency = material.currency || 'USD';

    const netVolume = volume && isFinite(Number(volume.netVolume)) ? Number(volume.netVolume) : 0;
    const cutVolume = volume && isFinite(Number(volume.cutVolume)) ? Number(volume.cutVolume) : 0;
    const absNet = Math.abs(netVolume);
    const basedOn = cutVolume >= absNet ? 'cutVolume' : 'netVolume';
    const volumeForEstimate = Math.max(cutVolume, absNet);
    const tons = volumeForEstimate * density;
    const cost = tons * safeCost;

    return {
        weightEstimate: { tons, basedOn },
        costEstimate: { amount: cost, currency }
    };
}
