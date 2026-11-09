<template>
    <Window id="merge-multispectral" title="Merge Multispectral Bands" modal width="900px" height="auto" fixed-position :busy="submitting" @close="close">
        <div class="merge-ms-dialog">
            <!-- 3-column layout -->
            <div class="columns-row">
                <!-- Column 1: Band order -->
                <div class="col-bands">
                    <span id="merge-band-order-label" class="section-label">Band Order (drag or use the arrows)</span>
                    <ol ref="bandList" class="band-list" aria-labelledby="merge-band-order-label">
                        <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -- dragging is the mouse way; the arrow buttons are the keyboard way -->
                        <li v-for="(item, index) in orderedFiles" :key="item.entry.path"
                            class="band-item" :class="{ 'drag-over': dragOverIndex === index }"
                            :draggable="!submitting"
                            @dragstart="onDragStart(index, $event)"
                            @dragover.prevent="onDragOver(index)"
                            @dragleave="onDragLeave"
                            @drop.prevent="onDrop(index)"
                            @dragend="onDragEnd">
                            <span class="drag-handle" aria-hidden="true"><i class="fa-solid fa-grip-vertical" /></span>
                            <span class="band-index">{{ index + 1 }}.</span>
                            <span class="band-name" :title="item.entry.path">{{ shortName(item.label) }}</span>
                            <span v-if="cameraName(index)" class="band-camera" data-testid="band-camera-name">{{ cameraName(index) }}</span>
                            <span v-if="bandInfo[item.entry.path]" class="band-meta">
                                ({{ bandInfo[item.entry.path].dataType }})
                            </span>
                            <span class="band-move">
                                <Button icon="fa-solid fa-arrow-up" text rounded size="small" severity="secondary"
                                        :aria-label="`Move ${item.label} up`" :disabled="submitting || index === 0"
                                        @click="moveBand(index, index - 1, 'up')" />
                                <Button icon="fa-solid fa-arrow-down" text rounded size="small" severity="secondary"
                                        :aria-label="`Move ${item.label} down`" :disabled="submitting || index === orderedFiles.length - 1"
                                        @click="moveBand(index, index + 1, 'down')" />
                            </span>
                        </li>
                    </ol>
                    <!-- The new position of the band a button moved, said to a screen reader (FR-PRC-18) -->
                    <span class="visually-hidden" role="status" aria-live="polite" data-testid="band-move-announcement">{{ moveAnnouncement }}</span>
                </div>

                <!-- Column 2: Validation info -->
                <div class="col-info">
                    <div v-if="validating" class="status-info">
                        <LoadingSpinner inline label="Validating..." />
                    </div>

                    <template v-if="validationResult">
                        <!-- Errors -->
                        <div v-if="validationResult.errors && validationResult.errors.length > 0" class="validation-errors">
                            <div v-for="(err, i) in validationResult.errors" :key="'e'+i" class="validation-msg error">
                                <i class="fa-solid fa-circle-xmark" /> {{ err }}
                            </div>
                        </div>
                        <!-- Warnings (filtered to remove misalignment duplicates; an identical warning is said once) -->
                        <div v-if="filteredWarnings.length > 0" class="validation-warnings">
                            <div v-for="(warn, i) in filteredWarnings" :key="'w'+i" class="validation-msg warning">
                                <i class="fa-solid fa-triangle-exclamation" /> {{ warn.text }}<span v-if="warn.count > 1"> (×{{ warn.count }})</span>
                            </div>
                        </div>
                        <!-- Alignment banner -->
                        <div v-if="alignmentWarning" class="alignment-warning">
                            <i class="fa-solid fa-circle-info" />
                            <div>
                                <strong>Band misalignment detected</strong>
                                <p>
                                    Multi-camera sensor (~{{ maxShift }}px shift).
                                    {{ validationResult.alignment.correctionApplied ? 'Approximate correction will be applied.' : 'No approximate correction applies to these images.' }}
                                    For accurate results, process the band images with
                                    <strong>Run Photogrammetry</strong> in the Tasks tab.
                                </p>
                            </div>
                        </div>
                        <!-- Summary -->
                        <div v-if="validationResult.ok || (validationResult.errors && validationResult.errors.length === 0)" class="merge-summary">
                            <div v-if="validationResult.summary" class="summary-row">
                                <div class="d-flex gap-3 flex-wrap">
                                    <div v-if="validationResult.summary.crs"><strong>CRS:</strong> {{ validationResult.summary.crs }}</div>
                                    <div><strong>Size:</strong> {{ validationResult.summary.width }}×{{ validationResult.summary.height }}</div>
                                    <div><strong>Bands:</strong> {{ validationResult.summary.totalBands }} × {{ validationResult.summary.dataType }}</div>
                                    <div v-if="estimatedSize"><strong>Est.:</strong> {{ estimatedSize }}</div>
                                </div>
                            </div>
                        </div>
                    </template>
                </div>

                <!-- Column 3: Preview -->
                <div v-if="previewUrl" class="col-preview">
                    <button type="button" class="btn-reset preview-open" title="Show the preview at full size"
                            aria-label="Show the preview at full size" @click="previewOpen = true">
                        <img :src="previewUrl" class="preview-thumb" alt="Merge preview">
                    </button>
                </div>
            </div>

            <!-- Bottom section: Output + actions (full width) -->
            <div class="bottom-row">
                <div class="bottom-left">
                    <div class="section">
                        <label for="merge-multispectral-dialog-output-path" class="section-label">Output path</label>
                        <InputText id="merge-multispectral-dialog-output-path" v-model="outputName" class="w-100" :invalid="!isOutputValid" fluid
                                   placeholder="merged.tif" :disabled="submitting" @input="validateOutputName" />
                        <small v-if="outputProblem" class="output-error">{{ outputProblem }}</small>
                        <small v-else-if="existingOutput" class="output-warning">
                            <i class="fa-solid fa-triangle-exclamation" /> This file exists and will be replaced
                        </small>
                    </div>
                    <div class="d-flex align-items-center gap-2">
                        <Checkbox v-model="deleteSource" :binary="true" input-id="deleteSrcCheckbox" :disabled="submitting" />
                        <label for="deleteSrcCheckbox">Delete source files after merge</label>
                    </div>
                    <div v-if="deleteSource" class="delete-warning">
                        <i class="fa-solid fa-triangle-exclamation" /> Source files will be permanently deleted after merge.
                    </div>
                </div>
                <div class="bottom-actions">
                    <Button severity="secondary" label="Cancel" :disabled="submitting" @click="close" />
                    <Button :disabled="!canMerge" :loading="submitting" severity="primary" label="Merge" @click="merge" />
                </div>
            </div>

            <!-- The task: queued, merging, failed with its reason (FR-PRC-13) -->
            <HeavyTaskStatus class="merge-task" :task="mergeTask" :error="mergeError" label="Merge" cancellable :cancelling="cancelling"
                             @cancel="cancelHeavyTask($event, 'Merge multispectral')" />
        </div>
        <Window v-if="previewOpen && previewUrl" title="Merge preview" modal width="1100px" height="auto" close-button cancel-label="Close"
                @close="previewOpen = false">
            <img :src="previewUrl" class="preview-full" alt="Merge preview at full size">
        </Window>
        <DialogHost :dialogs="dialogs" />
    </Window>
