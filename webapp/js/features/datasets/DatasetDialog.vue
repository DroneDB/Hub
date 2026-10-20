<template>
    <Window id="datasetDialog" :title="title" modal max-width="70%" fixed-size @on-close="close('close')">
        <div class="ds-dialog">
            <form class="me-2" :class="{ error: !isValid() }" @submit.prevent>
                <PrimeMessage v-if="isDuplicateSlug()" severity="error" :closable="false">
                    This dataset name is already in use. It will generate a duplicate slug.
                </PrimeMessage>

                <div class="row g-3">
                    <div class="col-md-6">
                        <div class="mb-3">
                            <label class="d-block mb-1 fw-semibold">Dataset Name</label>
                            <InputText ref="name" v-model="ds.name"
                                       placeholder="Dataset Name" class="w-100" @keyup.enter="isValid() && close(mode == 'new' ? 'create' : 'save')" />
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="mb-3">
                            <label class="d-block mb-1 fw-semibold">Visibility</label>
                            <Select v-model="ds.visibility" :options="visibilityOptions" option-label="label" option-value="value" placeholder="Select visibility" class="w-100" />
                        </div>
                    </div>
                </div>
                <div class="mb-3">
                    <label class="d-block mb-1 fw-semibold">Dataset Slug</label>
                    <PrimeMessage severity="info" :closable="false">
                        <small>{{ ds.name ? slugFromName(ds.name) : "" }}</small>
                    </PrimeMessage>
                </div>
                <div class="mb-3">
                    <label class="d-block mb-1 fw-semibold">Tagline</label>
                    <InputText v-model="ds.tagline" maxlength="256"
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
            <div class="d-flex justify-content-end gap-2 mt-3 w-100">
                <Button severity="secondary" label="Close" @click="close('close')" />
                <Button v-if="mode == 'new'" severity="primary" :disabled="!isValid()" label="Create" @click="close('create')" />
                <Button v-else severity="primary" :disabled="!isValid()" label="Save" @click="close('save')" />
            </div>
        </div>
    </Window>
</template>

<script>
import Window from '@/components/Window.vue';
import Select from 'primevue/select';
import InputText from 'primevue/inputtext';
import Button from 'primevue/button';
import PrimeMessage from 'primevue/message';
import Checkbox from 'primevue/checkbox';
import { slugFromName } from '@/libs/api/registryUtils';
import { getOpenAfterCreatePreference, saveOpenAfterCreatePreference } from '@/libs/storageUtils';
import { Visibility } from 'ddb';

var re = /^[a-z0-9\-_]+$/;

export default {
    components: {
        Window, Select, InputText, Button, PrimeMessage, Checkbox
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
    emits: ['onClose'],

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
            this.$emit('onClose', buttonId, {
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
