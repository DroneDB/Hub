<template>
    <Window id="datasetDialog" :title="title" modal max-width="70%" fixed-size :confirm-label="mode == 'new' ? 'Create' : 'Save'" :confirm-disabled="!isValid()" @confirm="close(mode == 'new' ? 'create' : 'save')" @close="close('close')">
        <div class="ds-dialog">
            <form class="me-2" :class="{ error: !isValid() }" @submit.prevent>
                <PrimeMessage v-if="isDuplicateSlug()" severity="error" :closable="false">
                    <template v-if="changesSlug">A dataset with this slug already exists in this organization.</template>
                    <template v-else>This dataset name is already in use. It will generate a duplicate slug.</template>
                </PrimeMessage>

                <div class="row g-3">
                    <div class="col-md-6">
                        <div class="mb-3">
                            <label for="dataset-dialog-dataset-name" class="d-block mb-1 fw-semibold">Dataset Name</label>
                            <InputText id="dataset-dialog-dataset-name" ref="name" v-model="ds.name"
                                       placeholder="Dataset Name" class="w-100" :invalid="!!nameError"
                                       :aria-describedby="nameError ? 'dataset-dialog-name-error' : undefined" />
                            <!-- The Registry's rule text, before submit (D-035) -->
                            <small v-if="nameError" id="dataset-dialog-name-error" class="d-block text-danger">{{ nameError }}</small>
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="mb-3">
                            <label id="dataset-dialog-visibility-label" for="dataset-dialog-visibility" class="d-block mb-1 fw-semibold">Visibility</label>
                            <Select v-model="ds.visibility" input-id="dataset-dialog-visibility" aria-labelledby="dataset-dialog-visibility-label" :options="visibilityOptions" option-label="label" option-value="value" placeholder="Select visibility" class="w-100" />
                        </div>
                    </div>
                </div>
                <div v-if="mode == 'new'" class="mb-3">
                    <span class="d-block mb-1 fw-semibold">Dataset Slug</span>
                    <PrimeMessage severity="info" :closable="false">
                        <small>{{ ds.name ? slugFromName(ds.name) : "" }}</small>
                    </PrimeMessage>
                    <small v-if="slugError" class="d-block text-danger">{{ slugError }}</small>
                </div>
                <!-- Editing keeps the URL: the name is the display name only, unless the user asks for a new slug (FR-ORG-08) -->
                <div v-else class="mb-3">
                    <span class="d-block mb-1 fw-semibold">Dataset Slug</span>
                    <PrimeMessage severity="info" :closable="false">
                        <small>{{ model.slug }}</small>
                    </PrimeMessage>
                    <div class="d-flex align-items-center gap-2 mt-2">
                        <Checkbox v-model="changeSlug" :binary="true" input-id="dataset-dialog-change-slug" />
                        <label for="dataset-dialog-change-slug">Change URL (slug)</label>
                    </div>
                    <div v-if="changeSlug" class="mt-2">
                        <PrimeMessage severity="warn" :closable="false" class="mb-2">
                            {{ slugChangeWarning }}
                        </PrimeMessage>
                        <label for="dataset-dialog-slug" class="d-block mb-1 fw-semibold">New slug</label>
                        <InputText id="dataset-dialog-slug" v-model="ds.slug" class="w-100" :invalid="!!slugError"
                                   autocomplete="off" spellcheck="false" aria-describedby="dataset-dialog-slug-help" />
                        <small v-if="slugError" id="dataset-dialog-slug-help" class="d-block text-danger">{{ slugError }}</small>
                        <small v-else id="dataset-dialog-slug-help" class="d-block text-muted">A slug: {{ slugRuleText }}</small>
                    </div>
                </div>
                <div class="mb-3">
                    <label for="dataset-dialog-tagline" class="d-block mb-1 fw-semibold">Tagline</label>
                    <!-- The counter under the field gives the limit: a placeholder that names it is cut on a phone -->
                    <InputText id="dataset-dialog-tagline" v-model="ds.tagline" :maxlength="taglineMaxLength"
                               placeholder="A short description" class="w-100"
                               aria-describedby="dataset-dialog-tagline-count" />
                    <small id="dataset-dialog-tagline-count" class="char-count">{{ ds.tagline ? ds.tagline.length : 0 }}/{{ taglineMaxLength }}</small>
                </div>

            </form>
            <div v-if="mode == 'new'" class="mb-3">
                <div class="d-flex align-items-center gap-2">
                    <Checkbox v-model="openAfterCreate" :binary="true" input-id="openAfterCreate" />
                    <label for="openAfterCreate">Open dataset after creation</label>
                </div>
            </div>
        </div>
    </Window>
</template>

