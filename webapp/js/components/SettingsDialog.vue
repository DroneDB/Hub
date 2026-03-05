<template>
    <Window title="Settings" id="settings" @onClose="close('close')" modal maxWidth="70%" fixedSize fixedPosition
        closeModalOnClick>
        <Message bindTo="error" />

        <div v-if="loading" class="loading">
            <i class="fa-solid fa-circle-notch fa-spin" />
        </div>
        <div class="settings-body" v-else>
            <div class="settings-section">
                <h4>
                    <i class="fa-solid" :class="{ 'fa-unlock': noAuthRequired, 'fa-lock': !noAuthRequired }"></i>
                    Visibility: <Select v-model="visibility" @change="setVisibility" :options="visibilityOptions" optionLabel="label" optionValue="value" />
                </h4>
                <div class="settings-desc" v-html="safeDescription"></div>
            </div>

            <div class="settings-section">
                <h4>
                    <i class="fa-solid fa-scale-balanced"></i>
                    License: <Select v-model="license" @change="setLicense" :options="licenseOptions" optionLabel="label" optionValue="value" class="license-dropdown" :title="Licenses[license].name" />
                </h4>
            </div>

            <div class="settings-section" v-if="canWrite">
                <h4>
                    <i class="fa-solid fa-tag"></i>
                    Tagline
                </h4>
                <div class="tagline-field">
                    <InputText v-model="tagline" maxlength="256"
                        placeholder="Brief description of your dataset (max 256 chars)"
                        @change="setTagline" fluid />
                    <small class="char-count">{{ tagline ? tagline.length : 0 }}/256</small>
                </div>
            </div>

            <div class="settings-section" v-if="canWrite">
                <h4>
                    <i class="fa-solid fa-image"></i>
                    Thumbnail
                </h4>
                <div class="thumbnail-upload">
                    <div class="thumbnail-preview-container">
                        <img v-if="thumbnailPreview && !thumbnailError"
                            :src="thumbnailPreview"
                            class="thumbnail-preview"
                            @error="thumbnailError = true" />
                        <img v-else
                            src="/images/dataset-placeholder.svg"
                            class="thumbnail-preview thumbnail-placeholder" />
                    </div>
                    <div class="thumbnail-actions">
                        <input type="file" ref="thumbnailInput"
                            @change="handleThumbnailSelect"
                            accept="image/webp,image/jpeg,image/png"
                            style="display: none" />
                        <Button @click="$refs.thumbnailInput.click()"
                            :loading="thumbnailUploading" icon="fa-solid fa-upload" label="Upload" />
                        <Button v-if="thumbnailPreview && !thumbnailError"
                            severity="danger"
                            @click="removeThumbnail"
                            :loading="thumbnailRemoving" icon="fa-solid fa-trash" label="Remove" />
                    </div>
                </div>
            </div>

            <div class="settings-section" v-if="readme == null">
                <Button @click="addDocument('README.md')" icon="fa-solid fa-book" label="Add Readme" />
            </div>

            <div class="settings-section settings-maintenance" v-if="canWrite">
                <h4>
                    <i class="fa-solid fa-gear"></i>
                    Maintenance
                </h4>
                <div class="rescan-info-box">
                    <i class="fa-solid fa-circle-info"></i>
                    <div>
                        <strong>Rescan</strong> re-processes all indexed files to update their metadata
                        (e.g. GPS coordinates, timestamps, thumbnails). This is useful after a DroneDB upgrade
                        or if file metadata appears outdated or incorrect.
                    </div>
                </div>
                <Button @click="$emit('rescanRequested')" icon="fa-solid fa-rotate" label="Rescan Dataset" />
            </div>
        </div>
    </Window>
</template>

<script>
import Message from './Message.vue';
import mouse from '../libs/mouse';
import { clone } from '../libs/utils';
import { Licenses } from '../libs/licenses';
import Window from './Window.vue';
import Button from 'primevue/button';
import Select from 'primevue/select';
import InputText from 'primevue/inputtext';
import ddb from 'ddb';
import { sanitizeHtml } from '../libs/sanitize';

