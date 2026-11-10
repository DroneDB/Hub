/**
 * The navigation of the header (FR-NAV-01, FR-NAV-03, FR-NAV-04): Organizations and Upload as links with
 * aria-current on the page, the user named beside the avatar (and the role of an administrator), the user menu
 * in labelled groups, the breadcrumb of an organization and of a dataset, and the labels of Download and
 * Settings from md. A real router, so the links are real ones.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import PrimeVue from 'primevue/config';

const h = vi.hoisted(() => ({ reg: null, auth: null }));
vi.mock('@/libs/api/sharedRegistry', () => {
    h.reg = {
        isLoggedIn: () => true,
        getUsername: () => 'maria',
        features: { get: () => true, value: () => null },
        Organization: () => ({ info: () => Promise.resolve({ name: 'T Orgs Bulk', isPublic: true }) }),
        storageInfo: () => Promise.resolve(null),
        notificationStatus: () => Promise.resolve({ canReceiveEmail: true, reason: null }),
        sys: { updateInfo: () => Promise.resolve({ isUpdateAvailable: false }) }
    };
    return { default: h.reg };
});
vi.mock('@/stores/auth', async () => {
    const { reactive } = await import('vue');
    h.auth = reactive({
        username: 'maria', isLoggedIn: true, isAdmin: false, featuresVersion: 0,
        flags: { updateCheckEnabled: false }, feature(name) { return this.flags[name]; }, logout() {}
    });
    return { useAuthStore: () => h.auth };
});
vi.mock('@/stores/preferences', async () => {
    const { reactive } = await import('vue');
    return { usePreferencesStore: () => reactive({ status: 'idle', resetSection() {}, resetAll() {} }) };
});

const { default: HubHeader } = await import('./HubHeader.vue');
const { useDatasetSessionStore } = await import('@/stores/datasetSession');
const { resetUpdateCheck } = await import('@/composables/useUpdateCheck');

const Blank = { template: '<div />' };
let wrapper;
let router;

async function renderAt(path) {
    router = createRouter({
        history: createMemoryHistory(),
        routes: [
            { path: '/r', name: 'Organizations', component: Blank },
            { path: '/r/:org', name: 'Datasets', component: Blank },
            { path: '/r/:org/:ds', name: 'ViewDataset', component: Blank },
            { path: '/r/:org/:ds/view/:encodedPath/map', name: 'MapViewer', component: Blank },
            { path: '/upload', name: 'Upload', component: Blank },
            { path: '/login', name: 'Login', component: Blank }
        ]
    });
    router.push(path);
    await router.isReady();
    wrapper = mount(HubHeader, {
        global: {
            plugins: [PrimeVue, createPinia(), router],
            stubs: { UploadIndicator: true, UpdateNotesDialog: true, Menu: true, ShareEmbed: true }
        }
    });
    await flushPromises();
    return wrapper;
}
const navLink = id => wrapper.find(`.primary-nav [data-nav="${id}"]`);
const crumbs = () => wrapper.findAll('.hub-breadcrumb li').map(li => li.text());

beforeEach(() => {
    globalThis.HubOptions = {};
    setActivePinia(createPinia());
    resetUpdateCheck();
    h.auth.isLoggedIn = true;
    h.auth.isAdmin = false;
    h.auth.username = 'maria';
});
afterEach(() => wrapper?.unmount());

describe('the main navigation (FR-NAV-01)', () => {
    it('has Organizations and Upload as links of a Main navigation, for a signed-in user', async () => {
        await renderAt('/r');
        const nav = wrapper.find('nav[aria-label="Main"]');
        expect(nav.exists()).toBe(true);
        expect(nav.findAll('a').map(a => a.text())).toEqual(['Organizations', 'Upload']);
        expect(navLink('organizations').attributes('href')).toBe('/r');
        expect(navLink('upload').attributes('href')).toBe('/upload');
    });

    it('marks the link of the page it is on with aria-current, and no other', async () => {
        await renderAt('/r');
        expect(navLink('organizations').attributes('aria-current')).toBe('page');
        expect(navLink('upload').attributes('aria-current')).toBeUndefined();
        await router.push('/upload');
        await flushPromises();
        expect(navLink('organizations').attributes('aria-current')).toBeUndefined();
        expect(navLink('upload').attributes('aria-current')).toBe('page');
    });

    it('has no Upload where datasets cannot be created', async () => {
        globalThis.HubOptions = { disableDatasetCreation: true };
        await renderAt('/r');
        expect(navLink('upload').exists()).toBe(false);
        expect(navLink('organizations').exists()).toBe(true);
    });

    it('has none for a visitor, who has no Sign In on Login either', async () => {
        h.auth.isLoggedIn = false;
        await renderAt('/r');
        expect(wrapper.find('.primary-nav').exists()).toBe(false);
    });

    it('names the user beside the avatar, with the role of an administrator', async () => {
        await renderAt('/r');
        const button = wrapper.find('.user-menu-button');
        expect(button.find('.user-name').text()).toBe('maria');
        expect(button.find('.user-role').exists()).toBe(false);
        expect(button.attributes('aria-label')).toBe('Account menu for maria');
        wrapper.unmount();
        h.auth.isAdmin = true;
        await renderAt('/r');
        expect(wrapper.find('.user-menu-button .user-role').text()).toBe('Admin');
    });

    it('groups the user menu: Account for everyone, Administration for an administrator', async () => {
        h.auth.isAdmin = true;
        await renderAt('/r');
        const groups = wrapper.vm.userMenuItems.filter(i => i.items).map(i => [i.label, i.items.filter(e => !e.separator).map(e => e.label)]);
        expect(groups).toEqual([
            ['Administration', ['Manage Users', 'Tasks', 'Configuration', 'Hangfire', 'API Docs', 'System health']],
            ['Account', ['My Datasets', 'My Account', 'Preferences', 'Logout']]
        ]);
        // The destinations of the primary navigation are not repeated in the menu
        const all = wrapper.vm.userMenuItems.flatMap(i => i.items ?? [i]).map(i => i.label);
        expect(all).not.toContain('Upload Files');
        expect(all).not.toContain('My Organizations');
    });
});

describe('the breadcrumb of the header (FR-NAV-03)', () => {
    it('is not on the list of organizations', async () => {
        await renderAt('/r');
        expect(wrapper.find('.hub-breadcrumb').exists()).toBe(false);
    });

    it('shows Organizations / organization on the page of an organization', async () => {
        await renderAt('/r/t-orgs-bulk');
        expect(crumbs()).toEqual(['Organizations', 'T Orgs Bulk']);
    });

    it('shows Organizations / organization / dataset on the page of a dataset, and replaces the sitemap button', async () => {
        await renderAt('/r/t-orgs-bulk/bulk-dataset-26');
        useDatasetSessionStore().setRootEntry({ path: 'x', properties: { meta: { name: { data: 'Bulk dataset 26' } } } });
        await flushPromises();
        expect(crumbs()).toEqual(['Organizations', 'T Orgs Bulk', 'Bulk dataset 26']);
        expect(wrapper.find('button[title="Back to organization"]').exists()).toBe(false);
        expect(wrapper.find('.fa-sitemap').exists() && wrapper.find('button .fa-sitemap').exists()).toBe(false);
    });

    it('is on a viewer route too, with the slug of the dataset until the viewer reads its name', async () => {
        await renderAt('/r/t-orgs-bulk/bulk-dataset-26/view/YS50aWY=/map');
        expect(crumbs()).toEqual(['Organizations', 'T Orgs Bulk', 'bulk-dataset-26']);
    });

    it('follows the route from one dataset to another', async () => {
        await renderAt('/r/t-orgs-bulk/one');
        await router.push('/r/other/two');
        await flushPromises();
        expect(crumbs()[2]).toBe('two');
    });
});

describe('the actions of a dataset page (FR-NAV-04)', () => {
    async function onDataset() {
        await renderAt('/r/t-orgs-bulk/bulk-dataset-26');
        const session = useDatasetSessionStore();
        session.setActiveTab('explorer');
        session.setCanWrite(true);
        await flushPromises();
    }

    it('give Download and Settings a visible label from md, which an icon-only phone layout hides', async () => {
        await onDataset();
        // With nothing selected Download is "Download entire dataset" to a screen reader; its label says Download
        for (const [name, shown] of [['Download entire dataset', 'Download'], ['Settings', 'Settings']]) {
            const label = wrapper.find(`button[aria-label="${name}"] .header-action-label`);
            expect(label.exists()).toBe(true);
            expect(label.text()).toBe(shown);
            // d-none d-md-inline: hidden below md, shown from it
            expect(label.classes()).toEqual(expect.arrayContaining(['d-none', 'd-md-inline']));
        }
    });
});
