<template>
    <Window id="align-georaster" title="Align GeoTIFF to Reference" modal width="600px" height="auto" fixed-position :busy="running" @close="$emit('close', 'close')">
        <div class="align-dialog">
            <!-- Explanation -->
            <PrimeMessage severity="info" :closable="false" icon="fa-solid fa-circle-info" class="align-info">
                <div>
                    Aligns the source GeoTIFF to the selected reference by template matching, correcting
                    georeferencing offsets (GPS drift, rotation, scale drift) between two surveys.<br>
                    <strong>Similarity</strong> mode corrects translation, rotation and uniform scale; <br>
                    <strong>Translation</strong> mode corrects position only and is faster for small offsets.<br>
                    The aligned result is added to the dataset as a <em>new</em> GeoTIFF file with the <i>_aligned</i> suffix, the original source is never modified.<br>
                    See the <a :href="docsLink" target="_blank" rel="noopener">Raster Alignment documentation</a> for details.
                </div>
            </PrimeMessage>

            <!-- Source (read-only) -->
            <div class="section">
                <label for="align-dialog-source-file" class="section-label">Source file</label>
                <InputText id="align-dialog-source-file" :model-value="sourceEntry.entry.path" readonly fluid class="w-100" />
            </div>

            <!-- Reference picker -->
            <div class="section">
                <label id="align-dialog-reference-geotiff-label" for="align-dialog-reference-geotiff" class="section-label">Reference GeoTIFF</label>
                <Select v-model="selectedReference" input-id="align-dialog-reference-geotiff" aria-labelledby="align-dialog-reference-geotiff-label" :options="referenceOptions" option-label="label" option-value="value"
                        placeholder="Select reference..." class="w-100" fluid @change="onReferenceChange" />
                <small v-if="referenceOptions.length === 0" class="hint-error">
                    No other GeoTIFF in this dataset to use as reference.
                </small>
            </div>

            <!-- Mode -->
            <div class="section">
                <label id="align-dialog-alignment-mode-label" for="align-dialog-alignment-mode" class="section-label">Alignment mode</label>
                <Select v-model="mode" input-id="align-dialog-alignment-mode" aria-labelledby="align-dialog-alignment-mode-label" :options="modeOptions" option-label="label" option-value="value" class="w-100" fluid />
            </div>

            <!-- Output name -->
            <div class="section">
                <label for="align-dialog-output-file-name" class="section-label">Output file name</label>
                <InputText id="align-dialog-output-file-name" v-model="outputName" fluid class="w-100" :invalid="!isOutputValid"
                           placeholder="aligned.tif" :disabled="running" @input="validateOutputName" />
                <small v-if="outputProblem" class="hint-error">{{ outputProblem }}</small>
                <small v-else-if="existingOutput" class="hint-warn">
                    <i class="fa-solid fa-triangle-exclamation" /> This file exists and will be replaced
                </small>
            </div>

            <!-- Validation result -->
            <div v-if="validating" class="status-info">
                <LoadingSpinner inline label="Validating..." />
            </div>
            <div v-else-if="validationResult">
                <div v-if="!validationResult.ok" class="result-msg error">
                    {{ (validationResult.errors || []).join('; ') }}
                </div>
                <div v-else-if="(validationResult.warnings || []).length" class="result-msg warn">
                    {{ validationResult.warnings.join('; ') }}
                </div>
                <div v-else class="result-msg ok">
                    Compatible - Overlap: {{ formatNumber(validationResult.summary && validationResult.summary.overlapPercent, 1) }}%,
                    GSD {{ formatNumber(validationResult.summary && validationResult.summary.sourceGsdM, 3) }} m
                </div>
            </div>

            <!-- The two tasks: the align and the build of its output, each with its real state (FR-XC-15) -->
            <HeavyTaskStatus :task="alignTask" label="Align" cancellable :cancelling="cancelling" @cancel="cancelHeavyTask($event, 'Align GeoTIFF')" />
            <HeavyTaskStatus :task="buildTask" label="Build" cancellable :cancelling="cancelling" @cancel="cancelHeavyTask($event, 'Build')" />

            <!-- Align result (parsed from the log tail): stays until the user closes the window (FR-PRC-11) -->
            <div v-if="alignResult" ref="resultBox" class="result-msg ok" data-testid="align-result">
                Aligned - {{ resultText }}
                <span v-if="alignResult.warning"> - {{ alignResult.warning }}</span>
            </div>
            <div v-if="done" class="result-msg ok" data-testid="align-done">
                Output saved as {{ writtenPath }}
            </div>

            <!-- Error -->
            <div v-if="errorMsg" class="result-msg error">{{ errorMsg }}</div>

            <!-- Actions -->
            <div class="actions">
                <Button label="Validate" icon="fa-solid fa-check" severity="secondary"
                        :disabled="!selectedReference || validating || running" @click="validate" />
                <Button label="Align" icon="fa-solid fa-crosshairs" severity="primary"
                        :disabled="!canAlign" :loading="running" @click="startAlign" />
                <Button v-if="done" label="Open on map" icon="fa-solid fa-map" severity="secondary"
                        @click="$emit('close', 'map', { outputPath: writtenPath })" />
                <Button label="Close" severity="secondary" :disabled="running" @click="$emit('close', 'close')" />
            </div>
        </div>
        <DialogHost :dialogs="dialogs" />
    </Window>
