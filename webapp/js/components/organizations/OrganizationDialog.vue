<template>
    <Window v-bind:title="title" id="organizationDialog" @onClose="close('close')" modal maxWidth="70%" fixedSize>
        <div class="org-dialog">
            <form v-on:submit.prevent class="ui form">
                <div class="fields">
                    <div class="field">
                        <label>Name</label>
                        <input type="text" ref="name"
                            v-on:keyup.enter="isValid() && close(mode == 'new' ? 'create' : 'save')" v-model="org.name"
                            placeholder="Name" />
                    </div>
                </div>
                <div class="field">
                    <label>Description</label>
                    <textarea v-model="org.description" placeholder="Description"></textarea>
                </div>
                <div class="inline field">
                    <label>Public</label>
                    <input type="checkbox" v-model="org.isPublic" />
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

    props: ["mode", "model"],

    data: function () {
        return {
            org: {
                name: null,
                description: null,
                isPublic: false
            },
            title: null
        };
    },
    mounted: function () {
        this.$nextTick(() => this.$refs.name.focus());

        if (this.mode == 'edit') {

            this.title = "Edit " + this.model.slug;

            this.org.name = this.model.name;
            this.org.description = this.model.description;
            this.org.isPublic = this.model.isPublic;
        } else {

            this.title = "Add New Organization";

            this.org.name = null;
            this.org.description = null;
            this.org.isPublic = false;
        }

    },
    methods: {
        filterKeys(e) {

            // Allow backspace, canc, left arrow, right arrow and tab
            if (e.keyCode == 8 || e.keyCode == 46 || e.keyCode == 37 || e.keyCode == 39 || e.keyCode == 9) {
                return;
            }

            // Allow only lowercase letters and numbers
            if (!re.test(e.key)) {
                e.preventDefault();
            }
        },
        close: function (buttonId, obj) {
            this.$emit('onClose', buttonId, {
                name: this.org.name,
                description: typeof this.org.description === "string" ? this.org.description : "",
                isPublic: this.org.isPublic,
                slug: slugFromName(this.org.name)
            });
        },
        isValid: function () {
            // organization slug can contain only letters, numbers, dashes and underscores
            const slug = slugFromName(this.org.name);
            return slug && re.test(slug) && this.org.name;
        }
    }
}
</script>

<style scoped>
.org-dialog {
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

.field {
    width: 100%;
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