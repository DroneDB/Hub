<template>
    <Window title="Merge Multispectral Bands" id="merge-multispectral" @onClose="close" modal width="900px" height="auto" fixedPosition>
        <div class="merge-ms-dialog">
            <!-- 3-column layout -->
            <div class="columns-row">
                <!-- Column 1: Band order -->
                <div class="col-bands">
                    <label class="section-label">Band Order (drag to reorder)</label>
                    <div class="band-list" ref="bandList">
                        <div v-for="(item, index) in orderedFiles" :key="item.entry.path"
                            class="band-item" :class="{ 'drag-over': dragOverIndex === index }"
                            draggable="true"
                            @dragstart="onDragStart(index, $event)"
                            @dragover.prevent="onDragOver(index)"
                            @dragleave="onDragLeave"
                            @drop.prevent="onDrop(index)"
                            @dragend="onDragEnd">
                            <span class="drag-handle"><i class="fa-solid fa-grip-vertical"></i></span>
                            <span class="band-index">{{ index + 1 }}.</span>
                            <span class="band-name" :title="item.entry.path">{{ item.label }}</span>
                            <span v-if="bandInfo[item.entry.path]" class="band-meta">
                                ({{ bandInfo[item.entry.path].dataType }})
                            </span>
                        </div>
                    </div>
                </div>

                <!-- Column 2: Validation info -->
                <div class="col-info">
                    <div v-if="validating" class="status-info">
                        <i class="fa-solid fa-spinner fa-spin"></i> Validating...
                    </div>

                    <template v-if="validationResult">
                        <!-- Errors -->
                        <div v-if="validationResult.errors && validationResult.errors.length > 0" class="validation-errors">
                            <div v-for="(err, i) in validationResult.errors" :key="'e'+i" class="validation-msg error">
                                <i class="fa-solid fa-circle-xmark"></i> {{ err }}
                            </div>
                        </div>
                        <!-- Warnings (filtered to remove misalignment duplicates) -->
                        <div v-if="filteredWarnings.length > 0" class="validation-warnings">
                            <div v-for="(warn, i) in filteredWarnings" :key="'w'+i" class="validation-msg warning">
                                <i class="fa-solid fa-triangle-exclamation"></i> {{ warn }}
                            </div>
                        </div>
                        <!-- Alignment banner -->
                        <div v-if="alignmentWarning" class="alignment-warning">
                            <i class="fa-solid fa-circle-info"></i>
                            <div>
                                <strong>Band misalignment detected</strong>
                                <p>
                                    Multi-camera sensor (~{{ maxShift }}px shift).
                                    Approximate correction will be applied.
                                    For accurate results, process with
                                    <a href="https://webodm.org/" target="_blank">WebODM</a>.
                                </p>
                            </div>
                        </div>
                        <!-- Summary -->
                        <div v-if="validationResult.ok || (validationResult.errors && validationResult.errors.length === 0)" class="merge-summary">
                            <div class="summary-row" v-if="validationResult.summary">
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
                <div class="col-preview" v-if="previewUrl">
                    <img :src="previewUrl" class="preview-thumb" alt="Merge preview" />
                </div>
            </div>

            <!-- Bottom section: Output + actions (full width) -->
            <div class="bottom-row">
                <div class="bottom-left">
                    <div class="section">
                        <label class="section-label">Output path</label>
                        <InputText v-model="outputName" class="w-100" :invalid="!isOutputValid" fluid
                            @input="validateOutputName" placeholder="merged.tif" />
                        <small v-if="outputNameError" class="output-error">{{ outputNameError }}</small>
                    </div>
                    <div class="d-flex align-items-center gap-2">
                        <Checkbox v-model="deleteSource" :binary="true" inputId="deleteSrcCheckbox" />
                        <label for="deleteSrcCheckbox">Delete source files after merge</label>
                    </div>
                    <div v-if="deleteSource" class="delete-warning">
                        <i class="fa-solid fa-triangle-exclamation"></i> Source files will be permanently deleted after merge.
                    </div>
                </div>
                <div class="bottom-actions">
                    <Button @click="close" severity="secondary" label="Cancel" />
                    <Button @click="merge" :disabled="!canMerge" severity="primary" label="Merge" />
                </div>
            </div>
        </div>
    </Window>
</template>

<script>
import Window from '@/components/Window.vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Checkbox from 'primevue/checkbox';