</template>

<script>
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import HeavyTaskStatus from '@/components/HeavyTaskStatus.vue';
import DialogHost from '@/components/DialogHost.vue';
import ddb from 'ddb';
import Window    from '@/components/HubWindow.vue';
import Button    from 'primevue/button';
import InputText from 'primevue/inputtext';
import Select    from 'primevue/select';
import PrimeMessage from 'primevue/message';
import { useHeavyTask } from '@/composables/useHeavyTask';
import { useDialogs } from '@/composables/useDialogs';
import { useHeavyTaskCancel } from '@/composables/useHeavyTaskCancel';
import {
    useConfirmReplace, replaceConflictPath, conflictIsFolder, existingItem, namesInFolder
} from '@/composables/useConfirmReplace';
import { freeName, namesClash, nameClashMessage } from '@/libs/nameRules';
import { DOCS } from '@/libs/docsLinks';
import { formatNumber } from '@/libs/format';
import { formatAlignResult } from '@/libs/dataset/alignResult';

/**
 * One click starts one task (FR-PRC-02): the form is busy from the click until the tasks end. The align and the
 * build of its output show their state through HeavyTaskStatus, read from useHeavyTask (FR-XC-15). When both are
 * done the window stays open with the result (tx, ty, rotation, scale, confidence): it emits `aligned` (the page
 * refreshes its list and says the numbers in a toast) and closes only on Close or Open on map (FR-PRC-11). The
 * proposed output is a free name of the source's folder (FR-PRC-04); a name that exists is replaced
 * only after the user confirmed it (overwrite: true), also when the Registry finds it at the submit
 * (409 with conflictPath).
 */