export default {
    props: {
        dataset: {
            required: true,
            type: Object
        },
        canWrite: {
            type: Boolean,
            default: false
        }
    },
    emits: ['onClose'],
    components: {
        Message, Window, Button, Select, InputText
    },
    data: function () {
        return {
            error: "",
            properties: null,
            loading: true,
            readme: null,
            license: "proprietary",
            tagline: "",
            thumbnailPreview: null,
            thumbnailError: false,
            thumbnailUploading: false,
            thumbnailRemoving: false,
            Licenses,
            Visibilities: {
                [ddb.Visibility.PUBLIC]: { label: "Public" },
                [ddb.Visibility.UNLISTED]: { label: "Unlisted" },
                [ddb.Visibility.PRIVATE]: { label: "Private" }
            },
            visibility: ddb.Visibility.PRIVATE
        }
    },
    mounted: async function () {
        try {
            const info = await this.dataset.info();
            this.properties = info[0].properties;

            this.readme = (typeof this.properties.readme !== 'undefined') ? this.properties.readme : null;
            this.license = this.properties?.meta?.license?.data ?? 'proprietary';
            this.visibility = this.properties?.meta?.visibility?.data ?? ddb.Visibility.PRIVATE;
            this.tagline = this.properties?.meta?.tagline?.data ?? '';

            // Load existing dataset thumbnail preview
            this.thumbnailPreview = this.dataset.datasetThumbUrl(256) + '&t=' + Date.now();
            this.thumbnailError = false;

            console.log(this.Visibilities);
        } catch (e) {
            this.error = e.message;
        }

        this.loading = false;
    },
    beforeUnmount: function () {
    },
    computed: {
        currentUrl: function () {
            return window.location.href;
        },
        noAuthRequired: function () {
            return [ddb.Visibility.PUBLIC, ddb.Visibility.UNLISTED].indexOf(this.visibility) !== -1;
        },
        description: function () {
            if (parseInt(this.visibility) === ddb.Visibility.PUBLIC) {
                return `This dataset will be discoverable. Anybody with the <a href="${this.currentUrl}">link</a> to this page can also see and download the data`;
            } else if (parseInt(this.visibility) === ddb.Visibility.UNLISTED) {
                return `Anybody with the <a href="${this.currentUrl}">link</a> to this page can see and download the data, but it will not be discoverable.`;
            } else {
                return `Only you and people in your organization can see and download the data.`;
            }
        },
        safeDescription: function () {
            return sanitizeHtml(this.description);
        },
        visibilityOptions: function () {
            return Object.entries(this.Visibilities).map(([k, v]) => ({
                value: parseInt(k),
                label: v.label
            }));
        },
        licenseOptions: function () {
            return Object.entries(this.Licenses).map(([k, v]) => ({
                value: k,
                label: v.name
            }));
        }
    },
    methods: {
        close: function (buttonId) {
            this.$emit('onClose', buttonId);
        },
        setVisibility: async function () {
            try {
                this.properties.meta.visibility = await this.dataset.setVisibility(this.visibility);
                this.$toast.add({ severity: 'success', summary: 'Visibility Updated', detail: 'Dataset visibility updated successfully', life: 3000 });
            } catch (e) {
                this.$toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to update visibility: ' + e.message, life: 5000 });
                this.error = e.message;
            }
        },
        setLicense: async function () {
            try {
                this.properties.meta.license = await this.dataset.metaSet("license", this.license);
                this.$toast.add({ severity: 'success', summary: 'License Updated', detail: 'Dataset license updated successfully', life: 3000 });
            } catch (e) {
                this.$toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to update license: ' + e.message, life: 5000 });
                this.error = e.message;
            }
        },
        setTagline: async function () {
            try {
                if (this.tagline && this.tagline.trim()) {
                    await this.dataset.metaSet('tagline', this.tagline.trim());
                    this.$toast.add({ severity: 'success', summary: 'Tagline Updated', detail: 'Tagline updated successfully', life: 3000 });
                } else {
                    await this.dataset.metaUnset('tagline');
                    this.tagline = '';
                    this.$toast.add({ severity: 'success', summary: 'Tagline Removed', detail: 'Tagline removed successfully', life: 3000 });
                }
            } catch (e) {
                this.$toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to update tagline: ' + e.message, life: 5000 });
                this.error = e.message;
            }
        },
        handleThumbnailSelect: async function (event) {
            const file = event.target.files[0];
            if (!file) return;

            this.thumbnailUploading = true;
            this.error = '';

            try {
                // Determine the target filename based on file type
                const ext = file.type === 'image/webp' ? 'webp'
                          : file.type === 'image/png' ? 'png'
                          : 'jpg';
                const path = `thumbnail.${ext}`;

                await this.dataset.uploadObj(path, file);

                // Refresh preview with cache-busting timestamp
                this.thumbnailPreview = this.dataset.datasetThumbUrl(256) + '&t=' + Date.now();
                this.thumbnailError = false;
                this.$toast.add({ severity: 'success', summary: 'Thumbnail Updated', detail: 'Thumbnail uploaded successfully', life: 3000 });
            } catch (e) {
                this.$toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to upload thumbnail: ' + e.message, life: 5000 });
                this.error = 'Failed to upload thumbnail: ' + e.message;
            }

            this.thumbnailUploading = false;
            // Reset file input so the same file can be re-selected
            this.$refs.thumbnailInput.value = '';
        },
        removeThumbnail: async function () {
            this.thumbnailRemoving = true;
            this.error = '';

            try {
                // Try to delete all possible thumbnail candidates
                const candidates = ['thumbnail.webp', 'thumbnail.jpg', 'thumbnail.png',
                                    'cover.webp', 'cover.jpg', 'cover.png'];
                for (const candidate of candidates) {
                    try {
                        await this.dataset.deleteObj(candidate);
                    } catch (e) {
                        // Ignore 404 errors — file doesn't exist
                    }
                }

                this.thumbnailPreview = null;
                this.thumbnailError = true;
                this.$toast.add({ severity: 'success', summary: 'Thumbnail Removed', detail: 'Thumbnail removed successfully', life: 3000 });
            } catch (e) {
                this.$toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to remove thumbnail: ' + e.message, life: 5000 });
                this.error = 'Failed to remove thumbnail: ' + e.message;
            }

            this.thumbnailRemoving = false;
        },
        addDocument: async function (document) {

            this.loading = true;

            var entry = null;

            try {
                switch (document) {
                    case "README.md":
                        entry = await this.dataset.writeObj(document, "\n");
                        this.readme = document;
                        break;
                    default:
                        throw new Error("Invalid document: " + document);
                }

                this.$toast.add({ severity: 'success', summary: 'Document Created', detail: `${document} created successfully`, life: 3000 });
                this.$emit('addMarkdown', document, entry);
            } catch (e) {
                this.$toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to create document: ' + e.message, life: 5000 });
                this.error = e.message;
            }

            this.loading = false;
        }
    }
}
</script>

