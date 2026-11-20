// @ts-check
/**
 * useHubForm - the state a Hub form keeps around `@primevue/forms` (FR-XC-11):
 *
 *   const { formRef, busy, formError, submit, errorOf, submitForm } = useHubForm({ fields: ['username', 'password'] });
 *   <Form ref="formRef" :resolver="resolver" @submit="submit(save, $event)" v-slot="$form"> ... errorOf($form, 'username') ...
 *
 * - one guarded submit for Enter and click: while the request is pending a second submit does
 *   nothing (`busy`);
 * - a submit validates every field first (the library does, through the resolver); when one is
 *   invalid no request is sent, every field shows its error and the focus goes to the first
 *   invalid field (the submit control itself stays enabled, D-046);
 * - a failed request maps to a field by the `errors` member of the answer (D-047, never by its
 *   text), else to the one form-level message (`formError`, shown in the form, never in a toast);
 *   a form that must not say which field the server refused (sign-in) turns the mapping off
 *   (`fieldErrors: false`) and always gets the form-level message;
 * - an error clears when its field is edited, the form-level one when any field is;
 * - a field that depends on another one (the confirmation of a password on the password) is
 *   checked again when the other one changes, once the user has put something in it.
 */
import { ref, reactive, watch, nextTick } from 'vue';
import { fieldErrorsOf, formMessageOf } from '@/libs/forms/serverErrors';

/**
 * @param {{
 *   fields: string[],
 *   aliases?: Record<string, string>,
 *   dependents?: Record<string, string[]>,
 *   formMessage?: (error: unknown) => string,
 *   fieldErrors?: boolean,
 *   statusFields?: Record<number, string>
 * }} options
 *   fields: the names of the fields of the form;
 *   aliases: the form field by the request member that names it in `errors` (`{ currentPassword: 'oldPassword' }`);
 *   dependents: the fields to check again when a field changes (`{ newPassword: ['confirmPassword'] }`);
 *   formMessage: the text of an error that names no field (default: the message of the error);
 *   fieldErrors: false to never map a failed request to the fields (default true);
 *   statusFields: the field that an answer of a status refuses when its body names none (`{ 409: 'name' }`:
 *   a name that exists is a 409 that belongs to the name field, D-040)
 */
export function useHubForm({ fields, aliases = {}, dependents = {}, formMessage = formMessageOf, fieldErrors = true, statusFields = {} }) {
    /** The Form component (`ref="formRef"`). */
    const formRef = ref(/** @type {any} */ (null));
    const busy = ref(false);
    const formError = ref('');
    /** @type {Record<string, string>} */
    const serverErrors = reactive({});

    /** The values of the fields now, to see which one the user edits. */
    function values() {
        /** @type {Record<string, any>} */
        const result = {};
        const states = formRef.value?.states;
        if (!states) return result;
        for (const name of fields) {
            if (states[name] && typeof states[name] === 'object') result[name] = states[name].value;
        }
        return result;
    }

    watch(values, (now, before) => {
        let changed = false;
        for (const name of fields) {
            if (now[name] === before[name]) continue;
            changed = true;
            delete serverErrors[name];
            for (const other of dependents[name] ?? []) {
                const state = formRef.value?.getFieldState?.(other);
                if (state && (state.value || state.invalid)) formRef.value.validate(other);
            }
        }
        if (changed) formError.value = '';
    });

    /**
     * The message to show at a field: the server's, else the validator's.
     * @param {any} $form  the slot scope of Form
     * @param {string} name
     * @returns {string}
     */
    function errorOf($form, name) {
        return serverErrors[name] || $form?.[name]?.error?.message || '';
    }

    /** The focus goes to the first field that shows an error. */
    async function focusFirstInvalid() {
        await nextTick();
        /** @type {HTMLElement | null} */
        const field = formRef.value?.$el?.querySelector('[aria-invalid="true"]') ?? null;
        field?.focus();
    }

    /**
     * The `@submit` handler of the Form: `@submit="submit(save, $event)"`, where `save(values)`
     * is the request (with the checked values).
     * @param {(values: Record<string, any>) => Promise<any> | any} action
     * @param {{ valid: boolean, values: Record<string, any> }} e  the submit event of the Form
     */
    async function submit(action, e) {
        if (busy.value) return;
        if (!e.valid) {
            await focusFirstInvalid();
            return;
        }
        busy.value = true;
        formError.value = '';
        for (const name of Object.keys(serverErrors)) delete serverErrors[name];
        try {
            await action(e.values);
        } catch (error) {
            const byField = fieldErrors ? fieldErrorsOf(error, aliases, fields) : {};
            const statusField = fieldErrors ? statusFields[/** @type {any} */ (error)?.status] : undefined;
            if (!Object.keys(byField).length && statusField && fields.includes(statusField)) {
                byField[statusField] = formMessage(error);
            }
            if (Object.keys(byField).length) {
                Object.assign(serverErrors, byField);
                await focusFirstInvalid();
            } else {
                formError.value = formMessage(error);
            }
        } finally {
            busy.value = false;
        }
    }

    /** Submits the form as a click on its button would (for a dialog whose button is in the window footer). */
    function submitForm() {
        formRef.value?.submit();
    }

    return { formRef, busy, formError, serverErrors, errorOf, submit, submitForm, focusFirstInvalid };
}
