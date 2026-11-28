/**
 * Deleting a role: the question stays open while the request runs, and cannot be answered twice (a second click or Enter
 * would send a second delete).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';

const reg = vi.hoisted(() => ({ admin: {} }));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: reg }));

const { default: RoleManagementDialog } = await import('./RoleManagementDialog.vue');

let wrapper;
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
});

const dialog = () => document.getElementById('confirmDialog');
const confirmButton = () => dialog().querySelector('[data-confirm]');
async function open() {
    wrapper = mount(RoleManagementDialog, {
        props: { roles: ['admin', 'editor'] },
        attachTo: document.body,
        global: { plugins: [PrimeVue], mocks: { $notify: { success: vi.fn(), error: vi.fn() } } }
    });
    await flushPromises();
    await wrapper.vm.deleteRole('editor');
    await flushPromises();
    const input = dialog().querySelector('input');
    if (input) {
        input.value = 'editor';
        input.dispatchEvent(new Event('input'));
        await flushPromises();
    }
}

describe('RoleManagementDialog delete', () => {
    it('keeps the question busy while the delete runs, and sends it once', async () => {
        let finish;
        reg.admin.deleteRole = vi.fn(() => new Promise(resolve => { finish = resolve; }));
        await open();
        confirmButton().click();
        await flushPromises();
        expect(confirmButton().disabled).toBe(true);
        expect(dialog().querySelector('[data-cancel]').disabled).toBe(true);
        confirmButton().click();
        await wrapper.vm.confirmDeleteRole();
        expect(reg.admin.deleteRole).toHaveBeenCalledTimes(1);
        finish();
        await flushPromises();
        expect(reg.admin.deleteRole).toHaveBeenCalledTimes(1);
        expect(wrapper.emitted('rolesChanged')).toHaveLength(1);
    });
});
