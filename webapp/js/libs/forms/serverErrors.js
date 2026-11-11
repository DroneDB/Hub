// @ts-check
/**
 * What a failed request says about the fields of a form (FR-XC-11, D-047).
 *
 * A Registry refusal that concerns one input field carries a ValidationProblemDetails `errors`
 * member keyed by the request member (`{ errors: { currentPassword: ['...'] } }`); ApiError keeps
 * the server body, so it is `error.errors`. The Hub maps an error to a field by that key, and
 * never by the text of the message. An error with no field (a 500, a network failure, a refusal
 * of the whole request) goes to the one form-level message.
 */

/**
 * @param {unknown} value
 * @returns {string}
 */
function textOf(value) {
    const list = Array.isArray(value) ? value : [value];
    return list.filter(m => typeof m === 'string' && m.trim() !== '').join(' ');
}

/**
 * The messages of the `errors` member of `error`, by form field.
 * @param {unknown} error  what the request threw
 * @param {Record<string, string>} [fields]  the form fields by the request member that names them
 *   (`{ currentPassword: 'oldPassword' }`); a member that is not listed maps to the field of the
 *   same name when `known` has it. Keys are compared without regard to letter case ("Email", "email").
 * @param {string[]} [known]  the names of the fields of the form: members that name none are left out
 * @returns {Record<string, string>}  field name -> message; empty when the error names no field
 */
export function fieldErrorsOf(error, fields = {}, known = []) {
    const errors = /** @type {any} */ (error)?.errors;
    if (!errors || typeof errors !== 'object' || Array.isArray(errors)) return {};

    const byLower = new Map(Object.entries(fields).map(([member, field]) => [member.toLowerCase(), field]));
    const knownByLower = new Map([...known, ...Object.values(fields)].map(f => [f.toLowerCase(), f]));
    /** @type {Record<string, string>} */
    const result = {};
    for (const [member, value] of Object.entries(errors)) {
        const field = byLower.get(member.toLowerCase()) ?? knownByLower.get(member.toLowerCase());
        const message = textOf(value);
        if (field && message) result[field] = result[field] ? `${result[field]} ${message}` : message;
    }
    return result;
}

/**
 * The message of an error that names no field, for the form-level message.
 * @param {unknown} error @param {string} [fallback]
 * @returns {string}
 */
export function formMessageOf(error, fallback = 'The request failed') {
    const message = /** @type {any} */ (error)?.message;
    return typeof message === 'string' && message.trim() !== '' ? message : fallback;
}