</template>

<script>
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import DialogHost from '@/components/DialogHost.vue';
import Window from '@/components/HubWindow.vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Checkbox from 'primevue/checkbox';
import HeavyTaskStatus from '@/components/HeavyTaskStatus.vue';
import { useHeavyTask } from '@/composables/useHeavyTask';
import { useDialogs } from '@/composables/useDialogs';
import { useHeavyTaskCancel } from '@/composables/useHeavyTaskCancel';
import {
    useConfirmReplace, replaceConflictPath, conflictIsFolder, existingItem, namesInFolder
} from '@/composables/useConfirmReplace';
import { freeName, namesClash, nameClashMessage } from '@/libs/nameRules';
import { shortenMiddle, groupWarnings, cameraBandName } from '@/libs/dataset/mergeBands';
import { thumbnailRequestSize } from '@/libs/thumbnailQueue';
import ddb, { pathutils } from 'ddb';

// The preview is drawn at 28rem at most (.preview-thumb): its bitmap has that CSS width times the pixel ratio,
// in the steps of FR-XC-32 (440 px at 2x is 512, 28rem at 2x is 1024), and never more than 1024 px (FR-PRC-46)
const PREVIEW_CSS_PX = 448;
const PREVIEW_MAX_PX = 1024;

/**
 * MergeMultispectralDialog - Dialog for merging multispectral bands into a
 * composite GeoTIFF via a heavy processing task.
 *
 * Validates band availability, exposes merge options, and tracks task
 * progress via the useHeavyTask composable.
 *
 * One click starts one task (FR-PRC-02): the form is busy from the click until the task ends.
 * The proposed output is a free name of its folder (FR-PRC-04); a name that exists is replaced
 * only after the user confirmed it (overwrite: true), also when the Registry finds it at the
 * submit (409 with conflictPath). With "Delete source files" the Registry deletes the bands
 * itself (deleteSources), once the output is written and opens.
 */
