<template>
    <div class="new-password-fields">
        <div class="mb-3">
            <label :for="newId" class="d-block mb-1 fw-semibold">{{ newLabel }}</label>
            <PasswordInput :name="newName" :input-id="newId" :autocomplete="autocomplete" :placeholder="newPlaceholder"
                           :error="errors[newName] || ''" :describedby="checklist.length ? checklistId : ''" :readonly="readonly" />
            <ul v-if="checklist.length" :id="checklistId" class="password-requirements" aria-label="Password requirements">
                <li v-for="requirement in checklist" :key="requirement.label"
                    :class="{ met: typed && requirement.met, unmet: typed && !requirement.met }">
                    <i :class="iconOf(requirement)" />
                    {{ requirement.label }}
                    <span v-if="typed" class="p-hidden-accessible">{{ requirement.met ? '(met)' : '(not met)' }}</span>
                </li>
            </ul>
        </div>
        <div class="mb-3">
            <label :for="confirmId" class="d-block mb-1 fw-semibold">{{ confirmLabel }}</label>
            <PasswordInput :name="confirmName" :input-id="confirmId" :autocomplete="autocomplete" :placeholder="confirmPlaceholder"
                           :error="errors[confirmName] || ''" :readonly="readonly" />
        </div>
    </div>
</template>

<script setup>
/**
 * NewPasswordFields - the new password and its confirmation, once for every form that sets a
 * password (FR-ADM-08, FR-ACC-21): the add user, change password and admin change password
 * windows. Put it inside a Form of `@primevue/forms`: the two fields are registered by their
 * names, and the validators in libs/accountProblems.js (newPasswordProblem,
 * confirmPasswordProblem) give the texts in `errors`, which the component only draws.
 *
 * - The requirements of the server's policy are listed from the start, in a neutral colour; once
 *   the user types, each one says whether it is met (an icon, a colour and a hidden text).
 * - The confirmation says "Passwords do not match" under it while both fields are filled and
 *   differ (the form checks it again when the password changes).
 */
import { computed } from 'vue';
import PasswordInput from '@/components/PasswordInput.vue';
import { passwordChecklist } from '@/libs/passwordValidator';

const props = defineProps({
    /** The password policy of the server (Features.PASSWORD_POLICY), or null */
    policy: { type: Object, default: null },
    /** The value of the new password now, for the checklist (from the Form slot: $form.newPassword?.value) */
    newPassword: { type: String, default: '' },
    /** The texts to show at the fields, by field name */
    errors: { type: Object, default: () => ({}) },
    /** The values cannot be edited (a request is pending) */
    readonly: { type: Boolean, default: false },
    /**
     * The autocomplete value of both fields: `new-password`, or `off` where the password is
     * someone else's (an admin sets another user's password: the browser must not offer or save
     * the admin's own, FR-ACC-07)
     */
    autocomplete: { type: String, default: 'new-password' },
    /** Prefix of the DOM ids of the fields */
    idPrefix: { type: String, default: 'new-password' },
    newName: { type: String, default: 'newPassword' },
    confirmName: { type: String, default: 'confirmPassword' },
    newLabel: { type: String, default: 'New Password' },
    confirmLabel: { type: String, default: 'Confirm New Password' },
    newPlaceholder: { type: String, default: '' },
    confirmPlaceholder: { type: String, default: '' }
});

const newId = computed(() => `${props.idPrefix}-new`);
const confirmId = computed(() => `${props.idPrefix}-confirm`);
const checklistId = computed(() => `${props.idPrefix}-requirements`);
const typed = computed(() => !!props.newPassword);
const checklist = computed(() => passwordChecklist(props.newPassword, props.policy));

/** @param {{ met: boolean }} requirement */
function iconOf(requirement) {
    if (!typed.value) return 'fa-regular fa-circle';
    return requirement.met ? 'fa-solid fa-check' : 'fa-solid fa-xmark';
}
</script>

<style scoped>
.password-requirements {
    list-style: none;
    margin: var(--ddb-spacing-xs) 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--ddb-spacing-xs);
    font-size: var(--ddb-font-size-sm);
    color: var(--ddb-text-muted);
    text-align: left;
}

.password-requirements li.met {
    color: var(--ddb-success-text);
}

.password-requirements li.unmet {
    color: var(--ddb-danger);
}
</style>
