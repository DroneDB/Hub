<template>
    <Window id="contour-options" :visible="visible" title="Generate Contour Lines" modal fixed-position
            width="460px" max-width="95vw" height="auto" :busy="loading"
            confirm-label="Generate" confirm-icon="fas fa-check" :confirm-disabled="!!validationError"
            @update:visible="$emit('update:visible', $event)" @close="$emit('cancel')" @confirm="onGenerate">
        <!-- Full-page overlay while generating, above the dialog -->
        <Teleport to="body">
            <div v-if="loading && visible" class="contour-gen-overlay">
                <LoadingSpinner class="contour-gen-spinner" size="lg" label="Generating contour lines…" />
            </div>
        </Teleport>

        <div class="contour-dialog-body">
            <p class="dialog-help">
                Generate contour lines from this elevation raster. They will be added to the
                measurements layer; click <b>Save</b> on the measurement toolbar to persist them.
                Generating again replaces the unsaved contours.
            </p>

            <!-- Mode toggle -->
            <div class="form-row">
                <span id="contour-spacing-label" class="form-label">Spacing</span>
                <div class="mode-toggle" role="radiogroup" aria-labelledby="contour-spacing-label">
                    <label>
                        <input v-model="mode" type="radio" value="interval">
                        Fixed interval
                    </label>
                    <label>
                        <input v-model="mode" type="radio" value="count">
                        Target count
                    </label>
                </div>
            </div>

            <!-- Interval -->
            <div v-if="mode === 'interval'" class="form-row">
                <label for="contour-options-dialog-interval" class="form-label">Interval ({{ unit || 'units' }})</label>
                <InputNumber v-model="interval" input-id="contour-options-dialog-interval"
                             :min="0.0001"
                             :max-fraction-digits="4"
                             :min-fraction-digits="0"
                             show-buttons button-layout="horizontal" :step="1"
                             class="form-input" />
            </div>

            <!-- Count -->
            <div v-else class="form-row">
                <label for="contour-options-dialog-number-of-levels" class="form-label">Number of levels</label>
                <InputNumber v-model="count" input-id="contour-options-dialog-number-of-levels"
                             :min="2" :max="500"
                             show-buttons button-layout="horizontal" :step="1"
                             class="form-input" />
                <small v-if="rangeHint" class="form-hint">
                    Spacing ≈ {{ rangeHint }} {{ unit || '' }}
                </small>
            </div>

            <!-- Base offset -->
            <div class="form-row">
                <label for="contour-options-dialog-base-elevation" class="form-label">Base elevation</label>
                <InputNumber v-model="baseOffset" input-id="contour-options-dialog-base-elevation"
                             :max-fraction-digits="3"
                             show-buttons button-layout="horizontal" :step="1"
                             class="form-input" />
            </div>

            <!-- Min/max clipping -->
            <div class="form-row two-cols">
                <div>
                    <label for="contour-options-dialog-min-elevation" class="form-label">Min elevation</label>
                    <InputNumber v-model="minElev" input-id="contour-options-dialog-min-elevation"
                                 :max-fraction-digits="3"
                                 :placeholder="rasterMin != null ? String(rasterMin) : ''"
                                 class="form-input" />
                </div>
                <div>
                    <label for="contour-options-dialog-max-elevation" class="form-label">Max elevation</label>
                    <InputNumber v-model="maxElev" input-id="contour-options-dialog-max-elevation"
                                 :max-fraction-digits="3"
                                 :placeholder="rasterMax != null ? String(rasterMax) : ''"
                                 class="form-input" />
                </div>
            </div>

            <!-- Simplification -->
            <div class="form-row">
                <label for="contour-options-dialog-simplification-tolerance" class="form-label">Simplification tolerance (raster CRS units)</label>
                <InputNumber v-model="simplifyTolerance" input-id="contour-options-dialog-simplification-tolerance"
                             :min="0"
                             :max-fraction-digits="4"
                             show-buttons button-layout="horizontal" :step="0.5"
                             class="form-input" />
                <small class="form-hint">0 disables simplification.</small>
            </div>

            <!-- Validation error -->
            <div v-if="validationError" class="form-error">
                <i class="fas fa-exclamation-triangle" /> {{ validationError }}
            </div>
        </div>

    </Window>
</template>

<script>
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import Window from '@/components/HubWindow.vue';
import InputNumber from 'primevue/inputnumber';

