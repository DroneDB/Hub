<template>
    <Dialog :visible="visible"
            @update:visible="onVisibleChange"
            modal
            header="Generate Contour Lines"
            :style="{ width: '460px' }"
            :draggable="false"
            :closable="!loading"
            :closeOnEscape="!loading">

        <!-- Full-dialog loading overlay – teleported above the PrimeVue dialog z-index -->
        <Teleport to="body">
            <div v-if="loading && visible" class="contour-gen-overlay">
                <div class="contour-gen-spinner">
                    <i class="fas fa-spinner fa-spin fa-2x"></i>
                    <span>Generating contour lines…</span>
                </div>
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
                <label class="form-label">Spacing</label>
                <div class="mode-toggle">
                    <label>
                        <input type="radio" value="interval" v-model="mode" />
                        Fixed interval
                    </label>
                    <label>
                        <input type="radio" value="count" v-model="mode" />
                        Target count
                    </label>
                </div>
            </div>

            <!-- Interval -->
            <div class="form-row" v-if="mode === 'interval'">
                <label class="form-label">Interval ({{ unit || 'units' }})</label>
                <InputNumber v-model="interval"
                             :min="0.0001"
                             :max-fraction-digits="4"
                             :min-fraction-digits="0"
                             showButtons buttonLayout="horizontal" :step="1"
                             class="form-input" />
            </div>

            <!-- Count -->
            <div class="form-row" v-else>
                <label class="form-label">Number of levels</label>
                <InputNumber v-model="count"
                             :min="2" :max="500"
                             showButtons buttonLayout="horizontal" :step="1"
                             class="form-input" />
                <small class="form-hint" v-if="rangeHint">
                    Spacing ≈ {{ rangeHint }} {{ unit || '' }}
                </small>
            </div>

            <!-- Base offset -->
            <div class="form-row">
                <label class="form-label">Base elevation</label>
                <InputNumber v-model="baseOffset"
                             :max-fraction-digits="3"
                             showButtons buttonLayout="horizontal" :step="1"
                             class="form-input" />
            </div>

            <!-- Min/max clipping -->
            <div class="form-row two-cols">
                <div>
                    <label class="form-label">Min elevation</label>
                    <InputNumber v-model="minElev"
                                 :max-fraction-digits="3"
                                 :placeholder="rasterMin != null ? String(rasterMin) : ''"
                                 class="form-input" />
                </div>
                <div>
                    <label class="form-label">Max elevation</label>
                    <InputNumber v-model="maxElev"
                                 :max-fraction-digits="3"
                                 :placeholder="rasterMax != null ? String(rasterMax) : ''"
                                 class="form-input" />
                </div>
            </div>

            <!-- Simplification -->
            <div class="form-row">
                <label class="form-label">Simplification tolerance (raster CRS units)</label>
                <InputNumber v-model="simplifyTolerance"
                             :min="0"
                             :max-fraction-digits="4"
                             showButtons buttonLayout="horizontal" :step="0.5"
                             class="form-input" />
                <small class="form-hint">0 disables simplification.</small>
            </div>

            <!-- Validation error -->
            <div class="form-error" v-if="validationError">
                <i class="fas fa-exclamation-triangle"></i> {{ validationError }}
            </div>
        </div>

        <template #footer>
            <Button label="Cancel" icon="fas fa-times" severity="secondary" text
                    :disabled="loading"
                    @click="onCancel" />
            <Button :label="loading ? 'Generating...' : 'Generate'"
                    :icon="loading ? 'fas fa-spinner fa-spin' : 'fas fa-check'"
                    :disabled="loading || !!validationError"
                    @click="onGenerate" />
        </template>
    </Dialog>
</template>

<script>
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import InputNumber from 'primevue/inputnumber';

export default {
    name: 'ContourOptionsDialog',
    components: { Dialog, Button, InputNumber },
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
            if (this.validationError) return;
            this.$emit('generate', this.buildPayload());
        },
        onCancel() {
            this.$emit('cancel');
            this.$emit('update:visible', false);
        },
        onVisibleChange(v) {
            this.$emit('update:visible', v);
            if (!v) this.$emit('cancel');
        }
    }
};
</script>

<style>
/* Global (not scoped) — the Teleport overlay renders outside this component's root */
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
    color: #444;
    font-size: 0.95rem;
    font-weight: 500;
}
</style>

<style scoped>
.contour-dialog-body {
    display: flex;
    flex-direction: column;
    gap: 12px;
    font-size: 0.9rem;
}

.dialog-help {
    margin: 0 0 8px 0;
    color: #666;
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
    color: #444;
}

.form-hint {
    color: #888;
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
    color: #c62828;
    font-size: 0.82rem;
    background: #ffebee;
    padding: 6px 10px;
    border-radius: 4px;
}
</style>
