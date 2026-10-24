<template>
    <Window id="changePasswordDialog" title="Change Password" modal max-width="50%" fixed-size confirm-label="Change Password" :confirm-disabled="!isValid()" :busy="changing" @confirm="confirmChange()" @close="$emit('close')">

        <LoadingSpinner v-if="loading" />

        <div v-else class="dialog">
            <Message v-model="error" />

            <PrimeMessage severity="info" :closable="false" class="mb-3">
                Changing password for user: <strong>{{ user.userName }}</strong>
            </PrimeMessage>

            <form :class="{ error: !!error }" @submit.prevent>
                <div class="mb-3">
                    <label for="change-password-dialog-current-password" class="d-block mb-1 fw-semibold">Current Password</label>
                    <Password ref="txtCurrentPassword" v-model="currentPassword" input-id="change-password-dialog-current-password" placeholder="Enter current password"
                              :feedback="false" toggle-mask class="w-100" @keydown="clearError()" />
                    <small>Leave empty if you don't know the current password (admin override)</small>
                </div>
                <div class="mb-3">
                    <label for="change-password-dialog-new-password" class="d-block mb-1 fw-semibold">New Password</label>
                    <Password v-model="newPassword" input-id="change-password-dialog-new-password" placeholder="Enter new password"
                              :feedback="false" toggle-mask class="w-100" @keydown="clearError()" />
                </div>
                <div class="mb-3">
                    <label for="change-password-dialog-confirm-new-password" class="d-block mb-1 fw-semibold">Confirm New Password</label>
                    <Password v-model="confirmPassword" input-id="change-password-dialog-confirm-new-password" placeholder="Confirm new password"
                              :feedback="false" toggle-mask class="w-100" @keydown="clearError()" />
                </div>
            </form>
        </div>
    </Window>
</template>

<script>
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import Window from '@/components/HubWindow.vue';
import Message from '@/components/HubMessage.vue';
import Password from 'primevue/password';
import PrimeMessage from 'primevue/message';
import reg from '@/libs/api/sharedRegistry';

export default {
    // NOTE: This dialog is used by admins to change other users' passwords.
    // Password policy validation is intentionally NOT applied here (admin override).
    components: {
        LoadingSpinner,
        Window, Message, Password, PrimeMessage
    },
    props: {
        user: {
            type: Object,
            required: true
        }
    },
    emits: ['close'],

    data: function () {
        return {
            changing: false,
            loading: false,
            error: "",
            currentPassword: "",
            newPassword: "",
            confirmPassword: ""
        };
    },
    methods: {
        clearError: function () {
            this.error = "";
        },
        isValid: function () {
            return this.newPassword !== "" &&
                   this.newPassword === this.confirmPassword;
        },
        confirmChange: async function () {
            if (!this.isValid()) return;

            if (this.newPassword !== this.confirmPassword) {
                this.error = "New passwords do not match";
                return;
            }

            this.changing = true;
            try {
                await reg.admin.changeUserPassword(
                    this.user.userName,
                    this.currentPassword || null, // Pass null instead of empty string for admin override
                    this.newPassword
                );

                this.$notify.success(`Password changed successfully for "${this.user.userName}"`, { summary: 'Password Changed' });
                this.changing = false;
                this.$emit('close', 'updated');
            } catch (e) {
                this.$notify.error('Failed to change password: ' + (e.message || 'Unknown error'));
                this.error = e.message || 'Failed to change password';
                this.changing = false;
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
