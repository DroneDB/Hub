<template>
    <Window title="Align GeoTIFF to Reference" id="align-georaster" @onClose="close" modal width="600px" height="auto" fixedPosition>
        <div class="align-dialog">
            <!-- Source (read-only) -->
            <div class="section">
                <label class="section-label">Source file</label>
                <InputText :modelValue="sourceEntry.entry.path" readonly fluid class="w-100" />
            </div>

            <!-- Reference picker -->
            <div class="section">
                <label class="section-label">Reference GeoTIFF</label>
                <Select v-model="selectedReference" :options="referenceOptions" optionLabel="label" optionValue="value"
                    placeholder="Select reference..." class="w-100" fluid @change="onReferenceChange" />
                <small v-if="referenceOptions.length === 0" class="hint-error">
                    No other GeoTIFF in this dataset to use as reference.
                </small>
            </div>

            <!-- Mode -->
            <div class="section">
                <label class="section-label">Alignment mode</label>
                <Select v-model="mode" :options="modeOptions" optionLabel="label" optionValue="value" class="w-100" fluid />
            </div>

            <!-- Output name -->
            <div class="section">
                <label class="section-label">Output file name</label>
                <InputText v-model="outputName" fluid class="w-100" :invalid="!isOutputValid"
                    @input="validateOutputName" placeholder="aligned.tif" />
                <small v-if="outputNameError" class="hint-error">{{ outputNameError }}</small>
            </div>

            <!-- Validation result -->
            <div v-if="validating" class="status-info">
                <i class="fa-solid fa-spinner fa-spin"></i> Validating...
            </div>
            <div v-else-if="validationResult">
                <div v-if="!validationResult.ok" class="result-msg error">
                    {{ (validationResult.errors || []).join('; ') }}
                </div>
                <div v-else-if="(validationResult.warnings || []).length" class="result-msg warn">
                    {{ validationResult.warnings.join('; ') }}
                </div>
                <div v-else class="result-msg ok">
                    Compatible - Overlap: {{ fmt(validationResult.summary && validationResult.summary.overlapPercent, 1) }}%,
                    GSD {{ fmt(validationResult.summary && validationResult.summary.sourceGsdM, 3) }} m
                </div>
            </div>

            <!-- Align task progress -->
            <div v-if="alignTaskId" class="task-row" :class="alignTaskState">
                <i :class="taskIcon(alignTaskState)"></i>
                <span class="task-label">Align</span>
                <span class="task-phase">{{ alignPhase || alignTaskState }}</span>
                <span v-if="alignPct !== null" class="task-pct">{{ alignPct }}%</span>
            </div>

            <!-- Build task progress -->
            <div v-if="buildTaskId" class="task-row" :class="buildTaskState">
                <i :class="taskIcon(buildTaskState)"></i>
                <span class="task-label">Build</span>
                <span class="task-phase">{{ buildPhase || buildTaskState }}</span>
                <span v-if="buildPct !== null" class="task-pct">{{ buildPct }}%</span>
            </div>

            <!-- Align result (parsed from log tail) -->
            <div v-if="alignResult" class="result-msg ok">
                Aligned - tx={{ fmt(alignResult.tx, 3) }} m,
                ty={{ fmt(alignResult.ty, 3) }} m,
                θ={{ fmt(alignResult.thetaDeg, 3) }}°,
                s={{ fmt(alignResult.scale, 5) }},
                conf={{ fmt(alignResult.confidence, 2) }}
                <span v-if="alignResult.warning"> - {{ alignResult.warning }}</span>
            </div>

            <!-- Error -->
            <div v-if="errorMsg" class="result-msg error">{{ errorMsg }}</div>

            <!-- Actions -->
            <div class="actions">
                <Button label="Validate" icon="fa-solid fa-check" severity="secondary"
                    :disabled="!selectedReference || validating || running" @click="validate" />
                <Button label="Align" icon="fa-solid fa-crosshairs" severity="primary"
                    :disabled="!canAlign" @click="startAlign" />
                <Button label="Close" severity="secondary" :disabled="running" @click="close" />
            </div>
        </div>
    </Window>
</template>

