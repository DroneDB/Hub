import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import PrimeVue from 'primevue/config';

vi.mock('@/libs/api/sharedRegistry', () => ({ default: { ensureLoggedIn: () => false } }));
vi.mock('@/libs/api/xauth', () => ({ xAuthAvailable: () => false, getXAuthToken: () => null }));

import LoginPage from './LoginPage.vue';

let wrapper;

function mountPage(hubOptions = {}) {
    globalThis.HubOptions = hubOptions;
    wrapper = mount(LoginPage, {
        global: {
            plugins: [PrimeVue],
            mocks: { $route: { query: {} }, $router: { replace: vi.fn() } }
        }
    });
    return wrapper;
}

beforeEach(() => setActivePinia(createPinia()));
afterEach(() => wrapper?.unmount());

describe('LoginPage signature', () => {
    // Searches for these exact words find public sign-in pages: a change here is a change of the fingerprint
    it('ends with the stable signature text linking dronedb.app', () => {
        const footer = mountPage().find('footer.login-signature');
        expect(footer.exists()).toBe(true);
        expect(footer.text().replace(/\s+/g, ' ')).toBe('Powered by DroneDB Registry');
        const link = footer.find('a');
        expect(link.attributes('href')).toBe('https://dronedb.app');
        expect(link.attributes('rel')).toBe('noopener');
    });

    it('keeps the signature on a branded deployment without the registration link', () => {
        const page = mountPage({ appName: 'Acme Maps', showRegistrationLink: false });
        expect(page.text()).not.toContain('register for free');
        expect(page.find('footer.login-signature').text().replace(/\s+/g, ' ')).toBe('Powered by DroneDB Registry');
    });
});
