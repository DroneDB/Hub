<template>
    <Window id="organizationDialog" :title="title" modal size-class="dialog-lg" fixed-size :confirm-label="mode == 'new' ? 'Create' : 'Save'" :confirm-disabled="!isValid()" @confirm="close(mode == 'new' ? 'create' : 'save')" @close="close('close')">
        <div>
            <form @submit.prevent>
                <div class="mb-3">
                    <label for="organization-dialog-name" class="d-block mb-1 fw-semibold">Name</label>
                    <InputText id="organization-dialog-name" ref="name"
                               v-model="org.name" placeholder="Name"
                               class="w-100" :invalid="!!nameError"
                               :aria-describedby="nameError ? 'organization-dialog-name-error' : undefined" />
                    <!-- The Registry's rule text, before submit (D-035, slug rule) -->
                    <small v-if="nameError" id="organization-dialog-name-error" class="d-block text-danger">{{ nameError }}</small>
                </div>
                <div class="mb-3">
                    <label for="organization-dialog-description" class="d-block mb-1 fw-semibold">Description</label>
                    <Textarea id="organization-dialog-description" v-model="org.description" placeholder="Description" rows="3" auto-resize class="w-100" />
                </div>
                <div class="d-flex align-items-center gap-2 mt-2">
                    <Checkbox v-model="org.isPublic" :binary="true" input-id="orgPublic" :pt="{ input: { 'aria-describedby': 'organization-dialog-public-hint' } }" />
                    <label for="orgPublic" class="mb-0" style="cursor: pointer;">Public</label>
                </div>
                <!-- What Public means (D-003): readable and listed for everyone -->
                <small id="organization-dialog-public-hint" class="d-block text-muted mt-1">Anyone, signed in or not, can see this organization and its public datasets.</small>
            </form>
        </div>
    </Window>
</template>

<script>
import Window from '@/components/HubWindow.vue';
import Checkbox from 'primevue/checkbox';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import { slugFromName } from '@/libs/api/registryUtils';
import { slugProblem } from '@/libs/slug';
import { latinNameProblem } from '@/libs/nameRules';

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
    computed: {
        // What the Registry would refuse in the name: no Latin letter or digit (D-035; the dialog has no slug
        // field), or, for a new organization, a slug made from it that the slug rule refuses
        nameError() {
            if (!this.org.name || !this.org.name.trim()) return null;
            const latin = latinNameProblem(this.org.name, { withSlugField: false });
            if (latin || this.mode === 'edit') return latin;
            return slugProblem(slugFromName(this.org.name), 'Organization');
        }
    },
    mounted: function () {
        if (this.mode == 'edit') {

            this.title = `Edit ${this.model.name || this.model.slug}`;

            this.org.name = this.model.name;
            this.org.description = this.model.description;
            this.org.isPublic = this.model.isPublic;
        } else {

            this.title = 'Create organization';

            this.org.name = null;
            this.org.description = null;
            this.org.isPublic = false;
        }

    },
    methods: {
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
            // An edit keeps the organization's slug: only a new one is made from the name
            return !!this.org.name && !!this.org.name.trim() && !this.nameError;
        }
    }
}
</script>
