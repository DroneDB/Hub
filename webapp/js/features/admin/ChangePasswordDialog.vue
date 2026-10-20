<template>
    <Window id="changePasswordDialog" title="Change Password" modal max-width="50%" fixed-size @close="close">

        <div v-if="loading" class="loading">
            <i class="fa-solid fa-circle-notch fa-spin" />
        </div>

        <div v-else class="dialog">
            <Message v-model="error" />

            <PrimeMessage severity="info" :closable="false" class="mb-3">
                Changing password for user: <strong>{{ user.userName }}</strong>
            </PrimeMessage>

            <form :class="{ error: !!error }" @submit.prevent>
                <div class="mb-3">
                    <label class="d-block mb-1 fw-semibold">Current Password</label>
                    <Password ref="txtCurrentPassword" v-model="currentPassword" placeholder="Enter current password"
                              :feedback="false" toggle-mask class="w-100" @keydown="clearError()" @keyup.enter="confirmChange()" />
                    <small>Leave empty if you don't know the current password (admin override)</small>
                </div>
                <div class="mb-3">
                    <label class="d-block mb-1 fw-semibold">New Password</label>
                    <Password v-model="newPassword" placeholder="Enter new password"
                              :feedback="false" toggle-mask class="w-100" @keydown="clearError()" @keyup.enter="confirmChange()" />
                </div>
                <div class="mb-3">
                    <label class="d-block mb-1 fw-semibold">Confirm New Password</label>
                    <Password v-model="confirmPassword" placeholder="Confirm new password"
                              :feedback="false" toggle-mask class="w-100" @keydown="clearError()" @keyup.enter="confirmChange()" />
                </div>
            </form>
            <div class="d-flex justify-content-end gap-2 mt-3 w-100">
                <Button severity="secondary" :disabled="changing" label="Cancel" @click="close()" />
                <Button :disabled="changing || !isValid()" :loading="changing" severity="primary"
                        label="Change Password" @click="confirmChange()" />
            </div>
        </div>
    </Window>
</template>

<script>
import Window from '@/components/Window.vue';
import Message from '@/components/Message.vue';
import Button from 'primevue/button';
import Password from 'primevue/password';
import PrimeMessage from 'primevue/message';
import reg from '@/libs/api/sharedRegistry';

export default {
    // NOTE: This dialog is used by admins to change other users' passwords.
    // Password policy validation is intentionally NOT applied here (admin override).
    components: {
        Window, Message, Button, Password, PrimeMessage
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
        close: function () {
            this.$emit('close');
        },
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
