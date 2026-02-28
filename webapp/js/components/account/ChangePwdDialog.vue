<template>
    <Window title="Change Password" id="changePwdDialog" @onClose="close" modal maxWidth="70%" fixedSize>
        <div class="dialog">
            <form v-on:submit.prevent>
                <Message v-if="error" severity="error">{{ error }}</Message>
                <Message v-if="success" severity="success"><strong>Password changed successfully!</strong></Message>
                <div class="mb-3">
                    <label class="d-block mb-1 fw-semibold">Old Password</label>
                    <Password ref="oldPwd" @keydown="clearError()" @keyup.enter="changePwd()"
                        v-model="oldPwd" :feedback="false" toggleMask class="w-100" inputClass="w-100" />
                </div>
                <div class="mb-3">
                    <label class="d-block mb-1 fw-semibold">New Password</label>
                    <Password @keydown="clearError()" @keyup.enter="changePwd()" v-model="newPwd"
                        :feedback="false" toggleMask @input="onPasswordInput" class="w-100" inputClass="w-100" />
                    <div v-if="passwordPolicy && newPwd" class="password-requirements">
                        <small v-for="(req, idx) in passwordRequirements" :key="idx"
                            :class="{ met: isRequirementMet(req) }">
                            <i :class="isRequirementMet(req) ? 'fa-solid fa-check text-success' : 'fa-solid fa-xmark text-danger'" />
                            {{ req }}
                        </small>
                    </div>
                </div>
                <div class="mb-3">
                    <label class="d-block mb-1 fw-semibold">Confirm New Password</label>
                    <Password @keydown="clearError()" @keyup.enter="changePwd()"
                        v-model="confirmPwd" :feedback="false" toggleMask class="w-100" inputClass="w-100" />
                </div>
            </form>
            <div class="d-flex justify-content-end gap-2 mt-3">
                <Button @click="close()" severity="secondary" :disabled="changing" label="Close" />
                <Button @click="changePwd()" :disabled="changing || !isFilled()" :loading="changing"
                    severity="info" label="Change Password" />
            </div>
        </div>
    </Window>
</template>

<script>
import Window from '../Window.vue';
import Button from 'primevue/button';
import Password from 'primevue/password';
import Message from 'primevue/message';
import reg from '../../libs/sharedRegistry';
import { Features } from '../../libs/features';
import { validatePassword, getPasswordRequirements } from '../../libs/passwordValidator';

export default {
    components: {
        Window, Button, Password, Message
    },
    props: {

    },
    emits: ['onClose'],

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
            const el = this.$refs.oldPwd?.$el;
            if (el) {
                const input = el.querySelector('input');
                if (input) input.focus();
            }
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
    min-width: 20rem;
    padding: 0.25rem;
}

.password-requirements {
    margin-top: 0.375rem;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
}

.password-requirements small {
    color: #db2828;
}

.password-requirements small.met {
    color: #21ba45;
}
</style>