<template>
    <Window title="Add User" id="addUserDialog" @onClose="close" modal maxWidth="70%" fixedSize>

        <div v-if="loading" class="loading">
            <i class="fa-solid fa-circle-notch fa-spin" />
        </div>

        <div v-else class="dialog">
            <Message bindTo="error" />
            <PrimeMessage v-if="success" severity="success" :closable="false">
                <strong>User added successfully!</strong>
            </PrimeMessage>

            <form v-on:submit.prevent v-bind:class="{ error: !!error }">
                <div class="mb-3">
                    <label class="d-block mb-1 fw-semibold">Username</label>
                    <InputText ref="txtUsername" @keydown="clearError()" @keyup.enter="confirmAddUser()"
                        v-model="username" placeholder="" class="w-100" />
                </div>
                <div class="mb-3">
                    <label class="d-block mb-1 fw-semibold">Email</label>
                    <InputText @keydown="clearError()" @keyup.enter="confirmAddUser()"
                        v-model="email" placeholder="user@example.com" class="w-100" />
                    <div v-if="email && !isEmailValid()" class="text-danger small">
                        Please enter a valid email address
                    </div>
                </div>
                <div class="mb-3">
                    <label class="d-block mb-1 fw-semibold">Password</label>
                    <Password ref="txtPassword" @keydown="clearError()" @keyup.enter="confirmAddUser()"
                        v-model="password" placeholder="" :feedback="false" toggleMask class="w-100" @input="onPasswordInput" />
                    <div v-if="passwordPolicy && password" class="password-requirements">
                        <small v-for="(req, idx) in passwordRequirements" :key="idx"
                            :class="{ met: isRequirementMet(req) }">
                            <i :class="isRequirementMet(req) ? 'fa-solid fa-check text-success' : 'fa-solid fa-xmark text-danger'" />
                            {{ req }}
                        </small>
                    </div>
                </div>
                <div class="mb-3">
                    <label class="d-block mb-1 fw-semibold">Roles</label>
                    <MultiSelect v-model="roles" :options="roleOptions" optionLabel="label" optionValue="value" placeholder="Select roles" class="w-100" display="chip" />
                </div>
            </form>
            <div class="d-flex justify-content-end gap-2 mt-3">
                <Button @click="close()" :disabled="adding" label="Close" />
                <Button @click="confirmAddUser()" :disabled="adding || !isFilled()" :loading="adding"
                    severity="info" label="Add User" />
            </div>
        </div>
    </Window>
</template>

<script>
import Window from '../Window.vue';
import Message from '../Message.vue';
import MultiSelect from 'primevue/multiselect';
import InputText from 'primevue/inputtext';
import Password from 'primevue/password';
import Button from 'primevue/button';
import PrimeMessage from 'primevue/message';
import reg from '../../libs/sharedRegistry';
import { Features } from '../../libs/features';
import { validatePassword, getPasswordRequirements } from '../../libs/passwordValidator';

export default {
    components: {
        Window, Message, MultiSelect, InputText, Password, Button, PrimeMessage
    },
    props: {
        availableRoles: {
            type: Array,
            required: true
        }
    },
    emits: ['onClose'],

    data: function () {
        return {
            adding: false,
            success: false,
            loading: false,
            error: "",
            username: "",
            email: "",
            password: "",
            roles: [],
            passwordPolicy: null,
            passwordRequirements: [],
            passwordValidation: { isValid: true, errors: [] }
        };
    },
    computed: {
        roleOptions() {
            return this.availableRoles.map(r => ({ label: r, value: r }));
        }
    },
    mounted: function () {
        this.$nextTick(() => {
            this.$refs.txtUsername.$el.querySelector('input').focus();

            // Load password policy from features
            this.passwordPolicy = reg.getFeatureValue(Features.PASSWORD_POLICY);
            this.passwordRequirements = getPasswordRequirements(this.passwordPolicy);
        });
    },
    methods: {
        close: function () {
            this.$emit('onClose');
        },
        clearError: function () {
            this.error = "";
        },
        isFilled: function () {
            return this.username !== "" && this.password !== "" && this.isEmailValid() && this.isPasswordValid();
        },
        isPasswordValid: function () {
            if (!this.passwordPolicy || !this.password) return true;
            return this.passwordValidation.isValid;
        },
        onPasswordInput: function () {
            this.passwordValidation = validatePassword(this.password, this.passwordPolicy);
        },
        isRequirementMet: function (requirement) {
            if (!this.password) return false;
            const req = requirement.toLowerCase();
            if (req.includes('character') && !req.includes('special'))
                return this.password.length >= (this.passwordPolicy?.minLength || 0);
            if (req.includes('digit'))
                return /\d/.test(this.password);
            if (req.includes('uppercase'))
                return /[A-Z]/.test(this.password);
            if (req.includes('lowercase'))
                return /[a-z]/.test(this.password);
            if (req.includes('special'))
                return !/^[a-zA-Z0-9]*$/.test(this.password);
            return false;
        },
        isEmailValid: function () {
            if (!this.email || this.email.trim() === "") return true; // Email is optional

            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return emailRegex.test(this.email.trim());
        },
        confirmAddUser: async function () {
            if (!this.isFilled()) {
                if (!this.isEmailValid()) {
                    this.error = "Please enter a valid email address";
                    return;
                }
                return;
            }

            this.adding = true;
            try {
                const user = await reg.addUser(this.username, this.password, this.roles, this.email);
                this.success = true;
                setTimeout(() => {
                    this.adding = false;
                    this.$emit('onClose', user);
                }, 2500);
            } catch (e) {
                this.error = e.message;
                this.adding = false;
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
    color: var(--ddb-danger);
}

.password-requirements small.met {
    color: var(--ddb-success);
}
</style>
