<template>
    <Window id="settings" title="Dataset Settings" modal size-class="dialog-lg" fixed-position close-modal-on-click
            @close="$emit('close', 'close')">
        <Message v-model="error" />

        <LoadingSpinner v-if="loading" />
        <div v-else class="settings-body">
            <section v-if="canWrite" class="settings-group" aria-labelledby="settings-general">
                <h3 id="settings-general" class="settings-group-title">General</h3>

                <!-- The display name only: the URL does not change with it (FR-EXP-24) -->
                <div class="settings-field">
                    <label for="settings-name" class="settings-label"><i class="fa-solid fa-signature" aria-hidden="true" />Name</label>
                    <div class="settings-control">
                        <InputText id="settings-name" v-model="name" :maxlength="nameMaxLength" autocomplete="off"
                                   placeholder="Dataset name" :invalid="!!nameError" :aria-invalid="nameError ? 'true' : undefined"
                                   :aria-describedby="nameError ? 'settings-name-error' : 'settings-name-hint'"
                                   fluid @change="setName" />
                        <FieldError id="settings-name-error" :message="nameError" />
                        <small id="settings-name-hint" class="field-hint">Shown on the dataset page and in the lists. The URL stays as it is.</small>
                    </div>
                </div>

                <div class="settings-field">
                    <label for="settings-slug" class="settings-label"><i class="fa-solid fa-link" aria-hidden="true" />URL slug</label>
                    <div class="settings-control">
                        <InputText id="settings-slug" v-model="slug" autocomplete="off" spellcheck="false"
                                   :invalid="!!slugError" :aria-invalid="slugError ? 'true' : undefined"
                                   :aria-describedby="slugError ? 'settings-slug-error settings-slug-hint' : 'settings-slug-hint'"
                                   :disabled="slugRenaming" fluid @input="slugError = ''" @keydown.enter.prevent="renameSlug" />
                        <FieldError id="settings-slug-error" :message="slugError" />
                        <small id="settings-slug-hint" class="field-hint">The dataset is at /r/{{ dataset.org }}/{{ slug.trim() || '…' }}. A slug: {{ slugRuleText }}</small>
                        <!-- A new slug breaks the links that exist: said before it is applied -->
                        <PrimeMessage v-if="slugChanged" severity="warn" :closable="false" class="slug-warning">
                            {{ slugChangeWarning }}
                        </PrimeMessage>
                        <Button v-if="slugChanged" severity="secondary" icon="fa-solid fa-link" label="Change URL"
                                :loading="slugRenaming" @click="renameSlug" />
                    </div>
                </div>

                <div class="settings-field">
                    <label for="settings-tagline" class="settings-label"><i class="fa-solid fa-tag" aria-hidden="true" />Tagline</label>
                    <div class="settings-control">
                        <InputText id="settings-tagline" v-model="tagline" :maxlength="taglineMaxLength"
                                   placeholder="A short description" aria-describedby="settings-tagline-count"
                                   fluid @change="setTagline" />
                        <small id="settings-tagline-count" class="char-count">{{ tagline ? tagline.length : 0 }}/{{ taglineMaxLength }}</small>
                    </div>
                </div>

                <div class="settings-field">
                    <span id="settings-thumbnail-label" class="settings-label"><i class="fa-solid fa-image" aria-hidden="true" />Thumbnail</span>
                    <div class="settings-control thumbnail-upload" role="group" aria-labelledby="settings-thumbnail-label">
                        <img v-if="thumbnailPreview && !thumbnailError"
                             :src="thumbnailPreview" alt="Dataset thumbnail"
                             class="thumbnail-preview"
                             @error="thumbnailError = true">
                        <img v-else
                             :src="placeholderUrl" alt="No thumbnail"
                             class="thumbnail-preview thumbnail-placeholder">
                        <div class="thumbnail-actions">
                            <input ref="thumbnailInput" type="file" aria-label="Thumbnail image"
                                   accept="image/webp,image/jpeg,image/png"
                                   style="display: none"
                                   @change="handleThumbnailSelect">
                            <Button severity="secondary" :loading="thumbnailUploading"
                                    icon="fa-solid fa-upload" label="Upload" @click="$refs.thumbnailInput.click()" />
                            <Button v-if="thumbnailPreview && !thumbnailError"
                                    severity="danger" text
                                    :loading="thumbnailRemoving"
                                    icon="fa-solid fa-trash" label="Remove" @click="removeThumbnail" />
                            <small class="field-hint">WebP, JPEG or PNG. Shown in the dataset list.</small>
                        </div>
                    </div>
                </div>

                <div class="settings-field">
                    <span class="settings-label"><i class="fa-solid fa-book" aria-hidden="true" />Readme</span>
                    <div class="settings-control">
                        <template v-if="readme == null">
                            <Button severity="secondary" icon="fa-solid fa-plus" label="Add Readme" @click="addDocument('README.md')" />
                            <small class="field-hint">Creates README.md at the root of the dataset, a file to describe it.</small>
                        </template>
                        <template v-else>
                            <span class="settings-value">{{ readme }}</span>
                            <div class="readme-actions">
                                <Button severity="secondary" icon="fa-solid fa-book-open" label="Open" @click="$emit('openReadme', readme)" />
                                <Button v-if="canWrite" severity="secondary" icon="fa-solid fa-pen-to-square" label="Edit" @click="$emit('editReadme', readme)" />
                            </div>
                        </template>
                    </div>
                </div>
            </section>

            <section class="settings-group" aria-labelledby="settings-sharing">
                <h3 id="settings-sharing" class="settings-group-title">Sharing</h3>

                <div class="settings-field">
                    <label id="settings-visibility-label" for="settings-visibility" class="settings-label">
                        <i class="fa-solid" :class="noAuthRequired ? 'fa-unlock' : 'fa-lock'" aria-hidden="true" />Visibility
                    </label>
                    <div class="settings-control">
                        <Select v-model="visibility" input-id="settings-visibility" aria-labelledby="settings-visibility-label"
                                aria-describedby="settings-visibility-hint" :options="visibilityOptions" option-label="label"
                                option-value="value" :disabled="!canWrite" class="settings-select" @change="setVisibility" />
                        <!-- eslint-disable-next-line vue/no-v-html -- sanitised with libs/sanitize.js -->
                        <small id="settings-visibility-hint" class="field-hint" v-html="safeDescription" />
                    </div>
                </div>

                <div class="settings-field">
                    <label id="settings-license-label" for="settings-license" class="settings-label">
                        <i class="fa-solid fa-scale-balanced" aria-hidden="true" />License
                    </label>
                    <div class="settings-control">
                        <Select v-model="license" input-id="settings-license" aria-labelledby="settings-license-label"
                                :options="licenseOptions" option-label="label" option-value="value" :disabled="!canWrite"
                                class="settings-select" :title="licenseInfo.name" @change="setLicense" />
                        <small v-if="licenseInfo.url" class="field-hint">
                            <a :href="licenseInfo.url" target="_blank" rel="noopener">Read the license</a>
                        </small>
                    </div>
                </div>
            </section>

            <section v-if="canWrite" class="settings-group" aria-labelledby="settings-maintenance">
                <h3 id="settings-maintenance" class="settings-group-title">Maintenance</h3>

                <div class="settings-field">
                    <span class="settings-label"><i class="fa-solid fa-rotate" aria-hidden="true" />Rescan</span>
                    <div class="settings-control">
                        <Button severity="secondary" icon="fa-solid fa-rotate" label="Rescan Dataset"
                                aria-describedby="settings-rescan-hint" @click="$emit('rescanRequested')" />
                        <small id="settings-rescan-hint" class="field-hint">
                            Reads the metadata of every file again (GPS position, timestamps, thumbnails).
                            Use it after a DroneDB upgrade or when file metadata looks wrong.
                        </small>
                    </div>
                </div>
            </section>
        </div>

        <template #footer>
            <span class="save-note me-auto"><i class="fa-solid fa-circle-check" aria-hidden="true" /> Changes are saved as you make them</span>
            <Button label="Close" severity="secondary" @click="$emit('close', 'close')" />
        </template>
    </Window>
