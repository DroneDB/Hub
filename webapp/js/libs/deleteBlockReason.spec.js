/**
 * The rules of the Delete action of the admin lists (FR-ADM-24): one function per list, giving the reason or null.
 */
import { describe, it, expect } from 'vitest';
import { userDeleteBlockReason, userDisableBlockReason, organizationDeleteBlockReason } from './deleteBlockReason';

describe('userDeleteBlockReason', () => {
    it('says why the built-in admin account cannot be deleted, and nothing for any other user', () => {
        expect(userDeleteBlockReason({ userName: 'admin' })).toBe('The built-in admin account cannot be deleted');
        expect(userDeleteBlockReason({ userName: 'alice' })).toBeNull();
        expect(userDeleteBlockReason({ userName: 'administrator' })).toBeNull();
        expect(userDeleteBlockReason(null)).toBeNull();
    });
});

describe('userDisableBlockReason', () => {
    it('says why the signed-in user cannot disable their own account, whatever the letter case', () => {
        expect(userDisableBlockReason({ userName: 'alice' }, 'alice')).toBe('You cannot disable your own account');
        expect(userDisableBlockReason({ userName: 'Alice' }, 'aLICE')).toBe('You cannot disable your own account');
        expect(userDisableBlockReason({ userName: 'admin' }, 'admin')).toBe('You cannot disable your own account');
    });

    it('says nothing for another user, or when nobody is signed in', () => {
        expect(userDisableBlockReason({ userName: 'bob' }, 'alice')).toBeNull();
        expect(userDisableBlockReason({ userName: 'alice' }, null)).toBeNull();
        expect(userDisableBlockReason({ userName: 'alice' }, undefined)).toBeNull();
        expect(userDisableBlockReason({ userName: null }, null)).toBeNull();
        expect(userDisableBlockReason(null, 'alice')).toBeNull();
    });
});

describe('organizationDeleteBlockReason', () => {
    it('says why the Public organization cannot be deleted, whatever the case of its slug', () => {
        expect(organizationDeleteBlockReason({ slug: 'public' })).toBe('The Public organization cannot be deleted');
        expect(organizationDeleteBlockReason({ slug: 'Public' })).toBe('The Public organization cannot be deleted');
        expect(organizationDeleteBlockReason({ slug: 'public-works' })).toBeNull();
        expect(organizationDeleteBlockReason(undefined)).toBeNull();
    });
});
