<template>
    <Window id="changePwdDialog" title="Change Password" modal max-width="70%" fixed-size cancel-label="Close" confirm-label="Change Password" :busy="busy || success" @confirm="submitForm()" @close="$emit('close')">
        <div class="dialog">
            <Form ref="formRef" :resolver="resolver" @submit="onSubmit">
                <template #default="$form">
                    <Message v-if="formError" severity="error" role="alert" class="mb-3 form-error">{{ formError }}</Message>
                    <Message v-if="success" severity="success"><strong>Password changed successfully!</strong></Message>
                    <div class="mb-3">
                        <label for="change-pwd-dialog-old-password" class="d-block mb-1 fw-semibold">Current Password</label>
                        <PasswordInput name="oldPassword" input-id="change-pwd-dialog-old-password" autocomplete="current-password"
                                       :error="errorOf($form, 'oldPassword')" :readonly="busy || success" />
                    </div>
                    <NewPasswordFields id-prefix="change-pwd-dialog" :policy="passwordPolicy" :new-password="$form.newPassword?.value ?? ''"
                                       :errors="{ newPassword: errorOf($form, 'newPassword'), confirmPassword: errorOf($form, 'confirmPassword') }"
                                       :readonly="busy || success" />
                </template>
            </Form>
        </div>
    </Window>
</template>

<script>
import Form from '@primevue/forms/form';
import Window from '@/components/HubWindow.vue';
import Message from 'primevue/message';
import PasswordInput from '@/components/PasswordInput.vue';
import NewPasswordFields from '@/components/NewPasswordFields.vue';
import reg from '@/libs/api/sharedRegistry';
import { Features } from '@/libs/features';
import { createResolver } from '@/libs/forms/resolver';
import { currentPasswordProblem, newPasswordProblem, confirmPasswordProblem } from '@/libs/accountProblems';
import { useHubForm } from '@/composables/useHubForm';
import { useTimerGroup } from '@/composables/useTimers';

export default {
    components: {
        Window, Message, Form, PasswordInput, NewPasswordFields
    },
    props: {

    },
    emits: ['close'],

    setup() {
        const policy = reg.features?.value?.(Features.PASSWORD_POLICY) ?? null;
        const resolver = createResolver({
            oldPassword: v => currentPasswordProblem(v),
            newPassword: (v, values) => newPasswordProblem(v, { policy, current: values.oldPassword }),
            confirmPassword: (v, values) => confirmPasswordProblem(v, { newPassword: values.newPassword })
        });
        const form = useHubForm({
            fields: ['oldPassword', 'newPassword', 'confirmPassword'],
            // The Registry names the field of a refusal (D-047): a wrong current password under
            // `currentPassword`, the policy under `newPassword`
            aliases: { currentPassword: 'oldPassword' },
            dependents: { oldPassword: ['newPassword'], newPassword: ['confirmPassword'] }
        });
        return { ...form, resolver, passwordPolicy: policy, later: useTimerGroup() };
    },
    data: function () {
        return {
            success: false
        };
    },
    methods: {
        // Once the password is changed the form is done: the fields stay read-only until the
        // window closes, and a submit (Enter in a field) sends nothing (FR-XC-11)
        onSubmit: function (e) {
            if (this.success) return;
            return this.submit(this.change, e);
        },
        change: async function (values) {
            await reg.changePwd(values.oldPassword, values.newPassword);
            this.success = true;
            this.later(() => this.$emit('close'), 2500);
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
