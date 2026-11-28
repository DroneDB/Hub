<template>
    <div class="rescale-fields" role="group" :aria-labelledby="labelledby || undefined" :data-testid="`${idPrefix}-fields`">
        <!-- Min and Max on one line; the row label names the group and each field has its own accessible name -->
        <div class="rescale-row">
            <input :id="`${idPrefix}-min`" v-model="minText" type="text" inputmode="decimal" autocomplete="off" class="panel-input rescale-input"
                   aria-label="Min" placeholder="auto" :disabled="disabled" :aria-invalid="shown.min ? 'true' : undefined"
                   :aria-describedby="shown.min ? `${idPrefix}-min-error` : undefined" data-testid="rescale-min"
                   @input="onInput" @change="commit">
            <span class="rescale-dash" aria-hidden="true">&ndash;</span>
            <input :id="`${idPrefix}-max`" v-model="maxText" type="text" inputmode="decimal" autocomplete="off" class="panel-input rescale-input"
                   aria-label="Max" placeholder="auto" :disabled="disabled" :aria-invalid="shown.max ? 'true' : undefined"
                   :aria-describedby="shown.max ? `${idPrefix}-max-error` : undefined" data-testid="rescale-max"
                   @input="onInput" @change="commit">
            <span v-if="unit" class="rescale-unit" data-testid="rescale-unit">{{ unit }}</span>
        </div>
        <!-- What the data holds, and one click to take it as the range -->
        <div v-if="hasDataRange" class="rescale-caption" data-testid="rescale-data-range">
            <span>Data <b class="rescale-data">{{ dataText }}</b></span>
            <!-- Only a range the fields accept can be fitted: a constant raster (min = max) has none -->
            <button v-if="canFit" type="button" class="rescale-fit" :disabled="disabled" data-testid="rescale-fit" @click="fitToData">Fit to data</button>
        </div>
        <!-- The refusal at its field; the map keeps the last valid range meanwhile -->
        <small v-if="shown.min" :id="`${idPrefix}-min-error`" class="rescale-error" role="alert" data-testid="rescale-min-error">{{ shown.min }}</small>
        <small v-if="shown.max" :id="`${idPrefix}-max-error`" class="rescale-error" role="alert" data-testid="rescale-max-error">{{ shown.max }}</small>
    </div>
</template>

<script>
import { rescaleErrors, rescaleValue, localiseRescale } from '@/libs/rescale';
import { formatNumber, localiseNumberText } from '@/libs/format';

/**
 * RescaleFields - the Rescale range of a raster panel as two number fields, Min and Max. the one Rescale input of RasterAnalysisControls and PlantHealthPanel.
 *
 * The user types numbers the way their locale writes them ("12,5" is 12.5). A range that is not two
 * numbers with Min below Max shows its error at the field and emits nothing, so the map keeps the
 * last valid range. A valid one is emitted as the machine value of the request, "min,max" with ".",
 * and both fields empty is the automatic range (''). `modelValue` is that value: when the panel
 * sets it (a stretch, the observed range) the fields follow, written in the user's locale like the
 * other numbers of the Hub; what the user typed stays as typed.
 *
 * With `dataRange` a caption shows the range of the data and "Fit to data" takes it as the range;
 * there is no Fit when the data has no range the fields accept (a constant raster, min = max).
 * `dataUnit` is the unit of the caption when it is not the unit of the fields.
 *
 * Emits update:modelValue with each valid range, and `commit` (the same value) when the user
 * finishes editing a field (change), which is when the panel applies it. Fit to data emits both, then
 * `fit` with the value, so that a panel can tell that the range is in the unit of the data.
 */
