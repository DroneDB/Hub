<template>
    <div class="password-input">
        <div class="password-field">
            <Password :name="name" :input-id="id" :feedback="false" fluid :invalid="(invalid || !!error) || undefined" :disabled="disabled"
                      :input-props="inputProps" v-bind="$attrs" />
            <!-- One button for both states (not PrimeVue's mask/unmask slots, which replace the
                 button on each toggle and drop the keyboard focus to the page) -->
            <button type="button" class="password-toggle p-password-toggle-mask-icon" aria-label="Show password" :aria-pressed="shown"
                    :aria-controls="id" :disabled="disabled" @click="shown = !shown">
                <i :class="shown ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye'" aria-hidden="true" />
            </button>
        </div>
        <FieldError :id="errorId" :message="error" />
    </div>
</template>

<script setup>
/**
 * PasswordInput - the one password field of the Hub (FR-ACC-06, FR-ADM-20): PrimeVue Password
 * with a show/hide toggle that is a real button, named "Show password" in both states (the
 * name does not change: it is a toggle button, `aria-pressed` says the state) and the same
 * element in both, so the keyboard focus stays on it when it is pressed; full width,
 * with the autocomplete value of its place and its error under it.
 *
 *   inside a Form:   <PasswordInput name="password" autocomplete="current-password" :error="errorOf($form, 'password')" />
 *   on its own:      <PasswordInput v-model="value" autocomplete="new-password" />
 *
 * Other attributes (v-model, placeholder, ...) go to the Password.
 */
import { computed, ref, useId } from 'vue';
import Password from 'primevue/password';
import FieldError from '@/components/FieldError.vue';

defineOptions({ name: 'PasswordInput', inheritAttrs: false });

const props = defineProps({
    /** Field name in a Form (`@primevue/forms` registers the field by it) */
    name: { type: String, default: undefined },
    /** DOM id of the input, for the label (generated when omitted) */
    inputId: { type: String, default: '' },
    /** `current-password`, `new-password` (the password manager reads it) */
    autocomplete: { type: String, default: 'current-password' },
    /** The error of the field: shown under it, and named by aria-describedby */
    error: { type: String, default: '' },
    invalid: { type: Boolean, default: false },
    /** Ids of other elements that describe the field (a list of requirements) */
    describedby: { type: String, default: '' },
    /** The value is shown, but cannot be edited (a request is pending) */
    readonly: { type: Boolean, default: false },
    disabled: { type: Boolean, default: false }
});

const generated = useId();
const id = computed(() => props.inputId || `password-${generated}`);
const errorId = computed(() => `${id.value}-error`);
/** The password is shown as text (the toggle is pressed) */
const shown = ref(false);

const inputProps = computed(() => ({
    // Password's own type follows its toggle-mask state, which the Hub does not use
    type: shown.value ? 'text' : 'password',
    autocomplete: props.autocomplete,
    readonly: props.readonly || undefined,
    'aria-invalid': props.invalid || !!props.error ? 'true' : undefined,
    'aria-describedby': [props.error ? errorId.value : '', props.describedby].filter(Boolean).join(' ') || undefined
}));
</script>

<style scoped>
.password-input {
    width: 100%;
}

/* The toggle sits over the end of the input (the theme's .p-password-toggle-mask-icon places it
   in the nearest positioned box); the input leaves room for it */
.password-field {
    position: relative;
}

.password-field :deep(.p-password-input) {
    padding-inline-end: calc((var(--p-form-field-padding-x) * 2) + var(--p-icon-size));
}

.password-toggle {
    background: none;
    border: 0;
    padding: 0;
    color: inherit;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
}

.password-toggle:focus-visible {
    outline: 2px solid var(--ddb-primary);
    outline-offset: 2px;
    border-radius: var(--ddb-radius-sm);
}
</style>
