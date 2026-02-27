<template>
    <Window title="Transfer to Dataset" id="transferDialog" @onClose="close('close')" modal maxWidth="70%" fixedSize>
        <div class="transfer-dialog">
            <form v-on:submit.prevent class="form" :class="{ error: hasError }">

                <!-- Error Message -->
                <PrimeMessage v-if="errorMessage" severity="error" :closable="false">
                    {{ errorMessage }}
                </PrimeMessage>

                <!-- Source Info -->
                <PrimeMessage severity="info" :closable="false">
                    <strong>Source:</strong> {{ sourceInfo }}
                </PrimeMessage>

                <!-- Destination Organization -->
                <div class="field">
                    <label>Destination Organization</label>
                    <Select v-model="destOrg" @change="onOrgChange" :options="organizationOptions" optionLabel="label" optionValue="value" placeholder="Select organization..." class="w-full" />
                </div>

                <!-- Destination Dataset -->
                <div class="field">
                    <label>Destination Dataset</label>
                    <Select v-model="destDs" :disabled="!destOrg" :options="datasetOptions" optionLabel="label" optionValue="value" placeholder="Select dataset..." class="w-full" />
                </div>

                <!-- Destination Path -->
                <div class="field">
                    <label>Destination Path (optional)</label>
                    <input type="text" v-model="destPath" placeholder="Leave empty for root folder" />
                    <small class="help-text">Example: folder/subfolder</small>
                </div>

                <!-- Overwrite Checkbox -->
                <div class="field">
                    <div class="flex align-items-center gap-2">
                        <Checkbox v-model="overwrite" :binary="true" inputId="overwriteCheckbox" />
                        <label for="overwriteCheckbox">Overwrite existing files</label>
                    </div>
                </div>

                <!-- Progress Bar -->
                <div v-if="isTransferring" class="progress-section">
                    <ProgressBar :value="progress" :showValue="true" />
                    <div class="progress-label">{{ statusMessage }}</div>
                </div>

            </form>

            <!-- Buttons -->
            <div class="buttons">
                <Button @click="close('close')" :disabled="isTransferring" label="Close" />
                <Button @click="transfer" :disabled="!canTransfer" severity="success" icon="fa-solid fa-right-left" label="Transfer" />
            </div>
        </div>
    </Window>
</template>

<script>
import Window from './Window.vue';
import Button from 'primevue/button';
import PrimeMessage from 'primevue/message';
import Select from 'primevue/select';
import Checkbox from 'primevue/checkbox';
import ProgressBar from 'primevue/progressbar';
import ddb from 'ddb';

const { Registry } = ddb;
const reg = new Registry(window.location.origin);

export default {
    components: {
        Window, Button, PrimeMessage, Select, Checkbox, ProgressBar
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
        }
    },
    emits: ['onClose'],

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
            transferredCount: 0
        };
    },

    computed: {
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

        canTransfer: function () {
            return !this.isTransferring && this.destOrg && this.destDs;
        },

        hasError: function () {
            return !!this.errorMessage;
        },

        progressClass: function () {
            if (this.progress === 100) return 'success';
            return 'blue';
        },

        progressText: function () {
            return `${this.transferredCount}/${this.files.length}`;
        }
    },

    mounted: async function () {
        try {
            // Load organizations - getOrganizations returns Organization instances
            const orgInstances = await reg.getOrganizations();
            // Extract the org data from each Organization instance
            this.organizations = orgInstances.map(orgInstance => orgInstance.org);

        } catch (e) {
            console.error("Error loading organizations:", e);
            this.errorMessage = "Failed to load organizations: " + e.message;
        }
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

                    this.statusMessage = `Transferring ${sourcePath}...`;

                    await sourceDataset.transferObj(
                        sourcePath,
                        this.destOrg,
                        this.destDs,
                        this.destPath,
                        this.overwrite
                    );

                    this.transferredCount++;
                    this.progress = Math.round((this.transferredCount / this.files.length) * 100);
                }

                this.statusMessage = "Transfer completed successfully!";

                // Close dialog after a short delay
                setTimeout(() => {
                    this.$emit('onClose', 'transferred', this.files);
                }, 1500);

            } catch (e) {
                console.error("Transfer error:", e);
                this.errorMessage = "Transfer failed: " + e.message;
                this.isTransferring = false;
                this.statusMessage = "Transfer failed";
            }
        },

        close: function (buttonId) {
            if (this.isTransferring) return; // Prevent closing during transfer
            this.$emit('onClose', buttonId);
        }
    }
}
</script>

<style scoped>
.transfer-dialog {
    min-width: 500px;
}

.form {
    margin-bottom: 16px;
}

.field {
    margin-bottom: 16px;
}

.help-text {
    color: #999;
    font-style: italic;
    display: block;
    margin-top: 4px;
}

.progress-section {
    margin-top: 16px;
    margin-bottom: 16px;
}

.progress-label {
    margin-top: 6px;
    font-size: 0.9em;
    color: #666;
}

.buttons {
    margin-top: 16px;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
}

.flex {
    display: flex;
}

.align-items-center {
    align-items: center;
}

.gap-2 {
    gap: 0.5rem;
}
</style>
