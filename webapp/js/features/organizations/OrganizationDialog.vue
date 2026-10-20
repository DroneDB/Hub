<template>
    <Window id="organizationDialog" :title="title" modal max-width="70%" fixed-size cancel-label="Close" :confirm-label="mode == 'new' ? 'Create' : 'Save'" :confirm-disabled="!isValid()" @confirm="close(mode == 'new' ? 'create' : 'save')" @close="close('close')">
        <div class="org-dialog">
            <form @submit.prevent>
                <div class="mb-3">
                    <label for="organization-dialog-name" class="d-block mb-1 fw-semibold">Name</label>
                    <InputText id="organization-dialog-name" ref="name"
                               v-model="org.name" placeholder="Name"
                               class="w-100" />
                </div>
                <div class="mb-3">
                    <label for="organization-dialog-description" class="d-block mb-1 fw-semibold">Description</label>
                    <Textarea id="organization-dialog-description" v-model="org.description" placeholder="Description" rows="3" auto-resize class="w-100" />
                </div>
                <div class="d-flex align-items-center gap-2 mt-2">
                    <Checkbox v-model="org.isPublic" :binary="true" input-id="orgPublic" />
                    <label for="orgPublic" class="mb-0" style="cursor: pointer;">Public</label>
                </div>
            </form>
        </div>
    </Window>
</template>

<script>
import Window from '@/components/Window.vue';
import Checkbox from 'primevue/checkbox';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import { slugFromName } from '@/libs/api/registryUtils';

var re = /^[a-z0-9\-_]+$/;

export default {
    components: {
        Window, Checkbox, InputText, Textarea
    },

    props: {
        mode: { type: String, required: true },
        model: { type: Object, default: null }
    },
    emits: ['close'],

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
                this.$emit('close', 'close');
                return;
            }
            this.$emit('close', buttonId, {
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
}
</style>