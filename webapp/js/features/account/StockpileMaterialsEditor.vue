<template>
    <div class="materials-editor" data-testid="stockpile-materials-editor">
        <p class="pref-hint">
            The stockpile panel weighs a pile with the density of its material and prices it with the price per
            {{ units.perWeight.unit === 't' ? 'tonne' : 'short ton' }}, in the currency of the Units tab. Change the values to yours,
            hide the materials you do not use, or add your own.
        </p>

        <div class="materials-table" role="table" aria-label="Stockpile materials">
            <div class="materials-row materials-head" role="row">
                <span role="columnheader" class="col-shown">Shown</span>
                <span role="columnheader" class="col-name">Material</span>
                <span role="columnheader" class="col-density">Density ({{ units.density.unit }})</span>
                <span role="columnheader" class="col-price">Price ({{ currency }}/{{ units.perWeight.unit }})</span>
                <span role="columnheader" class="col-action"><span class="visually-hidden">Actions</span></span>
            </div>

            <div v-for="row in rows" :key="row.slug" class="materials-row" :class="{ hidden: row.hidden }"
                 role="row" :data-testid="`material-${row.slug}`">
                <span role="cell" class="col-shown">
                    <ToggleSwitch v-if="row.builtIn" :model-value="!row.hidden" :aria-label="`Show ${row.name} in the stockpile panel`"
                                  @update:model-value="shown => apply(withMaterialHidden(settingsNow, row.slug, !shown))" />
                </span>
                <span role="cell" class="col-name">
                    <template v-if="row.builtIn">
                        <span class="material-name">{{ row.name }}</span>
                        <span v-if="row.edited" class="edited-mark" :title="defaultsText(row)">edited</span>
                        <span class="material-category">{{ row.category }}</span>
                    </template>
                    <template v-else>
                        <InputText :id="`material-name-${row.slug}`" :model-value="row.name" size="small" class="name-input"
                                   :maxlength="MAX_MATERIAL_TEXT" :aria-label="`Name of ${row.name}`"
                                   :invalid="!!errors[`${row.slug}:name`]" @change="rename(row, $event.target.value)" />
                    </template>
                </span>
                <span role="cell" class="col-density">
                    <InputNumber :model-value="shownValue(row, 'densityTonPerM3')" size="small" :min-fraction-digits="0" :max-fraction-digits="MATERIAL_DECIMALS.densityTonPerM3"
                                 :min="0" :aria-label="`Density of ${row.name} in ${units.density.unit}`"
                                 :invalid="!!errors[`${row.slug}:densityTonPerM3`]"
                                 :input-id="`density-${row.slug}`"
                                 @update:model-value="v => setValue(row, 'densityTonPerM3', v)" />
                </span>
                <span role="cell" class="col-price">
                    <InputNumber :model-value="shownValue(row, 'costPerTon')" size="small" :min-fraction-digits="0" :max-fraction-digits="MATERIAL_DECIMALS.costPerTon"
                                 :min="0" :aria-label="`Price of ${row.name} in ${currency} per ${units.perWeight.unit}`"
                                 :invalid="!!errors[`${row.slug}:costPerTon`]"
                                 :input-id="`price-${row.slug}`"
                                 @update:model-value="v => setValue(row, 'costPerTon', v)" />
                </span>
                <span role="cell" class="col-action">
                    <Button v-if="row.builtIn && row.edited" icon="fa-solid fa-rotate-left" text rounded size="small" severity="secondary"
                            :aria-label="`Set ${row.name} back to the default values`" :title="defaultsText(row)"
                            @click="apply(withMaterialReset(settingsNow, row.slug))" />
                    <Button v-else-if="!row.builtIn" icon="fa-solid fa-trash" text rounded size="small" severity="danger"
                            :aria-label="`Remove ${row.name}`" title="Remove this material"
                            @click="remove(row)" />
                </span>
                <span v-if="rowError(row)" class="row-error" role="alert">{{ rowError(row) }}</span>
            </div>
        </div>

        <div class="materials-actions">
            <Button severity="secondary" size="small" icon="fa-solid fa-plus" label="Add material"
                    :disabled="settingsNow.custom.length >= MAX_CUSTOM_MATERIALS" @click="add" />
            <span v-if="settingsNow.custom.length >= MAX_CUSTOM_MATERIALS" class="pref-hint">
                You have {{ MAX_CUSTOM_MATERIALS }} materials of your own, the most there can be.
            </span>
        </div>
    </div>
