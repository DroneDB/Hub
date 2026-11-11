<template>
    <div id="upload" class="page-scroll">
        <div v-if="error" class="error-msg">
            <Message v-model="error" />
        </div>

        <!-- Where the files go, before the upload starts (FR-UPL-02): organization, name, visibility -->
        <form v-if="!batchOpen" class="upload-form form-column" novalidate @submit.prevent="startUpload">
            <div v-if="orgsLoaded && organizationOptions.length === 0" class="field">
                <Message :model-value="NO_WRITABLE_ORG" no-dismiss />
            </div>

            <div class="field">
                <label id="upload-org-label" for="upload-org" class="field-label">Organization</label>
                <Select v-model="orgSlug" input-id="upload-org" aria-labelledby="upload-org-label"
                        :options="organizationOptions" option-label="label" option-value="value"
                        :loading="!orgsLoaded" :disabled="starting || organizationOptions.length === 0"
                        placeholder="Select an organization" class="w-100" />
            </div>

            <div class="field">
                <label for="upload-dataset-name" class="field-label">Dataset name</label>
                <InputText id="upload-dataset-name" v-model="datasetName" :maxlength="DATASET_NAME_MAX_LENGTH"
                           :disabled="starting" :invalid="!!nameError" autocomplete="off" class="w-100"
                           :aria-describedby="nameError ? 'upload-dataset-name-error' : undefined"
                           @input="onNameInput" />
                <small v-if="nameError" id="upload-dataset-name-error" class="field-error" role="alert">{{ nameError }}</small>
            </div>

            <div class="field">
                <label id="upload-visibility-label" for="upload-visibility" class="field-label">Visibility</label>
                <Select v-model="visibility" input-id="upload-visibility" aria-labelledby="upload-visibility-label"
                        :options="visibilityOptions" option-label="label" option-value="value"
                        :disabled="starting" class="w-100" />
            </div>

            <!-- Drop files or a folder here, or use the button -->
            <div ref="droparea" class="droparea" :class="{ dragging }" role="presentation"
                 @dragenter.prevent="onDragEnter" @dragover.prevent @dragleave.prevent="onDragLeave"
                 @drop.prevent="handleDrop">
                <i class="fa-solid fa-cloud-arrow-up droparea-icon" aria-hidden="true" />
                <p class="droparea-text">Drop files or a folder here</p>
                <Button ref="btnUpload" type="button" severity="secondary" icon="fa-solid fa-file-circle-plus"
                        label="Choose files" :disabled="starting" @click="handleChoose" />
                <p v-if="staged.length > 0" class="droparea-staged">
                    {{ staged.length }} {{ staged.length === 1 ? 'file' : 'files' }} ({{ stagedSize }}) ready
                    <Button type="button" link size="small" label="Clear" @click="clearStaged" />
                </p>
            </div>

            <Button type="submit" size="large" icon="fa-solid fa-cloud-arrow-up" label="Upload"
                    :disabled="!canUpload" :loading="starting" />
        </form>

        <!-- The files of the batch (FR-UPL-16): the filter bar, every file with its status, the total, and Cancel, which asks -->
        <div v-if="batchOpen" class="upload-batch">
            <LoadingSpinner v-if="!snapshot" />

            <UploadQueueView v-else v-model:filter="activeFilter" :snapshot="snapshot" :rows="filteredFiles" @retry="retryFile">
                <template #footer>
                    <div class="actions">
                        <Button v-if="hasFailed && !committing" severity="secondary" icon="fa-solid fa-rotate-right"
                                label="Retry failed" @click="retryFailed" />
                        <Button v-if="!committing" severity="danger" icon="fa-solid fa-circle-stop" label="Cancel"
                                :disabled="cancelling" @click="handleCancel" />
                    </div>
                </template>
            </UploadQueueView>
        </div>

        <DialogHost :dialogs="dialogs" />
    </div>
</template>

<script>
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import Message from '@/components/HubMessage.vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import DialogHost from '@/components/DialogHost.vue';
import UploadQueueView from '@/features/dataset/upload/UploadQueueView.vue';
import { bytesToSize } from '@/libs/utils';
import { useConfirm } from '@/composables/useConfirm';
import { useDialogs } from '@/composables/useDialogs';
import { cancelUploadQuestion } from '@/libs/upload/cancelQuestion';
import reg from '@/libs/api/sharedRegistry';
import { notify } from '@/libs/notify';
import { useUploadQueue } from '@/composables/useUploadQueue';
import { createUploadRequests } from '@/libs/upload/uploadRequests';
import { authorizedGetJson } from '@/libs/upload/uploadFormat';
import { planNextJob } from '@/libs/upload/uploadPlanner';
import { getFilesFromDrop } from '@/libs/dragDropUtils';
import { VISIBILITY_OPTIONS, DEFAULT_VISIBILITY } from '@/libs/visibility';
import { latinNameProblem } from '@/libs/nameRules';
import {
    DATASET_NAME_MAX_LENGTH, writableOrganizations, defaultOrganization, defaultDatasetName, fieldErrorOf
} from '@/libs/upload/uploadForm';
import { markRaw } from 'vue';

