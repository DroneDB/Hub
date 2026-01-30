<template>
    <Window v-bind:title="title" id="datasetDialog" @onClose="close('close')" modal maxWidth="70%" fixedSize>
        <div class="ds-dialog">
            <form v-on:submit.prevent class="ui form" style="margin-right: 10px" v-bind:class="{ error: !isValid() }">
                <div class="ui error message" v-if="isDuplicateSlug()">
                    <p>This dataset name is already in use. It will generate a duplicate slug.</p>
                </div>

                <div class="ui grid two column">
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
                            <div class="ui selection dropdown" ref="visibilityDropdown">
                                <input type="hidden" name="visibility" v-model="ds.visibility">
                                <i class="dropdown icon"></i>
                                <div class="text">{{ getVisibilityText(ds.visibility) }}</div>
                                <div class="menu">
                                    <div class="item" data-value="0"><i class="lock icon"></i>Private</div>
                                    <div class="item" data-value="1"><i class="unlock icon"></i>Unlisted</div>
                                    <div class="item" data-value="2"><i class="unlock icon"></i>Public</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="ui grid one column">
                    <div class="column">
                        <div class="field">
                            <label>Dataset Slug</label>
                            <div class="ui message">
                                <small>{{ ds.name ? slugFromName(ds.name) : "" }}</small>
                            </div>
                        </div>
                    </div>
                </div>

            </form>
            <div v-if="mode == 'new'" class="field" style="margin-bottom: 1em;">
                <div class="ui checkbox">
                    <input type="checkbox" id="openAfterCreate" v-model="openAfterCreate">
                    <label for="openAfterCreate">Open dataset after creation</label>
                </div>
            </div>
            <div class="buttons">
                <button @click="close('close')" class="ui button">
                    Close
                </button>
                <button v-if="mode == 'new'" @click="close('create')" class="ui button primary" :disabled="!isValid()">
                    Create
                </button>
                <button v-else @click="close('save')" class="ui button primary" :disabled="!isValid()">
                    Save
                </button>
            </div>
        </div>
    </Window>
</template>

<script>
import Window from '../Window.vue';
import { slugFromName } from '../../libs/registryUtils';
import { getOpenAfterCreatePreference, saveOpenAfterCreatePreference } from '../../libs/storageUtils';

var re = /^[a-z0-9\-_]+$/;

export default {
    components: {
        Window
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

    data: function () {
        return {
            ds: {
                slug: null,
                name: null,
                visibility: 0
            },
            title: null,
            openAfterCreate: getOpenAfterCreatePreference()
        };
    }, mounted: function () {
        this.$nextTick(() => {
            this.$refs.name.focus();

            // Initialize the visibility dropdown with Semantic UI
            $(this.$refs.visibilityDropdown).dropdown({
                onChange: (value) => {
                    this.ds.visibility = parseInt(value);
                }
            });
        });

        if (this.mode == 'edit') {
            this.title = "Edit dataset " + this.model.slug;

            this.ds.slug = this.model.slug;
            this.ds.name = this.model.name;
            this.ds.visibility = this.model.visibility !== undefined ? this.model.visibility : 0;

            // Set the dropdown value after initialization
            this.$nextTick(() => {
                $(this.$refs.visibilityDropdown).dropdown('set selected', this.ds.visibility.toString());
            });
        } else {
            this.title = "Create new dataset";

            this.ds.slug = null;
            this.ds.name = null;
            this.ds.visibility = 0;

            // Set the dropdown value after initialization
            this.$nextTick(() => {
                $(this.$refs.visibilityDropdown).dropdown('set selected', '0');
            });
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
                openAfterCreate: this.openAfterCreate
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
        }, isDuplicateSlug: function () {
            const slug = slugFromName(this.ds.name);
            return this.forbiddenSlugs.includes(slug);
        },

        getVisibilityText: function (visibility) {
            if (visibility === 2) return 'Public';
            if (visibility === 1) return 'Unlisted';
            return 'Private';
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
    text-align: right;
}

.form {
    margin-bottom: 20px;
}

.fields .field:first-child {
    padding-left: 0px;
}


.fields .field:last-child {
    padding-right: 0px;
}

.ui.form .fields {
    margin-left: 0;
    margin-right: 0;
}

.content {
    overflow: hidden;
}
</style>