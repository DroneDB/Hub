import { describe, it, expect } from 'vitest';
import { fieldErrorsOf, formMessageOf } from './serverErrors';
import { ApiError } from '@/libs/ddb/apiError';

describe('fieldErrorsOf (D-047)', () => {
    it('maps the members of the errors of the answer to the fields, by key', () => {
        const e = new ApiError('One or more validation errors occurred.', 400, {
            errors: { currentPassword: ['The current password is incorrect.'] }
        });
        expect(fieldErrorsOf(e, { currentPassword: 'oldPassword' })).toEqual({ oldPassword: 'The current password is incorrect.' });
    });

    it('maps a member to the field of the same name when the form has it', () => {
        const e = new ApiError('x', 400, { errors: { newPassword: ['Too short.', 'Needs a digit.'], elsewhere: ['No such field.'] } });
        expect(fieldErrorsOf(e, {}, ['newPassword'])).toEqual({ newPassword: 'Too short. Needs a digit.' });
    });

    it('compares the keys without regard to letter case', () => {
        const e = new ApiError('x', 400, { errors: { UserName: ['Taken.'] } });
        expect(fieldErrorsOf(e, { userName: 'username' })).toEqual({ username: 'Taken.' });
    });

    it('never maps by the text of the message', () => {
        const e = new ApiError('Cannot change user password: PasswordMismatch - Incorrect password.', 400);
        expect(fieldErrorsOf(e, { currentPassword: 'oldPassword' }, ['oldPassword'])).toEqual({});
    });

    it('gives nothing for an error without errors, or with a shape it does not know', () => {
        expect(fieldErrorsOf(new Error('boom'))).toEqual({});
        expect(fieldErrorsOf(null)).toEqual({});
        expect(fieldErrorsOf({ errors: ['a'] }, {}, ['a'])).toEqual({});
        expect(fieldErrorsOf({ errors: { a: [] } }, {}, ['a'])).toEqual({});
    });
});

describe('formMessageOf', () => {
    it('is the message of the error, or the fallback', () => {
        expect(formMessageOf(new Error('Network down'))).toBe('Network down');
        expect(formMessageOf({}, 'Failed')).toBe('Failed');
        expect(formMessageOf(null)).toBe('The request failed');
    });
});
