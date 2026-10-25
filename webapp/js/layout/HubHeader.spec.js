import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import PrimeVue from 'primevue/config';

const h = vi.hoisted(() => ({
    reg: null,
    auth: null
}));
vi.mock('@/libs/api/sharedRegistry', () => {
    h.reg = {
        isLoggedIn: () => true,
        getUsername: () => 'admin',
        features: { get: () => false, value: () => null },
        Organization: () => ({ info: () => Promise.resolve({ isPublic: true }) }),
        storageInfo: () => Promise.resolve(null),
        sys: { updateInfo: null }
    };
    return { default: h.reg };
});
vi.mock('@/stores/auth', async () => {
    const { reactive } = await import('vue');
    h.auth = reactive({
        username: 'admin',
        isLoggedIn: true,
        isAdmin: true,
        featuresVersion: 0,
        flags: { updateCheckEnabled: true },
        feature(name) { return this.flags[name]; },
        logout() {}
    });
    return { useAuthStore: () => h.auth };
});

const { default: HubHeader } = await import('./HubHeader.vue');
const { resetUpdateCheck } = await import('@/composables/useUpdateCheck');

const AVAILABLE = { currentVersion: '2.0.0', latestVersion: '2.1.0', isUpdateAvailable: true, isSecurityUpdate: false, releaseNotes: 'Notes' };

let wrapper;
async function render(info = AVAILABLE) {
    h.reg.sys.updateInfo = vi.fn(() => Promise.resolve(info));
    wrapper = mount(HubHeader, {
        global: {
            plugins: [PrimeVue, createPinia()],
            mocks: { $route: { params: { org: 'acme', ds: 'site' } }, $router: { push: vi.fn() } },
            stubs: { UpdateNotesDialog: { props: ['info'], template: '<div class="notes-stub">{{ info.latestVersion }}</div>' }, Menu: true, ShareEmbed: true }
        }
    });
    await flushPromises();
    return wrapper;
}
const icon = () => wrapper.find('.update-available-btn');

beforeEach(() => {
    globalThis.HubOptions = {};
    setActivePinia(createPinia());
    resetUpdateCheck();
    h.auth.isLoggedIn = true;
    h.auth.isAdmin = true;
    h.auth.flags.updateCheckEnabled = true;
});
afterEach(() => wrapper?.unmount());

describe('HubHeader update indicator', () => {
    it('shows the icon to an admin when an update is available', async () => {
        await render();
        expect(icon().exists()).toBe(true);
        expect(icon().find('i').classes()).toContain('fa-circle-arrow-up');
        expect(icon().attributes('aria-label')).toBe("Registry 2.1.0 is available, show what's new");
        expect(icon().attributes('title')).toContain('Registry 2.1.0 is available (current: 2.0.0)');
    });

    it('sits right after the back-to-organization button', async () => {
        await render();
        const buttons = [...wrapper.find('.right').element.children].filter(el => el.tagName === 'BUTTON');
        const back = buttons.findIndex(b => b.getAttribute('title') === 'Back to organization');
        expect(back).toBeGreaterThanOrEqual(0);
        expect(buttons[back + 1].classList.contains('update-available-btn')).toBe(true);
    });

    it('is hidden when Registry is up to date', async () => {
        await render({ ...AVAILABLE, isUpdateAvailable: false });
        expect(icon().exists()).toBe(false);
    });

    it('is hidden, and nothing is requested, for a user who is not an admin', async () => {
        h.auth.isAdmin = false;
        await render();
        expect(icon().exists()).toBe(false);
        expect(h.reg.sys.updateInfo).not.toHaveBeenCalled();
    });

    it('requests nothing when the update check is off', async () => {
        h.auth.flags.updateCheckEnabled = false;
        await render();
        expect(icon().exists()).toBe(false);
        expect(h.reg.sys.updateInfo).not.toHaveBeenCalled();
    });

    it('asks again only when the feature flags arrive after the first render', async () => {
        h.auth.flags.updateCheckEnabled = false;
        await render();
        h.auth.flags.updateCheckEnabled = true;
        await flushPromises();
        expect(h.reg.sys.updateInfo).toHaveBeenCalledTimes(1);
        expect(icon().exists()).toBe(true);
    });

    it('stays silent when the server cannot be asked (no network, no icon, no error)', async () => {
        h.reg.sys.updateInfo = vi.fn(() => Promise.reject(new Error('offline')));
        wrapper = mount(HubHeader, {
            global: {
                plugins: [PrimeVue, createPinia()],
                mocks: { $route: { params: { org: 'acme', ds: 'site' } }, $router: { push: vi.fn() } },
                stubs: { UpdateNotesDialog: true, Menu: true, ShareEmbed: true }
            }
        });
        await flushPromises();
        expect(h.reg.sys.updateInfo).toHaveBeenCalledTimes(1);
        expect(icon().exists()).toBe(false);
    });

    it('hides the decorative icon from assistive technology', async () => {
        await render();
        expect(icon().find('i').attributes('aria-hidden')).toBe('true');
    });

    it('disappears on logout', async () => {
        await render();
        h.auth.isLoggedIn = false;
        await flushPromises();
        expect(icon().exists()).toBe(false);
    });

    it('opens the notes from the icon', async () => {
        await render();
        await icon().trigger('click');
        expect(wrapper.find('.notes-stub').text()).toBe('2.1.0');
    });
});
