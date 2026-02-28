<template>
    <Window title="Create Organization" id="createOrganizationDialog" @onClose="close" modal maxWidth="40%" fixedSize>
        <div v-if="loading" class="loading">
            <i class="fa-solid fa-circle-notch fa-spin" />
        </div>

        <div v-else class="dialog">
            <Message bindTo="error" />
            <PrimeMessage v-if="success" severity="success" :closable="false">
                <strong>{{ successMessage }}</strong>
            </PrimeMessage>

            <form v-on:submit.prevent v-bind:class="{ error: !!error }">
                <div class="mb-3">
                    <label class="d-block mb-1 fw-semibold">Organization Name <span class="text-danger">*</span></label>
                    <InputText ref="txtOrgName" @keydown="clearError()" @keyup.enter="confirmCreate()"
                           v-model="organizationName" placeholder="Enter organization name" class="w-100" />
                    <small>Organization names should be descriptive and will be converted to a valid slug</small>
                </div>

                <div class="mb-3">
                    <label class="d-block mb-1 fw-semibold">Organization Slug</label>
                    <InputText :modelValue="organizationSlug" :placeholder="suggestedSlug" readonly class="w-100" />
                    <small>This is automatically generated from the name and cannot be changed later</small>
                </div>

                <div class="mb-3">
                    <label class="d-block mb-1 fw-semibold">Description (Optional)</label>
                    <Textarea v-model="organizationDescription" placeholder="Brief description of the organization" rows="3" autoResize class="w-100" />
                </div>
            </form>

            <div class="d-flex justify-content-end gap-2 mt-3">
                <Button @click="close()" label="Cancel" />
                <Button @click="confirmCreate()" :disabled="creating || !organizationName.trim()"
                        :loading="creating" severity="info" icon="fa-solid fa-plus" label="Create Organization" />
            </div>
        </div>
    </Window>
</template>

<script>
import Window from '../Window.vue';
import Message from '../Message.vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import PrimeMessage from 'primevue/message';
import reg from '../../libs/sharedRegistry';

export default {
    components: {
        Window, Message, Button, InputText, Textarea, PrimeMessage
    },
    emits: ['onClose'],

    data: function () {
        return {
            loading: false,
            error: "",
            success: false,
            successMessage: "",
            organizationName: "",
            organizationDescription: "",
            creating: false
        };
    },

    computed: {
        organizationSlug: function() {
            return this.suggestedSlug;
        },

        suggestedSlug: function() {
            if (!this.organizationName.trim()) return "";

            // Convert name to valid slug
            return this.organizationName
                .toLowerCase()
                .trim()
                .replace(/[^a-z0-9\s-]/g, '') // Remove invalid characters
                .replace(/\s+/g, '-') // Replace spaces with hyphens
                .replace(/-+/g, '-') // Replace multiple hyphens with single
                .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
        }
    },

    mounted: function () {
        this.$nextTick(() => this.focusNameInput());
    },

    methods: {
        focusNameInput() {
            if (this.$refs.txtOrgName) {
                this.$refs.txtOrgName.$el.querySelector('input').focus();
            }
        },

        close: function () {
            this.$emit('onClose');
        },

        clearError: function () {
            this.error = "";
            this.success = false;
        },

        async confirmCreate() {
            if (!this.organizationName.trim()) return;

            const slug = this.suggestedSlug;
            if (!slug) {
                this.error = "Please enter a valid organization name";
                return;
            }

            this.creating = true;
            this.error = "";

            try {
                await reg.createOrganization({
                    name: this.organizationName.trim(),
                    slug: slug,
                    description: this.organizationDescription.trim() || undefined
                });

                this.success = true;
                this.successMessage = `Organization "${this.organizationName}" created successfully!`;

                setTimeout(() => {
                    this.creating = false;
                    this.$emit('onClose', 'created');
                }, 1500);
            } catch (e) {
                this.error = e.message || 'Failed to create organization';
                this.creating = false;
            }
        }
    }
}
</script>

<style scoped>
.dialog {
    min-width: 20rem;
    padding: 0.25rem;
}
</style>
