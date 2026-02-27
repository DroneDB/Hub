<template>
    <Window v-bind:title="title" id="datasetDialog" @onClose="close('close')" modal maxWidth="70%" fixedSize>
        <div class="ds-dialog">
            <form v-on:submit.prevent class="form" style="margin-right: 10px" v-bind:class="{ error: !isValid() }">
                <PrimeMessage v-if="isDuplicateSlug()" severity="error" :closable="false">
                    This dataset name is already in use. It will generate a duplicate slug.
                </PrimeMessage>

                <div class="grid-two-column">
                    <div class="column">
                        <div class="field">
                            <label>Dataset Name</label>
                            <input ref="name" v-on:keyup.enter="isValid() && close(mode == 'new' ? 'create' : 'save')"
                                type="text" v-model="ds.name" placeholder="Dataset Name" />
                        </div>
                    </div>
                    <div class="column">
                        <div class="field">
                            <label>Visibility</label>
                            <Select v-model="ds.visibility" :options="visibilityOptions" optionLabel="label" optionValue="value" placeholder="Select visibility" class="w-full" />
                        </div>
                    </div>
                </div>
                <div class="grid-one-column">
                    <div class="column">
                        <div class="field">
                            <label>Dataset Slug</label>
                            <PrimeMessage severity="info" :closable="false">
                                <small>{{ ds.name ? slugFromName(ds.name) : "" }}</small>
                            </PrimeMessage>
                        </div>
                    </div>
                </div>
                <div class="grid-one-column">
                    <div class="column">
                        <div class="field">
                            <label>Tagline</label>
                            <input type="text" v-model="ds.tagline" maxlength="256"
                                placeholder="Brief description of your dataset (max 256 chars)" />
                            <small class="char-count">{{ ds.tagline ? ds.tagline.length : 0 }}/256</small>
                        </div>
                    </div>
                </div>

            </form>
            <div v-if="mode == 'new'" class="field" style="margin-bottom: 1em;">
                <div class="flex align-items-center gap-2">
                    <Checkbox v-model="openAfterCreate" :binary="true" inputId="openAfterCreate" />
                    <label for="openAfterCreate">Open dataset after creation</label>
                </div>
            </div>
            <div class="buttons">
                <Button @click="close('close')" label="Close" />
                <Button v-if="mode == 'new'" @click="close('create')" severity="info" :disabled="!isValid()" label="Create" />
                <Button v-else @click="close('save')" severity="info" :disabled="!isValid()" label="Save" />
            </div>
        </div>
    </Window>
</template>

<script>
import Window from '../Window.vue';
import Select from 'primevue/select';
import Button from 'primevue/button';
import PrimeMessage from 'primevue/message';
import Checkbox from 'primevue/checkbox';
import { slugFromName } from '../../libs/registryUtils';
import { getOpenAfterCreatePreference, saveOpenAfterCreatePreference } from '../../libs/storageUtils';

var re = /^[a-z0-9\-_]+$/;

export default {
    components: {
        Window, Select, Button, PrimeMessage, Checkbox
    },
    props: {
        mode: {
            type: String,
            default: 'new'
        },
        model: {
            type: Object,
            required: false
        },
        forbiddenSlugs: {
            default: [],
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
                visibility: 0,
                tagline: ''
            },
            title: null,
            openAfterCreate: getOpenAfterCreatePreference(),
            visibilityOptions: [
                { value: 0, label: 'Private' },
                { value: 1, label: 'Unlisted' },
                { value: 2, label: 'Public' }
            ]
        };
    }, mounted: function () {
        this.$nextTick(() => {
            this.$refs.name.focus();
        });

        if (this.mode == 'edit') {
            this.title = "Edit dataset " + this.model.slug;

            this.ds.slug = this.model.slug;
            this.ds.name = this.model.name;
            this.ds.visibility = this.model.visibility !== undefined ? this.model.visibility : 0;
            this.ds.tagline = this.model.tagline || '';
        } else {
            this.title = "Create new dataset";

            this.ds.slug = null;
            this.ds.name = null;
            this.ds.visibility = 0;
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
    min-width: 320px;
    padding: 4px;
}

.buttons {
    margin-top: 16px;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
}

.form {
    margin-bottom: 20px;
}

.grid-two-column {
    display: flex;
    gap: 16px;
}

.grid-two-column > .column {
    flex: 1;
}

.grid-one-column {
    display: flex;
}

.grid-one-column > .column {
    flex: 1;
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

.fields .field:first-child {
    padding-left: 0px;
}


.fields .field:last-child {
    padding-right: 0px;
}

.content {
    overflow: hidden;
}

.char-count {
    color: #999;
    float: right;
    margin-top: 2px;
}
</style>
