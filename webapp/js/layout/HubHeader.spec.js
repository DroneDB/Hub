import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import PrimeVue from 'primevue/config';
import { reactive } from 'vue';

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
        notificationStatus: () => Promise.resolve({ canReceiveEmail: true, reason: null }),
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

// The window under test is the real one; the store that syncs it with the account is not the subject here
vi.mock('@/stores/preferences', async () => {
    const { reactive } = await import('vue');
    const store = reactive({ status: 'idle', resetSection() {}, resetAll() {} });
    return { usePreferencesStore: () => store };
});
const xauth = vi.hoisted(() => ({ logout: vi.fn(() => Promise.resolve()) }));
vi.mock('@/libs/api/xauth', async importOriginal => ({ ...(await importOriginal()), xAuthLogout: () => xauth.logout() }));

const { default: HubHeader } = await import('./HubHeader.vue');
const { resetUpdateCheck } = await import('@/composables/useUpdateCheck');
const { replaceQueryKeys, replaceHash } = await import('@/libs/routeQuery');

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

describe('HubHeader user menu: Preferences', () => {
    let push;
    beforeEach(() => {
        h.reg.features.get = () => false;
        h.auth.isAdmin = false;
        push = vi.fn();
    });

    async function menuItems({ accountManagement, loggedIn = true }) {
        h.reg.features.get = () => accountManagement;
        h.auth.isLoggedIn = loggedIn;
        h.reg.sys.updateInfo = vi.fn(() => Promise.resolve(AVAILABLE));
        wrapper = mount(HubHeader, {
            global: {
                plugins: [PrimeVue, createPinia()],
                mocks: { $route: { params: {}, fullPath: '/r' }, $router: { push } },
                stubs: { UpdateNotesDialog: true, Menu: true, ShareEmbed: true }
            },
            attachTo: document.body
        });
        await flushPromises();
        return wrapper.vm.userMenuItems;
    }
    const labels = items => items.filter(i => !i.separator).map(i => i.label);

    it('is there for a local user, right after My Account', async () => {
        const items = await menuItems({ accountManagement: true });
        const names = labels(items);
        expect(names).toContain('My Account');
        expect(names.indexOf('Preferences')).toBe(names.indexOf('My Account') + 1);
        expect(items.find(i => i.label === 'Preferences').icon).toBe('fa-solid fa-sliders');
    });

    it('is there for an LDAP / remote user, who has no My Account', async () => {
        const items = await menuItems({ accountManagement: false });
        expect(labels(items)).toContain('Preferences');
        expect(labels(items)).not.toContain('My Account');
        // a separator precedes it, so it is not glued to the storage entries
        const at = items.findIndex(i => i.label === 'Preferences');
        expect(items[at - 1].separator).toBe(true);
    });

    it('is there for an admin too', async () => {
        h.auth.isAdmin = true;
        const items = await menuItems({ accountManagement: false });
        expect(labels(items)).toContain('Preferences');
    });

    it('is absent when logged out', async () => {
        const items = await menuItems({ accountManagement: true, loggedIn: false });
        expect(labels(items)).not.toContain('Preferences');
    });

    describe('window', () => {
        const preferencesWindow = () => document.body.querySelector('#preferencesDialog');
        async function openIt() {
            const items = await menuItems({ accountManagement: false });
            items.find(i => i.label === 'Preferences').command();
            await loaded();
        }
        // The window is a lazy chunk: the import resolves after a few turns of the event loop
        const loaded = () => vi.waitFor(() => expect(preferencesWindow()).not.toBeNull());
        beforeEach(() => { wrapper = null; });
        afterEach(() => { wrapper?.unmount(); wrapper = null; document.body.innerHTML = ''; });

        it('opens from the menu item, without leaving the page', async () => {
            const items = await menuItems({ accountManagement: false });
            expect(preferencesWindow()).toBeNull();
            items.find(i => i.label === 'Preferences').command();
            await loaded();
            expect(preferencesWindow().querySelector('#pref-measurement-units')).not.toBeNull();
            expect(push).not.toHaveBeenCalled();
        });

        it('closes with its Close button', async () => {
            await openIt();
            [...preferencesWindow().querySelectorAll('button')].find(b => b.textContent.includes('Close')).click();
            await flushPromises();
            expect(preferencesWindow()).toBeNull();
            expect(wrapper.vm.preferencesOpen).toBe(false);
        });

        it('closes on logout', async () => {
            await openIt();
            expect(preferencesWindow()).not.toBeNull();
            h.auth.isLoggedIn = false;
            await flushPromises();
            expect(preferencesWindow()).toBeNull();
            expect(wrapper.vm.preferencesOpen).toBe(false);
        });
    });
});

