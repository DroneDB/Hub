<template>
    <Window id="extractDialog" title="Extract Archive" modal max-width="600px" fixed-size cancel-label="Close" confirm-label="Extract" confirm-icon="fa-solid fa-box-open" :confirm-disabled="!!destPathError" :busy="isExtracting" @confirm="extract" @close="close('close')">
        <div class="extract-dialog">
            <form @submit.prevent>

                <!-- Archive Info -->
                <PrimeMessage severity="info" :closable="false">
                    <strong>Archive:</strong> {{ archiveName }}
                </PrimeMessage>

                <!-- Destination Path -->
                <div class="my-3">
                    <label for="extract-dialog-extract-to" class="d-block mb-1 fw-semibold">Extract to</label>
                    <div class="dest-path-row">
                        <InputText id="extract-dialog-extract-to" v-model="destPath" placeholder="root folder" :disabled="isExtracting"
                                   :invalid="!!destPathError" fluid @input="onDestPathInput" />
                        <Button type="button" severity="secondary" icon="fa-solid fa-folder-open"
                                :disabled="isExtracting" title="Browse folders" aria-label="Browse folders"
                                @click="openFolderPicker" />
                    </div>
                    <small v-if="destPathError" class="dest-error">{{ destPathError }}</small>
                    <small v-else-if="destPathChecking" class="help-text"><LoadingSpinner inline label="Checking destination…" /></small>
                    <small v-else-if="destPathExists === true" class="dest-exists"><i class="fa-solid fa-folder-open" /> This folder already exists; extracted files will be added to it.</small>
                    <small v-else-if="destPathExists === false" class="dest-create"><i class="fa-solid fa-folder-plus" /> This folder will be created.</small>
                    <small v-else class="help-text">Destination folder (leave empty for the dataset root).</small>
                </div>

                <!-- Overwrite Checkbox -->
                <div class="mb-2">
                    <div class="d-flex align-items-center gap-2">
                        <Checkbox v-model="overwrite" :binary="true" input-id="extractOverwrite" :disabled="isExtracting" />
                        <label for="extractOverwrite">Overwrite existing files</label>
                    </div>
                </div>

                <!-- Delete Archive Checkbox -->
                <div class="mb-3">
                    <div class="d-flex align-items-center gap-2">
                        <Checkbox v-model="deleteArchive" :binary="true" input-id="extractDeleteArchive" :disabled="isExtracting" />
                        <label for="extractDeleteArchive">Delete archive after extraction</label>
                    </div>
                </div>

                <!-- The task: queued, extracting, failed with its reason (FR-XC-15) -->
                <HeavyTaskStatus :task="extractTask" :error="errorMessage" label="Extract" :phases="PHASES" cancellable :cancelling="cancelling"
                                 @cancel="cancelHeavyTask($event, 'Extract archive')" />

            </form>

            <!-- Buttons -->
        </div>

        <!-- Guided folder browser -->
        <FolderPicker v-if="folderPickerOpen" :dataset="dataset" mode="folder" title="Select Destination Folder" :initial-path="destPath"
                      @close="handleFolderPickerClose" />
        <DialogHost :dialogs="dialogs" />
    </Window>
</template>

<script>
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import Window from '@/components/HubWindow.vue';
import Button from 'primevue/button';
import PrimeMessage from 'primevue/message';
import InputText from 'primevue/inputtext';
import Checkbox from 'primevue/checkbox';
import HeavyTaskStatus from '@/components/HeavyTaskStatus.vue';
import FolderPicker from '@/components/FolderPicker.vue';
import DialogHost from '@/components/DialogHost.vue';
import { useHeavyTask } from '@/composables/useHeavyTask';
import { useDialogs } from '@/composables/useDialogs';
import { useHeavyTaskCancel } from '@/composables/useHeavyTaskCancel';
import { extractSummary } from '@/libs/tasks/extractSummary';
import ddb from 'ddb';

const { pathutils } = ddb;

// The phases the archive-extract tool reports, in words
const PHASES = Object.freeze({
    extracting: 'Extracting files…',
    building: 'Building derivatives…',
    done: 'Finishing…'
});

