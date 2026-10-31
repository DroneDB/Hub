import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';

// The routes that take a user name answer 403 to anyone but an administrator, as the Registry does
const forbidden = () => Promise.reject(Object.assign(new Error('Only administrators can perform this operation'), { status: 403 }));

const h = vi.hoisted(() => ({ reg: {} }));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: h.reg }));
vi.mock('@/libs/api/xauth', () => ({ xAuthLogout: vi.fn() }));

const { default: AccountPage } = await import('./AccountPage.vue');

let wrapper;
async function render() {
    wrapper = mount(AccountPage, {
        global: {
            plugins: [PrimeVue],
            stubs: { UploadDiagnostics: true, ChangePwdDialog: true },
            mocks: { $router: { push: vi.fn(() => Promise.resolve()) } }
        }
    });
    await flushPromises();
}
const item = (label) => wrapper.findAll('.info-item').find(i => i.find('dt').text() === label)?.find('dd').text();

function signIn({ admin }) {
    const name = admin ? 'admin' : 'docsdemo';
    Object.assign(h.reg, {
        getUsername: () => name,
        isAdmin: () => admin,
        features: { get: () => true },
        currentUser: vi.fn(() => Promise.resolve({
            userName: name, email: `${name}@example.com`, roles: admin ? ['admin'] : [],
            organizations: ['field-surveys', 'quarry']
        })),
        storageInfo: vi.fn(() => Promise.resolve({ used: 3 * 1024 * 1024, total: 10 * 1024 * 1024 })),
        admin: {
            getUserOrganizations: vi.fn(admin ? () => Promise.resolve([]) : forbidden),
            getUserStorageInfo: vi.fn(admin ? () => Promise.resolve({ used: 0, total: null }) : forbidden),
            usersDetailed: vi.fn(admin ? () => Promise.resolve([]) : forbidden)
        }
    });
}

beforeEach(() => {
    window.HubOptions = {};
});
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
});

describe.each([
    ['a user who is not an administrator', false],
    ['an administrator', true]
])('AccountPage for %s', (_, admin) => {
    beforeEach(() => signIn({ admin }));

    it('shows their own e-mail, organizations and storage, read from the routes of the signed-in user', async () => {
        await render();

        expect(item('Email')).toBe(`${admin ? 'admin' : 'docsdemo'}@example.com`);
        expect(item('Organizations')).toBe('2 organizations');
        expect(wrapper.find('.storage-details').text()).toContain('3 MB used');
        expect(wrapper.find('.storage-details').text()).toContain('of 10 MB');
        expect(wrapper.text()).not.toContain('Unlimited');
        expect(wrapper.find('.p-message').exists()).toBe(false);
    });

    it('never asks the administrator routes, which take a user name', async () => {
        await render();

        expect(h.reg.currentUser).toHaveBeenCalledTimes(1);
        expect(h.reg.storageInfo).toHaveBeenCalledTimes(1);
        expect(h.reg.admin.getUserOrganizations).not.toHaveBeenCalled();
        expect(h.reg.admin.getUserStorageInfo).not.toHaveBeenCalled();
        expect(h.reg.admin.usersDetailed).not.toHaveBeenCalled();
    });

    it(`${admin ? 'shows' : 'does not show'} the Administrator role`, async () => {
        await render();

        expect(item('Role')).toBe(admin ? 'Administrator' : undefined);
    });
});

describe('AccountPage', () => {
    beforeEach(() => signIn({ admin: false }));

    it('says when the account cannot be read, instead of showing an account without e-mail, organizations or storage', async () => {
        h.reg.currentUser = vi.fn(() => Promise.reject(new Error('Unauthorized')));
        await render();

        expect(wrapper.find('.p-message').text()).toContain('Unauthorized');
    });

    it('shows Unlimited for an account without a quota', async () => {
        h.reg.storageInfo = vi.fn(() => Promise.resolve({ used: 1024, total: null }));
        await render();

        expect(wrapper.find('.storage-details').text()).toContain('Unlimited');
    });
});
