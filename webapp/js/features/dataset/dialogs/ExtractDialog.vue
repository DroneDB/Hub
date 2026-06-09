<template>
    <Window title="Extract Archive" id="extractDialog" @onClose="close('close')" modal maxWidth="600px" fixedSize>
        <div class="extract-dialog">
            <form v-on:submit.prevent>

                <!-- Error Message -->
                <PrimeMessage v-if="errorMessage" severity="error" :closable="false">
                    {{ errorMessage }}
                </PrimeMessage>

                <!-- Archive Info -->
                <PrimeMessage severity="info" :closable="false">
                    <strong>Archive:</strong> {{ archiveName }}
                </PrimeMessage>

                <!-- Destination Path -->
                <div class="my-3">
                    <label class="d-block mb-1 fw-semibold">Extract to</label>
                    <div class="dest-path-row">
                        <InputText v-model="destPath" placeholder="root folder" :disabled="isExtracting"
                            :invalid="!!destPathError" @input="onDestPathInput" fluid />
                        <Button type="button" severity="secondary" icon="fa-solid fa-folder-open"
                            :disabled="isExtracting" @click="openFolderPicker" title="Browse folders"
                            aria-label="Browse folders" />
                    </div>
                    <small v-if="destPathError" class="dest-error">{{ destPathError }}</small>
                    <small v-else class="help-text">Destination folder (leave empty for the dataset root).</small>
                </div>

                <!-- Overwrite Checkbox -->
                <div class="mb-2">
                    <div class="d-flex align-items-center gap-2">
                        <Checkbox v-model="overwrite" :binary="true" inputId="extractOverwrite" :disabled="isExtracting" />
                        <label for="extractOverwrite">Overwrite existing files</label>
                    </div>
                </div>

                <!-- Delete Archive Checkbox -->
                <div class="mb-3">
                    <div class="d-flex align-items-center gap-2">
                        <Checkbox v-model="deleteArchive" :binary="true" inputId="extractDeleteArchive" :disabled="isExtracting" />
                        <label for="extractDeleteArchive">Delete archive after extraction</label>
                    </div>
                </div>

                <!-- Progress Bar -->
                <div v-if="isExtracting" class="progress-section">
                    <ProgressBar :value="progress" :showValue="true" />
                    <div class="progress-label">{{ statusMessage }}</div>
                </div>

            </form>

            <!-- Buttons -->
            <div class="d-flex justify-content-end gap-2 mt-3 w-100">
                <Button @click="close('close')" severity="secondary" :disabled="isExtracting" label="Close" />
                <Button @click="extract" :disabled="isExtracting || !!destPathError" :loading="isExtracting"
                    severity="primary" icon="fa-solid fa-box-open" label="Extract" />
            </div>
        </div>

        <!-- Guided folder browser -->
        <FolderPickerDialog v-if="folderPickerOpen" :dataset="dataset" :initialPath="destPath"
            @onClose="handleFolderPickerClose" />
    </Window>
</template>

<script>
import Window from '@/components/Window.vue';
import Button from 'primevue/button';
import PrimeMessage from 'primevue/message';
import InputText from 'primevue/inputtext';
import Checkbox from 'primevue/checkbox';
import ProgressBar from 'primevue/progressbar';
import FolderPickerDialog from './FolderPickerDialog.vue';
import useHeavyTask from '@/composables/useHeavyTask';
import ddb from 'ddb';

const { pathutils } = ddb;

