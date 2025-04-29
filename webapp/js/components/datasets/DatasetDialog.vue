<template>
    <Window v-bind:title="title" id="datasetDialog" @onClose="close('close')" modal maxWidth="70%" fixedSize>
        <div class="ds-dialog">
            <form v-on:submit.prevent class="ui form" v-bind:class="{ error: !isValid() }">
                <div class="ui error message" v-if="isDuplicateSlug()">
                    <p>This name is already in use.</p>
                </div>
                <div class="field">
                    <label>Name</label>
                    <input ref="name" v-on:keyup.enter="isValid() && close(mode == 'new' ? 'create' : 'save')"
                        type="text" v-model="ds.name" placeholder="Name" />
                </div>
                <div class="inline field">
                    <label>Visibility</label>
                    <select v-model="ds.visibility">
                        <option :value="0">Private</option>
                        <option :value="1">Unlisted</option>
                        <option :value="2">Public</option>
                    </select>
                </div>
            </form>
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
            title: null
        };
    },
    mounted: function () {
        this.$nextTick(() => this.$refs.name.focus());

        if (this.mode == 'edit') {

            this.title = "Edit dataset " + this.model.slug;

            this.ds.slug = this.model.slug;
            this.ds.name = this.model.name;
            this.ds.visibility = this.model.visibility;
        } else {

            this.title = "Create new dataset";

            this.ds.slug = null;
            this.ds.name = null;
            this.ds.visibility = 0;
        }

    },
    methods: {
        close: function (buttonId) {
            this.$emit('onClose', buttonId, {
                name: this.ds.name,
                visibility: this.ds.visibility,
                slug: slugFromName(this.ds.name)
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