/**
 * The system roles are the ones the Registry lists in /sys/features (FR-ADM-04), "admin" and
 * "deactivated" when it lists none; role names compare without regard to case.
 */
import { describe, it, expect, afterEach } from 'vitest';
import reg from '@/libs/api/sharedRegistry';
import {
    isAdminRole, isSystemRole, isDeactivatedRole, isDisabledUser, pickableRoles, publishesSystemRoles, roleDescription, systemRoles
} from './roles';

const serve = features => { reg.features.values = features; };
afterEach(() => reg.features.clear());

describe('roles', () => {
    it('knows the admin role in any case', () => {
        expect(['admin', 'Admin', 'ADMIN'].map(isAdminRole)).toEqual([true, true, true]);
        expect(isSystemRole('admin')).toBe(true);
    });

    it('takes other roles for custom ones', () => {
        expect(['editor', 'administrator', '', null, undefined].map(isSystemRole)).toEqual([false, false, false, false, false]);
    });

    it('reads the system roles the server publishes', () => {
        serve({ systemRoles: ['admin', 'deactivated', 'auditor'] });
        expect(publishesSystemRoles()).toBe(true);
        expect(['Auditor', 'deactivated', 'DEACTIVATED', 'admin'].map(isSystemRole)).toEqual([true, true, true, true]);
        expect(roleDescription('auditor')).toBe('System role');
    });

    it('knows admin and deactivated when the server publishes none (an older Registry)', () => {
        serve({});
        expect(publishesSystemRoles()).toBe(false);
        expect(systemRoles()).toEqual(['admin', 'deactivated']);
        expect(isSystemRole('deactivated')).toBe(true);
    });

    it('describes deactivated as what it does, and keeps it out of the role pickers', () => {
        expect(roleDescription('deactivated')).toBe('Blocks sign-in');
        expect(roleDescription('admin')).toBe('Administrator role with full system access');
        expect(roleDescription('editor')).toBe('Custom user role');
        expect(pickableRoles(['admin', 'Deactivated', 'editor'])).toEqual(['admin', 'editor']);
        expect(isDeactivatedRole('Deactivated')).toBe(true);
    });

    it('tells a disabled user by the role', () => {
        expect(isDisabledUser({ roles: ['editor', 'deactivated'] })).toBe(true);
        expect(isDisabledUser({ roles: ['admin'] })).toBe(false);
        expect(isDisabledUser({})).toBe(false);
        expect(isDisabledUser(null)).toBe(false);
    });
});