export default {
    name: 'ContourOptionsDialog',
    components: { Window, InputNumber, LoadingSpinner },
    props: {
        visible: { type: Boolean, default: false },
        loading: { type: Boolean, default: false },
        unit: { type: String, default: '' },
        rasterMin: { type: Number, default: null },
        rasterMax: { type: Number, default: null },
        // Last-used parameters so the dialog re-opens with prior values.
        initialOptions: { type: Object, default: null }
    },
    emits: ['update:visible', 'generate', 'cancel'],
    data() {
        return {
            mode: 'interval',
            interval: 1,
            count: 20,
            baseOffset: 0,
            minElev: null,
            maxElev: null,
            simplifyTolerance: 0
        };
    },
    computed: {
        rangeHint() {
            if (this.mode !== 'count') return null;
            if (this.rasterMin == null || this.rasterMax == null) return null;
            if (!this.count || this.count <= 0) return null;
            const r = this.rasterMax - this.rasterMin;
            if (!(r > 0)) return null;
            return (r / this.count).toFixed(3);
        },
        validationError() {
            if (this.mode === 'interval') {
                if (!(this.interval > 0)) return 'Interval must be greater than 0.';
            } else {
                if (!(this.count >= 2)) return 'Count must be at least 2.';
            }
            if (this.minElev != null && this.maxElev != null
                && Number(this.minElev) >= Number(this.maxElev)) {
                return 'Min elevation must be less than max elevation.';
            }
            if (this.simplifyTolerance != null && this.simplifyTolerance < 0) {
                return 'Simplification tolerance must be >= 0.';
            }
            return null;
        }
    },
    watch: {
        visible(val) {
            if (val) this.applyInitial();
        }
    },
    methods: {
        applyInitial() {
            const o = this.initialOptions || {};
            if (o.interval != null && o.interval > 0) {
                this.mode = 'interval';
                this.interval = o.interval;
            } else if (o.count != null) {
                this.mode = 'count';
                this.count = o.count;
            }
            if (o.baseOffset != null) this.baseOffset = o.baseOffset;
            if (o.minElev != null) this.minElev = o.minElev;
            if (o.maxElev != null) this.maxElev = o.maxElev;
            if (o.simplifyTolerance != null) this.simplifyTolerance = o.simplifyTolerance;
        },
        buildPayload() {
            return {
                interval: this.mode === 'interval' ? Number(this.interval) : null,
                count: this.mode === 'count' ? Number(this.count) : null,
                baseOffset: Number(this.baseOffset || 0),
                minElev: this.minElev != null && this.minElev !== '' ? Number(this.minElev) : null,
                maxElev: this.maxElev != null && this.maxElev !== '' ? Number(this.maxElev) : null,
                simplifyTolerance: Number(this.simplifyTolerance || 0)
            };
        },
        onGenerate() {
            if (this.validationError || this.loading) return;
            this.$emit('generate', this.buildPayload());
        }
    }
};
</script>

<style scoped>
/* Teleported, still scoped: the overlay is this template's */
.contour-gen-overlay {
    position: fixed;
    inset: 0;
    z-index: 10010; /* above PrimeVue Dialog z-index (~1000-3000) */
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: all;
    cursor: wait;
}

.contour-gen-spinner {
    background: rgba(255, 255, 255, 0.96);
    border-radius: 8px;
    padding: 2rem 3rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.25);
    color: var(--ddb-text-secondary);
    font-size: 0.95rem;
    font-weight: 500;
}

.contour-dialog-body {
    display: flex;
    flex-direction: column;
    gap: 12px;
    font-size: 0.9rem;
}

.dialog-help {
    margin: 0 0 8px 0;
    color: var(--ddb-text-secondary);
    font-size: 0.85rem;
    line-height: 1.4;
}

.form-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.form-row.two-cols {
    flex-direction: row;
    gap: 12px;
}

.form-row.two-cols > div {
    flex: 1;
}

.form-label {
    font-weight: 600;
    font-size: 0.82rem;
    color: var(--ddb-text-secondary);
}

.form-hint {
    color: var(--ddb-text-muted);
    font-size: 0.78rem;
}

.form-input {
    width: 100%;
}

.form-input :deep(input) {
    width: 100%;
}

.mode-toggle {
    display: flex;
    gap: 16px;
}

.mode-toggle label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: normal;
    cursor: pointer;
}

.form-error {
    color: var(--ddb-danger);
    font-size: 0.82rem;
    background: var(--ddb-danger-bg);
    padding: 6px 10px;
    border-radius: 4px;
}
</style>