export default {
    components: { Window, Button, InputText, Checkbox },
    props: {
        files: { type: Array, required: true },
        dataset: { type: Object, required: true }
    },
    emits: ['onClose'],

    data() {
        return {
            orderedFiles: [...this.files],
            dragIndex: null,
            dragOverIndex: null,
            validating: false,
            validationResult: null,
            previewUrl: null,
            outputName: '',
            outputNameError: null,
            deleteSource: false,
            bandInfo: {}
        };
    },

    computed: {
        isOutputValid() {
            return this.outputName.length > 0 && !this.outputNameError;
        },
        canMerge() {
            return this.isOutputValid &&
                this.validationResult &&
                this.validationResult.ok &&
                !this.validating;
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
            if (!this.alignmentWarning) return warnings;
            return warnings.filter(w => !w.toLowerCase().includes('misalignment'));
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

    methods: {
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
            const names = this.files.map(f => f.label || f.entry.path.split('/').pop());
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
            this.outputName = commonFolder + filename;
        },

        async validate() {
            this.validating = true;
            this.validationResult = null;
            this.previewUrl = null;

            try {
                const paths = this.orderedFiles.map(f => f.entry.path);
                const result = await this.dataset.validateMergeMultispectral(paths);
                this.validationResult = typeof result === 'string' ? JSON.parse(result) : result;

                // Build bandInfo from validation summary
                if (this.validationResult.summary) {
                    this.orderedFiles.forEach((f, i) => {
                        this.bandInfo[f.entry.path] = {
                            dataType: this.validationResult.summary.dataType || 'Unknown'
                        };
                    });
                }

                // Load preview if validation passed
                if (this.validationResult.ok) {
                    this.loadPreview();
                }
            } catch (e) {
                this.validationResult = { ok: false, errors: [e.message || 'Validation failed'], warnings: [] };
            } finally {
                this.validating = false;
            }
        },

        async loadPreview() {
            try {
                const paths = this.orderedFiles.map(f => f.entry.path);
                const result = await this.dataset.previewMergeMultispectral(paths, '1,2,3', 256);
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
            if (this.dragIndex === null || this.dragIndex === index) return;
            const item = this.orderedFiles.splice(this.dragIndex, 1)[0];
            this.orderedFiles.splice(index, 0, item);
            this.dragOverIndex = null;
            this.dragIndex = null;
            this.validate();
        },
        onDragEnd() {
            this.dragOverIndex = null;
            this.dragIndex = null;
        },

        async merge() {
            if (!this.canMerge) return;

            try {
                const paths = this.orderedFiles.map(f => f.entry.path);
                let outputPath = this.outputName.trim();

                await this.dataset.mergeMultispectral(paths, outputPath);

                const sourceNames = paths.map(p => p.split('/').pop());
                this.$emit('onClose', 'merged', { outputPath, deleteSource: this.deleteSource, sourceNames, sourcePaths: paths });
            } catch (e) {
                this.validationResult = { ok: false, errors: [e.message || 'Merge failed'], warnings: [] };
            }
        },

        close() {
            if (this.previewUrl && this.previewUrl.startsWith('blob:')) {
                URL.revokeObjectURL(this.previewUrl);
            }
            this.$emit('onClose', 'close');
        }
    },

    beforeUnmount() {
        if (this.previewUrl && this.previewUrl.startsWith('blob:')) {
            URL.revokeObjectURL(this.previewUrl);
        }
    }
};
</script>

<style scoped>
.merge-ms-dialog {
    min-width: 400px;
}

.columns-row {
    display: flex;
    gap: 1rem;
    align-items: flex-start;
}

.col-bands {
    flex: 0 0 auto;
    min-width: 200px;
    max-width: 280px;
}

.col-info {
    flex: 1 1 0;
    min-width: 200px;
}

.col-preview {
    flex: 0 0 auto;
    text-align: center;
    display: flex;
    align-items: flex-start;
}

.section-label {
    display: block;
    font-weight: 600;
    margin-bottom: 0.35rem;
    font-size: 0.85rem;
}

.band-list {
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
    max-width: 220px;
    max-height: 220px;
    border: 1px solid var(--p-surface-200);
    border-radius: 0.375rem;
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
    background: var(--p-orange-50);
    border-left: 3px solid var(--p-orange-400);
    border-radius: 0.375rem;
    margin-top: 0.5rem;
    font-size: 0.8rem;
    color: var(--p-orange-800);
}

.alignment-warning i {
    margin-top: 0.1rem;
    font-size: 0.9rem;
}

.alignment-warning p {
    margin: 0.2rem 0 0 0;
}

.alignment-warning a {
    color: var(--p-orange-700);
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