export default {
    components: { Window, Button, InputText, Checkbox, LoadingSpinner, DialogHost, HeavyTaskStatus },
    props: {
        files: { type: Array, required: true },
        dataset: { type: Object, required: true },
        // The items of the folder in view (file browser items): tell whether the output exists
        allEntries: { type: Array, default: () => [] }
    },
    emits: ['close'],

    setup(props) {
        const { runHeavyTask, heavyTasks } = useHeavyTask();
        const dialogs = useDialogs();
        const { cancelHeavyTask, cancelling } = useHeavyTaskCancel(() => props.dataset, dialogs);
        return { runHeavyTask, heavyTasks, dialogs, confirmReplace: useConfirmReplace(dialogs), cancelHeavyTask, cancelling };
    },
    data() {
        return {
            orderedFiles: [...this.files],
            moveAnnouncement: '',
            dragIndex: null,
            dragOverIndex: null,
            validating: false,
            validationResult: null,
            previewUrl: null,
            // The preview at full size is open (a click on the preview)
            previewOpen: false,
            outputName: '',
            outputNameError: null,
            deleteSource: false,
            bandInfo: {},
            submitting: false,
            // The task of the latest submit (its state is read from heavyTasks, not copied) and the refusal of
            // a submit that started none
            mergeTaskId: null,
            mergeError: '',
            // The number of the latest check (validate): the answers of the older ones are ignored
            validationRequest: 0
        };
    },

    computed: {
        mergeTask() {
            return this.mergeTaskId ? this.heavyTasks[this.mergeTaskId] ?? null : null;
        },
        outputPath() {
            return this.outputName.trim();
        },
        // The listed entry the output would replace (letter case ignored, D-040)
        existingOutput() {
            return existingItem(this.outputPath, this.allEntries);
        },
        // What makes the output unusable beyond its syntax: a source band, or a folder of that name
        outputProblem() {
            if (this.outputNameError) return this.outputNameError;
            if (this.orderedFiles.some(f => namesClash(f.entry.path, this.outputPath))) {
                return 'The output cannot be one of the source bands';
            }
            const existing = this.existingOutput;
            if (existing && ddb.entry.isDirectory(existing.entry)) {
                return nameClashMessage(pathutils.basename(existing.entry.path));
            }
            return null;
        },
        isOutputValid() {
            return this.outputName.length > 0 && !this.outputProblem;
        },
        canMerge() {
            return this.isOutputValid &&
                this.validationResult &&
                this.validationResult.ok &&
                !this.validating &&
                !this.submitting;
        },
        estimatedSize() {
            const s = this.validationResult?.summary;
            if (!s) return null;
            const dtSize = { 'Byte': 1, 'UInt16': 2, 'Int16': 2, 'UInt32': 4, 'Int32': 4, 'Float32': 4, 'Float64': 8 };
            const bytes = s.width * s.height * s.totalBands * (dtSize[s.dataType] || 2) * 1.1;
            if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
            if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
            return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
        },
        filteredWarnings() {
            const warnings = this.validationResult?.warnings || [];
            return groupWarnings(this.alignmentWarning
                ? warnings.filter(w => !w.toLowerCase().includes('misalignment'))
                : warnings);
        },
        alignmentWarning() {
            const a = this.validationResult?.alignment;
            return a && a.detected && a.maxShiftPixels > 2;
        },
        maxShift() {
            return Math.round(this.validationResult?.alignment?.maxShiftPixels || 0);
        }
    },

    mounted() {
        this.generateOutputName();
        this.validate();
    },

    beforeUnmount() {
        if (this.previewUrl && this.previewUrl.startsWith('blob:')) {
            URL.revokeObjectURL(this.previewUrl);
        }
    },

    methods: {
        // The file name with its middle cut, so that the suffix that tells the bands apart stays
        shortName(label) {
            return shortenMiddle(label);
        },

        // What the camera calls the band at that position of the order (Blue, Red edge)
        cameraName(index) {
            return cameraBandName(this.validationResult, index);
        },

        generateOutputName() {
            if (this.files.length === 0) return;

            // Find common folder among source files
            const paths = this.files.map(f => f.entry.path);
            let commonFolder = '';
            const folders = paths.map(p => {
                const idx = p.lastIndexOf('/');
                return idx >= 0 ? p.substring(0, idx + 1) : '';
            });
            if (folders.length > 0 && folders.every(f => f === folders[0])) {
                commonFolder = folders[0];
            }

            // Find common base name among file names (without folder)
            const names = this.files.map(f => f.label || pathutils.basename(f.entry.path));
            // Try to find common prefix
            let prefix = names[0];
            for (let i = 1; i < names.length; i++) {
                while (!names[i].startsWith(prefix) && prefix.length > 0) {
                    prefix = prefix.substring(0, prefix.length - 1);
                }
            }
            // Remove trailing non-alphanumeric chars
            prefix = prefix.replace(/[^a-zA-Z0-9]+$/, '');

            let filename;
            if (prefix.length > 2) {
                filename = prefix + '_merged.tif';
            } else {
                const now = new Date();
                const ts = now.getFullYear().toString() +
                    (now.getMonth() + 1).toString().padStart(2, '0') +
                    now.getDate().toString().padStart(2, '0') + '_' +
                    now.getHours().toString().padStart(2, '0') +
                    now.getMinutes().toString().padStart(2, '0') +
                    now.getSeconds().toString().padStart(2, '0');
                filename = 'merged_' + ts + '.tif';
            }
            this.outputName = commonFolder + freeName(filename, namesInFolder(commonFolder, this.allEntries));
        },

        // Every move of a band starts a new check: only the answer of the latest one is shown (an
        // older one describes the bands in an order that is gone)
        async validate() {
            const request = ++this.validationRequest;
            this.validating = true;
            this.validationResult = null;
            this.previewUrl = null;
            this.previewOpen = false;

            try {
                const paths = this.orderedFiles.map(f => f.entry.path);
                const result = await this.dataset.validateMergeMultispectral(paths);
                if (request !== this.validationRequest) return;
                this.validationResult = typeof result === 'string' ? JSON.parse(result) : result;

                // Build bandInfo from validation summary
                if (this.validationResult.summary) {
                    this.orderedFiles.forEach((f) => {
                        this.bandInfo[f.entry.path] = {
                            dataType: this.validationResult.summary.dataType || 'Unknown'
                        };
                    });
                }

                // Load preview if validation passed
                if (this.validationResult.ok) {
                    this.loadPreview(request);
                }
            } catch (e) {
                if (request !== this.validationRequest) return;
                this.validationResult = { ok: false, errors: [e.message || 'Validation failed'], warnings: [] };
            } finally {
                if (request === this.validationRequest) this.validating = false;
            }
        },

        async loadPreview(request) {
            try {
                const paths = this.orderedFiles.map(f => f.entry.path);
                const result = await this.dataset.previewMergeMultispectral(paths, '1,2,3', Math.min(PREVIEW_MAX_PX, thumbnailRequestSize(PREVIEW_CSS_PX)));
                if (request !== this.validationRequest) return;
                if (result instanceof Blob) {
                    this.previewUrl = URL.createObjectURL(result);
                } else if (typeof result === 'string') {
                    this.previewUrl = result;
                }
            } catch (e) {
                console.warn('Preview not available:', e);
            }
        },

        validateOutputName() {
            this.outputNameError = null;
            const name = this.outputName.trim();
            if (!name) {
                this.outputNameError = 'Output filename is required';
                return;
            }
            if (name.includes('\\') || name.includes('..')) {
                this.outputNameError = 'Invalid characters in path';
                return;
            }
            if (name.startsWith('/')) {
                this.outputNameError = 'Path must be relative';
                return;
            }
            if (!name.toLowerCase().endsWith('.tif') && !name.toLowerCase().endsWith('.tiff')) {
                this.outputNameError = 'Output must have .tif extension';
                return;
            }
        },

        // Drag & drop reordering
        onDragStart(index, event) {
            this.dragIndex = index;
            event.dataTransfer.effectAllowed = 'move';
        },
        onDragOver(index) {
            this.dragOverIndex = index;
        },
        onDragLeave() {
            this.dragOverIndex = null;
        },
        onDrop(index) {
            const from = this.dragIndex;
            this.dragOverIndex = null;
            this.dragIndex = null;
            if (from !== null) this.moveBand(from, index);
        },
        // Band order is the merge order: drag and the arrow buttons both end here. A move by a button (`direction`) keeps
        // the focus on the arrow of the same direction of the moved band, or on the other one when that is the end of the
        // list (the list is rebuilt: the browser drops the focus of a node that moves), and says the new position
        async moveBand(from, to, direction) {
            if (from === to || to < 0 || to >= this.orderedFiles.length) return;
            const item = this.orderedFiles.splice(from, 1)[0];
            this.orderedFiles.splice(to, 0, item);
            this.validate();
            if (!direction) return;
            this.moveAnnouncement = `${item.label} moved to position ${to + 1}`;
            await this.$nextTick();
            const buttons = this.$refs.bandList?.children[to]?.querySelectorAll('.band-move button');
            if (!buttons) return;
            const [up, down] = buttons;
            const wanted = direction === 'up' ? up : down;
            (wanted.disabled ? (direction === 'up' ? down : up) : wanted).focus();
        },
        onDragEnd() {
            this.dragOverIndex = null;
            this.dragIndex = null;
        },

        async merge() {
            // Busy before the first await: a second click finds it set
            if (this.submitting || !this.canMerge) return;
            this.submitting = true;
            this.mergeTaskId = null;
            this.mergeError = '';

            try {
                const paths = this.orderedFiles.map(f => f.entry.path);
                const outputPath = this.outputPath;
                const deleteSources = this.deleteSource;

                // A replaced file keeps its own path (the Registry writes the existing entry, D-040)
                let written = outputPath;
                let overwrite = false;
                if (this.existingOutput) {
                    if (!await this.confirmReplace(this.existingOutput.entry.path)) return;
                    overwrite = true;
                    written = this.existingOutput.entry.path;
                }

                // Offloaded to the merge-multispectral heavy task (progress visible in
                // the Tasks tab). Awaits completion so the file listing can refresh.
                const submit = replace => this.runHeavyTask(this.dataset, 'merge-multispectral', {
                    params: { paths, outputPath, overwrite: replace, deleteSources }, notify: false,
                    onSubmitted: entry => { this.mergeTaskId = entry.taskId; }
                });
                try {
                    await submit(overwrite);
                } catch (e) {
                    // The file appeared after the dialog read the folder: ask once, then replace it. A folder is
                    // never replaced: its clash message is shown
                    const conflict = overwrite ? null : replaceConflictPath(e);
                    if (!conflict || await conflictIsFolder(this.dataset, conflict, this.allEntries)) throw e;
                    if (!await this.confirmReplace(conflict)) return;
                    await submit(true);
                    written = conflict;
                }

                const sourceNames = paths.map(p => pathutils.basename(p));
                this.$emit('close', 'merged', { outputPath: written, deleteSource: deleteSources, sourceNames, sourcePaths: paths });
            } catch (e) {
                // A failed task shows its own reason in the status; a refusal of the submit has no task
                if (!e?.task) this.mergeError = e?.message || 'Merge failed';
            } finally {
                this.submitting = false;
            }
        },

        close() {
            if (this.previewUrl && this.previewUrl.startsWith('blob:')) {
                URL.revokeObjectURL(this.previewUrl);
            }
            this.$emit('close', 'close');
        }
    }
};
</script>

