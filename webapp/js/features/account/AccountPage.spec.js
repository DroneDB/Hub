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

    // FR-ACC-12, FR-ACC-17 (D-030)
    describe('storage quota', () => {
        const MB = 1024 * 1024;
        const showStorage = async (used, total) => {
            h.reg.storageInfo = vi.fn(() => Promise.resolve({ used, total }));
            await render();
        };
        const bar = () => wrapper.find('[role="progressbar"]');

        it('shows no progress bar for an unlimited storage, only the used size and Unlimited', async () => {
            await showStorage(0, null);
            expect(bar().exists()).toBe(false);
            expect(wrapper.find('.storage-details').text()).toBe('0 B usedUnlimited');
            expect(wrapper.find('.storage-percentage').exists()).toBe(false);
        });

        it('names the bar of a quota and gives its value as text', async () => {
            await showStorage(10 * MB, 40 * MB);
            expect(bar().attributes('aria-label')).toBe('Storage used');
            expect(bar().attributes('aria-valuetext')).toBe('25% of 40 MB used');
            expect(wrapper.find('.storage-percentage').text()).toBe('25% used');
            expect(wrapper.find('.storage-bar-container .p-message').exists()).toBe(false);
        });

        it('warns near the limit in amber (90 %)', async () => {
            await showStorage(36 * MB, 40 * MB);
            expect(wrapper.find('.storage-percentage').attributes('style')).toContain('var(--ddb-warning)');
            const message = wrapper.find('.storage-bar-container .p-message');
            expect(message.classes()).toContain('p-message-warn');
            expect(message.text()).toBe('Storage is almost full: 90% of 40 MB used.');
        });

        it('shows 130 % and an error message when the user is over the quota; the bar stops at 100', async () => {
            await showStorage(52 * MB, 40 * MB);
            expect(wrapper.find('.storage-percentage').text()).toBe('130% used');
            expect(wrapper.find('.storage-percentage').attributes('style')).toContain('var(--ddb-danger)');
            expect(bar().attributes('aria-valuenow')).toBe('100');
            const message = wrapper.find('.storage-bar-container .p-message');
            expect(message.classes()).toContain('p-message-error');
            expect(message.text()).toContain('Storage quota reached: 52 MB used of 40 MB');
        });
    });

    it('signs out only from the Logout button, not from a click on the Session card', async () => {
        h.reg.logout = vi.fn();
        await render();
        const card = wrapper.findAll('.account-card').find(c => c.text().includes('Session'));
        await card.find('.action-row .main').trigger('click');
        await card.trigger('click');
        expect(h.reg.logout).not.toHaveBeenCalled();

        await card.findAll('button').find(b => b.text().includes('Logout')).trigger('click');
        await flushPromises();
        expect(h.reg.logout).toHaveBeenCalledTimes(1);
    });

    it('opens Change Password only from its button, not from a click on the Security card', async () => {
        await render();
        const card = wrapper.findAll('.account-card').find(c => c.text().includes('Security'));
        await card.trigger('click');
        expect(wrapper.vm.showChangePwd).toBe(false);
        await card.findAll('button').find(b => b.text().includes('Change Password')).trigger('click');
        expect(wrapper.vm.showChangePwd).toBe(true);
    });
});