<style scoped>
#settings {
    min-height: 12.5rem;
    padding: 1rem;
    margin-top: 0.75rem;
}

.loading {
    text-align: center;
    padding: 1rem;
}

.settings-body {
    padding: 0.25rem 0.5rem 0 0.5rem;
}

.settings-section {
    padding: var(--ddb-spacing-md) 0;
    border-bottom: var(--ddb-border-width) solid rgba(0, 0, 0, 0.08);
}

.settings-section:last-child {
    border-bottom: none;
    padding-bottom: 0;
}

.settings-section .ui.header {
    margin-top: 0;
    margin-bottom: var(--ddb-spacing-xs);
}

.settings-desc {
    font-size: 90%;
    margin-top: 0.25rem;
    max-width: 26.25rem;
    color: var(--ddb-text-secondary);
}

.settings-desc a {
    text-decoration: underline;
}

.settings-section .ui.button {
    color: var(--ddb-text) !important;
}

.license-dropdown {
    max-width: 16rem;
}

.rescan-info-box {
    display: flex;
    gap: var(--ddb-spacing-sm);
    padding: var(--ddb-spacing-sm) var(--ddb-spacing-md);
    margin-bottom: var(--ddb-spacing-md);
    background-color: rgba(var(--ddb-primary-rgb), 0.08);
    border: var(--ddb-border-width) solid rgba(var(--ddb-primary-rgb), 0.2);
    border-radius: var(--ddb-radius-sm);
    font-size: var(--ddb-font-size-sm);
    color: var(--ddb-text-secondary);
    line-height: 1.4;
}

.rescan-info-box > .icon {
    color: var(--ddb-primary);
    flex-shrink: 0;
    margin-top: var(--ddb-spacing-xs);
}

.tagline-field {
    position: relative;
}

.tagline-field .char-count {
    color: var(--ddb-text-muted);
    float: right;
    margin-top: var(--ddb-spacing-xs);
    font-size: var(--ddb-font-size-sm);
}

.thumbnail-upload {
    display: flex;
    align-items: center;
    gap: 1rem;
}

.thumbnail-preview-container {
    flex-shrink: 0;
}

.thumbnail-preview {
    max-width: 7.5rem;
    max-height: 5rem;
    object-fit: contain;
    border: var(--ddb-border-width) solid var(--ddb-border);
    border-radius: var(--ddb-radius-sm);
}

.thumbnail-placeholder {
    opacity: 0.4;
}

.thumbnail-actions {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}
</style>
