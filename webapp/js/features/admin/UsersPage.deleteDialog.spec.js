/**
 * The Delete User window lays the successor field out as a form field: its label on a line of
 * its own, the list of users across the window under it, and the help text on a line under the
 * list (at any width, a phone's too).
 *
 * Deleting all the user's data says how much goes and waits for the user name to be typed;
 * Enter on open deletes nothing, and the result dialog is the one report of the delete.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import Dialog from 'primevue/dialog';
import PrimeVue from 'primevue/config';

const USERS = [
    { userName: 'admin' },
    { userName: 'alice', organizationCount: 2, datasetCount: 5, storageUsed: 3 * 1024 * 1024 }
];
const reg = vi.hoisted(() => ({ admin: {} }));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: reg }));
reg.admin.usersDetailed = () => Promise.resolve(USERS.map(u => ({ ...u })));
reg.admin.userRoles = () => Promise.resolve(['admin']);

const { default: UsersPage } = await import('./UsersPage.vue');

let wrapper;
let notify;
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
});

async function openDeleteDialog() {
    reg.admin.deleteUser = vi.fn(userName => Promise.resolve({ userName, datasetsDeleted: 5 }));
    notify = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() };
    wrapper = mount(UsersPage, {
        attachTo: document.body,
        global: { plugins: [PrimeVue], stubs: { DataTable: true, Column: true }, mocks: { $notify: notify } }
    });
    await flushPromises();
    await wrapper.vm.handleDelete(wrapper.vm.users[1]);
    await flushPromises();
    await wrapper.findComponent(Dialog).vm.$emit('show');
    return document.getElementById('users-transfer-data-to-successor-label').closest('.field');
}

const dialog = () => document.getElementById('confirmDialog');
const deleteButton = () => dialog().querySelector('[data-confirm]');
const enter = target => target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
async function type(value) {
    const input = dialog().querySelector('input[type="text"], input:not([type])');
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await flushPromises();
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

    it('titles the window with the user and says what goes with them', async () => {
        await openDeleteDialog();
        expect(dialog().textContent).toContain('Delete user “alice”');
        // No counts: the row counts memberships, the delete removes only what the user owns
        expect(dialog().textContent).toContain('the organizations they own and all their datasets, 3 MB of files');
        expect(dialog().textContent).not.toContain('2 organizations');
        expect(dialog().textContent).not.toContain('5 datasets');
    });

    it('asks for the user name, before the successor field, and Enter on open deletes nothing', async () => {
        await openDeleteDialog();
        const input = document.activeElement;
        expect(input.tagName).toBe('INPUT');
        expect(input.compareDocumentPosition(document.getElementById('users-transfer-data-to-successor-label')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        enter(input);
        deleteButton().click();
        await flushPromises();
        expect(deleteButton().disabled).toBe(true);
        expect(reg.admin.deleteUser).not.toHaveBeenCalled();
    });

    it('deletes once the user name is typed, and reports it once (the result dialog, no toast)', async () => {
        await openDeleteDialog();
        await type('alice');
        expect(deleteButton().disabled).toBe(false);
        deleteButton().click();
        await flushPromises();
        expect(reg.admin.deleteUser).toHaveBeenCalledWith('alice', null, 'Rename');
        expect(document.getElementById('deleteResultDialog')).not.toBeNull();
        expect(notify.success).not.toHaveBeenCalled();
        expect(notify.error).not.toHaveBeenCalled();
    });

    it('does not ask for the user name when a successor takes the data', async () => {
        await openDeleteDialog();
        wrapper.vm.deleteSuccessor = 'admin';
        await flushPromises();
        expect([...dialog().querySelectorAll('label')].some(l => l.textContent.includes('to confirm'))).toBe(false);
        expect(deleteButton().disabled).toBe(false);
    });
});
