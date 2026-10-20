<template>
    <Window id="datasetDialog" :title="title" modal max-width="70%" fixed-size cancel-label="Close" :confirm-label="mode == 'new' ? 'Create' : 'Save'" :confirm-disabled="!isValid()" @confirm="close(mode == 'new' ? 'create' : 'save')" @close="close('close')">
        <div class="ds-dialog">
            <form class="me-2" :class="{ error: !isValid() }" @submit.prevent>
                <PrimeMessage v-if="isDuplicateSlug()" severity="error" :closable="false">
                    This dataset name is already in use. It will generate a duplicate slug.
                </PrimeMessage>

                <div class="row g-3">
                    <div class="col-md-6">
                        <div class="mb-3">
                            <label for="dataset-dialog-dataset-name" class="d-block mb-1 fw-semibold">Dataset Name</label>
                            <InputText id="dataset-dialog-dataset-name" ref="name" v-model="ds.name"
                                       placeholder="Dataset Name" class="w-100" />
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="mb-3">
                            <label id="dataset-dialog-visibility-label" for="dataset-dialog-visibility" class="d-block mb-1 fw-semibold">Visibility</label>
                            <Select v-model="ds.visibility" input-id="dataset-dialog-visibility" aria-labelledby="dataset-dialog-visibility-label" :options="visibilityOptions" option-label="label" option-value="value" placeholder="Select visibility" class="w-100" />
                        </div>
                    </div>
                </div>
                <div class="mb-3">
                    <span class="d-block mb-1 fw-semibold">Dataset Slug</span>
                    <PrimeMessage severity="info" :closable="false">
                        <small>{{ ds.name ? slugFromName(ds.name) : "" }}</small>
                    </PrimeMessage>
                </div>
                <div class="mb-3">
                    <label for="dataset-dialog-tagline" class="d-block mb-1 fw-semibold">Tagline</label>
                    <InputText id="dataset-dialog-tagline" v-model="ds.tagline" maxlength="256"
                               placeholder="Brief description of your dataset (max 256 chars)" class="w-100" />
                    <small class="char-count">{{ ds.tagline ? ds.tagline.length : 0 }}/256</small>
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

var re = /^[a-z0-9\-_]+$/;

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
        }
    },
    emits: ['close'],

    data: function () {
        return {
            ds: {
                slug: null,
                name: null,
                visibility: Visibility.PRIVATE,
                tagline: ''
            },
            title: null,
            openAfterCreate: getOpenAfterCreatePreference(),
            visibilityOptions: [
                { value: Visibility.PRIVATE, label: 'Private' },
                { value: Visibility.UNLISTED, label: 'Unlisted' },
                { value: Visibility.PUBLIC, label: 'Public' }
            ]
        };
    }, mounted: function () {
        if (this.mode == 'edit') {
            this.title = "Edit dataset " + this.model.slug;

            this.ds.slug = this.model.slug;
            this.ds.name = this.model.name;
            this.ds.visibility = this.model.visibility !== undefined ? this.model.visibility : Visibility.PRIVATE;
            this.ds.tagline = this.model.tagline || '';
        } else {
            this.title = "Create new dataset";

            this.ds.slug = null;
            this.ds.name = null;
            this.ds.visibility = Visibility.PRIVATE;
            this.ds.tagline = '';
        }
    }, methods: {
        slugFromName,
        close: function (buttonId) {
            if (buttonId === 'create') {
                saveOpenAfterCreatePreference(this.openAfterCreate);
            }
            this.$emit('close', buttonId, {
                name: this.ds.name,
                visibility: this.ds.visibility,
                slug: this.mode === 'edit' ? this.model.slug : slugFromName(this.ds.name),
                openAfterCreate: this.openAfterCreate,
                tagline: this.ds.tagline || ''
            });
        },
        isValid: function () {
            const slug = slugFromName(this.ds.name);
            if (slug == null || slug.length == 0 || !re.test(slug)) {
                return false;
            }

            if (this.mode == 'new') {
                if (this.forbiddenSlugs.includes(slug)) {
                    return false;
                }
            } else {
                if (slug !== this.model.slug && this.forbiddenSlugs.includes(slug)) {
                    return false;
                }
            }

            return true;
        },
        isDuplicateSlug: function () {
            const slug = slugFromName(this.ds.name);
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
    min-width: 20rem;
}

.char-count {
    color: var(--ddb-text-muted);
    float: right;
    margin-top: 0.25rem;
}
</style>
