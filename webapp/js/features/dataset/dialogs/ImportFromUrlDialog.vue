<template>
    <Window title="Import from URL" id="importFromUrlDialog" @onClose="close('close')" modal maxWidth="640px" fixedSize>
        <div class="import-url-dialog">
            <form v-on:submit.prevent="importing ? undefined : runImport()">

                <!-- Error -->
                <PrimeMessage v-if="errorMessage" severity="error" :closable="false">
                    {{ errorMessage }}
                </PrimeMessage>

                <!-- URL input row -->
                <div class="mb-3">
                    <label class="d-block mb-1 fw-semibold">File URL <span class="text-danger">*</span></label>
                    <div class="url-row">
                        <InputText v-model="url" placeholder="https://example.com/file.tif" :disabled="importing"
                            :invalid="urlTouched && !urlValid" fluid @input="onUrlInput" />
                        <Button type="button" severity="secondary" icon="fa-solid fa-magnifying-glass"
                            label="Verify" :loading="verifying" :disabled="importing || verifying || !urlValid"
                            @click="verify" />
                    </div>
                    <small v-if="urlTouched && !urlValid" class="text-danger">Enter a valid http/https URL.</small>
                </div>

                <!-- Verification result -->
                <div v-if="verifyResult" class="verify-result mb-3">
                    <PrimeMessage v-if="!verifyResult.reachable" severity="error" :closable="false">
                        <i class="fa-solid fa-circle-xmark"></i> URL not reachable<span v-if="verifyResult.note"> - {{ verifyResult.note }}</span>
                    </PrimeMessage>
                    <PrimeMessage v-else-if="verifyResult.blocked" severity="warn" :closable="false">
                        <i class="fa-solid fa-ban"></i> This file type is not allowed for import.
                    </PrimeMessage>
                    <PrimeMessage v-else-if="verifyResult.sizeExceedsLimit" severity="warn" :closable="false">
                        <i class="fa-solid fa-triangle-exclamation"></i> File too large<span v-if="verifyResult.note"> - {{ verifyResult.note }}</span>
                    </PrimeMessage>
                    <PrimeMessage v-else severity="success" :closable="false">
                        <i class="fa-solid fa-circle-check"></i>
                        Reachable
                        <span v-if="verifyResult.sizeBytes"> - {{ humanSize(verifyResult.sizeBytes) }}</span>
                        <span v-if="verifyResult.note" class="verify-note"> - {{ verifyResult.note }}</span>
                    </PrimeMessage>
                </div>

                <!-- File name -->
                <div class="mb-3">
                    <label class="d-block mb-1 fw-semibold">File name</label>
                    <InputText v-model="fileName" :placeholder="derivedFileName || 'Derived from URL after verify'" fluid
                        :disabled="importing" />
                    <small class="help-text">Leave empty to use the name from the URL.</small>
                </div>

                <!-- Destination folder -->
                <div class="mb-3">
                    <label class="d-block mb-1 fw-semibold">Destination folder</label>
                    <div class="url-row">
                        <InputText v-model="folder" placeholder="root folder" fluid :disabled="importing" />
                        <Button type="button" severity="secondary" icon="fa-solid fa-folder-open"
                            :disabled="importing" @click="folderPickerOpen = true" title="Browse folders" />
                    </div>
                    <small class="help-text">Destination folder inside the dataset (empty = root).</small>
                </div>

                <!-- Overwrite -->
                <div class="mb-3">
                    <div class="d-flex align-items-center gap-2">
                        <Checkbox v-model="overwrite" :binary="true" inputId="importOverwrite" :disabled="importing" />
                        <label for="importOverwrite">Overwrite existing file</label>
                    </div>
                </div>

                <!-- Advanced: basic-auth -->
                <div class="mb-3">
                    <span class="advanced-toggle" @click="showAuth = !showAuth">
                        <i :class="showAuth ? 'fa-solid fa-chevron-down' : 'fa-solid fa-chevron-right'"></i>
                        Authentication (optional)
                    </span>
                    <div v-if="showAuth" class="auth-fields mt-2">
                        <div class="d-flex gap-2">
                            <InputText v-model="username" placeholder="Username" fluid :disabled="importing" />
                            <InputText v-model="password" type="password" placeholder="Password" fluid :disabled="importing" />
                        </div>
                    </div>
                </div>

                <!-- Progress -->
                <div v-if="importing" class="progress-section mb-2">
                    <ProgressBar :value="importProgress" :showValue="true" />
                    <div class="progress-label">{{ importStatus }}</div>
                </div>

                <!-- Success -->
                <PrimeMessage v-if="importDone" severity="success" :closable="false">
                    <i class="fa-solid fa-circle-check"></i> Import completed. The file will appear in the dataset shortly.
                </PrimeMessage>

            </form>

            <!-- Action buttons -->
            <div class="d-flex justify-content-end gap-2 mt-3 w-100">
                <Button @click="close('close')" severity="secondary" label="Close" />
                <Button @click="runImport" :disabled="!canImport" :loading="importing"
                    severity="primary" icon="fa-solid fa-cloud-arrow-down" label="Import" />
            </div>
        </div>

        <FolderPickerDialog v-if="folderPickerOpen" :dataset="dataset" :initialPath="folder"
            @onClose="handleFolderPickerClose" />
    </Window>