// The share endpoint takes one file per request and keeps no receipts
const ONE_FILE_PER_REQUEST = { bundleMaxFiles: 1, chunkedFileBytes: Number.POSITIVE_INFINITY };

const NO_WRITABLE_ORG = 'You cannot upload files: you have no organization where you can add datasets. Ask an organization to add you as a member who can write.';

/** The path a file gets in the dataset: its folder structure when it came from a folder. @param {File & { fullPath?: string }} file */
const pathOf = file => file.fullPath || file.webkitRelativePath || file.name;

/**
 * Upload - the share page: it asks for the organization, the dataset name and the visibility (Private unless the
 * user chooses another), then the files dropped or picked here go to a new share batch, which is committed (and the
 * dataset opened) once every file is uploaded. Cancel, and leaving the page before the commit, roll the batch back
 * on the Registry through the upload queue's cancel (FR-XC-27): no half-filled dataset stays (FR-UPL-01). The
 * Registry also rolls back a batch with no upload for 24 hours (D-049). Same upload queue as the dataset
 * upload dialog (useUploadQueue).
 */
export default {
    name: 'UploadPage',
    components: { LoadingSpinner, Message, Button, InputText, Select, DialogHost, UploadQueueView },
    setup() {
        const dialogs = useDialogs();
        return { dialogs, confirm: useConfirm(dialogs) };
    },
    data: function () {
        return {
            error: "",
            activeFilter: 'all',
            uploadToken: null,
            // Reactive property holding a raw queue: a new queue (after Cancel) re-renders
            queue: markRaw(this.createQueue()),

            // The form
            organizations: [],
            orgsLoaded: false,
            orgSlug: null,
            datasetName: '',
            nameEdited: false,
            nameError: '',
            visibility: DEFAULT_VISIBILITY,
            visibilityOptions: VISIBILITY_OPTIONS,
            staged: [],
            dragging: false,
            starting: false,
            committing: false,
            cancelling: false,
            // The question before Cancel is open
            asking: false,

            NO_WRITABLE_ORG,
            DATASET_NAME_MAX_LENGTH
        }
    },
    computed: {
        organizationOptions() {
            return this.organizations.map(org => ({ value: org.slug, label: org.name || org.slug }));
        },
        canUpload() {
            return !this.starting && this.staged.length > 0 && !!this.orgSlug && this.datasetName.trim().length > 0;
        },
        stagedSize() {
            return bytesToSize(this.staged.reduce((sum, file) => sum + file.size, 0));
        },
        // From the first file queued on until the batch ends (committed, cancelled): the form is not shown
        batchOpen() {
            return !!this.uploadToken || this.starting;
        },
        snapshot() {
            return this.queue.state.value;
        },
        hasFailed() {
            return this.snapshot != null && this.snapshot.done && this.snapshot.counts.error > 0;
        },
        filesCount() {
            return this.snapshot?.counts.total ?? 0;
        },
        // The files that are added to the batch: what Cancel would delete
        uploadedFiles() {
            return this.snapshot?.counts.done ?? 0;
        },
        // The files of the filter, all of them (a long list scrolls inside the view)
        filteredFiles() {
            const filter = this.activeFilter;
            return this.queue.rows(f => filter === 'all' ||
                (filter === 'uploading' ? ['uploading', 'processing', 'pending'].includes(f.status) : f.status === filter));
        }
    },
    async mounted() {
        try {
            const organizations = (await reg.orgs.getOrganizations()).map(instance => instance.org);
            this.organizations = writableOrganizations(organizations);
            this.orgSlug = defaultOrganization(this.organizations, reg.getUsername())?.slug ?? null;
        } catch (e) {
            this.error = `Cannot load your organizations: ${e.message}`;
        } finally {
            this.orgsLoaded = true;
        }
    },
    beforeUnmount: function () {
        // No ghost uploads: requests in flight and pending retries stop with the view, and a batch that was not
        // committed goes with it (a commit in flight is left to finish)
        this._isUnmounted = true;
        const token = this.uploadToken;
        if (token && !this.committing && !this.committed) {
            this.queue.cancel({ cleanup: () => reg.share.rollback(token) }).then(({ cleanupError }) => {
                // The Registry rolls the batch back itself after 24 hours (D-049)
                if (cleanupError) console.warn('Cannot roll back the upload batch', cleanupError);
            });
        } else {
            this.queue.cancel();
        }
    },
    methods: {
        createQueue() {
            return useUploadQueue({
                // The batch exists before the first file is queued (startUpload)
                send: (job, hooks) => this.shareRequests.send(job, hooks),
                plan: ready => planNextJob(ready, ONE_FILE_PER_REQUEST),
                onIdle: snapshot => this.onIdle(snapshot)
            });
        },

        // ---- Choosing the files

        /** Files dropped or picked: they wait for Upload, and name the dataset when the user has not. @param {File[]} files */
        stage(files) {
            if (files.length === 0) return;
            const known = new Set(this.staged.map(pathOf));
            const added = files.filter(file => !known.has(pathOf(file)));
            if (this.staged.length === 0 && !this.nameEdited) {
                this.datasetName = defaultDatasetName(files);
                this.nameError = '';
            }
            this.staged = [...this.staged, ...added];
        },

        clearStaged() {
            this.staged = [];
            if (!this.nameEdited) this.datasetName = '';
        },

        onNameInput() {
            this.nameEdited = this.datasetName !== '';
            this.nameError = '';
        },

        onDragEnter() {
            this._dragDepth = (this._dragDepth ?? 0) + 1;
            this.dragging = true;
        },

        onDragLeave() {
            this._dragDepth = Math.max(0, (this._dragDepth ?? 1) - 1);
            if (this._dragDepth === 0) this.dragging = false;
        },

        async handleDrop(ev) {
            this._dragDepth = 0;
            this.dragging = false;
            if (this.starting) return;
            // Folders are walked, with their structure (getFilesFromDrop)
            this.stage(await getFilesFromDrop(ev));
        },

        handleChoose: function () {
            const input = document.createElement('input');
            input.type = 'file';
            input.multiple = true;
            input.style.display = 'none';
            // lifetime: element (a one-shot file input created here)
            input.addEventListener('change', (e) => {
                this.stage(Array.from(e.target.files || []));
                document.body.removeChild(input);
            }, { once: true });
            document.body.appendChild(input);
            input.click();
        },

        // ---- The batch

        /** The refusal of the form before a request: what is wrong with the name, or '' */
        formProblem() {
            const name = this.datasetName.trim();
            if (!name) return 'Enter a name for the dataset';
            return latinNameProblem(name, { withSlugField: false }) ?? '';
        },

        async startUpload() {
            if (!this.canUpload) return;
            this.nameError = this.formProblem();
            if (this.nameError) return;

            this.error = '';
            this.starting = true;
            try {
                const r = await reg.share.init({
                    orgSlug: this.orgSlug,
                    datasetName: this.datasetName.trim(),
                    visibility: this.visibility
                });
                // The page was left while the batch was being created: nothing is sent, and the new batch goes
                // (beforeUnmount had no token to roll back)
                if (this._isUnmounted) {
                    reg.share.rollback(r.token).catch(e => {
                        // The Registry rolls the batch back itself after 24 hours (D-049)
                        console.warn('Cannot roll back the upload batch', e);
                    });
                    return;
                }
                this.uploadToken = r.token;
                this.shareRequests = createUploadRequests({
                    baseUrl: reg.url,
                    singleUrl: reg.share.uploadUrl(this.uploadToken),
                    authToken: () => reg.getAuthToken(),
                    getJson: authorizedGetJson(reg),
                    destination: item => item.path,
                    receipts: false
                });
                const files = this.staged;
                this.staged = [];
                this.queue.add(files.map(file => ({ file, path: pathOf(file) })));
            } catch (e) {
                // A refused name shows at its field, not in a toast (D-047)
                const nameError = fieldErrorOf(e, 'datasetName');
                if (nameError) this.nameError = nameError;
                else this.error = `Cannot initialize upload: ${e.message}`;
            } finally {
                this.starting = false;
            }
        },

        // Commit only when every file went through
        async onIdle(snapshot) {
            if (this._isUnmounted || this.committing || this.cancelling || !this.uploadToken) return;
            const failed = snapshot.items.filter(i => i.status === 'error');
            if (failed.length > 0) {
                this.activeFilter = 'error';
                this.error = failed.length === 1
                    ? `Failed to upload ${failed[0].name}: ${failed[0].errorMessage}`
                    : `Failed to upload ${failed.length} files (first: ${failed[0].name}: ${failed[0].errorMessage})`;
                return;
            }

            this.committing = true;
            try {
                const r = await reg.share.commit(this.uploadToken);
                this.committed = true;
                // The component may unmount while the commit is in flight
                if (!this._isUnmounted) this.openDataset(r);
                else if (r.error) this.error = r.error;
            } catch (e) {
                this.error = e.message;
            } finally {
                this.committing = false;
            }
        },

        // The dataset the batch filled, through the router
        openDataset(result) {
            const tag = result?.tag;
            if (tag?.organizationSlug && tag?.datasetSlug) {
                notify.success(`${this.filesCount} ${this.filesCount === 1 ? 'file' : 'files'} uploaded to ${this.datasetName.trim()}`,
                    { summary: 'Upload complete' });
                this.$router.push({ name: 'ViewDataset', params: { org: tag.organizationSlug, ds: tag.datasetSlug } });
            } else if (result?.url) {
                notify.success('Upload complete');
                this.$router.push(result.url);
            } else if (result?.error) {
                this.error = result.error;
            } else {
                this.error = `Cannot upload files: ${JSON.stringify(result)}`;
            }
        },

        retryFailed() {
            this.error = '';
            this.activeFilter = 'all';
            this.queue.retryFailed();
        },

        retryFile(file) {
            this.queue.retry(file.id);
        },

        // Cancel asks first (FR-UPL-16: nothing is kept), then discards the batch: the Registry removes its files and the dataset
        // it created (FR-UPL-01)
        async handleCancel() {
            const token = this.uploadToken;
            if (this.cancelling || this.asking) return;
            this.asking = true;
            try {
                // The rollback goes before the token is dropped
                const { cancelled, cleanupError } = await this.queue.cancel({
                    confirm: async () => {
                        const ok = await this.confirm(cancelUploadQuestion({ sent: this.uploadedFiles, discardsBatch: true }));
                        if (!ok) return false;
                        // The upload went on while the question was open: a commit that began is not undone, and the
                        // answer says so
                        if (this.committing || this.committed) {
                            notify.info('The upload had finished; nothing was cancelled');
                            return false;
                        }
                        // From here the batch is being discarded: nothing commits it
                        this.cancelling = true;
                        return true;
                    },
                    cleanup: token ? () => reg.share.rollback(token) : undefined
                });
                if (!cancelled) return;
                this.activeFilter = 'all';
                this.queue = markRaw(this.createQueue());
                this.uploadToken = null;
                this.shareRequests = null;
                this.error = '';
                if (cleanupError) {
                    notify.warn('The upload was stopped, but the Registry could not discard it now. It removes an upload that stays unfinished after 24 hours.',
                        { summary: 'Upload cancelled' });
                } else {
                    notify.info('Upload cancelled');
                }
            } finally {
                this.asking = false;
                this.cancelling = false;
            }
        }
    }
}
</script>

