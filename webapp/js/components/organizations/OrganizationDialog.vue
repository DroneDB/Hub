<template>
    <Window v-bind:title="title" id="organizationDialog" @onClose="close('close')" modal maxWidth="70%" fixedSize>
        <div class="org-dialog">
            <form v-on:submit.prevent class="form">
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
                <div class="inline field" style="display: flex; align-items: center; gap: 8px; margin-top: 8px;">
                    <Checkbox v-model="org.isPublic" :binary="true" inputId="orgPublic" />
                    <label for="orgPublic" style="margin: 0; cursor: pointer;">Public</label>
                </div>
            </form>
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
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import { slugFromName } from '../../libs/registryUtils';

var re = /^[a-z0-9\-_]+$/;

export default {
    components: {
        Window, Button, Checkbox
    },

    props: ["mode", "model"],
    emits: ['onClose'],

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
        close: function (buttonId) {
            if (buttonId === 'close') {
                this.$emit('onClose', 'close');
                return;
            }
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
    display: flex;
    justify-content: flex-end;
    gap: 8px;
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