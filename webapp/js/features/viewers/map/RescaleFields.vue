<template>
    <div class="rescale-fields" :data-testid="`${idPrefix}-fields`">
        <div class="rescale-row">
            <label :for="`${idPrefix}-min`" class="rescale-label">
                <span>Min</span>
                <input :id="`${idPrefix}-min`" v-model="minText" type="text" inputmode="decimal" autocomplete="off" class="panel-input"
                       placeholder="auto" :disabled="disabled" :aria-invalid="shown.min ? 'true' : undefined"
                       :aria-describedby="shown.min ? `${idPrefix}-min-error` : undefined" data-testid="rescale-min"
                       @input="onInput" @change="commit">
            </label>
            <label :for="`${idPrefix}-max`" class="rescale-label">
                <span>Max</span>
                <input :id="`${idPrefix}-max`" v-model="maxText" type="text" inputmode="decimal" autocomplete="off" class="panel-input"
                       placeholder="auto" :disabled="disabled" :aria-invalid="shown.max ? 'true' : undefined"
                       :aria-describedby="shown.max ? `${idPrefix}-max-error` : undefined" data-testid="rescale-max"
                       @input="onInput" @change="commit">
            </label>
        </div>
        <!-- The refusal at its field; the map keeps the last valid range meanwhile (FR-RAS-10, FR-RAS-20) -->
        <small v-if="shown.min" :id="`${idPrefix}-min-error`" class="rescale-error" role="alert" data-testid="rescale-min-error">{{ shown.min }}</small>
        <small v-if="shown.max" :id="`${idPrefix}-max-error`" class="rescale-error" role="alert" data-testid="rescale-max-error">{{ shown.max }}</small>
    </div>
</template>

<script>
import { rescaleErrors, rescaleValue, splitRescale } from '@/libs/rescale';

/**
 * RescaleFields - the Rescale range of a raster panel as two number fields, Min and Max (FR-RAS-10,
 * FR-RAS-20, D-025). It is the one Rescale input of RasterAnalysisControls and PlantHealthPanel.
 *
 * The user types numbers the way their locale writes them ("12,5" is 12.5). A range that is not two
 * numbers with Min below Max shows its error at the field and emits nothing, so the map keeps the
 * last valid range. A valid one is emitted as the machine value of the request, "min,max" with ".",
 * and both fields empty is the automatic range (''). `modelValue` is that value: when the panel
 * sets it (a stretch, the observed range) the fields follow.
 *
 * Emits update:modelValue with each valid range, and `commit` (the same value) when the user
 * finishes editing a field (change), which is when the panel applies it.
 */
export default {
    name: 'RescaleFields',
    props: {
        modelValue: { type: String, default: '' },
        /** Prefix of the ids of the fields and their errors */
        idPrefix: { type: String, required: true },
        disabled: { type: Boolean, default: false }
    },
    emits: ['update:modelValue', 'commit', 'invalid'],
    data() {
        const { min, max } = splitRescale(this.modelValue);
        return { minText: min, maxText: max, touched: false, lastEmitted: this.modelValue || '' };
    },
    computed: {
        errors() {
            return rescaleErrors(this.minText, this.maxText);
        },
        // Nothing is said before the user touches a field (a range set by the panel is valid)
        shown() {
            return this.touched ? this.errors : { min: null, max: null };
        }
    },
    watch: {
        // The panel set a new range (a stretch, a reset): the fields show it, unless it is what they have just emitted
        modelValue(value) {
            if ((value || '') === this.lastEmitted) return;
            const { min, max } = splitRescale(value);
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
        commit() {
            this.touched = true;
            const value = rescaleValue(this.minText, this.maxText);
            if (value === null) {
                this.$emit('invalid', this.errors);
                return;
            }
            this.lastEmitted = value;
            this.$emit('update:modelValue', value);
            this.$emit('commit', value);
        }
    }
};
</script>

<style scoped>
.rescale-row {
    display: flex;
    gap: 0.5rem;
}

.rescale-label {
    flex: 1 1 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    font-size: 0.75rem;
}

.rescale-error {
    display: block;
    margin-top: 0.2rem;
    color: var(--ddb-danger);
}
</style>
