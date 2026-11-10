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
                    <!-- The quota of storage of the user (FR-ADM-16): empty is no limit; off, with the reason, when the server does not apply it -->
                    <div class="mb-3">
                        <label for="edit-user-dialog-quota" class="d-block mb-1 fw-semibold">Storage quota (MB, empty = unlimited)</label>
                        <InputNumber name="storageQuotaMb" input-id="edit-user-dialog-quota" placeholder="Unlimited" class="w-100"
                                     :min="0" :max="MAX_QUOTA_MB" :max-fraction-digits="0" :use-grouping="false"
                                     :disabled="!storageLimiter" :readonly="busy"
                                     :pt="{ pcInputText: { root: { 'aria-describedby': 'edit-user-dialog-quota-help' } } }" />
                        <small id="edit-user-dialog-quota-help" class="field-help">{{ quotaHelp }}</small>
                        <!-- With the limiter off the field is off, but a quota that was stored can still be removed -->
                        <div v-if="staleQuotaMb !== null" class="stale-quota mt-2">
                            <small class="field-help">
                                {{ quotaCleared ? 'The stored quota is removed when you update the user.' : `A quota of ${staleQuotaMb} MB is stored but not applied.` }}
                            </small>
                            <Button v-if="!quotaCleared" type="button" size="small" severity="secondary" label="Remove stored quota"
                                    :disabled="busy" @click="clearStoredQuota()" />
                        </div>
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
import InputNumber from 'primevue/inputnumber';
import Button from 'primevue/button';
import FieldError from '@/components/FieldError.vue';
import reg from '@/libs/api/sharedRegistry';
import { Features } from '@/libs/features';
import { formatBytes } from '@/libs/format';
import { emailProblem } from '@/libs/nameRules';
import { pickableRoles, rolesToSend } from '@/libs/roles';
import { createResolver } from '@/libs/forms/resolver';
import { useHubForm } from '@/composables/useHubForm';

const BYTES_PER_MB = 1024 * 1024;
// A quota the server can hold in bytes (about 950 TB)
const MAX_QUOTA_MB = 1000000000;

/** The quota of a user (bytes, or none) in whole MB, null for none */
const quotaMegabytes = bytes => (typeof bytes === 'number' && bytes >= 0 ? Math.round(bytes / BYTES_PER_MB) : null);

export default {
    components: {
        LoadingSpinner,
        Window, PrimeMessage, MultiSelect, InputText, InputNumber, Button, Form, FieldError
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
        const form = useHubForm({ fields: ['email', 'roles', 'storageQuotaMb'] });
        return { ...form, resolver, MAX_QUOTA_MB };
    },
    data: function () {
        return {
            loading: false,
            // The stored quota is removed although the server does not apply it (the limiter is off)
            quotaCleared: false,
            initialValues: {
                email: this.user.email || '',
                // 'deactivated' is not offered: Disable and Enable in the Users list change it
                roles: pickableRoles(this.user.roles || []),
                // A quota the server does not apply is not shown in the field (which is off): see staleQuotaMb
                storageQuotaMb: reg.features.get(Features.STORAGE_LIMITER) ? quotaMegabytes(this.user.storageQuota) : null
            }
        };
    },
    computed: {
        // The server applies a quota only with the storage limiter on
        storageLimiter() {
            return reg.features.get(Features.STORAGE_LIMITER);
        },
        // The quota that is stored while the server does not apply it (the limiter is off): the field is off, and only its removal is offered
        staleQuotaMb() {
            return this.storageLimiter ? null : quotaMegabytes(this.user.storageQuota);
        },
        quotaHelp() {
            if (!this.storageLimiter) return 'Storage limiter is off on this server';
            const used = formatBytes(this.user.storageUsed ?? 0);
            return `${used} used now. A user who is an administrator has no limit.`;
        },
        roleOptions() {
            return pickableRoles(this.availableRoles).map(r => ({ label: r, value: r }));
        }
    },
    methods: {
        // The roles to send (libs/roles.js keeps 'deactivated' for a Registry that replaces every role)
        rolesToSend: function (roles) {
            return rolesToSend(roles, this.user.roles);
        },
        clearStoredQuota: function () {
            this.quotaCleared = true;
        },
        update: async function (values) {
            // An empty address is sent as it is: the Registry stores none (the address is optional). An address left as it
            // was is not sent at all: the Registry keeps it, and a Registry that takes the profile from its identity
            // provider has no address to refuse, so the roles still go (FR-ADM-07)
            const email = (values.email ?? '').trim();
            const unchanged = email === (this.user.email ?? '').trim();
            await reg.admin.updateUser(this.user.userName, unchanged ? undefined : email, this.rolesToSend(values.roles));

            // Only a quota that changed is sent, and only its key (the Registry keeps the other metadata)
            const quota = values.storageQuotaMb ?? null;
            // With the limiter off the field is off: only the removal of a stored quota is sent
            const quotaChanged = this.storageLimiter ? quota !== this.initialValues.storageQuotaMb : this.quotaCleared;
            if (quotaChanged) await reg.admin.setUserQuota(this.user.userName, this.storageLimiter ? quota : null);

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