describe('HubHeader: a link to the Preferences window', () => {
    const preferencesWindow = () => document.body.querySelector('#preferencesDialog');
    const selectedTab = () => preferencesWindow()?.querySelector('[role="tab"][aria-selected="true"]')?.textContent.trim();
    let replace;
    let push;

    // The address bar of a navigation to `path` with `query`
    const goTo = (path, query) => {
        const search = new URLSearchParams(query).toString();
        window.history.replaceState({}, '', `${path}${search ? `?${search}` : ''}`);
    };

    async function land(query, { loggedIn = true, path = '/r' } = {}) {
        h.auth.isLoggedIn = loggedIn;
        h.auth.isAdmin = false;
        h.auth.flags.emailEnabled = true;
        h.reg.sys.updateInfo = vi.fn(() => Promise.resolve(AVAILABLE));
        replace = vi.fn(() => Promise.resolve());
        push = vi.fn(() => Promise.resolve());
        goTo(path, query);
        const route = reactive({ params: {}, path, fullPath: path, hash: '', query });
        wrapper = mount(HubHeader, {
            global: {
                plugins: [PrimeVue, createPinia()],
                mocks: { $route: route, $router: { push, replace } },
                stubs: { UpdateNotesDialog: true, Menu: true, ShareEmbed: true }
            },
            attachTo: document.body
        });
        await flushPromises();
        return route;
    }
    beforeEach(() => { wrapper = null; });
    afterEach(() => {
        wrapper?.unmount();
        wrapper = null;
        document.body.innerHTML = '';
        delete h.auth.flags.emailEnabled;
    });

    it('opens the window on the tab it names and removes the query, keeping the others', async () => {
        await land({ preferences: 'notifications', q: 'x' });
        await vi.waitFor(() => expect(preferencesWindow()).not.toBeNull());
        await vi.waitFor(() => expect(selectedTab()).toBe('Notifications'));
        expect(replace).toHaveBeenCalledWith({ path: '/r', query: { q: 'x' }, hash: '' });
    });

    it('opens the window on its first tab for an empty or unknown tab', async () => {
        await land({ preferences: 'nonsense' });
        await vi.waitFor(() => expect(selectedTab()).toBe('Units'));
        expect(replace).toHaveBeenCalledTimes(1);
    });

    it('does nothing for an anonymous user (the router guard signs them in first)', async () => {
        await land({ preferences: 'notifications' }, { loggedIn: false });
        expect(wrapper.vm.preferencesOpen).toBe(false);
        expect(replace).not.toHaveBeenCalled();
    });

    it('opens the window once the user is signed in and back on the link', async () => {
        const route = await land({}, { loggedIn: false });
        h.auth.isLoggedIn = true;
        goTo('/r', { preferences: 'notifications' });
        route.query = { preferences: 'notifications' };
        await flushPromises();
        await vi.waitFor(() => expect(selectedTab()).toBe('Notifications'));
        expect(replace).toHaveBeenCalled();
    });

    it('removes the query from the address as it is now, keeping what a map wrote without a navigation', async () => {
        const path = '/r/o/d/view/abc/map';
        const route = await land({ t: 'map' }, { path });
        // The map adds its layers and Plant Health its hash without a navigation, so the route
        // still has the query it was opened with
        replaceQueryKeys({ layer: ['a', 'b'], preferences: 'stockpiles' });
        replaceHash('path=f.tif');
        route.query = { t: 'map', preferences: 'stockpiles' };
        // As on the navigation that adds the query
        wrapper.vm.openPreferencesFromLink();
        expect(wrapper.vm.preferencesOpen).toBe(true);
        expect(replace).toHaveBeenCalledWith({ path, query: { t: 'map', layer: ['a', 'b'] }, hash: '#path=f.tif' });
    });

    it('signs in coming back to the address as it is now', async () => {
        const path = '/r/o/d/view/abc/map';
        await land({ t: 'map' }, { path, loggedIn: false });
        replaceQueryKeys({ layer: ['a'] });
        wrapper.vm.login();
        expect(push).toHaveBeenCalledWith({ name: 'Login', query: { redirect: `${path}?t=map&layer=a` } });
    });

    it('does not open the window without the query', async () => {
        await land({});
        expect(wrapper.vm.preferencesOpen).toBe(false);
        expect(replace).not.toHaveBeenCalled();
    });
});

