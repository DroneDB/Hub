<template>
    <Window title="Transfer to Dataset" id="transferDialog" @onClose="close('close')" modal maxWidth="70%" fixedSize>
        <div class="transfer-dialog">
            <form v-on:submit.prevent class="ui form" :class="{ error: hasError, loading: isTransferring }">

                <!-- Error Message -->
                <div class="ui error message" v-if="errorMessage">
                    <p>{{ errorMessage }}</p>
                </div>

                <!-- Source Info -->
                <div class="ui message">
                    <p><strong>Source:</strong> {{ sourceInfo }}</p>
                </div>

                <!-- Destination Organization -->
                <div class="field">
                    <label>Destination Organization</label>
                    <div class="ui selection dropdown" ref="orgDropdown">
                        <input type="hidden" name="destOrg" v-model="destOrg">
                        <i class="dropdown icon"></i>
                        <div class="default text">Select organization...</div>
                        <div class="menu">
                            <div class="item" v-for="org in organizations" :key="org.slug" :data-value="org.slug">
                                <i class="sitemap icon"></i>{{ org.name || org.slug }}
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Destination Dataset -->
                <div class="field">
                    <label>Destination Dataset</label>
                    <div class="ui selection dropdown" ref="dsDropdown" :class="{ disabled: !destOrg }">
                        <input type="hidden" name="destDs" v-model="destDs">
                        <i class="dropdown icon"></i>
                        <div class="default text">Select dataset...</div>
                        <div class="menu">
                            <div class="item" v-for="ds in datasets" :key="ds.slug" :data-value="ds.slug">
                                <i class="database icon"></i>{{ ds.name || ds.slug }}
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Destination Path -->
                <div class="field">
                    <label>Destination Path (optional)</label>
                    <input type="text" v-model="destPath" placeholder="Leave empty for root folder" />
                    <small class="help-text">Example: folder/subfolder</small>
                </div>

                <!-- Overwrite Checkbox -->
                <div class="field">
                    <div class="ui checkbox">
                        <input type="checkbox" v-model="overwrite" id="overwriteCheckbox">
                        <label for="overwriteCheckbox">Overwrite existing files</label>
                    </div>
                </div>

                <!-- Progress Bar -->
                <div v-if="isTransferring" class="ui progress active" :class="progressClass">
                    <div class="bar" :style="{ width: progress + '%' }">
                        <div class="progress">{{ progressText }}</div>
                    </div>
                    <div class="label">{{ statusMessage }}</div>
                </div>

            </form>

            <!-- Buttons -->
            <div class="buttons">
                <button @click="close('close')" class="ui button" :disabled="isTransferring">
                    Close
                </button>
                <button @click="transfer" :disabled="!canTransfer" class="ui button positive">
                    <i class="exchange icon"></i> Transfer
                </button>
            </div>
        </div>
    </Window>
</template>

<script>
import Window from './Window.vue';
import ddb from 'ddb';

const { Registry } = ddb;
const reg = new Registry(window.location.origin);

export default {
    components: {
        Window
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

            // Initialize organization dropdown
            this.$nextTick(() => {
                $(this.$refs.orgDropdown).dropdown({
                    onChange: async (value) => {
                        this.destOrg = value;
                        this.destDs = null;
                        this.datasets = [];
                        await this.loadDatasets(value);
                    }
                });

                // Initialize dataset dropdown (will be enabled when org is selected)
                $(this.$refs.dsDropdown).dropdown({
                    onChange: (value) => {
                        this.destDs = value;
                    }
                });
            });

        } catch (e) {
            console.error("Error loading organizations:", e);
            this.errorMessage = "Failed to load organizations: " + e.message;
        }
    },

    methods: {
        async loadDatasets(orgSlug) {
            try {
                const org = reg.Organization(orgSlug);
                const datasetsRaw = await org.datasets();

                // Map datasets to extract the display name from properties.meta.name.data or use slug
                this.datasets = datasetsRaw.map(ds => ({
                    slug: ds.slug,
                    name: ds.properties?.meta?.name?.data || ds.slug
                }));

                // Refresh the dataset dropdown
                this.$nextTick(() => {
                    $(this.$refs.dsDropdown).dropdown('clear');
                    $(this.$refs.dsDropdown).dropdown('refresh');
                });
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

.ui.form {
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

.ui.message {
    margin-bottom: 16px;
}

.ui.progress {
    margin-top: 16px;
    margin-bottom: 16px;
}

.buttons {
    margin-top: 16px;
    text-align: right;
}

.buttons button {
    margin-left: 8px;
}
</style>