<script>
import ddb from 'ddb';
import Window    from '@/components/Window.vue';
import Button    from 'primevue/button';
import InputText from 'primevue/inputtext';
import Select    from 'primevue/select';
import useHeavyTask from '@/composables/useHeavyTask';

export default {
    name: 'AlignDialog',
    components: { Window, Button, InputText, Select },
    mixins: [useHeavyTask],

    props: {
        sourceEntry: { type: Object, required: true },
        dataset:     { type: Object, required: true },
        allEntries:  { type: Array,  required: true }
    },
    emits: ['onClose'],

    data() {
        const stem = (this.sourceEntry?.entry?.path ?? 'output').replace(/\.tiff?$/i, '');
        return {
            mode: 'similarity',
            modeOptions: [
                { label: 'Similarity (tx, ty, rotation, scale)', value: 'similarity' },
                { label: 'Translation only (fast, no rotation)',  value: 'translation' }
            ],
            selectedReference: null,
            outputName: stem + '_aligned.tif',
            outputNameError: null,

            validating:       false,
            validationResult: null,

            running:        false,
            alignTaskId:    null,
            alignTaskState: null,
            alignPhase:     null,
            alignPct:       null,
            buildTaskId:    null,
            buildTaskState: null,
            buildPhase:     null,
            buildPct:       null,

            alignResult: null,
            errorMsg:    null
        };
    },

    computed: {
        referenceOptions() {
            const srcPath = this.sourceEntry.entry.path;
            return this.allEntries
                .filter(e => e.entry &&
                    e.entry.path !== srcPath &&
                    e.entry.type === ddb.entry.type.GEORASTER &&
                    /\.tiff?$/i.test(e.entry.path))
                .map(e => ({ label: e.entry.path, value: e.entry.path }));
        },
        isOutputValid() {
            return this.outputName.trim().length > 0 && !this.outputNameError;
        },
        canAlign() {
            return this.isOutputValid &&
                !!this.selectedReference &&
                this.validationResult != null &&
                this.validationResult.ok &&
                !this.validating &&
                !this.running;
        }
    },

    methods: {
        fmt(v, digits) {
            return typeof v === 'number' ? v.toFixed(digits) : '-';
        },

        taskIcon(state) {
            if (!state || state === 'Enqueued' || state === 'Reused') return 'fa-solid fa-clock';
            if (state === 'Processing') return 'fa-solid fa-spinner fa-spin';
            if (state === 'Succeeded') return 'fa-solid fa-check';
            if (state === 'Failed')    return 'fa-solid fa-xmark';
            return 'fa-solid fa-clock';
        },

        onReferenceChange() {
            this.validationResult = null;
            this.alignResult      = null;
            this.errorMsg         = null;
        },

        validateOutputName() {
            this.outputNameError = null;
            const name = this.outputName.trim();
            if (!name) { this.outputNameError = 'Output filename is required'; return; }
            if (name.includes('\\') || name.includes('..')) { this.outputNameError = 'Invalid characters'; return; }
            if (name.startsWith('/')) { this.outputNameError = 'Path must be relative'; return; }
            if (!/\.tiff?$/i.test(name)) this.outputNameError = 'Output must have .tif extension';
        },

        async validate() {
            this.validating       = true;
            this.validationResult = null;
            this.alignResult      = null;
            this.errorMsg         = null;
            try {
                const result = await this.dataset.validateAlignRaster(
                    this.sourceEntry.entry.path, this.selectedReference);
                this.validationResult = typeof result === 'string' ? JSON.parse(result) : result;
            } catch (e) {
                this.errorMsg = e?.message ?? String(e);
            } finally {
                this.validating = false;
            }
        },

        /** Finds the last JSON line in logTail that contains a 'success' boolean field.
         *  Strips the Hangfire log timestamp prefix if present (e.g. "[14:22:01] {...}"). */
        _extractResultFromLog(logTail) {
            if (!Array.isArray(logTail)) return null;
            for (let i = logTail.length - 1; i >= 0; i--) {
                try {
                    // Strip leading timestamp like "[14:22:01] " if present
                    const line = logTail[i].replace(/^\[\d{2}:\d{2}:\d{2}\] /, '').trim();
                    const j = JSON.parse(line);
                    if (typeof j.success === 'boolean') return j;
                } catch (_) { /* not JSON, skip */ }
            }
            return null;
        },

        async startAlign() {
            if (!this.canAlign) return;
            this.running     = true;
            this.errorMsg    = null;
            this.alignResult = null;

            const outputPath = this.outputName.trim();

            // ── Step 1: align-raster heavy task ───────────────────────────────
            try {
                const alignEntry = await this.runHeavyTask(this.dataset, 'align-raster', {
                    params: {
                        sourcePath:    this.sourceEntry.entry.path,
                        referencePath: this.selectedReference,
                        outputPath,
                        mode: this.mode
                    },
                    force:  true,
                    notify: false,
                    onProgress: (entry) => {
                        this.alignTaskId    = entry.taskId;
                        this.alignTaskState = entry.state;
                        this.alignPhase     = entry.phase;
                        this.alignPct       = entry.percent ?? null;
                    }
                });
                this.alignTaskId    = alignEntry.taskId;
                this.alignTaskState = alignEntry.state;
                this.alignPhase     = alignEntry.phase;
                this.alignPct       = 100;
                this.alignResult    = this._extractResultFromLog(alignEntry.logTail);
            } catch (e) {
                this.alignTaskState = 'Failed';
                this.errorMsg       = e?.message ?? String(e);
                this.running        = false;
                return;
            }

            // ── Step 2: build task (separate, consequence of the add) ──────────
            try {
                const buildEntry = await this.runHeavyTask(this.dataset, 'build', {
                    path:   outputPath,
                    params: { path: outputPath, force: false },
                    force:  false,
                    notify: false,
                    onProgress: (entry) => {
                        this.buildTaskId    = entry.taskId;
                        this.buildTaskState = entry.state;
                        this.buildPhase     = entry.phase;
                        this.buildPct       = entry.percent ?? null;
                    }
                });
                this.buildTaskId    = buildEntry.taskId;
                this.buildTaskState = buildEntry.state;
                this.buildPhase     = buildEntry.phase;
                this.buildPct       = 100;
            } catch (e) {
                this.buildTaskState = 'Failed';
                // Build failure is non-blocking: aligned file is already indexed.
                if (!this.errorMsg)
                    this.errorMsg = `Alignment complete but build failed: ${e?.message ?? String(e)}`;
            } finally {
                this.running = false;
            }

            // Notify parent to refresh file browser
            if (this.alignTaskState === 'Succeeded') {
                this.$emit('onClose', 'aligned', { outputPath });
            }
        },

        close() {
            this.$emit('onClose', 'close');
        }
    }
};
</script>

