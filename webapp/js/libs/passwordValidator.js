/**
 * Client-side password validation against server-defined policy.
 * When no policy is provided, all passwords are accepted.
 */

/**
 * Validates a password against the given policy.
 * @param {string} password - The password to validate.
 * @param {object|null} policy - The password policy from the server.
 * @returns {{ isValid: boolean, errors: string[] }}
 */
export function validatePassword(password, policy) {
    if (!policy) return { isValid: true, errors: [] };

    const errors = [];

    if (!password || password.length < policy.minLength) {
        errors.push(`Password must be at least ${policy.minLength} characters long`);
    }

    if (policy.requireDigit && !/\d/.test(password)) {
        errors.push('Password must contain at least one digit');
    }

    if (policy.requireUppercase && !/[A-Z]/.test(password)) {
        errors.push('Password must contain at least one uppercase letter');
    }

    if (policy.requireLowercase && !/[a-z]/.test(password)) {
        errors.push('Password must contain at least one lowercase letter');
    }

    if (policy.requireNonAlphanumeric && /^[a-zA-Z0-9]*$/.test(password)) {
        errors.push('Password must contain at least one special character');
    }

    return { isValid: errors.length === 0, errors };
}

/**
 * Returns a human-readable list of password requirements for the given policy.
 * @param {object|null} policy - The password policy from the server.
 * @returns {string[]}
 */
export function getPasswordRequirements(policy) {
    if (!policy) return [];

    const requirements = [];

    if (policy.minLength > 0) {
        requirements.push(`At least ${policy.minLength} characters`);
    }

    if (policy.requireDigit) {
        requirements.push('At least one digit (0-9)');
    }

    if (policy.requireUppercase) {
        requirements.push('At least one uppercase letter (A-Z)');
    }

    if (policy.requireLowercase) {
        requirements.push('At least one lowercase letter (a-z)');
    }

    if (policy.requireNonAlphanumeric) {
        requirements.push('At least one special character (!@#$...)');
    }

    return requirements;
}