<style scoped>
.merge-ms-dialog {
    min-width: min(400px, var(--window-content-width, 100%));
}

.columns-row {
    display: flex;
    gap: 1rem;
    align-items: flex-start;
}

.col-bands {
    flex: 0 0 auto;
    min-width: min(200px, 100%);
    max-width: 280px;
}

.col-info {
    flex: 1 1 0;
    min-width: min(200px, 100%);
}

.col-preview {
    /* The preview shares the free width with the details and grows with the dialog, up to 28rem (FR-PRC-46) */
    flex: 1 1 14rem;
    max-width: 28rem;
    min-width: 0;
    text-align: center;
    display: flex;
    align-items: flex-start;
}

.preview-open {
    display: block;
    width: 100%;
    padding: 0;
    cursor: zoom-in;
}

.section-label {
    display: block;
    font-weight: 600;
    margin-bottom: 0.35rem;
    font-size: 0.85rem;
}

.band-list {
    list-style: none;
    margin: 0;
    padding: 0;
    border: 1px solid var(--p-surface-300);
    border-radius: 0.375rem;
    overflow: hidden;
    max-height: 280px;
    overflow-y: auto;
}

.band-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.35rem 0.5rem;
    border-bottom: 1px solid var(--p-surface-200);
    cursor: grab;
    background: var(--p-surface-0);
    transition: background 0.15s;
    font-size: 0.85rem;
}

