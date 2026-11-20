/**
 * The Users list (FR-ADM-09, FR-ADM-16, FR-ADM-23, D-030): the button of the organizations is named with the user and
 * its count, the storage bar is amber from 90 % and red from 100 %, and the rows have checkboxes with bulk actions. A
 * bulk delete asks once, with the choices and the typed confirmation of the delete of one user, and its successor list
 * leaves out every selected user and every disabled user.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';

const MB = 1024 * 1024;
const USERS = [
    { userName: 'admin', email: 'a@x.org', roles: ['admin'], organizationCount: 1, datasetCount: 0, storageUsed: 0, storageQuota: null },
    { userName: 'alice', email: 'alice@x.org', roles: ['editor'], organizationCount: 2, datasetCount: 5, storageUsed: 3 * MB, storageQuota: null },
    { userName: 'bob', email: 'bob@x.org', roles: [], organizationCount: 0, datasetCount: 0, storageUsed: 10 * MB, storageQuota: 40 * MB },
    { userName: 'carol', email: 'carol@x.org', roles: ['viewer'], organizationCount: 1, datasetCount: 1, storageUsed: 36 * MB, storageQuota: 40 * MB },
    { userName: 'dave', email: 'dave@x.org', roles: [], organizationCount: 1, datasetCount: 1, storageUsed: 52 * MB, storageQuota: 40 * MB },
    { userName: 'erin', email: 'erin@x.org', roles: ['deactivated'], organizationCount: 0, datasetCount: 0, storageUsed: 0, storageQuota: null }
];
const reg = vi.hoisted(() => ({ admin: {}, limiter: true, features: { value: () => ['admin', 'deactivated'], get: name => name === 'storageLimiter' && reg.limiter } }));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: reg }));

const { default: UsersPage } = await import('./UsersPage.vue');

let wrapper;
let notify;
beforeEach(() => {
    reg.limiter = true;
    reg.admin.usersDetailed = vi.fn(() => Promise.resolve(USERS.map(u => ({ ...u }))));
    reg.admin.userRoles = () => Promise.resolve(['editor', 'viewer']);
    reg.admin.deleteUser = vi.fn(userName => Promise.resolve({ userName, organizationsDeleted: 1, datasetsDeleted: 2 }));
    reg.admin.disableUser = vi.fn(() => Promise.resolve());
    reg.admin.enableUser = vi.fn(() => Promise.resolve());
    notify = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() };
});
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
});

async function render() {
    wrapper = mount(UsersPage, { attachTo: document.body, global: { plugins: [PrimeVue], mocks: { $notify: notify } } });
    await flushPromises();
}
const row = name => wrapper.findAll('tbody tr').find(r => r.find('strong')?.text() === name);
const tick = async name => { await row(name).find('input[type="checkbox"]').setValue(true); await flushPromises(); };
const bulkBar = () => wrapper.find('.bulk-bar');
const barButton = label => bulkBar().findAll('button').find(b => b.text() === label);
const dialog = () => document.getElementById('confirmDialog');
const confirmButton = () => dialog().querySelector('[data-confirm]');
async function typeConfirmation(value) {
    const input = dialog().querySelector('input[type="text"], input:not([type])');
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await flushPromises();
}
const successors = () => wrapper.findAllComponents({ name: 'Select' }).find(s => s.props('inputId') === 'users-transfer-data-to-successor')
    .props('options').map(o => o.value);

describe('UsersPage organization count (FR-ADM-09)', () => {
    it('names the button with the user and the count, for the screen reader and in its tooltip', async () => {
        await render();
        const button = row('alice').find('button[title^="Manage organizations"]');
        expect(button.attributes('aria-label')).toBe('Manage organizations of alice (2)');
        expect(button.attributes('title')).toBe('Manage organizations of alice (2)');
        expect(button.text()).toBe('2');
        expect(row('bob').find('button[title^="Manage organizations"]').attributes('aria-label')).toBe('Manage organizations of bob (0)');
    });
});

describe('UsersPage storage column (FR-ADM-16, D-030)', () => {
    const storage = name => row(name).find('td[data-label="Storage"]');

    it('shows a bar in the colour of its severity, the real percentage over 100, and no bar without a quota', async () => {
        await render();
        expect(storage('alice').text()).toBe('3 MB / Unlimited');
        expect(storage('alice').find('[role="progressbar"]').exists()).toBe(false);

        expect(storage('bob').text()).toContain('10 MB / 40 MB');
        expect(storage('bob').find('.storage-warning').exists()).toBe(false);
        expect(storage('bob').find('[role="progressbar"]').attributes('aria-label')).toBe('Storage used by bob');

        expect(storage('carol').find('.storage-warning').text()).toBe('90% used');
        expect(storage('carol').find('.storage-warning').attributes('style')).toContain('var(--ddb-warning)');
        expect(storage('carol').find('.p-progressbar-value').attributes('style')).toContain('var(--ddb-warning)');

        expect(storage('dave').find('.storage-warning').text()).toBe('130% used');
        expect(storage('dave').find('.storage-warning').attributes('style')).toContain('var(--ddb-danger)');
        expect(storage('dave').find('[role="progressbar"]').attributes('aria-valuenow')).toBe('100');
    });
});

describe('UsersPage storage column when the quota is not enforced', () => {
    const storage = name => row(name).find('td[data-label="Storage"]');

    it('shows no bar and no warning for a stored quota when the storage limiter is off', async () => {
        reg.limiter = false;
        await render();
        expect(storage('dave').text()).toBe('52 MB / Unlimited');
        expect(storage('dave').find('[role="progressbar"]').exists()).toBe(false);
        expect(storage('dave').find('.storage-warning').exists()).toBe(false);
    });

    it('shows no bar for an administrator that has a stored quota, with the limiter on', async () => {
        reg.admin.usersDetailed = vi.fn(() => Promise.resolve(USERS.map(u => (u.userName === 'carol' ? { ...u, roles: ['admin'] } : { ...u }))));
        await render();
        expect(storage('carol').text()).toBe('36 MB / Unlimited');
        expect(storage('carol').find('[role="progressbar"]').exists()).toBe(false);
        expect(storage('bob').find('[role="progressbar"]').exists()).toBe(true);
    });
});

describe('UsersPage selection and bulk actions (FR-ADM-23)', () => {
    it('has a checkbox on every row but the built-in admin, and no bulk bar until a user is ticked', async () => {
        await render();
        expect(row('admin').find('input[type="checkbox"]').exists()).toBe(false);
        expect(row('alice').find('input[type="checkbox"]').attributes('aria-label')).toBe('Select alice');
        expect(bulkBar().exists()).toBe(false);

        await tick('alice');
        expect(bulkBar().text()).toContain('1 user selected');
        expect(bulkBar().attributes('role')).toBe('region');
    });

    it('selects every user but the admin from the header checkbox, and clears them from it', async () => {
        await render();
        const header = () => wrapper.find('thead input[type="checkbox"]');
        expect(header().attributes('aria-label')).toBe('Select all users');
        await header().setValue(true);
        await flushPromises();
        expect(bulkBar().text()).toContain('5 users selected');
        await header().setValue(false);
        await flushPromises();
        expect(bulkBar().exists()).toBe(false);
    });

    it('offers Add role, Add to organization, Disable, Enable, Delete and Clear selection', async () => {
        await render();
        await tick('alice');
        await tick('erin');
        expect(bulkBar().findAll('button').map(b => b.text())).toEqual(['Add role', 'Add to organization', 'Disable', 'Enable', 'Delete', 'Clear selection']);
        await barButton('Clear selection').trigger('click');
        expect(bulkBar().exists()).toBe(false);
    });

    it('asks once for the delete of three users: the choices of the delete of one, a typed number, no Enter on open', async () => {
        await render();
        await tick('alice');
        await tick('bob');
        await tick('carol');
        await barButton('Delete').trigger('click');
        await flushPromises();

        expect(document.querySelectorAll('#confirmDialog')).toHaveLength(1);
        expect(dialog().textContent).toContain('Delete 3 items');
        expect(dialog().textContent).toContain('the organizations they own and all their datasets, 49 MB of files');
        expect(dialog().textContent).toContain('Transfer data to successor (optional)');
        expect(dialog().textContent).toContain('All user data (organizations, datasets, files) will be permanently deleted.');
        // The number of users is what is typed
        expect(dialog().textContent).toContain('Type 3 to confirm');
        expect(confirmButton().disabled).toBe(true);

        dialog().querySelector('input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        confirmButton().click();
        await flushPromises();
        expect(reg.admin.deleteUser).not.toHaveBeenCalled();
    });

    it('leaves the selected users and the disabled ones out of the successors', async () => {
        await render();
        await tick('alice');
        await tick('bob');
        await tick('carol');
        await barButton('Delete').trigger('click');
        await flushPromises();
        // admin, dave stay; alice, bob, carol are being deleted, erin is disabled
        expect(successors()).toEqual(['admin', 'dave']);
    });

    it('deletes the users one after the other once the number is typed, and reports once', async () => {
        await render();
        await tick('alice');
        await tick('bob');
        await tick('carol');
        await barButton('Delete').trigger('click');
        await flushPromises();
        await typeConfirmation('3');
        expect(confirmButton().disabled).toBe(false);
        confirmButton().click();
        await flushPromises();

        expect(reg.admin.deleteUser.mock.calls).toEqual([['alice', null, 'Rename'], ['bob', null, 'Rename'], ['carol', null, 'Rename']]);
        const result = document.getElementById('deleteResultDialog');
        expect(result.textContent).toContain('3 users deleted');
        expect(result.textContent).toContain('Deleted 3 users: alice, bob, carol.');
        expect(result.textContent).toContain('Organizations deleted: 3');
        expect(result.textContent).toContain('Datasets deleted: 6');
        expect(notify.success).not.toHaveBeenCalled();
        expect(wrapper.findAll('tbody tr').map(r => r.find('strong').text())).toEqual(['admin', 'dave', 'erin']);
        expect(bulkBar().exists()).toBe(false);
    });

    it('does not ask for the number when a successor takes the data, and sends the successor and the strategy', async () => {
        await render();
        await tick('alice');
        await tick('bob');
        await barButton('Delete').trigger('click');
        await flushPromises();
        wrapper.vm.deleteSuccessor = 'dave';
        await flushPromises();
        expect(dialog().textContent).not.toContain('to confirm');
        expect(dialog().textContent).toContain('all organizations and datasets of the deleted users will be transferred');
        confirmButton().click();
        await flushPromises();
        expect(reg.admin.deleteUser.mock.calls).toEqual([['alice', 'dave', 'Rename'], ['bob', 'dave', 'Rename']]);
    });

    it('reports what failed with the message of the Registry, and keeps those users', async () => {
        reg.admin.deleteUser = vi.fn(userName => (userName === 'bob'
            ? Promise.reject(new Error('Cannot delete bob: owns a protected organization'))
            : Promise.resolve({ userName })));
        await render();
        await tick('alice');
        await tick('bob');
        await barButton('Delete').trigger('click');
        await flushPromises();
        await typeConfirmation('2');
        confirmButton().click();
        await flushPromises();

        const result = document.getElementById('deleteResultDialog');
        expect(result.textContent).toContain('1 of 2 users deleted');
        expect(result.textContent).toContain('bob: Cannot delete bob: owns a protected organization');
        expect(wrapper.findAll('tbody tr').map(r => r.find('strong').text())).toContain('bob');
        expect(wrapper.findAll('tbody tr').map(r => r.find('strong').text())).not.toContain('alice');
    });

    it('still deletes one user with the typed user name, as before', async () => {
        await render();
        await row('alice').find('button[aria-label="Delete User"]').trigger('click');
        await flushPromises();
        expect(dialog().textContent).toContain('Delete user “alice”');
        expect(dialog().textContent).toContain('Type alice to confirm');
        expect(successors()).toEqual(['admin', 'bob', 'carol', 'dave']);
    });

    it('disables the active users that are selected, after a question, and says how many', async () => {
        await render();
        await tick('alice');
        await tick('erin');
        await barButton('Disable').trigger('click');
        await flushPromises();
        expect(dialog().textContent).toContain('Disable user “alice”');
        confirmButton().click();
        await flushPromises();
        // erin is disabled already: only alice is disabled
        expect(reg.admin.disableUser.mock.calls).toEqual([['alice']]);
        expect(notify.success).toHaveBeenCalledWith('Disabled 1 user.', { summary: 'Users Disabled' });
    });

    it('enables the disabled users that are selected, and reports the ones that failed', async () => {
        reg.admin.enableUser = vi.fn(() => Promise.reject(new Error('Cannot enable')));
        await render();
        await tick('erin');
        await barButton('Enable').trigger('click');
        await flushPromises();
        expect(notify.warn).toHaveBeenCalledWith('Enabled 0 users. 1 failed: erin (Cannot enable).', expect.objectContaining({ summary: 'Enable Users' }));
    });

    it('drops the users that the search no longer shows from the selection', async () => {
        await render();
        await tick('alice');
        await tick('bob');
        await wrapper.findComponent({ name: 'SearchField' }).find('input').setValue('bob');
        await flushPromises();
        expect(bulkBar().text()).toContain('1 user selected');
    });

    it('opens the Add role and Add to organization dialogs for the selected users', async () => {
        await render();
        await tick('alice');
        await tick('bob');
        await barButton('Add role').trigger('click');
        await flushPromises();
        const dialogComponent = wrapper.findComponent({ name: 'BulkUsersDialog' });
        expect(dialogComponent.props('mode')).toBe('role');
        expect(dialogComponent.props('users').map(u => u.userName)).toEqual(['alice', 'bob']);
    });
});