</template>

<script setup>
/**
 * StockpileMaterialsEditor - the user's stockpile materials, in the Preferences: the density and
 * the price of each built-in material (an edited one can be set back to the default), whether it
 * is offered in the stockpile panel, and materials of the user's own.
 *
 * Values are shown in the user's units (t/m³ and per tonne, or ST/yd³ and per short ton) and
 * currency (both general settings, on the Units tab) and stored metric. An invalid value is shown as such and not stored. The changes are the pure
 * functions of libs/stockpileMaterials.js; the preference follows the account as any other.
 */
import { computed, nextTick, reactive } from 'vue';
import Button from 'primevue/button';
import InputNumber from 'primevue/inputnumber';
import InputText from 'primevue/inputtext';
import ToggleSwitch from 'primevue/toggleswitch';
import { usePreference } from '@/composables/usePreference';
import { useViewerSettings } from '@/composables/useViewerSettings';
import { bulkUnits, normalizeCurrency } from '@/libs/format';
import { PREF, PREF_DEFAULTS } from '@/libs/preferences';
import {
    MATERIAL_DECIMALS,
    MAX_CUSTOM_MATERIALS,
    MAX_DENSITY_TON_PER_M3,
    MAX_MATERIAL_TEXT,
    builtInMaterial,
    isValidCost,
    isValidDensity,
    materialNameProblem,
    normalizeStockpileSettings,
    resolveStockpileCatalog,
    shownMaterialValue,
    storedMaterialValue,
    withCustomMaterialAdded,
    withCustomMaterialRemoved,
    withMaterialHidden,
    withMaterialReset,
    withMaterialText,
    withMaterialValue
} from '@/libs/stockpileMaterials';

defineOptions({ name: 'StockpileMaterialsEditor' });

const stored = useViewerSettings(PREF.STOCKPILE_MATERIALS, PREF_DEFAULTS[PREF.STOCKPILE_MATERIALS]).settings;
const unitPref = usePreference(PREF.MEASURE_UNIT, PREF_DEFAULTS[PREF.MEASURE_UNIT]);
const units = computed(() => bulkUnits(unitPref.value));
// The currency is a general setting (the Units tab)
const storedCurrency = usePreference(PREF.CURRENCY, PREF_DEFAULTS[PREF.CURRENCY]);
const currency = computed(() => normalizeCurrency(storedCurrency.value));

/** The settings as the stockpile panel reads them */
const settingsNow = computed(() => normalizeStockpileSettings(stored));
const rows = computed(() => resolveStockpileCatalog(settingsNow.value, currency.value));

/** `${slug}:${field}` -> why the value typed there is not stored */
const errors = reactive(/** @type {Record<string, string>} */ ({}));

/** @param {import('@/libs/stockpileMaterials').StockpileSettings} next */
function apply(next) {
    Object.assign(stored, next);
}

/** @param {{ densityTonPerM3: number, costPerTon: number }} row @param {'densityTonPerM3'|'costPerTon'} field */
const shownValue = (row, field) => shownMaterialValue(row[field], field, units.value);

/**
 * Store a value typed in the user's units. A value equal to the one shown is not stored again,
 * so a conversion back and forth never moves the stored value.
 * @param {import('@/libs/stockpileMaterials').CatalogMaterial} row
 * @param {'densityTonPerM3'|'costPerTon'} field
 * @param {number|null} typed
 */
function setValue(row, field, typed) {
    const key = `${row.slug}:${field}`;
    const value = typed === null || typed === undefined ? NaN : storedMaterialValue(typed, field, units.value);
    const valid = field === 'densityTonPerM3' ? isValidDensity(value) : isValidCost(value);
    if (!valid) {
        errors[key] = field === 'densityTonPerM3'
            ? `The density must be more than 0 and at most ${shownMaterialValue(MAX_DENSITY_TON_PER_M3, field, units.value)} ${units.value.density.unit}.`
            : 'The price must be 0 or more.';
        return;
    }
    delete errors[key];
    if (typed === shownValue(row, field)) return;
    apply(withMaterialValue(settingsNow.value, row.slug, field, value));
}

