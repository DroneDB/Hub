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
                    <div v-if="emailError" class="text-danger small">
                        {{ emailError }}
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
import Window from '@/components/HubWindow.vue';
import Message from '@/components/HubMessage.vue';
import MultiSelect from 'primevue/multiselect';
import InputText from 'primevue/inputtext';
import reg from '@/libs/api/sharedRegistry';
import { emailProblem } from '@/libs/nameRules';
import { isDeactivatedRole, pickableRoles, publishesSystemRoles } from '@/libs/roles';

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
                // 'deactivated' is not offered: Disable and Enable in the Users list change it
                roles: pickableRoles(this.user.roles || [])
            }
        };
    },
    computed: {
        roleOptions() {
            return pickableRoles(this.availableRoles).map(r => ({ label: r, value: r }));
        },
        // The server's rule text, at the field, before submit
        emailError() {
            return emailProblem(this.editUser.email);
        }
    },
    mounted: function () {
        // PrimeVue MultiSelect handles roles reactively via v-model
    },
    methods: {
        clearError: function () {
            this.error = "";
        },
        isValid: function () {
            return !this.emailError;
        },
        // The roles to send. A Registry that lists its system roles keeps 'deactivated' itself (and refuses it in
        // the list); an older one replaces every role, so a disabled user gets it back, or the edit would enable them.
        rolesToSend: function () {
            const roles = [...this.editUser.roles];
            if (!publishesSystemRoles()) {
                const deactivated = (this.user.roles || []).find(isDeactivatedRole);
                if (deactivated) roles.push(deactivated);
            }
            return roles;
        },
        confirmUpdate: async function () {
            if (!this.isValid()) {
                this.error = this.emailError;
                return;
            }

            this.updating = true;
            try {
                // Update user with both email and roles
                await reg.admin.updateUser(this.editUser.userName, this.editUser.email, this.rolesToSend());

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
    min-width: min(20rem, var(--window-content-width, 100%));
    padding: 0.25rem;
}
</style>