.band-item:last-child {
    border-bottom: none;
}

.band-item:hover {
    background: var(--p-surface-50);
}

.band-item.drag-over {
    border-top: 2px solid var(--p-primary-color);
}

.band-move {
    margin-left: auto;
    display: inline-flex;
}

.drag-handle {
    color: var(--p-surface-400);
    cursor: grab;
}

.band-index {
    font-weight: 600;
    min-width: 1.2rem;
    color: var(--p-primary-color);
}

.band-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.band-camera {
    font-weight: 600;
    white-space: nowrap;
}

.band-meta {
    color: var(--p-surface-500);
    font-size: 0.75rem;
}

.validation-msg {
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    margin-bottom: 0.2rem;
    font-size: 0.8rem;
    word-break: break-word;
}

.validation-msg.error {
    background: var(--p-red-50);
    color: var(--p-red-700);
}

.validation-msg.warning {
    background: var(--p-yellow-50);
    color: var(--p-yellow-700);
}

.merge-summary {
    padding: 0.4rem 0.5rem;
    background: var(--p-surface-50);
    border-radius: 0.375rem;
    font-size: 0.8rem;
    margin-top: 0.5rem;
}

.preview-thumb {
    display: block;
    max-width: min(100%, 28rem);
    max-height: 28rem;
    margin: 0 auto;
    border: 1px solid var(--p-surface-200);
    border-radius: 0.375rem;
}