/** @param {import('@/libs/stockpileMaterials').CatalogMaterial} row @param {string} name */
function rename(row, name) {
    const key = `${row.slug}:name`;
    const problem = materialNameProblem(settingsNow.value, row.slug, name);
    if (problem) {
        errors[key] = problem;
        return;
    }
    delete errors[key];
    apply(withMaterialText(settingsNow.value, row.slug, 'name', name));
}

/** @param {import('@/libs/stockpileMaterials').CatalogMaterial} row */
function rowError(row) {
    return ['name', 'densityTonPerM3', 'costPerTon'].map(field => errors[`${row.slug}:${field}`]).find(Boolean) ?? null;
}

async function add() {
    const { settings, id } = withCustomMaterialAdded(settingsNow.value);
    if (!id) return;
    apply(settings);
    await nextTick();
    /** @type {HTMLInputElement|null} */ (document.getElementById(`material-name-${id}`))?.select();
}

/** @param {import('@/libs/stockpileMaterials').CatalogMaterial} row */
function remove(row) {
    for (const field of ['name', 'densityTonPerM3', 'costPerTon']) delete errors[`${row.slug}:${field}`];
    apply(withCustomMaterialRemoved(settingsNow.value, row.slug));
}

/** "Default: 1.68 t/m³, 15 USD/t" @param {import('@/libs/stockpileMaterials').CatalogMaterial} row */
function defaultsText(row) {
    const builtIn = builtInMaterial(row.slug);
    if (!builtIn) return '';
    const { density, perWeight } = units.value;
    return `Default: ${shownMaterialValue(builtIn.densityTonPerM3, 'densityTonPerM3', units.value)} ${density.unit}, `
        + `${shownMaterialValue(builtIn.costPerTon, 'costPerTon', units.value)} ${row.currency}/${perWeight.unit}`;
}
</script>

<style scoped>
.materials-table {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
}

/* Shown | Material | Density | Price | action */
.materials-row {
    display: grid;
    grid-template-columns: 3rem minmax(0, 1fr) 6.5rem 6.5rem 2.25rem;
    grid-template-areas: "shown name density price action";
    align-items: center;
    gap: 0.5rem;
    padding: 0.2rem 0;
    border-bottom: 1px solid var(--ddb-border);
}

.materials-head {
    font-size: var(--ddb-font-size-sm);
    color: var(--ddb-text-secondary);
    /* The column titles stay in view while the list scrolls in the window */
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--ddb-bg-surface);
    /* ... and cover the panel's top padding, which the rows would scroll through */
    box-shadow: 0 -1.25rem 0 0 var(--ddb-bg-surface);
}

.col-shown { grid-area: shown; }
.col-name { grid-area: name; min-width: 0; }
.col-density { grid-area: density; }
.col-price { grid-area: price; }
.col-action { grid-area: action; }

.materials-row.hidden .col-name,
.materials-row.hidden .col-density,
.materials-row.hidden .col-price {
    opacity: 0.55;
}

.material-name {
    color: var(--ddb-text);
}

.material-category {
    display: block;
    font-size: var(--ddb-font-size-sm);
    color: var(--ddb-text-secondary);
}

.edited-mark {
    margin-left: 0.4rem;
    font-size: var(--ddb-font-size-sm);
    color: var(--ddb-primary);
}

.name-input {
    width: 100%;
}

.col-density :deep(.p-inputnumber),
.col-price :deep(.p-inputnumber),
.col-density :deep(input),
.col-price :deep(input) {
    width: 100%;
    min-width: 0;
}

.row-error {
    grid-column: 1 / -1;
    font-size: var(--ddb-font-size-sm);
    color: var(--ddb-danger);
}

.materials-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-top: 0.75rem;
}

.materials-actions .pref-hint {
    margin: 0;
}

.pref-hint {
    margin: 0 0 0.75rem 0;
    font-size: var(--ddb-font-size-sm);
    color: var(--ddb-text-secondary);
}

/* A phone: the name on its own line, the values below it (the header follows the same grid) */
@media (max-width: 576px) {
    .materials-row {
        grid-template-columns: 3rem minmax(0, 1fr) minmax(0, 1fr) 2.25rem;
        grid-template-areas:
            "shown name name action"
            "shown density price action";
    }
}
</style>