export default {
    name: 'RescaleFields',
    props: {
        modelValue: { type: String, default: '' },
        /** Prefix of the ids of the fields and their errors */
        idPrefix: { type: String, required: true },
        disabled: { type: Boolean, default: false },
        /** Unit written after Max, as muted text */
        unit: { type: String, default: '' },
        /** The range of the data, { min, max }: shown as a caption with a Fit to data button; null for none */
        dataRange: { type: Object, default: null },
        /** Unit of the data range in the caption; null for the unit of the fields */
        dataUnit: { type: String, default: null },
        /** Writes a number of the data range in the caption */
        formatValue: { type: Function, default: value => formatNumber(value) },
        /** The id of the label of the row, which names the group of the two fields */
        labelledby: { type: String, default: '' }
    },
    emits: ['update:modelValue', 'commit', 'invalid', 'fit'],
    data() {
        const { min, max } = localiseRescale(this.modelValue);
        return { minText: min, maxText: max, touched: false, lastEmitted: this.modelValue || '' };
    },
    computed: {
        errors() {
            return rescaleErrors(this.minText, this.maxText);
        },
        // Nothing is said before the user touches a field (a range set by the panel is valid)
        shown() {
            return this.touched ? this.errors : { min: null, max: null };
        },
        // A range is two numbers: anything else (a range not read, a NaN) has no caption
        hasDataRange() {
            return !!this.dataRange && Number.isFinite(this.dataRange.min) && Number.isFinite(this.dataRange.max);
        },
        // Fit commits the data range, so it is offered only for a range the fields accept (Min below Max)
        canFit() {
            return this.hasDataRange && this.dataRange.min < this.dataRange.max;
        },
        dataText() {
            const unit = this.dataUnit ?? this.unit;
            return `${this.formatValue(this.dataRange.min)} \u2013 ${this.formatValue(this.dataRange.max)}${unit ? ` ${unit}` : ''}`;
        }
    },
    watch: {
        // The panel set a new range (a stretch, a reset): the fields show it, unless it is what they have just emitted
        modelValue(value) {
            if ((value || '') === this.lastEmitted) return;
            const { min, max } = localiseRescale(value);
            this.minText = min;
            this.maxText = max;
            this.lastEmitted = value || '';
            this.touched = false;
        }
    },
    methods: {
        onInput() {
            this.touched = true;
            const value = rescaleValue(this.minText, this.maxText);
            if (value === null) {
                this.$emit('invalid', this.errors);
                return;
            }
            this.lastEmitted = value;
            this.$emit('update:modelValue', value);
        },
        // The range of the data goes into the fields as a stretch of the panel does, in the user's locale
        fitToData() {
            if (!this.canFit) return;
            this.minText = localiseNumberText(String(this.dataRange.min));
            this.maxText = localiseNumberText(String(this.dataRange.max));
            const value = this.commit();
            if (value !== null) this.$emit('fit', value);
        },
        commit() {
            this.touched = true;
            const value = rescaleValue(this.minText, this.maxText);
            if (value === null) {
                this.$emit('invalid', this.errors);
                return null;
            }
            this.lastEmitted = value;
            this.$emit('update:modelValue', value);
            this.$emit('commit', value);
            return value;
        }
    }
};
</script>

<style scoped>
.rescale-row {
    display: flex;
    align-items: center;
    gap: 0.375rem;
}

/* Two fields share the line with the dash and the unit, so each shrinks to fit a narrow column */
.rescale-input {
    flex: 1 1 0;
    min-width: 0;
    text-align: right;
    font-variant-numeric: tabular-nums;
}

.rescale-dash {
    flex: none;
    color: var(--panel-muted, var(--ddb-text-muted));
}

.rescale-unit {
    flex: none;
    min-width: 0.9rem;
    font-size: 0.8125rem;
    color: var(--panel-muted, var(--ddb-text-muted));
}

.rescale-caption {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.25rem;
    font-size: 12px;
    color: var(--panel-muted, var(--ddb-text-muted));
}

.rescale-data {
    font-weight: 600;
    color: var(--panel-accent);
}

.rescale-fit {
    flex: none;
    padding: 0;
    border: 0;
    background: none;
    font: inherit;
    color: var(--panel-accent);
    text-decoration: underline;
    text-underline-offset: 2px;
    cursor: pointer;
}

.rescale-fit:disabled {
    opacity: 0.5;
    cursor: default;
}

.rescale-error {
    display: block;
    margin-top: 0.2rem;
    color: var(--ddb-danger);
}
</style>