export default {
    components: { Window, Button, PrimeMessage, InputText, Checkbox, HeavyTaskStatus, FolderPicker, LoadingSpinner, DialogHost },

    props: {
        file: { type: Object, required: true },
        dataset: { type: Object, required: true }
    },
    emits: ['close'],

    setup(props) {
        const { runHeavyTask, heavyTasks } = useHeavyTask();
        const dialogs = useDialogs();
        const { cancelHeavyTask, cancelling } = useHeavyTaskCancel(() => props.dataset, dialogs);
        return { runHeavyTask, heavyTasks, PHASES, dialogs, cancelHeavyTask, cancelling };
    },
    data() {
        return {
            destPath: '',
            overwrite: false,
            deleteArchive: false,
            isExtracting: false,
            // The task of the latest submit (its state is read from heavyTasks) and the refusal of a submit with no task
            extractTaskId: null,
            errorMessage: '',
            destPathError: null,
            destPathExists: null,    // null = unknown/root, true = exists, false = will be created
            destPathChecking: false,
            folderPickerOpen: false
        };
    },

    computed: {
        extractTask() {
            return this.extractTaskId ? this.heavyTasks[this.extractTaskId] ?? null : null;
        },
        archiveName() {
            const p = this.file && this.file.entry ? this.file.entry.path : '';
            return p ? pathutils.basename(p) : '';
        }
    },

    mounted() {
        const path = this.file && this.file.entry ? this.file.entry.path : '';
        this.destPath = pathutils.getParentFolder(path) || '';
        this.validateDestPath();
        this.checkDestExistence();
    },

    beforeUnmount() {
        if (this._destCheckTimer) clearTimeout(this._destCheckTimer);
    },

    methods: {
        onDestPathInput() {
            this.validateDestPath();
            this.scheduleDestCheck();
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
            // A reserved folder (".ddb" in any of the spellings a file system opens as it) is refused
            // by the server with the rule of libddb when the extraction is submitted
            return true;
        },

        openFolderPicker() {
            this.folderPickerOpen = true;
        },

        // FolderPicker: { path, entry }, or null when cancelled
        handleFolderPickerClose(result) {
            this.folderPickerOpen = false;
            if (result) {
                this.destPath = result.path || '';
                this.validateDestPath();
                this.checkDestExistence();
            }
        },

        scheduleDestCheck() {
            this.destPathExists = null;
            if (this._destCheckTimer) clearTimeout(this._destCheckTimer);
            this._destCheckTimer = setTimeout(() => this.checkDestExistence(), 400);
        },

        // Tells the user whether the destination already exists or will be created,
        // before they hit Extract. Mirrors the server-side guard that rejects a
        // destination occupied by a non-folder entry.
        async checkDestExistence() {
            const raw = (this.destPath || '').trim();
            if (raw === '' || this.destPathError) {
                this.destPathExists = null;
                this.destPathChecking = false;
                return;
            }
            this.destPathChecking = true;
            const norm = (p) => (p || '').replace(/\/+$/, '');
            try {
                const parent = pathutils.getParentFolder(raw) || '';
                const entries = await this.dataset.list(parent.length ? parent : undefined);
                // Ignore stale responses if the user kept typing.
                if (norm(raw) !== norm(this.destPath)) return;
                const match = (entries || []).find(e => norm(e.path) === norm(raw));
                if (!match) {
                    this.destPathExists = false;
                } else if (ddb.entry.isDirectory(match)) {
                    this.destPathExists = true;
                } else {
                    this.destPathExists = null;
                    this.destPathError = 'A file with this name already exists.';
                }
            } catch {
                // Parent folder doesn't exist yet (or listing failed): it will be created.
                if (norm(raw) === norm(this.destPath)) this.destPathExists = false;
            } finally {
                if (norm(raw) === norm(this.destPath)) this.destPathChecking = false;
            }
        },

        async extract() {
            if (this.isExtracting) return;
            if (!this.validateDestPath()) return;
            const sourcePath = this.file && this.file.entry ? this.file.entry.path : null;
            if (!sourcePath) return;

            this.isExtracting = true;
            this.errorMessage = '';
            this.extractTaskId = null;

            try {
                // Offloaded to the archive-extract heavy task. Awaits completion so the
                // file listing can be refreshed when the dialog closes. The task lists
                // name it by the label the tool gives it (archive → folder, FR-PRC-22):
                // no `path` is sent only for that.
                const task = await this.runHeavyTask(this.dataset, 'archive-extract', {
                    params: {
                        sourcePath,
                        destPath: this.destPath || '',
                        deleteArchive: this.deleteArchive,
                        overwrite: this.overwrite
                    },
                    // No force: a second submit of the same extraction gets the running task (FR-PRC-02)
                    notify: false,
                    onSubmitted: entry => { this.extractTaskId = entry.taskId; }
                });

                this.$emit('close', 'extracted', {
                    destPath: this.destPath || '',
                    deletedArchive: this.deleteArchive,
                    archivePath: sourcePath,
                    // What the extraction did not extract, named with the reason (FR-PRC-30)
                    summary: extractSummary(task && task.logTail)
                });
            } catch (e) {
                // A failed task shows its own reason in the status; a refusal of the submit has no task
                if (!e?.task) this.errorMessage = (e && e.message) ? e.message : String(e);
            } finally {
                this.isExtracting = false;
            }
        },

        close(id) {
            if (this.isExtracting) return;
            this.$emit('close', id || 'close');
        }
    }
};
</script>

<style scoped>
.extract-dialog {
    min-width: min(380px, var(--window-content-width, 100%));
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
    color: var(--p-red-500);
    font-size: 0.8rem;
}

.help-text {
    color: var(--p-text-muted-color);
    font-size: 0.8rem;
}

.dest-exists {
    color: var(--p-text-muted-color);
    font-size: 0.8rem;
}

.dest-create {
    color: var(--p-primary-color);
    font-size: 0.8rem;
}
</style>
