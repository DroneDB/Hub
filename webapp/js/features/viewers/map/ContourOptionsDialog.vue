<template>
    <Window id="contour-options" :visible="visible" title="Generate Contour Lines" modal fixed-position
            width="460px" max-width="95vw" height="auto" :busy="loading"
            confirm-label="Generate" confirm-icon="fas fa-check" :confirm-disabled="!!validationError"
            @update:visible="$emit('update:visible', $event)" @close="$emit('cancel')" @confirm="onGenerate">
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

            <!-- A long run: the levels it will draw (FR-RAS-11); Generate asks before it starts -->
            <div v-if="levelsWarning" class="form-warning" role="status" data-testid="contour-levels-warning">
                <i class="fas fa-exclamation-triangle" aria-hidden="true" /> {{ levelsWarning }}
            </div>

            <!-- Validation error -->
            <div v-if="validationError" class="form-error">
                <i class="fas fa-exclamation-triangle" /> {{ validationError }}
            </div>

            <!-- The request was refused, or its result could not be read: there is no task to say it -->
            <div v-if="error" class="form-error" role="alert" data-testid="contour-error">
                <i class="fas fa-exclamation-triangle" /> {{ error }}
            </div>

            <!-- The task: queued, running with its progress and a Cancel, failed with its reason, cancelled (FR-XC-15) -->
            <HeavyTaskStatus :task="task" label="Contours" cancellable :cancelling="cancelling"
                             @cancel="cancelHeavyTask($event, 'Contour lines')" />
        </div>
        <DialogHost :dialogs="dialogs" />
    </Window>
</template>

<script>
import HeavyTaskStatus from '@/components/HeavyTaskStatus.vue';
import DialogHost from '@/components/DialogHost.vue';
import Window from '@/components/HubWindow.vue';
import InputNumber from 'primevue/inputnumber';
import { useDialogs } from '@/composables/useDialogs';
import { useConfirm } from '@/composables/useConfirm';
import { useHeavyTaskCancel } from '@/composables/useHeavyTaskCancel';
import { contourLevelsWarning, estimateContourLevels } from '@/libs/map/contourTask';

/**
 * ContourOptionsDialog - the options of the contour lines. Generate starts the task `raster-contours` (the host runs it,
 * useContourLines): the dialog shows the task with HeavyTaskStatus, its progress and its Cancel, and stays open until the
 * lines are on the map. Before a run of more than 50 levels ((max - min) / interval, or the number of levels asked for) it
 * shows the estimate and asks to confirm.
 */
export default {
    name: 'ContourOptionsDialog',
    components: { Window, InputNumber, HeavyTaskStatus, DialogHost },
    props: {
        visible: { type: Boolean, default: false },
        // A request is running (its task): the dialog cannot be closed, the task has its Cancel
        loading: { type: Boolean, default: false },
        unit: { type: String, default: '' },
        rasterMin: { type: Number, default: null },
        rasterMax: { type: Number, default: null },
        // Last-used parameters so the dialog re-opens with prior values.
        initialOptions: { type: Object, default: null },
        // The dataset of the task, to cancel it
        dataset: { type: Object, default: null },
        // The live entry of the task of the latest request (useHeavyTask)
        task: { type: Object, default: null },
        // Why the latest request has no task: it was refused, or its result could not be read
        error: { type: String, default: '' }
    },
    emits: ['update:visible', 'generate', 'cancel'],
    setup(props) {
        const dialogs = useDialogs();
        const { cancelHeavyTask, cancelling } = useHeavyTaskCancel(() => props.dataset, dialogs);
        return { dialogs, confirm: useConfirm(dialogs), cancelHeavyTask, cancelling };
    },
    data() {
        return {
            mode: 'interval',
            interval: 1,
            count: 20,
            baseOffset: 0,
            minElev: null,
            maxElev: null,
            simplifyTolerance: 0,
            // The question before a long run is open
            asking: false
        };
    },
    computed: {
        // The levels the request draws (interval mode: the range of the raster over the interval)
        levels() {
            return estimateContourLevels({
                interval: this.mode === 'interval' ? Number(this.interval) : null,
                count: this.mode === 'count' ? Number(this.count) : null,
                minElev: this.minElev, maxElev: this.maxElev
            }, { min: this.rasterMin, max: this.rasterMax });
        },
        // A fixed interval and a target count alike ask above 50 levels (a count asks for its own number)
        levelsWarning() {
            return contourLevelsWarning(this.levels, this.mode === 'count' ? 'count' : 'interval');
        },
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
        async onGenerate() {
            if (this.validationError || this.loading || this.asking) return;
            if (this.levelsWarning) {
                this.asking = true;
                const confirmed = await this.confirm({
                    title: 'Generate many contour lines?',
                    message: this.levelsWarning,
                    confirmText: 'Generate',
                    cancelText: 'Change settings'
                }).finally(() => { this.asking = false; });
                if (!confirmed) return;
            }
            this.$emit('generate', this.buildPayload());
        }
    }
};
</script>

<style scoped>
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

.form-warning {
    color: var(--ddb-warning-text);
    font-size: 0.82rem;
    background: var(--ddb-warning-bg);
    padding: 6px 10px;
    border-radius: 4px;
}

.form-error {
    color: var(--ddb-danger);
    font-size: 0.82rem;
    background: var(--ddb-danger-bg);
    padding: 6px 10px;
    border-radius: 4px;
}
</style>
