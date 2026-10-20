<template>
    <Window id="editUserDialog" title="Edit User" modal max-width="70%" fixed-size confirm-label="Update User" :confirm-disabled="!isValid()" :busy="updating" @confirm="confirmUpdate()" @close="$emit('close')">

        <LoadingSpinner v-if="loading" />

        <div v-else class="dialog">
            <Message v-model="error" />

            <form :class="{ error: !!error }" @submit.prevent>
                <div class="mb-3">
                    <label for="edit-user-dialog-username" class="d-block mb-1 fw-semibold">Username</label>
                    <InputText id="edit-user-dialog-username" v-model="editUser.userName" disabled class="w-100" />
                </div>
                <div class="mb-3">
                    <label for="edit-user-dialog-email" class="d-block mb-1 fw-semibold">Email</label>
                    <InputText id="edit-user-dialog-email" v-model="editUser.email" placeholder="user@example.com"
                               class="w-100" @keydown="clearError()" />
                    <div v-if="editUser.email && !isEmailValid()" class="text-danger small">
                        Please enter a valid email address
                    </div>
                </div>
                <div class="mb-3">
                    <label id="edit-user-dialog-roles-label" for="edit-user-dialog-roles" class="d-block mb-1 fw-semibold">Roles</label>
                    <MultiSelect v-model="editUser.roles" input-id="edit-user-dialog-roles" aria-labelledby="edit-user-dialog-roles-label" :options="roleOptions" option-label="label" option-value="value" placeholder="Select roles" class="w-100" display="chip" />
                </div>
            </form>
        </div>
    </Window>
</template>

<script>
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import Window from '@/components/Window.vue';
import Message from '@/components/Message.vue';
import MultiSelect from 'primevue/multiselect';
import InputText from 'primevue/inputtext';
import reg from '@/libs/api/sharedRegistry';

export default {
    components: {
        LoadingSpinner,
        Window, Message, MultiSelect, InputText
    },
    props: {
        user: {
            type: Object,
            required: true
        },
        availableRoles: {
            type: Array,
            required: true
        }
    },
    emits: ['close'],

    data: function () {
        return {
            updating: false,
            loading: false,
            error: "",
            editUser: {
                userName: this.user.userName,
                email: this.user.email || '',
                roles: [...(this.user.roles || [])]
            }
        };
    },
    computed: {
        roleOptions() {
            return this.availableRoles.map(r => ({ label: r, value: r }));
        }
    },
    mounted: function () {
        // PrimeVue MultiSelect handles roles reactively via v-model
    },
    methods: {
        clearError: function () {
            this.error = "";
        },
        isEmailValid: function () {
            if (!this.editUser.email || this.editUser.email.trim() === "") return true; // Email is optional

            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return emailRegex.test(this.editUser.email.trim());
        },
        isValid: function () {
            return this.isEmailValid();
        },
        confirmUpdate: async function () {
            if (!this.isValid()) {
                if (!this.isEmailValid()) {
                    this.error = "Please enter a valid email address";
                    return;
                }
                return;
            }

            this.updating = true;
            try {
                // Update user with both email and roles
                await reg.admin.updateUser(this.editUser.userName, this.editUser.email, this.editUser.roles);

                this.$notify.success(`User "${this.editUser.userName}" updated successfully`, { summary: 'User Updated' });
                this.updating = false;
                this.$emit('close', 'updated');
            } catch (e) {
                this.$notify.error('Failed to update user: ' + e.message);
                this.error = e.message;
                this.updating = false;
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