</template>

<script>
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import Message from '@/components/HubMessage.vue';
import { Licenses } from '@/libs/licenses';
import Window from '@/components/HubWindow.vue';
import Button from 'primevue/button';
import Select from 'primevue/select';
import InputText from 'primevue/inputtext';
import PrimeMessage from 'primevue/message';
import FieldError from '@/components/FieldError.vue';
import ddb from 'ddb';
import { sanitizeHtml } from '@/libs/sanitize';
import { TAGLINE_MAX_LENGTH } from '@/libs/constants';
import { VISIBILITY_OPTIONS, DEFAULT_VISIBILITY } from '@/libs/visibility';
import { datasetThumbnailUrl } from '@/libs/optionalFile';
import { slugProblem, slugDescription } from '@/libs/slug';
import { displayNameLimits, displayNameLengthProblem } from '@/libs/nameRules';

export default {
    components: {
        LoadingSpinner,
        Message, Window, Button, Select, InputText, PrimeMessage, FieldError
    },
    props: {
        dataset: {
            required: true,
            type: Object
        },
        canWrite: {
            type: Boolean,
            default: false
        },
        // Asked before the URL slug changes: resolves to false when the user does not agree (the page stops uploads then)
        confirmSlugChange: {
            type: Function,
            default: null
        }
    },
    // changed: a setting was saved (the page reads the dataset again); slugRenamed: the URL changed, the page goes to it;
    // openReadme / editReadme: the README opens in its viewer / in the editor
    // fileSaved: a file of the dataset was written (the thumbnail), the file list shows it
    emits: ['close', 'rescanRequested', 'addMarkdown', 'openReadme', 'editReadme', 'changed', 'slugRenamed', 'fileSaved'],
    data: function () {
        return {
            // The image of a dataset without a cover, from the site's images (as the dataset list uses it)
            placeholderUrl: '/images/dataset-placeholder.svg',
            taglineMaxLength: TAGLINE_MAX_LENGTH,
            error: "",
            properties: null,
            loading: true,
            readme: null,
            license: "proprietary",
            name: "",
            // The name the dataset has, to tell a change from the typed text
            savedName: "",
            nameError: "",
            nameMaxLength: displayNameLimits().max,
            slug: this.dataset.ds,
            slugError: "",
            slugRenaming: false,
            tagline: "",
            thumbnailPreview: null,
            thumbnailError: false,
            thumbnailUploading: false,
            thumbnailRemoving: false,
            Licenses,
            visibilityOptions: VISIBILITY_OPTIONS,
            visibility: DEFAULT_VISIBILITY
        }
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
        slugChanged: function () {
            return this.slug.trim() !== this.dataset.ds;
        },
        slugRuleText: function () {
            return slugDescription();
        },
        slugChangeWarning: function () {
            return `Links to /r/${this.dataset.org}/${this.dataset.ds} will stop working`;
        },
        licenseInfo: function () {
            return this.Licenses[this.license] ?? { name: this.license, url: null };
        },
        safeDescription: function () {
            return sanitizeHtml(this.description);
        },
        licenseOptions: function () {
            return Object.entries(this.Licenses).map(([k, v]) => ({
                value: k,
                label: v.name
            }));
        }
    },
    mounted: async function () {
        try {
            const info = await this.dataset.info();
            this.properties = info[0].properties;

            this.readme = (typeof this.properties.readme !== 'undefined') ? this.properties.readme : null;
            this.license = this.properties?.meta?.license?.data ?? 'proprietary';
            this.visibility = this.properties?.meta?.visibility?.data ?? DEFAULT_VISIBILITY;
            this.tagline = this.properties?.meta?.tagline?.data ?? '';
            // Without a name the dataset shows its slug
            this.name = this.properties?.meta?.name?.data ?? '';
            this.savedName = this.name;

            // The existing dataset thumbnail, asked for only when the dataset has one (its entry says so): a request for
            // a cover that is not there logs a 404 in the console (FR-XC-10, FR-EXP-28)
            const thumbnail = datasetThumbnailUrl(this.dataset, this.properties, 256);
            this.thumbnailPreview = thumbnail && thumbnail + '&t=' + Date.now();
            this.thumbnailError = false;

        } catch (e) {
            this.error = e.message;
        }

        this.loading = false;
    },
    beforeUnmount: function () {
    },
    methods: {
        setVisibility: async function () {
            try {
                this.properties.meta.visibility = await this.dataset.setVisibility(this.visibility);
                this.$notify.success('Dataset visibility updated successfully', { summary: 'Visibility Updated' });
                this.$emit('changed');
            } catch (e) {
                this.$notify.error('Failed to update visibility: ' + e.message);
                this.error = e.message;
            }
        },
        setLicense: async function () {
            try {
                this.properties.meta.license = await this.dataset.metaSet("license", this.license);
                this.$notify.success('Dataset license updated successfully', { summary: 'License Updated' });
                this.$emit('changed');
            } catch (e) {
                this.$notify.error('Failed to update license: ' + e.message);
                this.error = e.message;
            }
        },
        setName: async function () {
            const name = this.name.trim();
            this.nameError = '';
            if (name === this.savedName) {
                this.name = name;
                return;
            }
            // A name is never empty: the dataset would show its slug in its place
            this.nameError = name === '' ? 'Enter a name' : (displayNameLengthProblem(name) || '');
            if (this.nameError) return;
            try {
                await this.dataset.metaSet('name', name);
                this.name = name;
                this.savedName = name;
                this.$notify.success('Dataset name updated successfully', { summary: 'Name Updated' });
                this.$emit('changed');
            } catch (e) {
                // The Registry's words, at the field (FR-XC-11)
                this.nameError = e.message;
            }
        },
        renameSlug: async function () {
            if (!this.slugChanged || this.slugRenaming) return;
            const slug = this.slug.trim();
            this.slugError = slugProblem(slug, { kind: 'Dataset' }) || '';
            if (this.slugError) return;
            if (this.confirmSlugChange && !await this.confirmSlugChange()) return;
            this.slugRenaming = true;
            try {
                const renamed = await this.dataset.rename(slug);
                this.$emit('slugRenamed', renamed?.slug || slug);
            } catch (e) {
                this.slugError = e.message;
            } finally {
                this.slugRenaming = false;
            }
        },
        setTagline: async function () {
            try {
                if (this.tagline && this.tagline.trim()) {
                    await this.dataset.metaSet('tagline', this.tagline.trim());
                    this.$notify.success('Tagline updated successfully', { summary: 'Tagline Updated' });
                    this.$emit('changed');
                } else {
                    await this.dataset.metaUnset('tagline');
                    this.tagline = '';
                    this.$notify.success('Tagline removed successfully', { summary: 'Tagline Removed' });
                    this.$emit('changed');
                }
            } catch (e) {
                this.$notify.error('Failed to update tagline: ' + e.message);
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

                // The dataset's thumbnail: a new one replaces it
                await this.dataset.uploadObj(path, file, { overwrite: true });

                // Refresh preview with cache-busting timestamp
                this.thumbnailPreview = this.dataset.datasetThumbUrl(256) + '&t=' + Date.now();
                this.thumbnailError = false;
                // The thumbnail is a file of the dataset: the toast names it (FR-EXP-30)
                this.$notify.success(`Saved as ${path} in the dataset root`, { summary: 'Thumbnail Updated' });
                this.$emit('fileSaved', path);
            } catch (e) {
                this.$notify.error('Failed to upload thumbnail: ' + e.message);
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
                    } catch {
                        // Ignore 404 errors - file doesn't exist
                    }
                }

                this.thumbnailPreview = null;
                this.thumbnailError = true;
                this.$notify.success('Thumbnail removed successfully', { summary: 'Thumbnail Removed' });
            } catch (e) {
                this.$notify.error('Failed to remove thumbnail: ' + e.message);
                this.error = 'Failed to remove thumbnail: ' + e.message;
            }

            this.thumbnailRemoving = false;
        },
        addDocument: async function (document) {

            this.loading = true;

            var entry;

            try {
                switch (document) {
                    case "README.md":
                        entry = await this.dataset.writeObj(document, "\n", { overwrite: true });
                        this.readme = document;
                        break;
                    default:
                        throw new Error("Invalid document: " + document);
                }

                this.$notify.success(`${document} created successfully`, { summary: 'Document Created' });
                this.$emit('addMarkdown', document, entry);
            } catch (e) {
                this.$notify.error('Failed to create document: ' + e.message);
                this.error = e.message;
            }

            this.loading = false;
        }
    }
}
</script>

