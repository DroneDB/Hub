// @ts-check
/**
 * The password policy of the server (`Features.PASSWORD_POLICY`) as the Hub forms show and check
 * it (FR-ADM-08): the checklist of requirements and the one problem message. When there is no
 * policy, every password is accepted and there is no checklist.
 */

/**
 * @typedef {{ minLength: number, requireDigit: boolean, requireUppercase: boolean, requireLowercase: boolean, requireNonAlphanumeric: boolean }} PasswordPolicy
 * @typedef {{ label: string, met: boolean }} PasswordRequirement
 */

/**
 * The requirements of the policy, each with whether `password` meets it: the list a form shows
 * live as the user types.
 * @param {string|null|undefined} password
 * @param {PasswordPolicy|null|undefined} policy
 * @returns {PasswordRequirement[]}
 */
export function passwordChecklist(password, policy) {
    if (!policy) return [];
    const value = typeof password === 'string' ? password : '';
    /** @type {PasswordRequirement[]} */
    const list = [];

    if (policy.minLength > 0) {
        list.push({ label: `At least ${policy.minLength} characters`, met: value.length >= policy.minLength });
    }
    if (policy.requireDigit) {
        list.push({ label: 'At least one digit (0-9)', met: /\d/.test(value) });
    }
    if (policy.requireUppercase) {
        list.push({ label: 'At least one uppercase letter (A-Z)', met: /[A-Z]/.test(value) });
    }
    if (policy.requireLowercase) {
        list.push({ label: 'At least one lowercase letter (a-z)', met: /[a-z]/.test(value) });
    }
    if (policy.requireNonAlphanumeric) {
        list.push({ label: 'At least one special character (!@#$...)', met: /[^a-zA-Z0-9]/.test(value) });
    }
    return list;
}

/**
 * What is wrong with a new password by the policy, or null. A blank value is the business of the
 * required check, not of the policy.
 * @param {string|null|undefined} password
 * @param {PasswordPolicy|null|undefined} policy
 * @returns {string|null}
 */
export function passwordPolicyProblem(password, policy) {
    if (!policy || !password) return null;
    return passwordChecklist(password, policy).every(r => r.met)
        ? null
        : 'The password does not meet the requirements listed below.';
}