<style scoped>
.align-dialog {
    min-width: 380px;
    display: flex;
    flex-direction: column;
    gap: 0;
}

.section {
    margin-bottom: 0.75rem;
}

.section-label {
    display: block;
    font-weight: 600;
    margin-bottom: 0.35rem;
    font-size: 0.85rem;
}

.w-100 { width: 100%; }

.hint-error {
    display: block;
    margin-top: 0.25rem;
    color: var(--p-red-500);
    font-size: 0.8rem;
}

.status-info {
    margin: 0.5rem 0;
    font-size: 0.9rem;
    color: var(--p-text-muted-color);
}

.result-msg {
    margin: 0.4rem 0;
    padding: 0.5rem 0.75rem;
    border-radius: 0.375rem;
    font-size: 0.88rem;
}
.result-msg.ok    { background: var(--p-green-50); color: var(--p-green-900); }
.result-msg.warn  { background: var(--p-yellow-50); color: var(--p-yellow-900); }
.result-msg.error { background: var(--p-red-50); color: var(--p-red-900); }

.task-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.4rem 0.6rem;
    border-radius: 0.375rem;
    margin: 0.3rem 0;
    font-size: 0.88rem;
    background: var(--p-surface-100);
}
.task-row.Succeeded { background: var(--p-green-50); }
.task-row.Failed    { background: var(--p-red-50);   }
.task-row.Processing{ background: var(--p-blue-50);  }

.task-label { font-weight: 600; min-width: 45px; }
.task-phase { flex: 1; color: var(--p-text-muted-color); }
.task-pct   { font-variant-numeric: tabular-nums; }

.actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 1rem;
}
</style>
