import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import PrimeVue from 'primevue/config';
import { reactive } from 'vue';
import ddb from 'ddb';

const h = vi.hoisted(() => ({
    reg: null,
    auth: null,
    download: null
}));
// What the download does is not the subject here: that it starts, or asks first, and with what
vi.mock('@/libs/datasetDownloads', async importOriginal => {
    h.download = vi.fn(() => Promise.resolve());
    return { ...(await importOriginal()), downloadFromDataset: h.download };
});
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
const { useDatasetSessionStore } = await import('@/stores/datasetSession');
const { explorerTools } = await import('@/libs/dataset/explorerTools');
const { actionMenuItem } = await import('@/libs/dataset/explorerActions');

const AVAILABLE = { currentVersion: '2.0.0', latestVersion: '2.1.0', isUpdateAvailable: true, isSecurityUpdate: false, releaseNotes: 'Notes' };

let wrapper;
// The entries of the user menu, its groups opened (libs/userMenuItems.js)
const flatMenu = items => items.flatMap(item => (item.items ? flatMenu(item.items) : [item]));
async function render(info = AVAILABLE, provide = {}) {
    h.reg.sys.updateInfo = vi.fn(() => Promise.resolve(info));
    wrapper = mount(HubHeader, {
        global: {
            provide,
            plugins: [PrimeVue, createPinia()],
            mocks: { $route: { params: { org: 'acme', ds: 'site' } }, $router: { push: vi.fn() } },
            stubs: { UploadIndicator: true, RouterLink: RouterLinkStub, UpdateNotesDialog: { props: ['info'], template: '<div class="notes-stub">{{ info.latestVersion }}</div>' }, Menu: true, ShareEmbed: true }
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

    it('is the first button of the actions, before the dataset actions and the user menu', async () => {
        await render();
        const buttons = [...wrapper.find('.right').element.children].filter(el => el.tagName === 'BUTTON');
        expect(buttons[0].classList.contains('update-available-btn')).toBe(true);
    });

    it('has the upload indicator of the dataset page uploads (FR-UPL-04)', async () => {
        await render();
        expect(wrapper.find('.right upload-indicator-stub').exists()).toBe(true);
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
                stubs: { UploadIndicator: true, RouterLink: RouterLinkStub, UpdateNotesDialog: true, Menu: true, ShareEmbed: true }
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
                stubs: { UploadIndicator: true, RouterLink: RouterLinkStub, UpdateNotesDialog: true, Menu: true, ShareEmbed: true }
            },
            attachTo: document.body
        });
        await flushPromises();
        return flatMenu(wrapper.vm.userMenuItems);
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
        // it is in the Account group, which names it
        const account = wrapper.vm.userMenuItems.find(i => i.label === 'Account');
        expect(account.items.map(i => i.label)).toContain('Preferences');
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
        // The window is a lazy chunk. Its first import transforms the SFC and its dependencies, which can take
        // seconds when the whole suite runs in parallel: load it once, up front, with a generous hook timeout,
        // so that the tests only wait for the (then cached) async component to render.
        beforeAll(async () => { await import('@/features/account/PreferencesDialog.vue'); }, 60000);
        const loaded = () => vi.waitFor(() => expect(preferencesWindow()).not.toBeNull(), { timeout: 5000, interval: 10 });
        beforeEach(() => { wrapper = null; });
        afterEach(() => { wrapper?.unmount(); wrapper = null; document.body.innerHTML = ''; });

        it('opens from the menu item, without leaving the page', { timeout: 20000 }, async () => {
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
                stubs: { UploadIndicator: true, RouterLink: RouterLinkStub, UpdateNotesDialog: true, Menu: true, ShareEmbed: true }
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
        // Nothing selected: the whole dataset (FR-EXP-27)
        expect(wrapper.find('[aria-label="Download entire dataset"]').attributes('title')).toBe('Download entire dataset');
    });

    it('offers no Download, Share or Settings on a dataset that did not load (FR-ACC-18)', async () => {
        await render();
        const { useDatasetSessionStore } = await import('@/stores/datasetSession');
        const session = useDatasetSessionStore(wrapper.vm.$pinia);
        session.activeTab = 'explorer';
        session.setSelectedFiles([{ path: 'ddb://acme/site/a.tif' }]);
        session.setUnavailable(true);
        await flushPromises();
        expect(wrapper.find('[aria-label="Settings"]').exists()).toBe(false);
        expect(wrapper.find('[aria-label="Download"]').exists()).toBe(false);
        expect(wrapper.find('[aria-label="Share/Embed"]').exists()).toBe(false);
        session.setUnavailable(false);
        await flushPromises();
        expect(wrapper.find('[aria-label="Settings"]').exists()).toBe(true);
        expect(wrapper.find('[aria-label="Download"]').exists()).toBe(true);
    });

    it('is the banner landmark, with its actions in the Main navigation (FR-NAV-02)', async () => {
        await render();
        expect(wrapper.element.tagName).toBe('HEADER');
        expect(wrapper.find('nav[aria-label="Main"]').exists()).toBe(true);
    });

    // FR-ACC-11: every shape of the storage has a row with a text and the one command, to open the Storage Info
    it('gives the storage row a text that says what it is, and the command that opens the Storage Info, for each shape', async () => {
        await render();
        const MB = 1024 * 1024;
        const storageRow = () => flatMenu(wrapper.vm.userMenuItems).find(i => i.icon === 'fa-regular fa-hard-drive');

        for (const [info, label] of [
            [{ total: 40 * MB, used: 5 * MB, usedPercentage: 0.125 }, 'Storage: 5 MB of 40 MB · 12.5%'],
            [{ total: 40 * MB, used: 0 }, 'Storage: 0 B of 40 MB'],
            [{ total: null, used: 190.86 * MB }, 'Storage: 190.86 MB used · Unlimited'],
            [{ total: null, used: 0 }, 'Storage: 0 B used · Unlimited']
        ]) {
            wrapper.vm.storageInfo = info;
            wrapper.vm.storageInfoDialogOpen = false;
            expect(storageRow().label).toBe(label);
            expect(wrapper.vm.userMenuPt.item({ context: { item: storageRow() } })).toEqual({});
            storageRow().command();
            expect(wrapper.vm.storageInfoDialogOpen).toBe(true);
        }

        // The other rows keep their label as their name
        expect(wrapper.vm.userMenuPt.item({ context: { item: { label: 'Logout' } } })).toEqual({});
    });

    it('colours the storage row amber from 90 % and red from 100 % (D-030)', async () => {
        await render();
        const labelPt = used => {
            wrapper.vm.storageInfo = { total: 100, used };
            const row = flatMenu(wrapper.vm.userMenuItems).find(i => i.icon === 'fa-regular fa-hard-drive');
            return wrapper.vm.userMenuPt.itemLabel({ context: { item: row } });
        };
        expect(labelPt(89)).toEqual({});
        expect(labelPt(90).style.color).toBe('var(--ddb-warning)');
        expect(labelPt(130).style.color).toBe('var(--ddb-danger)');
    });

    it('shows the Storage Info of an unlimited storage as text, without a bar, and of a quota with the real percentage', async () => {
        await render();
        const MB = 1024 * 1024;
        wrapper.vm.storageInfo = { total: null, used: 3 * MB };
        wrapper.vm.storageInfoDialogOpen = true;
        await flushPromises();
        expect(document.body.textContent).toContain('3 MB used · Unlimited');
        expect(document.body.querySelector('.storage-info-content [role="progressbar"]')).toBeNull();

        wrapper.vm.storageInfo = { total: 40 * MB, used: 52 * MB };
        await flushPromises();
        const bar = document.body.querySelector('.storage-info-content [role="progressbar"]');
        expect(bar.getAttribute('aria-label')).toBe('Storage used');
        expect(document.body.querySelector('.storage-percentage').textContent.trim()).toBe('130%');
        expect(document.body.textContent).toContain('Storage quota reached');
    });

    // FR-ACC-20: the avatar button says what it opens and whether it is open
    it('names the user menu button "Account menu for <user>", and aria-expanded follows the menu', async () => {
        await render();
        const button = () => wrapper.find('.user-menu-button');
        expect(button().attributes('aria-label')).toBe('Account menu for admin');
        expect(button().attributes('aria-expanded')).toBe('false');
        const menu = wrapper.findComponent({ name: 'Menu' });
        menu.vm.$emit('show');
        await flushPromises();
        expect(button().attributes('aria-expanded')).toBe('true');
        menu.vm.$emit('hide');
        await flushPromises();
        expect(button().attributes('aria-expanded')).toBe('false');
    });

    it('gives the focus back to the button when the menu closes with the focus inside it (Tab), and leaves it elsewhere', async () => {
        await render();
        const button = wrapper.find('.user-menu-button').element;
        const list = document.createElement('ul');
        const item = document.createElement('li');
        item.tabIndex = 0;
        list.appendChild(item);
        document.body.appendChild(list);
        // The header in the document, so that its button can have the focus
        document.body.appendChild(wrapper.element);
        // The popup's element, as the PrimeVue Menu exposes it
        wrapper.findComponent({ name: 'Menu' }).vm.container = list;

        item.focus();
        wrapper.findComponent({ name: 'Menu' }).vm.$emit('hide');
        expect(document.activeElement).toBe(button);

        // A menu closed by a click elsewhere keeps the focus where the user put it
        const other = document.createElement('input');
        document.body.appendChild(other);
        other.focus();
        wrapper.findComponent({ name: 'Menu' }).vm.$emit('hide');
        expect(document.activeElement).toBe(other);
        list.remove();
        other.remove();
    });

    // FR-NAV-08
    it('shows an administrator System health and the running versions in the menu, from the provided versions', async () => {
        await render(AVAILABLE, { versions: { registryVersion: '2.7.1', hubVersion: '2.7.0', ddbVersion: '2.2.0' } });
        const admin = wrapper.vm.userMenuItems.find(i => i.label === 'Administration').items;
        expect(admin.find(i => i.label === 'System health')).toMatchObject({ url: '/health', target: '_blank' });
        expect(admin.find(i => i.disabled)).toMatchObject({ label: 'Registry 2.7.1 · Hub 2.7.0 · ddb 2.2.0' });
    });

    it('has no System health or version line for a user who is not an administrator', async () => {
        h.auth.isAdmin = false;
        await render(AVAILABLE, { versions: { registryVersion: '2.7.1' } });
        expect(flatMenu(wrapper.vm.userMenuItems).map(i => i.label)).not.toContain('System health');
        expect(JSON.stringify(wrapper.vm.userMenuItems)).not.toContain('2.7.1');
    });
});

// FR-XC-14: Download, Share/Embed and Settings are actions of the explorer's registry
describe('HubHeader dataset actions', () => {
    const tif = { path: 'ddb://acme/site/a.tif', entry: { path: 'a.tif', type: ddb.entry.type.GEORASTER } };
    const jpg = { path: 'ddb://acme/site/b.jpg', entry: { path: 'b.jpg', type: ddb.entry.type.IMAGE } };
    const button = label => wrapper.find(`button[aria-label="${label}"]`);

    async function onDataset({ canWrite = true, selected = [tif] } = {}) {
        await render();
        const session = useDatasetSessionStore(wrapper.vm.$pinia);
        session.activeTab = 'explorer';
        session.setCanWrite(canWrite);
        session.setSelectedFiles(selected);
        await flushPromises();
        return session;
    }

    describe.each([['writer', true], ['reader', false]])('for a %s', (_, canWrite) => {
        it('has the labels, icons, permissions and enabled state of the toolbar and the menu', async () => {
            await onDataset({ canWrite });
            const ctx = { getSelectedEntries: () => [tif], canWrite, emit: vi.fn() };
            const share = explorerTools(ctx).find(t => t.id === 'share-embed');
            expect(share).toBeDefined();
            expect(button(share.title).exists()).toBe(true);
            expect(button(share.title).find('i').classes()).toEqual(expect.arrayContaining(share.icon.split(' ')));
            const download = actionMenuItem('download', ctx);
            expect(download.isVisible()).toBe(true);
            expect(button(download.label).exists()).toBe(true);
            expect(button(download.label).find('i').classes()).toEqual(expect.arrayContaining(download.icon.split(' ')));
            expect(button(download.label).attributes('aria-disabled')).toBe(download.isEnabled() ? undefined : 'true');
            // The settings window is read-only for a reader
            expect(button('Settings').exists()).toBe(true);
        });
    });

    it('shows Share/Embed only for one item, like the menu, and counts the files Download takes', async () => {
        const session = await onDataset({ selected: [tif, jpg] });
        const ctx = { getSelectedEntries: () => [tif, jpg], canWrite: true, emit: vi.fn() };
        expect(actionMenuItem('share-embed', ctx).isVisible()).toBe(false);
        expect(button('Share/Embed').exists()).toBe(false);
        expect(button('Download').find('.ms-1').text()).toBe('2');
        session.setSelectedFiles([]);
        await flushPromises();
        expect(button('Share/Embed').exists()).toBe(false);
        expect(button('Download entire dataset').attributes('title')).toBe('Download entire dataset');
    });

    it('keeps Download in place, disabled with its reason, while an archive is prepared', async () => {
        const session = await onDataset();
        session.setActiveBulkDownload(true);
        await flushPromises();
        const download = button('Download');
        expect(download.attributes('aria-disabled')).toBe('true');
        expect(download.attributes('title')).toBe('Download: A download archive is being prepared. Please wait for it to complete.');
        expect(wrapper.find(`#${download.attributes('aria-describedby')}`).text()).toContain('A download archive is being prepared');
        await download.trigger('click');
        expect(wrapper.vm.downloadConfirmOpen).toBe(false);
    });

    it('runs the action of the registry: Share/Embed opens the window, Settings asks the page', async () => {
        const session = await onDataset();
        await button('Share/Embed').trigger('click');
        expect(wrapper.vm.shareFile).toStrictEqual(tif);
        await button('Settings').trigger('click');
        expect(session.settingsRequests).toBe(1);
    });

    // FR-EXP-27: one file downloads at once; several items, a folder or the dataset ask, with their size
    describe('Download', () => {
        const sized = (name, size) => ({ path: `ddb://acme/site/${name}`, entry: { path: name, type: ddb.entry.type.IMAGE, size } });
        const folder = { path: 'ddb://acme/site/newdir', entry: { path: 'newdir', type: ddb.entry.type.DIRECTORY, size: 0 } };
        const dialog = () => wrapper.findComponent({ name: 'ConfirmDialog' });
        let search;
        beforeEach(() => {
            h.download.mockClear();
            search = vi.fn(() => Promise.resolve([]));
            h.reg.Organization = () => ({ info: () => Promise.resolve({ isPublic: true }), Dataset: () => ({ name: 'site', search }) });
        });

        it('starts at once, without a question, for one file', async () => {
            await onDataset({ selected: [{ path: 'ddb://h/acme/site/sub/b.jpg', entry: jpg.entry }] });
            await button('Download').trigger('click');
            await flushPromises();
            expect(wrapper.vm.downloadConfirmOpen).toBe(false);
            expect(dialog().exists()).toBe(false);
            expect(h.download).toHaveBeenCalledTimes(1);
            expect(h.download.mock.calls[0][0].paths).toEqual(['sub/b.jpg']);
        });

        it('asks for several files with their count and total size, and downloads on Download only', async () => {
            await onDataset({ selected: [sized('a.jpg', 1048576), sized('b.jpg', 2097152)] });
            await button('Download').trigger('click');
            await flushPromises();
            expect(dialog().exists()).toBe(true);
            expect(dialog().props('message')).toBe('Download 2 files (3 MB) as a ZIP?');
            expect(h.download).not.toHaveBeenCalled();
            await dialog().vm.$emit('close', 'confirm');
            await flushPromises();
            expect(h.download).toHaveBeenCalledTimes(1);
        });

        it('asks for a folder with "Calculating size…", then its total size, and stops reading it on Cancel', async () => {
            let found;
            search.mockImplementation(() => new Promise(resolve => { found = resolve; }));
            await onDataset({ selected: [folder, sized('a.jpg', 1048576)] });
            await button('Download').trigger('click');
            await flushPromises();
            expect(search).toHaveBeenCalledWith('*', expect.objectContaining({ path: 'newdir', recursive: true }));
            expect(dialog().props('message')).toBe('Download 2 items as a ZIP? A folder goes with everything inside it. Calculating size…');
            found([{ path: 'newdir/b.jpg', type: ddb.entry.type.IMAGE, size: 1572864 }, { path: 'newdir/sub', type: ddb.entry.type.DIRECTORY, size: 0 }]);
            await flushPromises();
            expect(dialog().props('message')).toBe('Download 2 items (2.5 MB) as a ZIP? A folder goes with everything inside it.');
            const { signal } = search.mock.calls[0][1];
            expect(signal.aborted).toBe(false);
            await dialog().vm.$emit('close', 'cancel');
            await flushPromises();
            expect(signal.aborted).toBe(true);
            expect(wrapper.vm.downloadConfirmOpen).toBe(false);
            expect(h.download).not.toHaveBeenCalled();
        });

        it('asks for one folder by name, and a late size does not reach a closed question', async () => {
            let found;
            search.mockImplementation(() => new Promise(resolve => { found = resolve; }));
            await onDataset({ selected: [folder] });
            await button('Download').trigger('click');
            await flushPromises();
            expect(dialog().props('message')).toBe('Download the folder <strong>newdir</strong> and everything inside it as a ZIP? Calculating size…');
            await dialog().vm.$emit('close', 'confirm');
            found([{ path: 'newdir/b.jpg', type: ddb.entry.type.IMAGE, size: 10 }]);
            await flushPromises();
            expect(h.download).toHaveBeenCalledTimes(1);
            expect(wrapper.vm.downloadSize).toBeNull();
        });

        it('says when the size of a folder could not be read', async () => {
            search.mockImplementation(() => Promise.reject(new Error('offline')));
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            await onDataset({ selected: [folder] });
            await button('Download').trigger('click');
            await flushPromises();
            expect(dialog().props('message')).toBe('Download the folder <strong>newdir</strong> and everything inside it as a ZIP? The size could not be calculated.');
            expect(warn).toHaveBeenCalled();
            warn.mockRestore();
        });

        it('reads no size for files only', async () => {
            await onDataset({ selected: [sized('a.jpg', 1048576), sized('b.jpg', 2097152)] });
            await button('Download').trigger('click');
            await flushPromises();
            expect(search).not.toHaveBeenCalled();
        });

        it('asks for the whole dataset with its item count (folders included) and size', async () => {
            const session = await onDataset({ selected: [] });
            // ddb's root entry counts every entry: here 12 files and 4 folders
            session.setRootEntry({ path: 'ddb://acme/site', size: 42050000, properties: { entries: 16 } });
            await button('Download entire dataset').trigger('click');
            await flushPromises();
            expect(dialog().props('message')).toBe('Download all 16 items (40.1 MB) as a ZIP?');
            expect(search).not.toHaveBeenCalled();
        });
    });

    it('offers no Settings to a visitor who is not signed in', async () => {
        h.auth.isLoggedIn = false;
        await onDataset();
        expect(button('Settings').exists()).toBe(false);
        expect(button('Download').exists()).toBe(true);
    });
});

// FR-ACC-01 / FR-XC-05: an anonymous visitor of a shared dataset of a private organization
describe('HubHeader organization look-up (breadcrumb)', () => {
    const crumbs = () => wrapper.findAll('.hub-breadcrumb li').map(li => li.text());
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
                stubs: { UploadIndicator: true, RouterLink: RouterLinkStub, UpdateNotesDialog: true, Menu: true, ShareEmbed: true }
            }
        });
        await flushPromises();
        return { push, replace };
    }

    it('asks for the organization without the global 401 handler, and shows its name', async () => {
        const info = vi.fn(() => Promise.resolve({ isPublic: true, name: 'Acme Inc' }));
        await renderWith(info, { loggedIn: true });
        expect(h.reg.Organization).toHaveBeenCalledWith('acme');
        expect(info).toHaveBeenCalledWith({ skipUnauthorized: true });
        expect(crumbs()).toEqual(['Organizations', 'Acme Inc', 'site']);
    });

    it.each([401, 403])('shows the slug, not as a link, and does not navigate when the look-up answers %i', async status => {
        const { ApiError } = await import('@/libs/ddb/apiError');
        const info = vi.fn(() => Promise.reject(new ApiError('No access', status)));
        const { push, replace } = await renderWith(info);
        expect(info).toHaveBeenCalledWith({ skipUnauthorized: true });
        expect(crumbs()).toEqual(['Organizations', 'acme', 'site']);
        expect(wrapper.findAllComponents(RouterLinkStub).filter(l => l.props('to')?.name === 'Datasets')).toHaveLength(0);
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
                stubs: { UploadIndicator: true, RouterLink: RouterLinkStub, UpdateNotesDialog: true, Menu: true, ShareEmbed: true }
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

// FR-NAV-06, FR-ACC-03, FR-ACC-08: home, Sign In and My Datasets
describe('HubHeader: home and the session', () => {
    let push;

    async function mountOn(route, { loggedIn = true } = {}) {
        h.auth.isLoggedIn = loggedIn;
        h.auth.isAdmin = false;
        h.reg.sys.updateInfo = vi.fn(() => Promise.resolve(AVAILABLE));
        push = vi.fn(() => Promise.resolve());
        window.history.replaceState({}, '', route.fullPath ?? route.path);
        wrapper = mount(HubHeader, {
            global: {
                plugins: [PrimeVue, createPinia()],
                mocks: { $route: reactive({ params: {}, query: {}, ...route }), $router: { push, replace: vi.fn() } },
                stubs: { UploadIndicator: true, RouterLink: RouterLinkStub, UpdateNotesDialog: true, Menu: true, ShareEmbed: true }
            }
        });
        await flushPromises();
    }
    const signIn = () => wrapper.find('button[aria-label="Sign In"]');
    const logo = () => wrapper.findComponent(RouterLinkStub);

    let isLoggedIn;
    beforeEach(() => {
        isLoggedIn = h.reg.isLoggedIn;
        h.auth.sync = vi.fn();
    });
    afterEach(() => {
        h.reg.isLoggedIn = isLoggedIn;
        h.auth.username = 'admin';
        delete h.auth.sync;
    });

    it('the logo is a link to home, the same for a visitor and a signed-in user', async () => {
        await mountOn({ path: '/r/x', name: 'Datasets' }, { loggedIn: false });
        expect(logo().classes()).toContain('logo');
        expect(logo().props('to')).toEqual({ name: 'Organizations' });
        wrapper.unmount();
        await mountOn({ path: '/r/x', name: 'Datasets' });
        expect(logo().props('to')).toEqual({ name: 'Organizations' });
    });

    it('the logo goes to the datasets of a one-organization install', async () => {
        globalThis.HubOptions = { singleOrganization: 'acme' };
        await mountOn({ path: '/r', name: 'Organizations' });
        expect(logo().props('to')).toEqual({ name: 'Datasets', params: { org: 'acme' } });
    });

    it('offers no Sign In on the Login page, which would lose the page to come back to', async () => {
        await mountOn({ path: '/login', fullPath: '/login?redirect=/r/survey-team', name: 'Login', query: { redirect: '/r/survey-team' } }, { loggedIn: false });
        expect(signIn().exists()).toBe(false);
        // Nor the user menu: nobody is signed in
        expect(wrapper.find('button[aria-controls="user_menu"]').exists()).toBe(false);
        // Should it be asked all the same, it keeps the page to come back to
        wrapper.vm.login();
        expect(push).toHaveBeenCalledWith({ name: 'Login', query: { redirect: '/r/survey-team' } });
    });

    it('signs in from another page, coming back to it', async () => {
        await mountOn({ path: '/r/x', name: 'Datasets' }, { loggedIn: false });
        await signIn().trigger('click');
        expect(push).toHaveBeenCalledWith({ name: 'Login', query: { redirect: '/r/x' } });
    });

    it('My Datasets with a session that has gone: the header catches up and Login opens, without an error or a notice', async () => {
        await mountOn({ path: '/account', name: 'Account' });
        h.reg.isLoggedIn = () => false;
        h.auth.username = '';
        expect(() => wrapper.vm.myDatasets()).not.toThrow();
        expect(h.auth.sync).toHaveBeenCalledOnce();
        // It may have ended by a sign-out in another tab: nothing says it expired (FR-ACC-08)
        expect(push).toHaveBeenCalledWith({ name: 'Login', query: { redirect: '/account' } });
    });

    it('My Datasets with a session: the datasets of the user', async () => {
        await mountOn({ path: '/account', name: 'Account' });
        wrapper.vm.myDatasets();
        expect(push).toHaveBeenCalledWith({ name: 'Datasets', params: { org: 'admin' } });
    });
});