export default {
    components: { Window, Button, PrimeMessage, InputText, Checkbox, ProgressBar, FolderPickerDialog },
    mixins: [useHeavyTask],

    props: {
        file: { type: Object, required: true },
        dataset: { type: Object, required: true }
    },
    emits: ['onClose'],

    data() {
        return {
            destPath: '',
            overwrite: false,
            deleteArchive: false,
            isExtracting: false,
            progress: 0,
            statusMessage: '',
            errorMessage: null,
            destPathError: null,
            folderPickerOpen: false
        };
    },

    computed: {
        archiveName() {
            const p = this.file && this.file.entry ? this.file.entry.path : '';
            return p ? pathutils.basename(p) : '';
        }
    },

    mounted() {
        const path = this.file && this.file.entry ? this.file.entry.path : '';
        this.destPath = pathutils.getParentFolder(path) || '';
        this.validateDestPath();
    },

    methods: {
        onDestPathInput() {
            this.validateDestPath();
        },

        // Client-side guard mirroring the server-side checks
        // (CommonUtils.ValidateRelativePath + reserved .ddb folder).
        validateDestPath() {
            this.destPathError = null;
            const raw = (this.destPath || '').trim();
            if (raw === '') return true; // empty = dataset root

            if (raw.startsWith('/') || raw.startsWith('\\')) {
                this.destPathError = 'Path must be relative (cannot start with a slash).';
                return false;
            }
            if (raw.includes('\\')) {
                this.destPathError = 'Use forward slashes (/) as the folder separator.';
                return false;
            }
            const segments = raw.split('/');
            if (segments.some(s => s === '.' || s === '..')) {
                this.destPathError = 'Path cannot contain "." or ".." segments.';
                return false;
            }
            if (segments.some(s => s.trim().length === 0)) {
                this.destPathError = 'Path cannot contain empty folder names.';
                return false;
            }
            // Reserved DroneDB database folder (server rejects any ".ddb" prefix).
            if (raw.startsWith('.ddb')) {
                this.destPathError = 'This is a reserved path.';
                return false;
            }
            return true;
        },

        openFolderPicker() {
            this.folderPickerOpen = true;
        },

        handleFolderPickerClose(action, path) {
            this.folderPickerOpen = false;
            if (action === 'select') {
                this.destPath = path || '';
                this.validateDestPath();
            }
        },

        async extract() {
            if (this.isExtracting) return;
            if (!this.validateDestPath()) return;
            const sourcePath = this.file && this.file.entry ? this.file.entry.path : null;
            if (!sourcePath) return;

            this.isExtracting = true;
            this.errorMessage = null;
            this.progress = 0;
            this.statusMessage = 'Starting…';

            try {
                // Offloaded to the archive-extract heavy task. Awaits completion so the
                // file listing can be refreshed when the dialog closes.
                // Pass sourcePath as the task's `path` field so TasksTable shows the
                // archive name instead of "Whole dataset".
                await this.runHeavyTask(this.dataset, 'archive-extract', {
                    path: sourcePath,
                    params: {
                        sourcePath,
                        destPath: this.destPath || '',
                        deleteArchive: this.deleteArchive,
                        overwrite: this.overwrite
                    },
                    force: true,
                    notify: false,
                    onProgress: (t) => {
                        this.progress = t.percent || 0;
                        this.statusMessage = this.phaseLabel(t.phase);
                    }
                });

                this.$emit('onClose', 'extracted', {
                    destPath: this.destPath || '',
                    deletedArchive: this.deleteArchive,
                    archivePath: sourcePath
                });
            } catch (e) {
                this.errorMessage = (e && e.message) ? e.message : String(e);
            } finally {
                this.isExtracting = false;
            }
        },

        phaseLabel(phase) {
            switch (phase) {
                case 'extracting': return 'Extracting files…';
                case 'building': return 'Building derivatives…';
                case 'done': return 'Finishing…';
                default: return 'Working…';
            }
        },

        close(id) {
            if (this.isExtracting) return;
            this.$emit('onClose', id || 'close');
        }
    }
};
</script>

<style scoped>
.extract-dialog {
    min-width: 380px;
}

.dest-path-row {
    display: flex;
    align-items: stretch;
    gap: 0.5rem;
}

.dest-path-row :deep(.p-inputtext) {
    flex: 1 1 auto;
}

.dest-error {
    color: var(--p-red-500, #e24c4c);
    font-size: 0.8rem;
}

.help-text {
    color: var(--p-text-muted-color, #888);
    font-size: 0.8rem;
}

.progress-section {
    margin-top: 1rem;
}

.progress-label {
    margin-top: 0.4rem;
    font-size: 0.85rem;
    color: var(--p-text-muted-color, #888);
    text-align: center;
}
</style>
