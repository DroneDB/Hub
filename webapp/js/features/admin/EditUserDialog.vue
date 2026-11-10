<template>
    <Window id="editUserDialog" title="Edit User" modal max-width="70%" fixed-size confirm-label="Update User" :busy="busy" @confirm="submitForm()" @close="$emit('close')">

        <LoadingSpinner v-if="loading" />

        <div v-else class="dialog">
            <Form ref="formRef" :resolver="resolver" :initial-values="initialValues" @submit="submit(update, $event)">
                <template #default="$form">
                    <PrimeMessage v-if="formError" severity="error" role="alert" class="mb-3 form-error">{{ formError }}</PrimeMessage>
                    <div class="mb-3">
                        <label for="edit-user-dialog-username" class="d-block mb-1 fw-semibold">Username</label>
                        <InputText id="edit-user-dialog-username" :model-value="user.userName" disabled class="w-100" />
                    </div>
                    <div class="mb-3">
                        <label for="edit-user-dialog-email" class="d-block mb-1 fw-semibold">Email</label>
                        <InputText id="edit-user-dialog-email" name="email" placeholder="user@example.com" class="w-100" autocomplete="off"
                                   :readonly="busy" :invalid="!!errorOf($form, 'email')"
                                   :aria-invalid="errorOf($form, 'email') ? 'true' : undefined"
                                   :aria-describedby="errorOf($form, 'email') ? 'edit-user-dialog-email-error edit-user-dialog-email-help' : 'edit-user-dialog-email-help'" />
                        <!-- The address is optional: an empty one removes it (FR-ADM-07) -->
                        <small id="edit-user-dialog-email-help" class="field-help">Optional. Leave it empty for a user without an address.</small>
                        <FieldError id="edit-user-dialog-email-error" :message="errorOf($form, 'email')" />
                    </div>
                    <div class="mb-3">
                        <label id="edit-user-dialog-roles-label" for="edit-user-dialog-roles" class="d-block mb-1 fw-semibold">Roles</label>
                        <MultiSelect name="roles" input-id="edit-user-dialog-roles" aria-labelledby="edit-user-dialog-roles-label" :options="roleOptions" option-label="label" option-value="value" placeholder="Select roles" class="w-100" display="chip" />
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
import reg from '@/libs/api/sharedRegistry';
import { emailProblem } from '@/libs/nameRules';
import { isDeactivatedRole, pickableRoles, publishesSystemRoles } from '@/libs/roles';
import { createResolver } from '@/libs/forms/resolver';
import { useHubForm } from '@/composables/useHubForm';

export default {
    components: {
        LoadingSpinner,
        Window, PrimeMessage, MultiSelect, InputText, Form, FieldError
    },
    props: {
        user: {
            type: Object,
            required: true
        },
        availableRoles: {
            type: Array,
            required: true
        }
    },
    emits: ['close'],

    setup() {
        // The e-mail is optional; the rule text of the server, at the field, as the user types (FR-ADM-07)
        const resolver = createResolver({ email: v => emailProblem(v) });
        // The Registry names the field of a refusal by the member of the request (D-047): the same names
        const form = useHubForm({ fields: ['email', 'roles'] });
        return { ...form, resolver };
    },
    data: function () {
        return {
            loading: false,
            initialValues: {
                email: this.user.email || '',
                // 'deactivated' is not offered: Disable and Enable in the Users list change it
                roles: pickableRoles(this.user.roles || [])
            }
        };
    },
    computed: {
        roleOptions() {
            return pickableRoles(this.availableRoles).map(r => ({ label: r, value: r }));
        }
    },
    methods: {
        // The roles to send. A Registry that lists its system roles keeps 'deactivated' itself (and refuses it in
        // the list); an older one replaces every role, so a disabled user gets it back, or the edit would enable them.
        rolesToSend: function (roles) {
            const result = [...(roles ?? [])];
            if (!publishesSystemRoles()) {
                const deactivated = (this.user.roles || []).find(isDeactivatedRole);
                if (deactivated) result.push(deactivated);
            }
            return result;
        },
        update: async function (values) {
            // An empty address is sent as it is: the Registry stores none (the address is optional). An address left as it
            // was is not sent at all: the Registry keeps it, and a Registry that takes the profile from its identity
            // provider has no address to refuse, so the roles still go (FR-ADM-07)
            const email = (values.email ?? '').trim();
            const unchanged = email === (this.user.email ?? '').trim();
            await reg.admin.updateUser(this.user.userName, unchanged ? undefined : email, this.rolesToSend(values.roles));

            this.$notify.success(`User "${this.user.userName}" updated successfully`, { summary: 'User Updated' });
            this.$emit('close', 'updated');
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