.preview-full {
    display: block;
    max-width: 100%;
    max-height: 75vh;
    margin: 0 auto;
}

.bottom-row {
    display: flex;
    align-items: flex-end;
    gap: 1rem;
    margin-top: 0.75rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--p-surface-200);
}

.bottom-left {
    flex: 1;
}

.bottom-left .section {
    margin-bottom: 0.5rem;
}

.bottom-actions {
    display: flex;
    gap: 0.5rem;
    flex-shrink: 0;
}

.output-error {
    color: var(--p-red-600);
    display: block;
    margin-top: 0.2rem;
}

.output-warning {
    color: var(--p-yellow-700);
    display: block;
    margin-top: 0.2rem;
}

.delete-warning {
    font-size: 0.8rem;
    color: var(--p-yellow-700);
    margin-top: 0.25rem;
}

.status-info {
    color: var(--p-surface-500);
    font-size: 0.85rem;
}

.alignment-warning {
    display: flex;
    gap: 0.5rem;
    padding: 0.5rem 0.6rem;
    background: var(--ddb-warning-bg);
    border-left: 3px solid var(--ddb-warning);
    border-radius: 0.375rem;
    margin-top: 0.5rem;
    font-size: 0.8rem;
    color: var(--ddb-warning-text);
}

.alignment-warning i {
    margin-top: 0.1rem;
    font-size: 0.9rem;
}

.alignment-warning p {
    margin: 0.2rem 0 0 0;
}

.alignment-warning a {
    color: var(--ddb-warning-text);
    text-decoration: underline;
}

@media (max-width: 700px) {
    .columns-row {
        flex-direction: column;
    }
    .col-bands {
        max-width: 100%;
    }
}
</style>