<style scoped>
.error-msg {
    margin: 1rem;
}

/* A long list of uploads scrolls inside the page (.page-scroll) */
#upload {
    text-align: center;
}

.upload-form {
    display: flex;
    flex-direction: column;
    gap: var(--ddb-spacing-lg);
    /* One column of --ddb-form-max (.form-column of css/app.scss, FR-XC-33) */
    margin: var(--ddb-spacing-xl) auto;
    padding: 0 var(--ddb-spacing-lg);
    text-align: left;
}

.field-label {
    display: block;
    margin-bottom: var(--ddb-spacing-xs);
    font-weight: 600;
}

.field-error {
    display: block;
    color: var(--ddb-danger);
}

/* The drop zone: dashed, highlighted while files are dragged over it */
.droparea {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    /* A zone of its own, not a strip under the fields: half the height of the screen (FR-NAV-10) */
    min-height: 50vh;
    gap: var(--ddb-spacing-sm);
    padding: var(--ddb-spacing-xl);
    border: 2px dashed var(--ddb-border-medium);
    border-radius: var(--ddb-radius-md);
    text-align: center;
    transition: border-color 0.15s, background-color 0.15s;
}

.droparea.dragging {
    border-color: var(--ddb-primary);
    background-color: rgba(var(--ddb-primary-rgb), 0.08);
}

.droparea-icon {
    font-size: 2rem;
    color: var(--ddb-text-secondary);
}

.droparea-text {
    margin: 0;
    color: var(--ddb-text-secondary);
}

.droparea-staged {
    margin: 0;
}

/* The files of the batch: the one view of the dataset upload (UploadQueueView), a column of its own on the page */
.upload-batch {
    display: flex;
    flex-direction: column;
    width: min(50rem, 100% - 2rem);
    max-height: 80vh;
    margin: var(--ddb-spacing-lg) auto;
    text-align: left;

    .actions {
        display: flex;
        justify-content: flex-end;
        gap: var(--ddb-spacing-md);
    }
}
</style>