</template>

<script>
/**
 * ImportFromUrlDialog - Single-file URL import dialog.
 *
 * Workflow:
 *   1. User enters an http/https URL and optionally clicks "Verify" to probe
 *      reachability, size and file-type policy without downloading.
 *   2. User confirms the destination folder, file name and overwrite flag.
 *   3. On "Import" the frontend calls POST /import/url (via dataset.importFromUrl)
 *      which returns a taskId for the `import-file` heavy task.
 *   4. The dialog polls the task inline (useHeavyTask.trackHeavyTask) so the user
 *      sees progress. The dialog can be closed and the task continues running in
 *      the Tasks tab.
 *   5. On successful completion the parent is notified via onClose('imported') so
 *      it can refresh the file browser.
 */
import Window from '@/components/Window.vue';
import Button from 'primevue/button';
import PrimeMessage from 'primevue/message';
import InputText from 'primevue/inputtext';
import Checkbox from 'primevue/checkbox';
import ProgressBar from 'primevue/progressbar';
import FolderPickerDialog from './FolderPickerDialog.vue';
import useHeavyTask from '@/composables/useHeavyTask';
import { bytesToSize } from '@/libs/utils';
import { isHttpUrl } from '@/libs/dragDropUtils';

export default {
    /** ImportFromUrlDialog - Single-file URL import dialog. */
    components: { Window, Button, PrimeMessage, InputText, Checkbox, ProgressBar, FolderPickerDialog },
    mixins: [useHeavyTask],

    props: {
        /** ddb Dataset instance for the target dataset. */
        dataset: { type: Object, required: true },
        /** Pre-filled URL (e.g. from OS clipboard paste). */
        initialUrl: { type: String, default: '' },
        /** Default destination folder (matches current browser path). */
        initialFolder: { type: String, default: '' }
    },
    emits: ['onClose'],

    data() {
        return {
            url: this.initialUrl || '',
            urlTouched: !!this.initialUrl,

            // Verification state
            verifying: false,
            verifyResult: null,

            // Import params
            fileName: '',
            folder: this.initialFolder || '',
            overwrite: false,

            // Auth
            showAuth: false,
            username: '',
            password: '',

            // Import progress
            importing: false,
            importProgress: 0,
            importStatus: 'Starting...',
            importDone: false,

            // Error
            errorMessage: null,

            // Folder picker
            folderPickerOpen: false
        };
    },

    computed: {
        urlValid() {
            return isHttpUrl(this.url);
        },

        /** File name derived from verification result, shown as placeholder. */
        derivedFileName() {
            return (this.verifyResult && this.verifyResult.fileName) || '';
        },

        canImport() {
            if (!this.urlValid || this.importing || this.verifying) return false;
            if (this.verifyResult) {
                if (!this.verifyResult.reachable) return false;
                if (this.verifyResult.blocked) return false;
                if (this.verifyResult.sizeExceedsLimit) return false;
            }
            return true;
        }
    },

    methods: {
        onUrlInput() {
            this.urlTouched = true;
            // Clear stale verify result when the URL changes.
            this.verifyResult = null;
            this.errorMessage = null;
        },

        async verify() {
            if (!this.urlValid || this.verifying) return;
            this.verifying = true;
            this.verifyResult = null;
            this.errorMessage = null;
            try {
                const result = await this.dataset.verifyUrlImport(this.url.trim(), {
                    username: this.username || undefined,
                    password: this.password || undefined
                });
                this.verifyResult = result;
                // Pre-fill the file name if the user hasn't typed one yet.
                if (!this.fileName && result.fileName) {
                    this.fileName = result.fileName;
                }
            } catch (e) {
                this.errorMessage = (e && e.message) ? e.message : String(e);
            } finally {
                this.verifying = false;
            }
        },

        async runImport() {
            if (!this.canImport || this.importing) return;
            this.importing = true;
            this.importDone = false;
            this.importProgress = 0;
            this.importStatus = 'Submitting...';
            this.errorMessage = null;

            try {
                const result = await this.dataset.importFromUrl({
                    url: this.url.trim(),
                    fileName: this.fileName.trim() || undefined,
                    folder: this.folder.trim() || undefined,
                    overwrite: this.overwrite,
                    username: this.username || undefined,
                    password: this.password || undefined,
                    sizeBytes: this.verifyResult ? this.verifyResult.sizeBytes : undefined
                });

                const taskId = result.taskId;

                // Poll the import-file task inline. The dialog stays open so the user
                // can see progress; if they close it the task keeps running in the Tasks
                // tab (trackHeavyTask resolves/rejects without cancelling on unmount).
                this.importStatus = 'Downloading...';

                await this.trackHeavyTask(this.dataset, taskId, {
                    notify: false,
                    onProgress: (t) => {
                        this.importProgress = t.percent || 0;
                        this.importStatus = this.phaseLabel(t.phase);
                    }
                });

                this.importProgress = 100;
                this.importStatus = 'Done';
                this.importDone = true;
                this.$emit('onClose', 'imported', { folder: this.folder.trim() || '' });

            } catch (e) {
                this.errorMessage = (e && e.message) ? e.message : String(e);
            } finally {
                this.importing = false;
            }
        },

        phaseLabel(phase) {
            switch (phase) {
                case 'downloading': return 'Downloading file...';
                case 'indexing': return 'Indexing file...';
                case 'building': return 'Building derivatives...';
                case 'done': return 'Finishing...';
                default: return 'Processing...';
            }
        },

        humanSize(bytes) {
            return bytesToSize(bytes);
        },

        handleFolderPickerClose(action, path) {
            this.folderPickerOpen = false;
            if (action === 'select') {
                this.folder = path || '';
            }
        },

        close(id) {
            // Allow closing even while importing (task continues in background).
            this.$emit('onClose', id || 'close');
        }
    }
};
</script>

<style scoped>
.import-url-dialog {
    display: flex;
    flex-direction: column;
    min-width: 28rem;
}

.url-row {
    display: flex;
    gap: var(--ddb-spacing-sm);
    align-items: flex-start;
}

.url-row .p-inputtext {
    flex: 1;
}

.verify-note {
    font-size: 0.85em;
    opacity: 0.85;
}

.auth-fields {
    border-left: 2px solid var(--ddb-border);
    padding-left: var(--ddb-spacing-md);
}

.advanced-toggle {
    cursor: pointer;
    font-size: 0.9em;
    color: var(--p-text-muted-color);
    user-select: none;
}

.advanced-toggle i {
    width: 0.9em;
}

.help-text {
    color: var(--p-text-muted-color);
    font-size: 0.82em;
}

.progress-section {
    margin-top: var(--ddb-spacing-sm);
}

.progress-label {
    font-size: 0.82em;
    color: var(--p-text-muted-color);
    margin-top: 4px;
}
</style>
