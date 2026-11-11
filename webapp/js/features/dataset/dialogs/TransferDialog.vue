<template>
    <Window id="transferDialog" :title="mode.title" modal max-width="70%" fixed-size cancel-label="Close" :confirm-label="mode.confirmLabel" :confirm-icon="mode.confirmIcon" :confirm-disabled="!canTransfer" :busy="isTransferring" @confirm="transfer" @close="close('close')">
        <div class="transfer-dialog">
            <form :class="{ error: hasError }" @submit.prevent>

                <!-- Error Message -->
                <PrimeMessage v-if="errorMessage" severity="error" :closable="false">
                    {{ errorMessage }}
                </PrimeMessage>

                <!-- Source Info -->
                <PrimeMessage severity="info" :closable="false">
                    <strong>Source:</strong> {{ sourceInfo }}
                    <div class="mt-1" data-transfer-note>{{ mode.note }}</div>
                </PrimeMessage>

                <!-- Destination Organization -->
                <div class="my-3">
                    <label id="transfer-dialog-destination-organization-label" for="transfer-dialog-destination-organization" class="d-block mb-1 fw-semibold">Destination Organization</label>
                    <Select v-model="destOrg" input-id="transfer-dialog-destination-organization" aria-labelledby="transfer-dialog-destination-organization-label" :options="organizationOptions" option-label="label" option-value="value"
                            placeholder="Select organization" class="w-100" data-autofocus @change="onOrgChange" />
                </div>

                <!-- Destination Dataset -->
                <div class="mb-3">
                    <label id="transfer-dialog-destination-dataset-label" for="transfer-dialog-destination-dataset" class="d-block mb-1 fw-semibold">Destination Dataset</label>
                    <Select v-model="destDs" input-id="transfer-dialog-destination-dataset" aria-labelledby="transfer-dialog-destination-dataset-label" :disabled="!destOrg" :options="datasetOptions" option-label="label"
                            option-value="value" option-disabled="disabled" placeholder="Select dataset" class="w-100" />
                </div>

                <!-- Destination Path -->
                <div class="mb-3">
                    <label for="transfer-dialog-destination-path" class="d-block mb-1 fw-semibold">Destination Path (optional)</label>
                    <div class="dest-path-row">
                        <InputText id="transfer-dialog-destination-path" v-model="destPath" placeholder="Leave empty for root folder" fluid />
                        <Button type="button" severity="secondary" icon="fa-solid fa-folder-open" :disabled="!destDataset || isTransferring"
                                title="Browse folders" aria-label="Browse folders" data-browse @click="folderPickerOpen = true" />
                    </div>
                    <small class="help-text">A folder of the destination dataset: browse it, or type folder/subfolder</small>
                </div>

                <!-- Overwrite Checkbox -->
                <div class="mb-3">
                    <div class="d-flex align-items-center gap-2">
                        <Checkbox v-model="overwrite" :binary="true" input-id="overwriteCheckbox" />
                        <label for="overwriteCheckbox">Overwrite existing files</label>
                    </div>
                </div>

                <!-- Progress Bar -->
                <div v-if="isTransferring" class="progress-section">
                    <ProgressBar :value="progress" :show-value="true" />
                    <div class="progress-label">{{ statusMessage }}</div>
                </div>

            </form>

            <!-- Buttons -->
        </div>

        <FolderPicker v-if="folderPickerOpen && destDataset" :dataset="destDataset" mode="folder" title="Select Destination Folder"
                      :initial-path="destPath" @close="onFolderPicked" />
    </Window>
</template>

<script>
import Window from '@/components/HubWindow.vue';
import FolderPicker from '@/components/FolderPicker.vue';
import Button from 'primevue/button';
import PrimeMessage from 'primevue/message';
import Select from 'primevue/select';
import InputText from 'primevue/inputtext';
import Checkbox from 'primevue/checkbox';
import ProgressBar from 'primevue/progressbar';
import reg from '@/libs/api/sharedRegistry';
import { useTimerGroup } from '@/composables/useTimers';
import { transferModeOf } from '@/libs/dataset/transferMode';


