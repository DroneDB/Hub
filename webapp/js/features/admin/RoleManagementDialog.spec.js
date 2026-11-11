/**
 * The Role Management window shows the Registry's system roles (admin, and deactivated, which
 * blocks sign-in) as system roles (no Delete), and the other roles as custom roles that can be deleted.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import PrimeVue from 'primevue/config';
import RoleManagementDialog from './RoleManagementDialog.vue';

const rowOf = (w, role) => w.findAll('.role-item').find(r => r.find('.role-name').text() === role);

describe('RoleManagementDialog', () => {
    // PrimeVue's TabList draws its ink bar from a 150 ms timer it does not clear: the timers run, and the
    // windows go, before the test ends, so none fires once the DOM environment is torn down
    const mounted = [];
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => {
        vi.runOnlyPendingTimers();
        mounted.splice(0).forEach(m => m.unmount());
        vi.useRealTimers();
    });
    const w = () => {
        const wrapper = mount(RoleManagementDialog, {
            props: { roles: ['admin', 'deactivated', 'editor'] },
            global: { plugins: [PrimeVue], stubs: { Window: { template: '<div><slot /></div>' } } }
        });
        mounted.push(wrapper);
        return wrapper;
    };

    it('shows the admin role as a system role that cannot be deleted', () => {
        const admin = rowOf(w(), 'admin');
        expect(admin.find('.role-description').text()).toBe('Administrator role with full system access');
        expect(admin.text()).toContain('System Role');
        expect(admin.find('button').exists()).toBe(false);
    });

    it('shows deactivated as the system role that blocks sign-in', () => {
        const deactivated = rowOf(w(), 'deactivated');
        expect(deactivated.find('.role-description').text()).toBe('Blocks sign-in');
        expect(deactivated.text()).toContain('System Role');
        expect(deactivated.find('button').exists()).toBe(false);
    });

    it('shows another role as a custom role with a Delete button', () => {
        const editor = rowOf(w(), 'editor');
        expect(editor.find('.role-description').text()).toBe('Custom user role');
        expect(editor.find('button').text()).toContain('Delete');
    });
});

describe('RoleManagementDialog delete question', () => {
    it('uses the shared delete wording, with Delete / Cancel', () => {
        const props = RoleManagementDialog.computed.deleteDialog.call({ roleToDelete: 'editor' });
        expect(props).toMatchObject({ title: 'Delete role “editor”', confirmText: 'Delete', cancelText: 'Cancel', confirmButtonClass: 'danger' });
        expect(props.message).toContain('<strong>editor</strong>');
    });
});

describe('RoleManagementDialog focus (ADM-03)', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => {
        vi.runOnlyPendingTimers();
        vi.useRealTimers();
        document.body.innerHTML = '';
    });

    it('takes the focus into the window, never into the hidden Add Role panel, and gives it back on close', async () => {
        const Dialog = (await import('primevue/dialog')).default;
        const opener = document.createElement('button');
        document.body.appendChild(opener);
        opener.focus();
        const wrapper = mount(RoleManagementDialog, {
            props: { roles: ['admin', 'editor'] },
            attachTo: document.body, global: { plugins: [PrimeVue] }
        });
        await nextTick();
        await wrapper.findComponent(Dialog).vm.$emit('show');
        const active = document.activeElement;
        expect(document.getElementById('roleManagementDialog').contains(active)).toBe(true);
        expect(active.id).not.toBe('role-management-dialog-role-name');
        expect(active.getAttribute('role')).toBe('tab');
        expect(active.textContent).toContain('View Roles');
        wrapper.unmount();
        expect(document.activeElement).toBe(opener);
    });
});