<script>
import Window from '@/components/HubWindow.vue';
import Select from 'primevue/select';
import InputText from 'primevue/inputtext';
import PrimeMessage from 'primevue/message';
import Checkbox from 'primevue/checkbox';
import { slugFromName } from '@/libs/api/registryUtils';
import { getOpenAfterCreatePreference, saveOpenAfterCreatePreference } from '@/libs/storageUtils';
import { Visibility } from 'ddb';
import { TAGLINE_MAX_LENGTH } from '@/libs/constants';
import { slugProblem, slugDescription } from '@/libs/slug';
import { latinNameProblem } from '@/libs/nameRules';

export default {
    components: {
        Window, Select, InputText, PrimeMessage, Checkbox
    },
    props: {
        mode: {
            type: String,
            default: 'new'
        },
        model: {
            type: Object,
            default: null
        },
        forbiddenSlugs: {
            default: () => [],
            type: Array,
            required: false
        },
        // The organization, for the links a new slug breaks
        orgSlug: {
            type: String,
            default: ''
        }
    },
    emits: ['close'],

    data: function () {
        const openAfterCreate = getOpenAfterCreatePreference();
        return {
            ds: {
                slug: null,
                name: null,
                visibility: Visibility.PRIVATE,
                tagline: ''
            },
            title: null,
            // Edit only: the user asked for a new slug (the URL changes)
            changeSlug: false,
            taglineMaxLength: TAGLINE_MAX_LENGTH,
            openAfterCreate,
            // What the checkbox started from: the preference is stored only when the user changed it,
            // so a value that changed elsewhere since the dialog opened is not overwritten
            openAfterCreateAtOpen: openAfterCreate,
            visibilityOptions: [
                { value: Visibility.PRIVATE, label: 'Private' },
                { value: Visibility.UNLISTED, label: 'Unlisted' },
                { value: Visibility.PUBLIC, label: 'Public' }
            ]
        };
    },
    computed: {
        // The slug the dataset will have
        targetSlug() {
            if (this.mode !== 'edit') return slugFromName(this.ds.name);
            return this.changeSlug ? this.ds.slug : this.model.slug;
        },
        changesSlug() {
            return this.mode === 'edit' && this.changeSlug && this.ds.slug !== this.model.slug;
        },
        slugChangeWarning() {
            return `Links to /r/${this.orgSlug || '<organization>'}/${this.model?.slug} will stop working`;
        },
        slugRuleText() {
            return slugDescription();
        },
        // A name needs a Latin letter or digit, or a slug the user enters (D-035): only Edit has a slug field
        nameError() {
            if (!this.ds.name || !this.ds.name.trim()) return null;
            return latinNameProblem(this.ds.name, {
                slug: this.mode === 'edit' && this.changeSlug ? this.ds.slug : null,
                withSlugField: this.mode === 'edit'
            });
        },
        slugError() {
            if (this.mode === 'edit') return this.changeSlug ? slugProblem(this.ds.slug, 'Dataset') : null;
            if (!this.ds.name || !this.ds.name.trim() || this.nameError) return null;
            return slugProblem(this.targetSlug, 'Dataset');
        }
    },
    mounted: function () {
        if (this.mode == 'edit') {
            this.title = `Edit ${this.model.name || this.model.slug}`;

            this.ds.slug = this.model.slug;
            this.ds.name = this.model.name;
            this.ds.visibility = this.model.visibility !== undefined ? this.model.visibility : Visibility.PRIVATE;
            this.ds.tagline = this.model.tagline || '';
        } else {
            this.title = 'Create dataset';

            this.ds.slug = null;
            this.ds.name = null;
            this.ds.visibility = Visibility.PRIVATE;
            this.ds.tagline = '';
        }
    }, methods: {
        slugFromName,
        close: function (buttonId) {
            if (buttonId === 'create' && this.openAfterCreate !== this.openAfterCreateAtOpen) {
                saveOpenAfterCreatePreference(this.openAfterCreate);
            }
            this.$emit('close', buttonId, {
                name: this.ds.name,
                visibility: this.ds.visibility,
                slug: this.targetSlug,
                // Edit: only then does the page rename the dataset
                changeSlug: this.changesSlug,
                openAfterCreate: this.openAfterCreate,
                tagline: this.ds.tagline || ''
            });
        },
        isValid: function () {
            if (!this.ds.name || !this.ds.name.trim()) return false;
            if (this.nameError) return false;
            // The slug an edit keeps is the dataset's own: only a new one is checked
            const keepsSlug = this.mode === 'edit' && !this.changeSlug;
            if (!keepsSlug && slugProblem(this.targetSlug, 'Dataset')) return false;
            return !this.isDuplicateSlug();
        },
        isDuplicateSlug: function () {
            const slug = this.targetSlug;
            if (!slug) return false;
            // In edit mode, the current slug is not a duplicate
            if (this.mode === 'edit' && this.model && slug === this.model.slug) return false;
            return this.forbiddenSlugs.includes(slug);
        }
    }
}
</script>

<style scoped>
.ds-dialog {
    min-width: min(20rem, var(--window-content-width, 100%));
}
</style>