describe('HubHeader accessible names', () => {
    it('names the icon-only buttons of a dataset', async () => {
        await render();
        const { useDatasetSessionStore } = await import('@/stores/datasetSession');
        useDatasetSessionStore(wrapper.vm.$pinia).activeTab = 'explorer';
        await flushPromises();
        expect(wrapper.find('[aria-label="Settings"]').exists()).toBe(true);
        expect(wrapper.find('[aria-label="Download"]').attributes('title')).toBe('Download');
    });

    it('says what the number of the storage row is', async () => {
        await render();
        const storageRow = () => wrapper.vm.userMenuItems.find(i => i.icon === 'fa-regular fa-hard-drive');
        const nameOf = item => wrapper.vm.userMenuPt.item({ context: { item } })['aria-label'];

        wrapper.vm.storageInfo = { total: 10737418240, used: 1073741824, usedPercentage: 0.1, free: 9663676416 };
        expect(nameOf(storageRow())).toBe(`Storage: ${storageRow().label} used`);
        expect(storageRow().label).toMatch(/%/);

        wrapper.vm.storageInfo = { total: 10737418240, used: 0 };
        expect(nameOf(storageRow())).toBe(`Storage: ${storageRow().label} total, none used`);

        // The other rows keep their label as their name
        expect(wrapper.vm.userMenuPt.item({ context: { item: { label: 'Logout' } } })).toEqual({});
    });
});

// FR-ACC-01 / FR-XC-05: an anonymous visitor of a shared dataset of a private organization
describe('HubHeader back-to-organization look-up', () => {
    const backButton = () => wrapper.find('button[title="Back to organization"]');
    let original;
    beforeEach(() => { original = h.reg.Organization; });
    afterEach(() => { h.reg.Organization = original; });

    async function renderWith(info, { loggedIn = false } = {}) {
        h.auth.isLoggedIn = loggedIn;
        h.auth.isAdmin = false;
        h.reg.Organization = vi.fn(() => ({ info }));
        h.reg.sys.updateInfo = vi.fn(() => Promise.resolve(AVAILABLE));
        const push = vi.fn();
        const replace = vi.fn();
        wrapper = mount(HubHeader, {
            global: {
                plugins: [PrimeVue, createPinia()],
                mocks: { $route: { params: { org: 'acme', ds: 'site' }, query: {} }, $router: { push, replace } },
                stubs: { UpdateNotesDialog: true, Menu: true, ShareEmbed: true }
            }
        });
        await flushPromises();
        return { push, replace };
    }

    it('asks for the organization without the global 401 handler', async () => {
        const info = vi.fn(() => Promise.resolve({ isPublic: true }));
        await renderWith(info, { loggedIn: true });
        expect(h.reg.Organization).toHaveBeenCalledWith('acme');
        expect(info).toHaveBeenCalledWith({ skipUnauthorized: true });
        expect(backButton().exists()).toBe(true);
    });

    it.each([401, 403])('hides the button and does not navigate when the look-up answers %i', async status => {
        const { ApiError } = await import('@/libs/ddb/apiError');
        const info = vi.fn(() => Promise.reject(new ApiError('No access', status)));
        const { push, replace } = await renderWith(info);
        expect(info).toHaveBeenCalledWith({ skipUnauthorized: true });
        expect(wrapper.vm.showBackToOrg).toBe(false);
        expect(backButton().exists()).toBe(false);
        expect(push).not.toHaveBeenCalled();
        expect(replace).not.toHaveBeenCalled();
    });
});