<style scoped>
.settings-body {
    display: flex;
    flex-direction: column;
    gap: var(--ddb-spacing-lg);
}

.settings-group-title {
    margin: 0 0 var(--ddb-spacing-sm);
    padding-bottom: var(--ddb-spacing-xs);
    border-bottom: var(--ddb-border-width) solid var(--ddb-border);
    font-size: var(--ddb-font-size-sm);
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--ddb-text-secondary);
}

/* A label column and a control column; stacked on a phone */
.settings-field {
    display: grid;
    grid-template-columns: 8rem minmax(0, 1fr);
    gap: var(--ddb-spacing-xs) var(--ddb-spacing-md);
    align-items: start;
    padding: var(--ddb-spacing-sm) 0;
}

.settings-label {
    display: flex;
    align-items: center;
    gap: var(--ddb-spacing-sm);
    min-height: 2.5rem;
    font-weight: 600;
    color: var(--ddb-text);
}

.settings-label i {
    flex-shrink: 0;
    width: 1.25em;
    text-align: center;
    color: var(--ddb-text-secondary);
}

.settings-control {
    min-width: 0;
}

.settings-select {
    width: min(18rem, 100%);
}

.settings-value {
    display: flex;
    align-items: center;
    min-height: 2.5rem;
    color: var(--ddb-text-secondary);
}

