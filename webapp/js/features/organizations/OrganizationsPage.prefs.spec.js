/**
 * The organisations page follows its list settings (itemsPerPage, ownedOnly) when they change
 * elsewhere and never writes them back: only the user's own change is a 'local' write, and
 * leaving the page stores the position alone.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';

const reg = vi.hoisted(() => ({
    isAdmin: () => false,
    getUsername: () => 'ann',
    features: { get: () => false },
    orgs: { getOrganizations: null }
}));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: reg }));

const { default: OrganizationsPage } = await import('./OrganizationsPage.vue');
const { PREF, applyAccountValue, setPref, onPrefChange, _resetPrefListenersForTests } = await import('@/libs/preferences');

let wrapper;
let events;
let off;

beforeEach(() => {
    globalThis.HubOptions = {};
    _resetPrefListenersForTests();
    localStorage.clear();
    reg.orgs.getOrganizations = vi.fn(() => Promise.resolve([]));
    events = [];
    off = onPrefChange((key, value, origin) => events.push({ key, value, origin }));
});
afterEach(() => {
    wrapper?.unmount();
    off();
    _resetPrefListenersForTests();
});

async function render() {
    wrapper = mount(OrganizationsPage, {
        global: {
            plugins: [PrimeVue],
            mocks: { $router: { push: vi.fn() }, $notify: { error: vi.fn() } },
            stubs: { OrganizationDialog: true, OrganizationMembersDialog: true, MessageDialog: true, DialogHost: true, EmptyState: true, Paginator: true }
        }
    });
    await flushPromises();
}
const localOrgSettingsWrites = () => events.filter(e => e.key === PREF.ORG_PAGE && e.origin === 'local');

describe('OrganizationsPage preferences', () => {
    it('starts from the stored settings and from an old combined value', async () => {
        localStorage.setItem(PREF.ORG_PAGE, JSON.stringify({ itemsPerPage: 25, ownedOnly: false, currentPage: 2, scrollTop: 0 }));
        await render();
        expect(wrapper.vm.itemsPerPage).toBe(25);
        expect(wrapper.vm.showAll).toBe(true);
        expect(wrapper.vm.currentPage).toBe(2);
    });

    it('an external change updates the page and writes no organisations setting back', async () => {
        await render();
        reg.orgs.getOrganizations.mockClear();
        applyAccountValue(PREF.ORG_PAGE, { itemsPerPage: 50, ownedOnly: false });
        await flushPromises();
        expect(wrapper.vm.itemsPerPage).toBe(50);
        expect(wrapper.vm.showAll).toBe(true);
        expect(reg.orgs.getOrganizations).toHaveBeenCalledWith(false); // the list is fetched for the new filter
        expect(localOrgSettingsWrites()).toHaveLength(0);
    });

    it('unmounting after an external change writes no local ORG_PAGE value, only the position', async () => {
        await render();
        applyAccountValue(PREF.ORG_PAGE, { itemsPerPage: 50, ownedOnly: false });
        await flushPromises();
        events.length = 0;
        wrapper.unmount();
        wrapper = null;
        expect(localOrgSettingsWrites()).toHaveLength(0);
        expect(events.filter(e => e.origin === 'local').map(e => e.key)).toEqual([PREF.ORG_PAGE_POSITION]);
    });

    it('unmounting with nothing changed writes no list setting either', async () => {
        await render();
        events.length = 0;
        wrapper.unmount();
        wrapper = null;
        expect(localOrgSettingsWrites()).toHaveLength(0);
    });

    it('a change of the user is one local write of {itemsPerPage, ownedOnly}', async () => {
        await render();
        events.length = 0;
        wrapper.vm.itemsPerPage = 25;
        await flushPromises();
        expect(localOrgSettingsWrites()).toEqual([{ key: PREF.ORG_PAGE, value: { itemsPerPage: 25, ownedOnly: true }, origin: 'local' }]);
    });

    it('stops following when unmounted', async () => {
        await render();
        const vm = wrapper.vm;
        wrapper.unmount();
        wrapper = null;
        applyAccountValue(PREF.ORG_PAGE, { itemsPerPage: 100, ownedOnly: true });
        expect(vm.itemsPerPage).toBe(10);
        setPref(PREF.ORG_PAGE, { itemsPerPage: 5, ownedOnly: true });
        expect(vm.itemsPerPage).toBe(10);
    });
});
