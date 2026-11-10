/**
 * Disable and Enable (FR-ADM-04, D-043): a Registry that lists its system roles has the endpoints,
 * and the Users list offers them in the Actions column. Disable asks first (it blocks sign-in);
 * a disabled user has a "Disabled" tag next to the name. Edit User does not offer 'deactivated'
 * and cannot enable a user; with an older Registry it sends the role back, so the edit keeps the
 * user disabled.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';

const h = vi.hoisted(() => ({ features: {} }));
const reg = vi.hoisted(() => ({
    admin: {},
    features: { value: name => h.features[name] ?? null, get: name => h.features[name] === true }
}));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: reg }));

const { default: UsersPage } = await import('./UsersPage.vue');
const { default: EditUserDialog } = await import('./EditUserDialog.vue');
const { ApiError } = await import('@/libs/ddb/apiError');

const USERS = [
    { userName: 'admin', roles: ['admin'] },
    { userName: 'alice', roles: ['editor'] },
    { userName: 'bob', roles: ['editor', 'deactivated'] }
];

let wrapper;
let notify;
beforeEach(() => {
    h.features = { systemRoles: ['admin', 'deactivated'] };
    reg.admin.usersDetailed = vi.fn(() => Promise.resolve(USERS.map(u => ({ ...u, roles: [...u.roles] }))));
    reg.admin.userRoles = () => Promise.resolve(['admin', 'deactivated', 'editor']);
    reg.admin.disableUser = vi.fn(() => Promise.resolve(true));
    reg.admin.enableUser = vi.fn(() => Promise.resolve(true));
    reg.admin.updateUser = vi.fn(() => Promise.resolve(true));
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
    return wrapper;
}
const rowOf = name => wrapper.findAll('tbody tr').find(r => r.find('strong').text() === name);
const confirmWindow = () => document.getElementById('confirmDialog');
const clickIn = async (root, selector) => {
    root.querySelector(selector).click();
    await flushPromises();
};

describe('UsersPage Disable and Enable', () => {
    it('tags a disabled user next to the name, and lists the other roles only', async () => {
        await render();
        expect(rowOf('bob').find('.user-name').text()).toContain('Disabled');
        expect(rowOf('alice').find('.user-name').text()).not.toContain('Disabled');
        expect(rowOf('bob').findAll('.p-chip').map(c => c.text())).toEqual(['editor']);
    });

    it('offers Disable to an active user and Enable to a disabled one', async () => {
        await render();
        expect(rowOf('alice').find('button[aria-label="Disable User"]').exists()).toBe(true);
        expect(rowOf('alice').find('button[aria-label="Enable User"]').exists()).toBe(false);
        expect(rowOf('bob').find('button[aria-label="Enable User"]').exists()).toBe(true);
        expect(rowOf('bob').find('button[aria-label="Disable User"]').exists()).toBe(false);
    });

    it('asks before it disables, as a destructive action; Cancel disables nobody', async () => {
        await render();
        await rowOf('alice').find('button[aria-label="Disable User"]').trigger('click');
        await flushPromises();
        expect(confirmWindow().textContent).toContain('Disable user “alice”');
        expect(confirmWindow().textContent).toContain('no longer be able to sign in');
        expect(confirmWindow().querySelector('[data-confirm]').classList).toContain('p-button-danger');
        await clickIn(confirmWindow(), '[data-cancel]');
        expect(reg.admin.disableUser).not.toHaveBeenCalled();
    });

    it('disables once confirmed, and reloads the list', async () => {
        await render();
        await rowOf('alice').find('button[aria-label="Disable User"]').trigger('click');
        await flushPromises();
        await clickIn(confirmWindow(), '[data-confirm]');
        expect(reg.admin.disableUser).toHaveBeenCalledWith('alice');
        expect(reg.admin.usersDetailed).toHaveBeenCalledTimes(2);
        expect(notify.success).toHaveBeenCalled();
    });

    it('shows the server\'s reason when it refuses (your own account, the last admin)', async () => {
        const reason = 'You cannot disable your own account';
        reg.admin.disableUser = vi.fn(() => Promise.reject(new ApiError(reason, 400, { detail: reason })));
        await render();
        await rowOf('admin').find('button[aria-label="Disable User"]').trigger('click');
        await flushPromises();
        await clickIn(confirmWindow(), '[data-confirm]');
        expect(wrapper.vm.error).toBe(reason);
        expect(wrapper.text()).toContain(reason);
    });

    it('enables without a question', async () => {
        await render();
        await rowOf('bob').find('button[aria-label="Enable User"]').trigger('click');
        await flushPromises();
        expect(confirmWindow()).toBeNull();
        expect(reg.admin.enableUser).toHaveBeenCalledWith('bob');
    });

    it('offers neither with an older Registry (no system roles listed), and still tags a disabled user', async () => {
        h.features = {};
        await render();
        expect(wrapper.find('button[aria-label="Disable User"]').exists()).toBe(false);
        expect(wrapper.find('button[aria-label="Enable User"]').exists()).toBe(false);
        expect(rowOf('bob').find('.user-name').text()).toContain('Disabled');
    });
});

describe('Edit User and the role that blocks sign-in', () => {
    const bob = () => ({ userName: 'bob', email: '', roles: ['editor', 'deactivated'] });
    const WindowStub = {
        emits: ['confirm', 'close'],
        template: '<div><slot /><button type="button" data-confirm @click="$emit(\'confirm\')">Update User</button></div>'
    };
    async function edit() {
        wrapper = mount(EditUserDialog, {
            props: { user: bob(), availableRoles: ['admin', 'deactivated', 'editor'] },
            global: { plugins: [PrimeVue], mocks: { $notify: notify }, stubs: { Window: WindowStub } }
        });
        await flushPromises();
    }
    const update = async () => {
        await wrapper.find('[data-confirm]').trigger('click');
        await flushPromises();
    };

    it('does not offer deactivated, and does not send it: the server keeps it', async () => {
        await edit();
        expect(wrapper.vm.roleOptions.map(o => o.value)).toEqual(['admin', 'editor']);
        await update();
        expect(reg.admin.updateUser).toHaveBeenCalledWith('bob', undefined, ['editor']);
    });

    it('sends it back to an older Registry, whose update replaces every role', async () => {
        h.features = {};
        await edit();
        await update();
        expect(reg.admin.updateUser).toHaveBeenCalledWith('bob', undefined, ['editor', 'deactivated']);
    });
});
