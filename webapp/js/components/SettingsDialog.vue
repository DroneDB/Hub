<template>
    <Window title="Settings" id="settings" @onClose="close('close')" modal maxWidth="70%" fixedSize fixedPosition
        closeModalOnClick>
        <Message bindTo="error" />

        <div v-if="loading" class="loading">
            <i class="icon circle notch spin" />
        </div>
        <div class="settings-body" v-else>
            <div class="settings-section">
                <h4 class="ui header">
                    <i class="icon" :class="{ unlock: noAuthRequired, lock: !noAuthRequired }"></i>
                    <div class="content">
                        Visibility: <select v-model="visibility" @change="setVisibility">
                            <option v-for="(v, k) in Visibilities" :value="k">{{ v.label }}</option>
                        </select>
                    </div>
                </h4>
                <div class="settings-desc" v-html="description"></div>
            </div>

            <div class="settings-section">
                <h4 class="ui header">
                    <i class="icon balance scale"></i>
                    <div class="content">
                        License: <select style="text-overflow: ellipsis" :title="Licenses[license].name"
                            class="license-dropdown" v-model="license" @change="setLicense">
                            <option v-for="(v, k) in Licenses" :value="k">{{ v.name }}</option>
                        </select>
                    </div>
                </h4>
            </div>

            <div class="settings-section" v-if="canWrite">
                <h4 class="ui header">
                    <i class="icon tag"></i>
                    <div class="content">Tagline</div>
                </h4>
                <div class="tagline-field">
                    <input type="text" v-model="tagline" maxlength="256"
                        placeholder="Brief description of your dataset (max 256 chars)"
                        @change="setTagline" />
                    <small class="char-count">{{ tagline ? tagline.length : 0 }}/256</small>
                </div>
            </div>

            <div class="settings-section" v-if="canWrite">
                <h4 class="ui header">
                    <i class="icon image"></i>
                    <div class="content">Thumbnail</div>
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
                        <button type="button" class="ui button basic icon small"
                            @click="$refs.thumbnailInput.click()"
                            :class="{ loading: thumbnailUploading }">
                            <i class="icon upload"></i> Upload
                        </button>
                        <button v-if="thumbnailPreview && !thumbnailError"
                            type="button" class="ui button basic icon small negative"
                            @click="removeThumbnail"
                            :class="{ loading: thumbnailRemoving }">
                            <i class="icon trash"></i> Remove
                        </button>
                    </div>
                </div>
            </div>

            <div class="settings-section" v-if="readme == null">
                <button @click="addDocument('README.md')" class="ui button basic icon">
                    <i class="icon book" /> Add Readme
                </button>
            </div>

            <div class="settings-section settings-maintenance" v-if="canWrite">
                <h4 class="ui header">
                    <i class="icon cog"></i>
                    <div class="content">Maintenance</div>
                </h4>
                <div class="rescan-info-box">
                    <i class="icon info circle"></i>
                    <div>
                        <strong>Rescan</strong> re-processes all indexed files to update their metadata
                        (e.g. GPS coordinates, timestamps, thumbnails). This is useful after a DroneDB upgrade
                        or if file metadata appears outdated or incorrect.
                    </div>
                </div>
                <button @click="$emit('rescanRequested')" class="ui button basic icon">
                    <i class="icon sync" /> Rescan Dataset
                </button>
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
import ddb from 'ddb';

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
    components: {
        Message, Window
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
    beforeDestroy: function () {
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
        }
    },
    methods: {
        close: function (buttonId) {
            this.$emit('onClose', buttonId);
        },
        setVisibility: async function () {
            try {
                this.properties.meta.visibility = await this.dataset.setVisibility(this.visibility);
            } catch (e) {
                this.error = e.message;
            }
        },
        setLicense: async function () {
            try {
                this.properties.meta.license = await this.dataset.metaSet("license", this.license);
            } catch (e) {
                this.error = e.message;
            }
        },
        setTagline: async function () {
            try {
                if (this.tagline && this.tagline.trim()) {
                    await this.dataset.metaSet('tagline', this.tagline.trim());
                } else {
                    await this.dataset.metaUnset('tagline');
                    this.tagline = '';
                }
            } catch (e) {
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
            } catch (e) {
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
            } catch (e) {
                this.error = 'Failed to remove thumbnail: ' + e.message;
            }

            this.thumbnailRemoving = false;
        },
        addDocument: async function (document) {

            this.loading = true;

            var entry = null;

            switch (document) {
                // case "LICENSE.md":
                //     entry = await this.dataset.writeObj(document, "# License\n");
                //     this.license = document;
                //     break;
                case "README.md":
                    entry = await this.dataset.writeObj(document, "\n");
                    this.readme = document;
                    break;
                default:
                    throw new Error("Invalid document: " + document);
            }

            this.$emit('addMarkdown', document, entry);

            this.loading = false;
        }
    }
}
</script>

<style scoped>
#settings {
    min-height: 200px;
    padding: 16px;
    margin-top: 12px;
}

.loading {
    text-align: center;
    padding: 16px;
}

.settings-body {
    padding: 4px 8px 0 8px;
}

.settings-section {
    padding: 12px 0;
    border-bottom: 1px solid rgba(0, 0, 0, 0.08);
}

.settings-section:last-child {
    border-bottom: none;
    padding-bottom: 0;
}

.settings-section .ui.header {
    margin-top: 0;
    margin-bottom: 6px;
}

.settings-desc {
    font-size: 90%;
    margin-top: 4px;
    max-width: 420px;
    color: #555;
}

.settings-desc a {
    text-decoration: underline;
}

.settings-section .ui.button {
    color: #030A03 !important;
}

.license-dropdown {
    max-width: 250px;
}

.rescan-info-box {
    display: flex;
    gap: 8px;
    padding: 10px 12px;
    margin-bottom: 12px;
    background-color: rgba(33, 133, 208, 0.08);
    border: 1px solid rgba(33, 133, 208, 0.2);
    border-radius: 4px;
    font-size: 90%;
    color: #444;
    line-height: 1.4;
}

.rescan-info-box > .icon {
    color: #2185d0;
    flex-shrink: 0;
    margin-top: 2px;
}

.tagline-field {
    position: relative;
}

.tagline-field input {
    width: 100%;
    padding: 6px 8px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 14px;
}

.tagline-field .char-count {
    color: #999;
    float: right;
    margin-top: 2px;
    font-size: 12px;
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
    max-width: 120px;
    max-height: 80px;
    object-fit: contain;
    border: 1px solid #ddd;
    border-radius: 4px;
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
