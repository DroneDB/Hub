<template>
    <Window id="changePasswordDialog" title="Change Password" modal max-width="50%" fixed-size confirm-label="Change Password" :busy="busy" @confirm="submitForm()" @close="$emit('close')">

        <LoadingSpinner v-if="loading" />

        <div v-else class="dialog">
            <PrimeMessage severity="info" :closable="false" class="mb-3">
                Changing password for user: <strong>{{ user.userName }}</strong>
            </PrimeMessage>

            <Form ref="formRef" :resolver="resolver" @submit="submit(change, $event)">
                <template #default="$form">
                    <PrimeMessage v-if="formError" severity="error" role="alert" class="mb-3 form-error">{{ formError }}</PrimeMessage>
                    <div class="mb-3">
                        <label for="change-password-dialog-current-password" class="d-block mb-1 fw-semibold">Current Password</label>
                        <PasswordInput name="currentPassword" input-id="change-password-dialog-current-password" placeholder="Enter current password"
                                       autocomplete="off" describedby="change-password-dialog-current-hint"
                                       :error="errorOf($form, 'currentPassword')" :readonly="busy" />
                        <small id="change-password-dialog-current-hint">Leave empty if you don't know the current password (admin override)</small>
                    </div>
                    <NewPasswordFields id-prefix="change-password-dialog" :policy="passwordPolicy" :new-password="$form.newPassword?.value ?? ''"
                                       new-placeholder="Enter new password" confirm-placeholder="Confirm new password" autocomplete="off"
                                       :errors="{ newPassword: errorOf($form, 'newPassword'), confirmPassword: errorOf($form, 'confirmPassword') }"
                                       :readonly="busy" />
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
import PasswordInput from '@/components/PasswordInput.vue';
import NewPasswordFields from '@/components/NewPasswordFields.vue';
import reg from '@/libs/api/sharedRegistry';
import { Features } from '@/libs/features';
import { createResolver } from '@/libs/forms/resolver';
import { currentPasswordProblem, newPasswordProblem, confirmPasswordProblem } from '@/libs/accountProblems';
import { useHubForm } from '@/composables/useHubForm';

export default {
    // Used by admins to change other users' passwords: the current password is optional (admin
    // override), the new one follows the policy of the server like any other. The passwords are
    // another user's: autocomplete off, so the browser does not fill in the admin's own (FR-ACC-07)
    components: {
        LoadingSpinner,
        Window, PrimeMessage, Form, PasswordInput, NewPasswordFields
    },
    props: {
        user: {
            type: Object,
            required: true
        }
    },
    emits: ['close'],

    setup() {
        const policy = reg.features?.value?.(Features.PASSWORD_POLICY) ?? null;
        const resolver = createResolver({
            currentPassword: v => currentPasswordProblem(v, { optional: true }),
            newPassword: (v, values) => newPasswordProblem(v, { policy, current: values.currentPassword }),
            confirmPassword: (v, values) => confirmPasswordProblem(v, { newPassword: values.newPassword })
        });
        const form = useHubForm({
            fields: ['currentPassword', 'newPassword', 'confirmPassword'],
            dependents: { currentPassword: ['newPassword'], newPassword: ['confirmPassword'] }
        });
        return { ...form, resolver, passwordPolicy: policy };
    },
    data: function () {
        return {
            loading: false
        };
    },
    methods: {
        change: async function (values) {
            await reg.admin.changeUserPassword(
                this.user.userName,
                values.currentPassword || null, // Pass null instead of empty string for admin override
                values.newPassword
            );

            this.$notify.success(`Password changed successfully for "${this.user.userName}"`, { summary: 'Password Changed' });
            this.$emit('close', 'updated');
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
