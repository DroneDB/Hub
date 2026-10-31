/**
 * The administrator role is the Registry's "admin", whatever its case.
 */
import { describe, it, expect } from 'vitest';
import { isAdminRole, isSystemRole } from './roles';

describe('roles', () => {
    it('knows the admin role in any case', () => {
        expect(['admin', 'Admin', 'ADMIN'].map(isAdminRole)).toEqual([true, true, true]);
        expect(isSystemRole('admin')).toBe(true);
    });

    it('takes other roles for custom ones', () => {
        expect(['editor', 'administrator', '', null, undefined].map(isSystemRole)).toEqual([false, false, false, false, false]);
    });
});
