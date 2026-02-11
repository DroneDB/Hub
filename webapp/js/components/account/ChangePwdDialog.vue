<template>
    <Window title="Change Password" id="changePwdDialog" @onClose="close" modal maxWidth="70%" fixedSize>
        <div class="dialog">
            <form v-on:submit.prevent class="ui form" v-bind:class="{ error: !!error }">
                <div class="ui error message" v-if="error">
                    <p>{{ error }}</p>
                </div>
                <div class="ui message positive" v-if="success">
                    <p><strong>Password changed successfully!</strong></p>
                </div>
                <div class="field">
                    <label>Old Password</label>
                    <input ref="oldPwd" v-on:keydown="clearError()" v-on:keyup.enter="changePwd()" type="password"
                        v-model="oldPwd" placeholder="" />
                </div>
                <div class="field">
                    <label>New Password</label>
                    <input v-on:keydown="clearError()" v-on:keyup.enter="changePwd()" type="password" v-model="newPwd"
                        placeholder="" @input="onPasswordInput" />
                    <div v-if="passwordPolicy && newPwd" class="password-requirements">
                        <small v-for="(req, idx) in passwordRequirements" :key="idx"
                            :class="{ met: isRequirementMet(req) }">
                            <i :class="isRequirementMet(req) ? 'icon check green' : 'icon close red'" />
                            {{ req }}
                        </small>
                    </div>
                </div>
                <div class="field">
                    <label>Confirm New Password</label>
                    <input v-on:keydown="clearError()" v-on:keyup.enter="changePwd()" type="password"
                        v-model="confirmPwd" placeholder="" />
                </div>
            </form>
            <div class="buttons">
                <button @click="close()" class="ui button" :disabled="changing">
                    Close
                </button>
                <button @click="changePwd()" :disabled="changing || !isFilled()" :class="{ loading: changing }"
                    class="ui button primary">
                    Change Password
                </button>
            </div>
        </div>
    </Window>
</template>

<script>
import Window from '../Window.vue';
import reg from '../../libs/sharedRegistry';
import { Features } from '../../libs/features';
import { validatePassword, getPasswordRequirements } from '../../libs/passwordValidator';

export default {
    components: {
        Window
    },
    props: {

    },

    data: function () {
        return {
            changing: false,
            success: false,
            error: "",
            oldPwd: "",
            newPwd: "",
            confirmPwd: "",
            passwordPolicy: null,
            passwordRequirements: [],
            passwordValidation: { isValid: true, errors: [] }
        };
    },
    mounted: function () {
        this.$nextTick(() => {
            this.$refs.oldPwd.focus();
            this.passwordPolicy = reg.getFeatureValue(Features.PASSWORD_POLICY);
            this.passwordRequirements = getPasswordRequirements(this.passwordPolicy);
        });
    },
    methods: {
        close: function (buttonId) {
            this.$emit('onClose');
        },
        clearError: function () {
            this.error = "";
        },
        isFilled: function () {
            return this.oldPwd !== "" && this.newPwd !== "" && this.confirmPwd !== "" && this.isPasswordValid();
        },
        isPasswordValid: function () {
            if (!this.passwordPolicy || !this.newPwd) return true;
            return this.passwordValidation.isValid;
        },
        onPasswordInput: function () {
            this.passwordValidation = validatePassword(this.newPwd, this.passwordPolicy);
        },
        isRequirementMet: function (requirement) {
            if (!this.newPwd) return false;
            const req = requirement.toLowerCase();
            if (req.includes('character') && !req.includes('special'))
                return this.newPwd.length >= (this.passwordPolicy?.minLength || 0);
            if (req.includes('digit'))
                return /\d/.test(this.newPwd);
            if (req.includes('uppercase'))
                return /[A-Z]/.test(this.newPwd);
            if (req.includes('lowercase'))
                return /[a-z]/.test(this.newPwd);
            if (req.includes('special'))
                return !/^[a-zA-Z0-9]*$/.test(this.newPwd);
            return false;
        },
        changePwd: async function () {
            if (!this.isFilled()) return;
            if (this.newPwd !== this.confirmPwd) {
                this.error = "The new passwords do not match.";
                return;
            }

            this.changing = true;
            try {
                await reg.changePwd(this.oldPwd, this.newPwd);
                this.success = true;
                setTimeout(() => {
                    this.close();
                    this.changing = false;
                }, 2500);
            } catch (e) {
                this.error = e.message;
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

.password-requirements {
    margin-top: 6px;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.password-requirements small {
    color: #db2828;
}

.password-requirements small.met {
    color: #21ba45;
}
</style>