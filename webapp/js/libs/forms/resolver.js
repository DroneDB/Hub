// @ts-check
/**
 * The one resolver of the Hub forms (FR-XC-11, D-018). `@primevue/forms` calls a resolver with
 * the values of the form and takes back its errors; this one runs one pure validator per field
 * (`xxxProblem(value, ctx) -> string | null`, in libs/) and builds the answer the library reads:
 * `{ values, errors: { field: [{ message }] } }`. A form has no other validation code, and no
 * schema library (D-018).
 *
 *   const resolver = createResolver({
 *       username: v => usernameProblem(v),
 *       confirmPassword: (v, values) => confirmPasswordProblem(v, { newPassword: values.newPassword })
 *   });
 *   <Form :resolver="resolver" @submit="onSubmit">
 */

/**
 * A validator of one field: the problem to show at it, or null when the value is fine. It gets
 * the value of the field and all the values of the form (a field that depends on another one).
 * @typedef {(value: any, values: Record<string, any>) => (string | null | undefined | false)} FieldValidator
 * @typedef {Record<string, FieldValidator>} FieldValidators
 * @typedef {{ values: Record<string, any>, names?: string[] }} ResolverOptions
 */

/**
 * @param {FieldValidators | (() => FieldValidators)} validators  by field name; a function is
 *   read at each validation (rules that depend on the password policy or on the siblings of the
 *   form, which can change while the dialog is open)
 * @returns {(options: ResolverOptions) => { values: Record<string, any>, errors: Record<string, { message: string }[]> }}
 */
export function createResolver(validators) {
    return ({ values, names }) => {
        const rules = typeof validators === 'function' ? validators() : validators;
        /** @type {Record<string, { message: string }[]>} */
        const errors = {};
        for (const [name, validate] of Object.entries(rules)) {
            // Only the fields the form has registered (a field that is not shown has no rule to meet)
            if (names && !names.includes(name)) continue;
            const message = validate(values?.[name], values ?? {});
            if (message) errors[name] = [{ message }];
        }
        return { values, errors };
    };
}
