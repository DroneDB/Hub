/**
 * The Role Management window shows the Registry's admin role as the system role it is (no
 * Delete), and the other roles as custom roles that can be deleted.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import RoleManagementDialog from './RoleManagementDialog.vue';

const rowOf = (w, role) => w.findAll('.role-item').find(r => r.find('.role-name').text() === role);

describe('RoleManagementDialog', () => {
    const w = () => mount(RoleManagementDialog, {
        props: { roles: ['admin', 'editor'] },
        global: { plugins: [PrimeVue], stubs: { Window: { template: '<div><slot /></div>' } } }
    });

    it('shows the admin role as a system role that cannot be deleted', () => {
        const admin = rowOf(w(), 'admin');
        expect(admin.find('.role-description').text()).toBe('Administrator role with full system access');
        expect(admin.text()).toContain('System Role');
        expect(admin.find('button').exists()).toBe(false);
    });

    it('shows another role as a custom role with a Delete button', () => {
        const editor = rowOf(w(), 'editor');
        expect(editor.find('.role-description').text()).toBe('Custom user role');
        expect(editor.find('button').text()).toContain('Delete');
    });
});
