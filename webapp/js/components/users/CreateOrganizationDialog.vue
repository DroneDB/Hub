<template>
    <Window title="Create Organization" id="createOrganizationDialog" @onClose="close" modal maxWidth="40%" fixedSize>
        <div v-if="loading" class="loading">
            <i class="icon circle notch spin" />
        </div>

        <div v-else class="dialog">
            <Message bindTo="error" />
            <div class="ui message positive" v-if="success">
                <p><strong>{{ successMessage }}</strong></p>
            </div>

            <form v-on:submit.prevent class="ui form" v-bind:class="{ error: !!error }">
                <div class="field">
                    <label>Organization Name <span class="text-red">*</span></label>
                    <input ref="txtOrgName" v-on:keydown="clearError()" v-on:keyup.enter="confirmCreate()"
                           type="text" v-model="organizationName" placeholder="Enter organization name" />
                    <small>Organization names should be descriptive and will be converted to a valid slug</small>
                </div>

                <div class="field">
                    <label>Organization Slug</label>
                    <input type="text" v-model="organizationSlug" :placeholder="suggestedSlug" readonly />
                    <small>This is automatically generated from the name and cannot be changed later</small>
                </div>

                <div class="field">
                    <label>Description (Optional)</label>
                    <textarea v-model="organizationDescription" placeholder="Brief description of the organization"></textarea>
                </div>
            </form>

            <div class="dialog-buttons">
                <button @click="close()" class="ui button">
                    Cancel
                </button>
                <button @click="confirmCreate()" :disabled="creating || !organizationName.trim()"
                        :class="{ loading: creating }" class="ui primary button">
                    <i class="plus icon"></i>Create Organization
                </button>
            </div>
        </div>
    </Window>
</template>

<script>
import Window from '../Window.vue';
import Message from '../Message.vue';
import reg from '../../libs/sharedRegistry';

export default {
    components: {
        Window, Message
    },

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
                this.$refs.txtOrgName.focus();
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
    min-width: 320px;
    padding: 4px;
}

.dialog-buttons {
    margin-top: 16px;
    text-align: right;
}

.form {
    margin-bottom: 20px;
}

.text-red {
    color: #e74c3c;
}

textarea {
    min-height: 60px;
    resize: vertical;
}
</style>
