import { describe, it, expect } from 'vitest';
import {
    usernameProblem, newUserNameProblem, loginPasswordProblem, currentPasswordProblem, newPasswordProblem, confirmPasswordProblem
} from './accountProblems';

const policy = { minLength: 8, requireDigit: true, requireUppercase: true, requireLowercase: true, requireNonAlphanumeric: false };

describe('sign-in validators (FR-ACC-05)', () => {
    it('require a username, and a username of spaces is empty', () => {
        expect(usernameProblem('')).toBe('Enter your username.');
        expect(usernameProblem('   ')).toBe('Enter your username.');
        expect(usernameProblem(undefined)).toBe('Enter your username.');
        expect(usernameProblem('admin')).toBeNull();
        expect(newUserNameProblem(' ')).toBe('Enter a username.');
        expect(newUserNameProblem('bob')).toBeNull();
    });

    it('require a password, which is not trimmed or checked against the policy', () => {
        expect(loginPasswordProblem('')).toBe('Enter your password.');
        expect(loginPasswordProblem(undefined)).toBe('Enter your password.');
        expect(loginPasswordProblem(' ')).toBeNull();
        expect(loginPasswordProblem('a')).toBeNull();
    });
});

describe('password change validators (FR-ADM-08, FR-ACC-21)', () => {
    it('requires the current password unless it is optional', () => {
        expect(currentPasswordProblem('')).toBe('Enter the current password.');
        expect(currentPasswordProblem('', { optional: true })).toBeNull();
        expect(currentPasswordProblem('x')).toBeNull();
    });

    it('requires a new password and checks the policy when there is one', () => {
        expect(newPasswordProblem('')).toBe('Enter a new password.');
        expect(newPasswordProblem('abc')).toBeNull();
        expect(newPasswordProblem('abc', { policy })).toBe('The password does not meet the requirements listed below.');
        expect(newPasswordProblem('Abcdef12', { policy })).toBeNull();
    });

    it('refuses a new password equal to the current one', () => {
        expect(newPasswordProblem('Abcdef12', { policy, current: 'Abcdef12' })).toBe('The new password must be different from the current one.');
        expect(newPasswordProblem('Abcdef12', { policy, current: 'Abcdef13' })).toBeNull();
        expect(newPasswordProblem('Abcdef12', { policy, current: '' })).toBeNull();
    });

    it('requires the confirmation and that it equals the new password', () => {
        expect(confirmPasswordProblem('', { newPassword: 'abc' })).toBe('Confirm the new password.');
        expect(confirmPasswordProblem('abd', { newPassword: 'abc' })).toBe('Passwords do not match');
        expect(confirmPasswordProblem('abc', { newPassword: 'abc' })).toBeNull();
    });
});