describe('HubHeader logout', () => {
    let router;
    let view;
    // Whether the session was there when Login showed (Login sends a signed-in user back)
    let signedInAtLogin;
    // The answer of the page's leave guard (unsaved edits)
    let pageLets;

    async function signedInOnAPage({ loginFails = false } = {}) {
        const vueRouter = await import('vue-router');
        const { defineComponent, h: render } = await import('vue');
        const Page = defineComponent({ beforeRouteLeave: () => pageLets, render: () => render('div', 'page') });
        const Login = defineComponent({ setup() { signedInAtLogin = h.auth.isLoggedIn; }, render: () => render('div', 'login') });
        router = vueRouter.createRouter({
            history: vueRouter.createMemoryHistory(),
            routes: [
                { path: '/r/acme/site', component: Page },
                // A lazy page whose code cannot be loaded (offline, a deployment replaced the chunks)
                { path: '/login', name: 'Login', component: loginFails ? () => Promise.reject(new Error('Loading chunk auth failed')) : Login }
            ]
        });
        await router.push('/r/acme/site');
        window.history.replaceState({}, '', '/r/acme/site');
        view = mount({ template: '<RouterView />' }, { global: { plugins: [router] } });
        h.reg.sys.updateInfo = vi.fn(() => Promise.resolve({ ...AVAILABLE, isUpdateAvailable: false }));
        wrapper = mount(HubHeader, {
            global: {
                plugins: [PrimeVue, createPinia()],
                mocks: { $route: { params: { org: 'acme', ds: 'site' } }, $router: router },
                stubs: { UpdateNotesDialog: true, Menu: true, ShareEmbed: true }
            }
        });
        await flushPromises();
    }

    beforeEach(() => {
        signedInAtLogin = undefined;
        pageLets = true;
        xauth.logout.mockClear();
        h.auth.logout = vi.fn(() => { h.auth.isLoggedIn = false; });
    });
    afterEach(() => {
        view?.unmount();
        h.auth.logout = () => {};
    });

    it('goes to Login first and ends the session before Login shows', async () => {
        await signedInOnAPage();
        await wrapper.vm.logout();
        await flushPromises();
        expect(router.currentRoute.value.name).toBe('Login');
        expect(router.currentRoute.value.query).toEqual({ redirect: '/r/acme/site' });
        expect(h.auth.logout).toHaveBeenCalledTimes(1);
        expect(signedInAtLogin).toBe(false);
        expect(xauth.logout).toHaveBeenCalledTimes(1);
    });

    it('keeps the session (and the page) when the page cancels the navigation', async () => {
        await signedInOnAPage();
        pageLets = false;
        await wrapper.vm.logout();
        await flushPromises();
        expect(router.currentRoute.value.path).toBe('/r/acme/site');
        expect(h.auth.logout).not.toHaveBeenCalled();
        expect(xauth.logout).not.toHaveBeenCalled();
        expect(h.auth.isLoggedIn).toBe(true);
    });

    it('ends the session all the same when Login cannot be reached (an error, not a guard)', async () => {
        await signedInOnAPage({ loginFails: true });
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        await wrapper.vm.logout();
        await flushPromises();
        expect(h.auth.logout).toHaveBeenCalledTimes(1);
        expect(h.auth.isLoggedIn).toBe(false);
        expect(xauth.logout).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledWith('Logout error:', 'Loading chunk auth failed');
        warn.mockRestore();
    });

    it('does not end the session on another navigation that comes while the page asks', async () => {
        await signedInOnAPage();
        let release;
        pageLets = new Promise(resolve => { release = resolve; });
        const loggingOut = wrapper.vm.logout();
        await flushPromises();
        router.addRoute({ path: '/r/acme', component: { render: () => null } });
        const other = router.push('/r/acme');
        release(true);
        await other;
        await loggingOut;
        await flushPromises();
        expect(router.currentRoute.value.path).toBe('/r/acme');
        expect(h.auth.logout).not.toHaveBeenCalled();
    });
});
