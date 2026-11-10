<template>
    <Window id="addUserDialog" title="Add User" modal max-width="70%" fixed-size cancel-label="Close" confirm-label="Add User" :busy="busy" @confirm="submitForm()" @close="$emit('close')">

        <LoadingSpinner v-if="loading" />

        <div v-else class="dialog">
            <Form ref="formRef" :resolver="resolver" :initial-values="{ roles: [] }" @submit="submit(addUser, $event)">
                <template #default="$form">
                    <PrimeMessage v-if="formError" severity="error" role="alert" class="mb-3 form-error">{{ formError }}</PrimeMessage>
                    <div class="mb-3">
                        <label for="add-user-dialog-username" class="d-block mb-1 fw-semibold">Username</label>
                        <InputText id="add-user-dialog-username" name="username" placeholder="" class="w-100" autocomplete="off"
                                   :readonly="busy" :invalid="!!errorOf($form, 'username')"
                                   :aria-invalid="errorOf($form, 'username') ? 'true' : undefined"
                                   :aria-describedby="errorOf($form, 'username') ? 'add-user-dialog-username-error add-user-dialog-username-help' : 'add-user-dialog-username-help'" />
                        <!-- The rule of the Registry, before any input (FR-ADM-02) -->
                        <small id="add-user-dialog-username-help" class="field-help">Use {{ nameRule }}</small>
                        <FieldError id="add-user-dialog-username-error" :message="errorOf($form, 'username')" />
                    </div>
                    <div class="mb-3">
                        <label for="add-user-dialog-email" class="d-block mb-1 fw-semibold">Email</label>
                        <InputText id="add-user-dialog-email" name="email" placeholder="user@example.com" class="w-100" autocomplete="off"
                                   :readonly="busy" :invalid="!!errorOf($form, 'email')"
                                   :aria-invalid="errorOf($form, 'email') ? 'true' : undefined"
                                   :aria-describedby="errorOf($form, 'email') ? 'add-user-dialog-email-error' : undefined" />
                        <FieldError id="add-user-dialog-email-error" :message="errorOf($form, 'email')" />
                    </div>
                    <NewPasswordFields id-prefix="add-user-dialog" :policy="passwordPolicy" :new-password="$form.newPassword?.value ?? ''"
                                       new-label="Password" confirm-label="Confirm Password"
                                       :errors="{ newPassword: errorOf($form, 'newPassword'), confirmPassword: errorOf($form, 'confirmPassword') }"
                                       :readonly="busy" />
                    <div class="mb-3">
                        <label id="add-user-dialog-roles-label" for="add-user-dialog-roles" class="d-block mb-1 fw-semibold">Roles</label>
                        <MultiSelect name="roles" input-id="add-user-dialog-roles" aria-labelledby="add-user-dialog-roles-label" :options="roleOptions" option-label="label" option-value="value" placeholder="Select roles" class="w-100" display="chip" />
                    </div>
                </template>
            </Form>
        </div>
    </Window>
</template>

<script>
import Form from '@primevue/forms/form';
import LoadingSpinner from '@/components/LoadingSpinner.vue';
import Window from '@/components/HubWindow.vue';
import PrimeMessage from 'primevue/message';
import MultiSelect from 'primevue/multiselect';
import InputText from 'primevue/inputtext';
import FieldError from '@/components/FieldError.vue';
import NewPasswordFields from '@/components/NewPasswordFields.vue';
import reg from '@/libs/api/sharedRegistry';
import { Features } from '@/libs/features';
import { emailProblem, nameDescription, userNameProblem } from '@/libs/nameRules';
import { pickableRoles } from '@/libs/roles';
import { createResolver } from '@/libs/forms/resolver';
import { newPasswordProblem, confirmPasswordProblem } from '@/libs/accountProblems';
import { useHubForm } from '@/composables/useHubForm';

export default {
    components: {
        LoadingSpinner,
        Window, PrimeMessage, MultiSelect, InputText, Form, FieldError, NewPasswordFields
    },
    props: {
        availableRoles: {
            type: Array,
            required: true
        }
    },
    emits: ['close'],

    setup() {
        const policy = reg.features?.value?.(Features.PASSWORD_POLICY) ?? null;
        const resolver = createResolver({
            // The rule of the Registry (lowercase letters and digits), in its words, as the user types
            username: userNameProblem,
            // The server's rule text, at the field; the e-mail is optional
            email: v => emailProblem(v),
            newPassword: v => newPasswordProblem(v, { policy }),
            confirmPassword: (v, values) => confirmPasswordProblem(v, { newPassword: values.newPassword })
        });
        const form = useHubForm({
            fields: ['username', 'email', 'newPassword', 'confirmPassword'],
            // The Registry names the field of a refusal by the member of the request (D-047)
            aliases: { userName: 'username', password: 'newPassword' },
            dependents: { newPassword: ['confirmPassword'] }
        });
        return { ...form, resolver, passwordPolicy: policy, nameRule: nameDescription() };
    },
    data: function () {
        return {
            loading: false
        };
    },
    computed: {
        // 'deactivated' is not a role to give: Disable in the Users list blocks sign-in
        roleOptions() {
            return pickableRoles(this.availableRoles).map(r => ({ label: r, value: r }));
        }
    },
    methods: {
        addUser: async function (values) {
            const user = await reg.admin.addUser(values.username.trim(), values.newPassword, values.roles ?? [], (values.email ?? '').trim());
            this.$notify.success(`User "${values.username.trim()}" created successfully`, { summary: 'User Added' });
            this.$emit('close', user);
        }
    }
}
</script>

<style scoped>
.field-help {
    display: block;
    margin-top: var(--ddb-spacing-xs);
    color: var(--ddb-text-secondary);
}

.dialog {
    min-width: min(20rem, var(--window-content-width, 100%));
    padding: 0.25rem;
}
</style>
