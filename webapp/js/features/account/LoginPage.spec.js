/**
 * LoginPage and the one-shot notice of FR-XC-13: an expired session says why (FR-ACC-09), and
 * the landing after sign-in is the page that asked, or home (FR-NAV-06), without the notice.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import PrimeVue from 'primevue/config';

vi.mock('@/libs/api/sharedRegistry', () => ({
    default: { ensureLoggedIn: () => false, isLoggedIn: () => false, getUsername: () => null, isAdmin: () => false, addEventListener() { } }
}));

const { default: LoginPage } = await import('./LoginPage.vue');

let wrapper;
let replace;
async function render(query) {
    replace = vi.fn(() => Promise.resolve());
    wrapper = mount(LoginPage, {
        global: {
            plugins: [PrimeVue, createPinia()],
            mocks: { $route: { name: 'Login', query }, $router: { replace } }
        }
    });
    await flushPromises();
}
afterEach(() => {
    wrapper?.unmount();
    globalThis.HubOptions = {};
});

describe('LoginPage notice', () => {
    it('says the session has expired', async () => {
        globalThis.HubOptions = {};
        await render({ redirect: '/account', notice: 'expired' });
        const message = wrapper.find('.login-notice');
        expect(message.exists()).toBe(true);
        expect(message.text()).toBe('Your session has expired. Please sign in again.');
    });

    it('says nothing without the notice, or for another notice', async () => {
        globalThis.HubOptions = {};
        await render({ redirect: '/account' });
        expect(wrapper.find('.login-notice').exists()).toBe(false);
        wrapper.unmount();
        await render({ notice: 'denied:Users' });
        expect(wrapper.find('.login-notice').exists()).toBe(false);
    });
});

describe('LoginPage after sign-in', () => {
    it('returns to the page that asked, without a notice', async () => {
        globalThis.HubOptions = {};
        await render({ redirect: '/account?notice=expired&tab=2', notice: 'expired' });
        wrapper.vm.redirectAfterLogin();
        expect(replace).toHaveBeenCalledWith('/account?tab=2');
    });

    it('goes home otherwise', async () => {
        globalThis.HubOptions = {};
        await render({});
        wrapper.vm.redirectAfterLogin();
        expect(replace).toHaveBeenCalledWith({ name: 'Organizations' });
        wrapper.unmount();
        globalThis.HubOptions = { singleOrganization: 'acme' };
        await render({ redirect: '//evil.example' });
        wrapper.vm.redirectAfterLogin();
        expect(replace).toHaveBeenCalledWith({ name: 'Datasets', params: { org: 'acme' } });
    });
});
