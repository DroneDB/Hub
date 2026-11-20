import { describe, it, expect } from 'vitest';
import { passwordChecklist, passwordPolicyProblem } from './passwordValidator';

const policy = { minLength: 8, requireDigit: true, requireUppercase: true, requireLowercase: true, requireNonAlphanumeric: true };

describe('passwordChecklist', () => {
    it('lists the requirements of the policy with whether each is met', () => {
        expect(passwordChecklist('Abcdefg1', policy)).toEqual([
            { label: 'At least 8 characters', met: true },
            { label: 'At least one digit (0-9)', met: true },
            { label: 'At least one uppercase letter (A-Z)', met: true },
            { label: 'At least one lowercase letter (a-z)', met: true },
            { label: 'At least one special character (!@#$...)', met: false }
        ]);
    });

    it('lists the requirements, all unmet, for an empty password', () => {
        expect(passwordChecklist('', policy).map(r => r.met)).toEqual([false, false, false, false, false]);
        expect(passwordChecklist(undefined, policy)).toHaveLength(5);
    });

    it('lists only what the policy requires, and nothing without a policy', () => {
        expect(passwordChecklist('x', { minLength: 6, requireDigit: false, requireUppercase: false, requireLowercase: false, requireNonAlphanumeric: false }))
            .toEqual([{ label: 'At least 6 characters', met: false }]);
        expect(passwordChecklist('x', null)).toEqual([]);
    });

    it('counts a character that is not a letter or digit as special', () => {
        expect(passwordChecklist('a_', policy).find(r => r.label.includes('special')).met).toBe(true);
    });
});

describe('passwordPolicyProblem', () => {
    it('is null without a policy, for a blank value and for a password that meets it', () => {
        expect(passwordPolicyProblem('x', null)).toBeNull();
        expect(passwordPolicyProblem('', policy)).toBeNull();
        expect(passwordPolicyProblem('Abcdefg1!', policy)).toBeNull();
    });

    it('is one message when a requirement is not met', () => {
        expect(passwordPolicyProblem('abc', policy)).toBe('The password does not meet the requirements listed below.');
    });
});
