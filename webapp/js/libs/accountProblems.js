// @ts-check
/**
 * The validators of the sign-in and password forms (FR-XC-11): pure `xxxProblem(value, ctx)`
 * functions that give the text to show at the field, or null. The Hub resolver
 * (libs/forms/resolver.js) runs them; no component holds a rule of its own. The server checks
 * again and stays the authority.
 */
import { passwordPolicyProblem } from '@/libs/passwordValidator';

/**
 * @typedef {import('@/libs/passwordValidator').PasswordPolicy} PasswordPolicy
 */

/** @param {unknown} value */
const blank = value => typeof value !== 'string' || value.trim() === '';

/**
 * The user name of a sign-in: required (the server trims it, so does the form).
 * @param {string|null|undefined} value
 * @returns {string|null}
 */
export function usernameProblem(value) {
    return blank(value) ? 'Enter your username.' : null;
}

/**
 * The user name of an account an admin creates: required.
 * @param {string|null|undefined} value
 * @returns {string|null}
 */
export function newUserNameProblem(value) {
    return blank(value) ? 'Enter a username.' : null;
}

/**
 * The password of a sign-in: required. It is never trimmed or checked against the policy: it
 * is whatever the account has.
 * @param {string|null|undefined} value
 * @returns {string|null}
 */
export function loginPasswordProblem(value) {
    return value ? null : 'Enter your password.';
}

/**
 * The current password of a password change.
 * @param {string|null|undefined} value
 * @param {{ optional?: boolean }} [ctx]  optional: an admin may change a password without it
 * @returns {string|null}
 */
export function currentPasswordProblem(value, { optional = false } = {}) {
    if (optional || value) return null;
    return 'Enter the current password.';
}

/**
 * A new password: required, by the policy when the server has one, and not the current one.
 * @param {string|null|undefined} value
 * @param {{ policy?: PasswordPolicy|null, current?: string|null }} [ctx]
 * @returns {string|null}
 */
export function newPasswordProblem(value, { policy = null, current = null } = {}) {
    if (!value) return 'Enter a new password.';
    const policyProblem = passwordPolicyProblem(value, policy);
    if (policyProblem) return policyProblem;
    if (current && value === current) return 'The new password must be different from the current one.';
    return null;
}

/**
 * The confirmation of a new password: required, and equal to it.
 * @param {string|null|undefined} value
 * @param {{ newPassword?: string|null }} [ctx]
 * @returns {string|null}
 */
export function confirmPasswordProblem(value, { newPassword = null } = {}) {
    if (!value) return 'Confirm the new password.';
    return value === (newPassword ?? '') ? null : 'Passwords do not match';
}