export default {
    components: {
        Window, FolderPicker, Button, PrimeMessage, Select, InputText, Checkbox, ProgressBar
    },

    props: {
        files: {
            type: Array,
            required: true
        },
        sourceOrg: {
            type: String,
            required: true
        },
        sourceDs: {
            type: String,
            required: true
        },
        // true copies the files (the user can only read the source), false moves them
        keepSource: {
            type: Boolean,
            default: false
        }
    },
    emits: ['close'],

    setup() {
        return { later: useTimerGroup() };
    },
    data: function () {
        return {
            organizations: [],
            datasets: [],
            destOrg: null,
            destDs: null,
            destPath: "",
            overwrite: false,
            isTransferring: false,
            progress: 0,
            statusMessage: "",
            errorMessage: null,
            transferredCount: 0,
            folderPickerOpen: false
        };
    },

    computed: {
        mode: function () {
            return transferModeOf(this.keepSource);
        },

        sourceInfo: function () {
            if (this.files.length === 1) {
                return `${this.sourceOrg}/${this.sourceDs}/${this.files[0].entry.path}`;
            } else {
                return `${this.files.length} items from ${this.sourceOrg}/${this.sourceDs}`;
            }
        },

        organizationOptions: function () {
            return this.organizations.map(org => ({
                label: org.name || org.slug,
                value: org.slug
            }));
        },

        datasetOptions: function () {
            return this.datasets.map(ds => ({
                label: ds.name || ds.slug,
                value: ds.slug,
                disabled: this.isCurrentDataset(ds.slug)
            }));
        },

        // The chosen destination dataset, whose folders the picker browses
        destDataset: function () {
            return this.destOrg && this.destDs ? reg.Organization(this.destOrg).Dataset(this.destDs) : null;
        },

        canTransfer: function () {
            return !this.isTransferring && this.destOrg && this.destDs;
        },

        hasError: function () {
            return !!this.errorMessage;
        }
    },

    // The destination starts in the current organization: its datasets load with the list of
    // organizations, and it is dropped if the user may not write it
    mounted: async function () {
        this.destOrg = this.sourceOrg;
        const datasets = this.loadDatasets(this.sourceOrg);
        try {
            // Load organizations - getOrganizations returns Organization instances
            const orgInstances = await reg.orgs.getOrganizations();
            // Extract the org data from each Organization instance. Only the organizations the user may write
            // are destinations: the list also holds the Public ones they can only read (D-003, FR-ORG-02)
            this.organizations = orgInstances
                .map(orgInstance => orgInstance.org)
                .filter(org => org.permissions?.canWrite === true);
            if (this.destOrg === this.sourceOrg && !this.organizations.some(org => org.slug === this.sourceOrg)) {
                this.destOrg = null;
                this.destDs = null;
                this.datasets = [];
            }
        } catch (e) {
            console.error("Error loading organizations:", e);
            this.errorMessage = "Failed to load organizations: " + e.message;
        }
        await datasets;
    },

    methods: {
        async onOrgChange() {
            this.destDs = null;
            this.datasets = [];
            if (this.destOrg) {
                await this.loadDatasets(this.destOrg);
            }
        },

        isCurrentDataset(dsSlug) {
            // Disable the current dataset if we're in the same organization
            return this.destOrg === this.sourceOrg && dsSlug === this.sourceDs;
        },

        async loadDatasets(orgSlug) {
            try {
                const org = reg.Organization(orgSlug);
                const datasetsRaw = await org.datasets();
                // Another organization was chosen meanwhile
                if (this.destOrg !== orgSlug) return;

                // Map datasets to extract the display name from properties.meta.name.data or use slug
                this.datasets = datasetsRaw.map(ds => ({
                    slug: ds.slug,
                    name: ds.properties?.meta?.name?.data || ds.slug
                }));
            } catch (e) {
                console.error("Error loading datasets:", e);
                this.errorMessage = "Failed to load datasets: " + e.message;
            }
        },

        async transfer() {
            if (!this.canTransfer) return;

            this.isTransferring = true;
            this.progress = 0;
            this.transferredCount = 0;
            this.errorMessage = null;

            const sourceDataset = reg.Organization(this.sourceOrg).Dataset(this.sourceDs);

            try {
                for (let i = 0; i < this.files.length; i++) {
                    const file = this.files[i];
                    const sourcePath = file.entry.path;

                    this.statusMessage = `${this.mode.working} ${sourcePath}...`;

                    await sourceDataset.transferObj(
                        sourcePath,
                        this.destOrg,
                        this.destDs,
                        this.destPath,
                        this.overwrite,
                        this.mode.keepSource
                    );

                    this.transferredCount++;
                    this.progress = Math.round((this.transferredCount / this.files.length) * 100);
                }

                this.statusMessage = this.mode.summary;

                // Close dialog after a short delay
                this.later(() => this.$emit('close', 'transferred', this.files), 1500);

            } catch (e) {
                console.error(`${this.mode.failed}:`, e);
                this.errorMessage = `${this.mode.failed}: ${e.message}`;
                this.isTransferring = false;
                this.statusMessage = this.mode.failed;
            }
        },

        // FolderPicker: { path, entry }, or null when cancelled
        onFolderPicked(result) {
            this.folderPickerOpen = false;
            if (result) this.destPath = result.path || '';
        },

        close: function (buttonId) {
            if (this.isTransferring) return; // Prevent closing during transfer
            this.$emit('close', buttonId);
        }
    }
}
</script>

<style scoped>
.transfer-dialog {
    min-width: min(31.25rem, var(--window-content-width, 100%));
}

.dest-path-row {
    display: flex;
    align-items: stretch;
    gap: 0.5rem;
}

.dest-path-row :deep(.p-inputtext) {
    flex: 1 1 auto;
}

.help-text {
    color: var(--ddb-text-muted);
    font-style: italic;
    display: block;
    margin-top: 0.25rem;
}

.progress-section {
    margin-top: 1rem;
    margin-bottom: 1rem;
}

.progress-label {
    margin-top: var(--ddb-spacing-xs);
    font-size: var(--ddb-font-size-base);
    color: var(--ddb-text-secondary);
}
</style>
