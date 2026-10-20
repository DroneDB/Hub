<template>
    <Window id="createOrganizationDialog" title="Create Organization" modal max-width="40%" fixed-size @close="close">
        <div v-if="loading" class="loading">
            <i class="fa-solid fa-circle-notch fa-spin" />
        </div>

        <div v-else class="dialog">
            <Message v-model="error" />

            <form :class="{ error: !!error }" @submit.prevent>
                <div class="mb-3">
                    <label class="d-block mb-1 fw-semibold">Organization Name <span class="text-danger">*</span></label>
                    <InputText ref="txtOrgName" v-model="organizationName" placeholder="Enter organization name"
                               class="w-100" @keydown="clearError()" @keyup.enter="confirmCreate()" />
                    <small>Organization names should be descriptive and will be converted to a valid slug</small>
                </div>

                <div class="mb-3">
                    <label class="d-block mb-1 fw-semibold">Organization Slug</label>
                    <InputText :model-value="organizationSlug" :placeholder="suggestedSlug" readonly class="w-100" />
                    <small>This is automatically generated from the name and cannot be changed later</small>
                </div>

                <div class="mb-3">
                    <label class="d-block mb-1 fw-semibold">Description (Optional)</label>
                    <Textarea v-model="organizationDescription" placeholder="Brief description of the organization" rows="3" auto-resize class="w-100" />
                </div>
            </form>

            <div class="d-flex justify-content-end gap-2 mt-3">
                <Button severity="secondary" label="Cancel" @click="close()" />
                <Button :disabled="creating || !organizationName.trim()" :loading="creating"
                        severity="primary" icon="fa-solid fa-plus" label="Create Organization" @click="confirmCreate()" />
            </div>
        </div>
    </Window>
</template>

<script>
import Window from '@/components/Window.vue';
import Message from '@/components/Message.vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import reg from '@/libs/api/sharedRegistry';

export default {
    components: {
        Window, Message, Button, InputText, Textarea
    },
    emits: ['close'],

    data: function () {
        return {
            loading: false,
            error: "",
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
                const el = this.$refs.txtOrgName.$el || this.$refs.txtOrgName;
                const input = el.querySelector ? el.querySelector('input') : el;
                if (input && input.focus) input.focus();
            }
        },

        close: function () {
            this.$emit('close');
        },

        clearError: function () {
            this.error = "";
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
                await reg.orgs.createOrganization({
                    name: this.organizationName.trim(),
                    slug: slug,
                    description: this.organizationDescription.trim() || undefined
                });

                this.$notify.success(`Organization "${this.organizationName}" created successfully`, { summary: 'Organization Created' });
                this.creating = false;
                this.$emit('close', 'created');
            } catch (e) {
                this.$notify.error('Failed to create organization: ' + (e.message || 'Unknown error'));
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