export default {
    name: 'AlignDialog',
    components: { Window, Button, InputText, Select, PrimeMessage, LoadingSpinner, DialogHost, HeavyTaskStatus },

    props: {
        sourceEntry: { type: Object, required: true },
        dataset:     { type: Object, required: true },
        allEntries:  { type: Array,  required: true }
    },
    emits: ['close', 'aligned'],

    setup(props) {
        const { runHeavyTask, heavyTasks } = useHeavyTask();
        const dialogs = useDialogs();
        const { cancelHeavyTask, cancelling } = useHeavyTaskCancel(() => props.dataset, dialogs);
        return {
            runHeavyTask, heavyTasks, formatNumber, docsLink: DOCS.alignRaster, dialogs, confirmReplace: useConfirmReplace(dialogs),
            cancelHeavyTask, cancelling
        };
    },
    data() {
        const stem = (this.sourceEntry?.entry?.path ?? 'output').replace(/\.tiff?$/i, '');
        const slash = stem.lastIndexOf('/');
        const folder = stem.substring(0, slash + 1);
        const name = freeName(stem.substring(slash + 1) + '_aligned.tif', namesInFolder(folder, this.allEntries));
        return {
            mode: 'similarity',
            modeOptions: [
                { label: 'Similarity (tx, ty, rotation, scale)', value: 'similarity' },
                { label: 'Translation only (fast, no rotation)',  value: 'translation' }
            ],
            selectedReference: null,
            outputName: folder + name,
            outputNameError: null,

            validating:       false,
            validationResult: null,

            running:        false,
            // The tasks of the latest run: their state is read from heavyTasks, never copied
            alignTaskId:    null,
            buildTaskId:    null,
            // Both tasks ended: the result stays until the user closes the window
            done:           false,
            writtenPath:    null,

            alignResult: null,
            errorMsg:    null
        };
    },

    computed: {
        alignTask() {
            return this.alignTaskId ? this.heavyTasks[this.alignTaskId] ?? null : null;
        },
        buildTask() {
            return this.buildTaskId ? this.heavyTasks[this.buildTaskId] ?? null : null;
        },
        resultText() {
            return formatAlignResult(this.alignResult);
        },
        referenceOptions() {
            const srcPath = this.sourceEntry.entry.path;
            return this.allEntries
                .filter(e => e.entry &&
                    e.entry.path !== srcPath &&
                    e.entry.type === ddb.entry.type.GEORASTER &&
                    /\.tiff?$/i.test(e.entry.path))
                .map(e => ({ label: e.entry.path, value: e.entry.path }));
        },
        outputPath() {
            return this.outputName.trim();
        },
        // The listed entry the output would replace (letter case ignored, D-040)
        existingOutput() {
            return existingItem(this.outputPath, this.allEntries);
        },
        // What makes the output unusable beyond its syntax: the source, the reference, or a folder of that name
        outputProblem() {
            if (this.outputNameError) return this.outputNameError;
            if (namesClash(this.sourceEntry.entry.path, this.outputPath)) return 'The output cannot be the source file';
            if (namesClash(this.selectedReference, this.outputPath)) return 'The output cannot be the reference file';
            const existing = this.existingOutput;
            if (existing && ddb.entry.isDirectory(existing.entry)) {
                return nameClashMessage(existing.entry.path.substring(existing.entry.path.lastIndexOf('/') + 1));
            }
            return null;
        },
        isOutputValid() {
            return this.outputPath.length > 0 && !this.outputProblem;
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
        /** Forgets the result and the tasks of the previous run */
        clearRun() {
            this.alignResult = null;
            this.errorMsg    = null;
            this.alignTaskId = null;
            this.buildTaskId = null;
            this.done        = false;
            this.writtenPath = null;
        },

        onReferenceChange() {
            this.validationResult = null;
            this.clearRun();
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
            this.clearRun();
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
                } catch { /* not JSON, skip */ }
            }
            return null;
        },

        /** Submits the align-raster task and waits for its end. */
        submitAlign(outputPath, overwrite) {
            return this.runHeavyTask(this.dataset, 'align-raster', {
                params: {
                    sourcePath:    this.sourceEntry.entry.path,
                    referencePath: this.selectedReference,
                    outputPath,
                    mode: this.mode,
                    overwrite
                },
                notify: false,
                onSubmitted: entry => { this.alignTaskId = entry.taskId; }
            });
        },

        async startAlign() {
            // Busy before the first await: a second click finds it set
            if (this.running || !this.canAlign) return;
            this.running = true;
            this.clearRun();

            const requested = this.outputPath;
            // The path written: a replaced file keeps its own (the Registry writes the existing entry, D-040)
            let outputPath = requested;

            // ── Step 1: align-raster heavy task ───────────────────────────────
            try {
                let overwrite = false;
                if (this.existingOutput) {
                    if (!await this.confirmReplace(this.existingOutput.entry.path)) {
                        this.running = false;
                        return;
                    }
                    overwrite = true;
                    outputPath = this.existingOutput.entry.path;
                }
                let alignEntry;
                try {
                    alignEntry = await this.submitAlign(requested, overwrite);
                } catch (e) {
                    // The file appeared after the dialog read the folder: ask once, then replace it. A folder is
                    // never replaced: its clash message is shown
                    const conflict = overwrite ? null : replaceConflictPath(e);
                    if (!conflict || await conflictIsFolder(this.dataset, conflict, this.allEntries)) throw e;
                    if (!await this.confirmReplace(conflict)) {
                        this.running = false;
                        return;
                    }
                    alignEntry = await this.submitAlign(requested, true);
                    outputPath = conflict;
                }
                this.alignResult = this._extractResultFromLog(alignEntry.logTail);
                // The result is there while the build still runs: bring it into view now, not when the build ends
                if (this.alignResult) this.$nextTick(() => this.$refs.resultBox?.scrollIntoView?.({ block: 'nearest' }));
            } catch (e) {
                // A failed task shows its own reason in its row; a refusal of the submit has no task
                if (!e?.task) this.errorMsg = e?.message ?? String(e);
                this.running = false;
                return;
            }

            // ── Step 2: build task (separate, consequence of the add) ──────────
            try {
                await this.runHeavyTask(this.dataset, 'build', {
                    path:   outputPath,
                    params: { path: outputPath, force: false },
                    force:  false,
                    notify: false,
                    onSubmitted: entry => { this.buildTaskId = entry.taskId; }
                });
            } catch (e) {
                // Build failure is non-blocking: aligned file is already indexed. Its row shows the reason of a failed
                // task; a build that could not be submitted has no row
                if (!e?.task) this.errorMsg = `Alignment complete but the build could not start: ${e?.message ?? String(e)}`;
            }

            // The output exists: the window stays open with the result until the user closes it (FR-PRC-11), and
            // the page refreshes its list
            this.writtenPath = outputPath;
            this.done        = true;
            this.running     = false;
            this.$emit('aligned', { outputPath, result: this.alignResult });
        },

    }
};
</script>

<style scoped>
.align-dialog {
    min-width: min(380px, var(--window-content-width, 100%));
    display: flex;
    flex-direction: column;
    gap: 0;
}

.align-info {
    margin-bottom: 0.75rem;
    font-size: 0.85rem;
}

.align-info :deep(a) {
    color: var(--ddb-link-on-tint);
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

.hint-warn {
    display: block;
    margin-top: 0.25rem;
    color: var(--p-yellow-700);
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

.actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 1rem;
}
</style>