.readme-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ddb-spacing-sm);
}

.slug-warning {
    margin: var(--ddb-spacing-sm) 0;
}

.field-hint {
    display: block;
    margin-top: var(--ddb-spacing-xs);
    color: var(--ddb-text-muted);
    font-size: var(--ddb-font-size-sm);
    line-height: 1.4;
}

.thumbnail-upload {
    display: flex;
    align-items: flex-start;
    gap: var(--ddb-spacing-md);
}

.thumbnail-preview {
    flex-shrink: 0;
    width: 7.5rem;
    height: 5rem;
    object-fit: cover;
    border: var(--ddb-border-width) solid var(--ddb-border);
    border-radius: var(--ddb-radius-sm);
}

.thumbnail-placeholder {
    object-fit: contain;
    opacity: 0.6;
}

.thumbnail-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--ddb-spacing-sm);
    min-width: 0;
}

.thumbnail-actions .field-hint {
    flex-basis: 100%;
    margin-top: 0;
}

.save-note {
    align-self: center;
    color: var(--ddb-text-muted);
    font-size: var(--ddb-font-size-sm);
}

@media only screen and (max-width: 575.98px) {
    .settings-field {
        grid-template-columns: minmax(0, 1fr);
    }

    .settings-label {
        min-height: 0;
    }
}
</style>
