<template>
    <Window v-bind:title="title" id="organizationDialog" @onClose="close('close')" modal maxWidth="70%" fixedSize>
        <div class="org-dialog">
            <form v-on:submit.prevent>
                <div class="mb-3">
                    <label class="d-block mb-1 fw-semibold">Name</label>
                    <InputText ref="name"
                        @keyup.enter="isValid() && close(mode == 'new' ? 'create' : 'save')" v-model="org.name"
                        placeholder="Name" class="w-100" />
                </div>
                <div class="mb-3">
                    <label class="d-block mb-1 fw-semibold">Description</label>
                    <Textarea v-model="org.description" placeholder="Description" rows="3" autoResize class="w-100" />
                </div>
                <div class="d-flex align-items-center gap-2 mt-2">
                    <Checkbox v-model="org.isPublic" :binary="true" inputId="orgPublic" />
                    <label for="orgPublic" class="mb-0" style="cursor: pointer;">Public</label>
                </div>
            </form>
            <div class="d-flex justify-content-end gap-2 mt-3">
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
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import { slugFromName } from '../../libs/registryUtils';

var re = /^[a-z0-9\-_]+$/;

export default {
    components: {
        Window, Button, Checkbox, InputText, Textarea
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
        this.$nextTick(() => this.$refs.name.$el.querySelector('input').focus());

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
    min-width: 20rem;
    padding: 0.25rem;
}
</style>