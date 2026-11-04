/**
 * The Delete User window lays the successor field out as a form field: its label on a line of
 * its own, the list of users across the window under it, and the help text on a line under the
 * list (at any width, a phone's too).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';

const USERS = [{ userName: 'admin' }, { userName: 'alice' }];
const reg = vi.hoisted(() => ({ admin: {} }));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: reg }));
reg.admin.usersDetailed = () => Promise.resolve(USERS);
reg.admin.userRoles = () => Promise.resolve(['admin']);

const { default: UsersPage } = await import('./UsersPage.vue');

let wrapper;
afterEach(() => wrapper?.unmount());

async function openDeleteDialog() {
    wrapper = mount(UsersPage, {
        attachTo: document.body,
        global: { plugins: [PrimeVue], stubs: { DataTable: true, Column: true } }
    });
    await flushPromises();
    await wrapper.vm.handleDelete(wrapper.vm.users[1]);
    await flushPromises();
    return document.getElementById('users-transfer-data-to-successor-label').closest('.field');
}

describe('UsersPage Delete User window', () => {
    it('puts the successor label above the list and the help text below it, each on its own line', async () => {
        const field = await openDeleteDialog();
        const [label, list, help] = field.children;
        expect(label.tagName).toBe('LABEL');
        expect(label.classList).toContain('d-block');
        expect(list.classList).toContain('p-select');
        expect(list.classList).toContain('w-100');
        expect(help.tagName).toBe('SMALL');
        expect(help.classList).toContain('d-block');
    });
});
