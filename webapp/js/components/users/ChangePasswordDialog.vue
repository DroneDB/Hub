<template>
    <Window title="Change Password" id="changePasswordDialog" @onClose="close" modal maxWidth="50%" fixedSize>

        <div v-if="loading" class="loading">
            <i class="icon circle notch spin" />
        </div>

        <div v-else class="dialog">
            <Message bindTo="error" />
            <div class="ui message positive" v-if="success">
                <p><strong>Password changed successfully!</strong></p>
            </div>

            <div class="ui message info">
                <p>Changing password for user: <strong>{{ user.userName }}</strong></p>
            </div>

            <form v-on:submit.prevent class="ui form" v-bind:class="{ error: !!error }">
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
                <button @click="close()" class="ui button" :disabled="changing">
                    Cancel
                </button>
                <button @click="confirmChange()" :disabled="changing || !isValid()" :class="{ loading: changing }"
                    class="ui button primary">
                    Change Password
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
    // NOTE: This dialog is used by admins to change other users' passwords.
    // Password policy validation is intentionally NOT applied here (admin override).
    components: {
        Window, Message
    },
    props: {
        user: {
            type: Object,
            required: true
        }
    },

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
    text-align: right;
}

.form {
    margin-bottom: 20px;
}
</style>
