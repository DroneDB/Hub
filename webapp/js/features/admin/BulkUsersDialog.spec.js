/**
 * Add role and Add to organization for the users selected in the Users list (FR-ADM-23): one request per user, one after
 * the other, and one summary of the users it worked for and the ones it did not.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';

const reg = vi.hoisted(() => ({ admin: {}, orgs: {}, features: { value: () => ['admin', 'deactivated'], get: () => false } }));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: reg }));

const { default: BulkUsersDialog } = await import('./BulkUsersDialog.vue');

const WindowStub = {
    props: ['title', 'confirmLabel', 'confirmDisabled', 'busy', 'closeButton'],
    emits: ['confirm', 'close'],
    template: '<div><h2>{{ title }}</h2><slot /><button v-if="confirmLabel" type="button" data-confirm :disabled="confirmDisabled || busy" @click="$emit(\'confirm\')">{{ confirmLabel }}</button><button type="button" data-cancel @click="$emit(\'close\')">Close</button></div>'
};
const USERS = [
    { userName: 'alice', roles: ['editor'] },
    { userName: 'bob', roles: ['viewer', 'deactivated'] },
    { userName: 'carol', roles: ['pilot'] }
];

let wrapper;
let notify;
beforeEach(() => {
    reg.admin.updateUser = vi.fn(() => Promise.resolve(true));
    reg.admin.addUserToOrganization = vi.fn(() => Promise.resolve({}));
    reg.orgs.getOrganizations = vi.fn(() => Promise.resolve([
        { org: { slug: 'public', name: 'Public' } }, { org: { slug: 'acme', name: 'Acme Survey' } }, { org: { slug: 'quarry', name: '' } }
    ]));
    notify = { success: vi.fn(), error: vi.fn() };
});
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
});

async function render(mode, users = USERS) {
    wrapper = mount(BulkUsersDialog, {
        props: { mode, users, availableRoles: ['admin', 'deactivated', 'editor', 'pilot', 'viewer'] },
        attachTo: document.body,
        global: { plugins: [PrimeVue], stubs: { Window: WindowStub }, mocks: { $notify: notify } }
    });
    await flushPromises();
}
const selectOf = id => wrapper.findAllComponents({ name: 'Select' }).find(s => s.props('inputId') === id);
const pick = async (id, value) => { selectOf(id).vm.$emit('update:modelValue', value); await flushPromises(); };
const run = async () => { await wrapper.find('[data-confirm]').trigger('click'); await flushPromises(); };

describe('BulkUsersDialog role', () => {
    it('lists the users, offers the roles but deactivated, and waits for a role before it adds one', async () => {
        await render('role');
        expect(wrapper.find('h2').text()).toBe('Add Role to Users');
        expect(wrapper.text()).toContain('Applies to 3 selected users: alice, bob, carol');
        expect(selectOf('bulk-users-role').props('options')).toEqual(['admin', 'editor', 'pilot', 'viewer']);
        expect(wrapper.find('[data-confirm]').attributes('disabled')).toBeDefined();
    });

    it('adds the role to every user that does not have it, keeping their other roles, one request each', async () => {
        await render('role');
        await pick('bulk-users-role', 'editor');
        await run();
        // alice has editor already; bob keeps viewer (the Registry keeps deactivated itself); carol keeps pilot
        expect(reg.admin.updateUser.mock.calls).toEqual([
            ['bob', undefined, ['viewer', 'editor']],
            ['carol', undefined, ['pilot', 'editor']]
        ]);
        expect(notify.success).toHaveBeenCalledWith('Added the role editor to 2 users. Already so for alice.', { summary: 'Role Added' });
        expect(wrapper.emitted('close')[0]).toEqual(['updated']);
    });

    it('stays open with the users it failed for, and tells the list to refresh when it closes', async () => {
        reg.admin.updateUser = vi.fn(userName => (userName === 'carol' ? Promise.reject(new Error('Role does not exist')) : Promise.resolve(true)));
        await render('role');
        await pick('bulk-users-role', 'viewer');
        await run();
        expect(wrapper.find('.bulk-result').text()).toBe('Added the role viewer to 1 user. Already so for bob. 1 failed: carol (Role does not exist).');
        expect(wrapper.emitted('close')).toBeUndefined();
        expect(wrapper.find('[data-confirm]').exists()).toBe(false);
        // alice got the role: the list refreshes when the window closes
        await wrapper.find('[data-cancel]').trigger('click');
        expect(wrapper.emitted('close')[0]).toEqual(['updated']);
    });

    it('closes without a refresh when nothing was changed', async () => {
        await render('role');
        await wrapper.find('[data-cancel]').trigger('click');
        expect(wrapper.emitted('close')[0]).toEqual([undefined]);
    });
});

describe('BulkUsersDialog organization', () => {
    it('offers the organizations but Public, by name or slug, and Read/Write as the first permission', async () => {
        await render('organization');
        expect(wrapper.find('h2').text()).toBe('Add Users to an Organization');
        expect(selectOf('bulk-users-org').props('options')).toEqual([{ label: 'Acme Survey', value: 'acme' }, { label: 'quarry', value: 'quarry' }]);
        expect(selectOf('bulk-users-permissions').props('modelValue')).toBe(1);
    });

    it('adds each user to the organization with the chosen permissions, one after the other', async () => {
        await render('organization');
        await pick('bulk-users-org', 'acme');
        await pick('bulk-users-permissions', 2);
        await run();
        expect(reg.admin.addUserToOrganization.mock.calls).toEqual([['alice', 'acme', 2], ['bob', 'acme', 2], ['carol', 'acme', 2]]);
        expect(notify.success).toHaveBeenCalledWith('Added to acme: 3 users.', { summary: 'Organization Added' });
        expect(wrapper.emitted('close')[0]).toEqual(['updated']);
    });

    it('says which users it could not add', async () => {
        reg.admin.addUserToOrganization = vi.fn(userName => (userName === 'bob' ? Promise.reject(new Error('Already a member')) : Promise.resolve({})));
        await render('organization');
        await pick('bulk-users-org', 'acme');
        await run();
        expect(wrapper.find('.bulk-result').text()).toBe('Added to acme: 2 users. 1 failed: bob (Already a member).');
        expect(wrapper.emitted('close')).toBeUndefined();
    });
});
