<template>
    <Window title="Change Password" id="changePasswordDialog" @onClose="close" modal maxWidth="50%" fixedSize>

        <div v-if="loading" class="loading">
            <i class="fa-solid fa-circle-notch fa-spin" />
        </div>

        <div v-else class="dialog">
            <Message bindTo="error" />
            <PrimeMessage v-if="success" severity="success" :closable="false">
                <strong>Password changed successfully!</strong>
            </PrimeMessage>

            <PrimeMessage severity="info" :closable="false">
                Changing password for user: <strong>{{ user.userName }}</strong>
            </PrimeMessage>

            <form v-on:submit.prevent class="form" v-bind:class="{ error: !!error }">
                <div class="field">
                    <label>Current Password</label>
                    <input ref="txtCurrentPassword" v-on:keydown="clearError()" v-on:keyup.enter="confirmChange()"
                           type="password" v-model="currentPassword" placeholder="Enter current password" />
                    <small>Leave empty if you don't know the current password (admin override)</small>
                </div>
                <div class="field">
                    <label>New Password</label>
                    <input v-on:keydown="clearError()" v-on:keyup.enter="confirmChange()"
                           type="password" v-model="newPassword" placeholder="Enter new password" />
                </div>
                <div class="field">
                    <label>Confirm New Password</label>
                    <input v-on:keydown="clearError()" v-on:keyup.enter="confirmChange()"
                           type="password" v-model="confirmPassword" placeholder="Confirm new password" />
                </div>
            </form>
            <div class="buttons">
                <Button @click="close()" :disabled="changing" label="Cancel" />
                <Button @click="confirmChange()" :disabled="changing || !isValid()" :loading="changing"
                    severity="info" label="Change Password" />
            </div>
        </div>
    </Window>
</template>

<script>
import Window from '../Window.vue';
import Message from '../Message.vue';
import Button from 'primevue/button';
import PrimeMessage from 'primevue/message';
import reg from '../../libs/sharedRegistry';

export default {
    // NOTE: This dialog is used by admins to change other users' passwords.
    // Password policy validation is intentionally NOT applied here (admin override).
    components: {
        Window, Message, Button, PrimeMessage
    },
    props: {
        user: {
            type: Object,
            required: true
        }
    },
    emits: ['onClose'],

    data: function () {
        return {
            changing: false,
            success: false,
            loading: false,
            error: "",
            currentPassword: "",
            newPassword: "",
            confirmPassword: ""
        };
    },
    mounted: function () {
        this.$nextTick(() => this.$refs.txtCurrentPassword.focus());
    },
    methods: {
        close: function () {
            this.$emit('onClose');
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
                await reg.changeUserPassword(
                    this.user.userName,
                    this.currentPassword || null, // Pass null instead of empty string for admin override
                    this.newPassword
                );

                this.success = true;
                setTimeout(() => {
                    this.changing = false;
                    this.$emit('onClose', 'updated');
                }, 1500);
            } catch (e) {
                this.error = e.message || 'Failed to change password';
                this.changing = false;
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

.buttons {
    margin-top: 16px;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
}

.form {
    margin-bottom: 20px;
}
</style>
