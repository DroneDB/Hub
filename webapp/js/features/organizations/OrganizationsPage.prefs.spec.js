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

    it('starts from the stored sort', async () => {
        localStorage.setItem(PREF.ORG_PAGE, JSON.stringify({ sortColumn: 'lastModified', sortDirection: 'desc' }));
        await render();
        expect(wrapper.vm.sortColumn).toBe('lastModified');
        expect(wrapper.vm.sortDirection).toBe('desc');
    });

    it('starts from the default sort when the stored one is not a sort of the list', async () => {
        localStorage.setItem(PREF.ORG_PAGE, JSON.stringify({ sortColumn: 'entries', sortDirection: 'up' }));
        await render();
        expect(wrapper.vm.sortColumn).toBe('name');
        expect(wrapper.vm.sortDirection).toBe('asc');
    });

    it('an external change of the sort updates the page and writes nothing back', async () => {
        await render();
        events.length = 0;
        applyAccountValue(PREF.ORG_PAGE, { itemsPerPage: 10, ownedOnly: true, sortColumn: 'datasetCount', sortDirection: 'desc' });
        await flushPromises();
        expect(wrapper.vm.sortColumn).toBe('datasetCount');
        expect(wrapper.vm.sortDirection).toBe('desc');
        expect(localOrgSettingsWrites()).toHaveLength(0);
    });

    it('a change of the user is one local write of the settings', async () => {
        await render();
        events.length = 0;
        wrapper.vm.itemsPerPage = 25;
        await flushPromises();
        expect(localOrgSettingsWrites()).toEqual([{
            key: PREF.ORG_PAGE,
            value: { itemsPerPage: 25, ownedOnly: true, sortColumn: 'name', sortDirection: 'asc', view: 'list' },
            origin: 'local'
        }]);
    });

    it('choosing a sort stores it and goes back to the first page', async () => {
        await render();
        wrapper.vm.currentPage = 3;
        events.length = 0;
        wrapper.vm.sortColumn = 'creationDate';
        wrapper.vm.sortDirection = 'desc';
        await flushPromises();
        expect(wrapper.vm.currentPage).toBe(1);
        expect(JSON.parse(localStorage.getItem(PREF.ORG_PAGE))).toMatchObject({ sortColumn: 'creationDate', sortDirection: 'desc' });
        expect(localOrgSettingsWrites().length).toBeGreaterThan(0);
    });

    it('choosing a sort keeps the view that is stored', async () => {
        localStorage.setItem(PREF.ORG_PAGE, JSON.stringify({ view: 'map' }));
        await render();
        wrapper.vm.sortDirection = 'desc';
        await flushPromises();
        expect(JSON.parse(localStorage.getItem(PREF.ORG_PAGE))).toMatchObject({ sortDirection: 'desc', view: 'map' });
    });

    it('starts from the stored view, and the default when it is not a view', async () => {
        localStorage.setItem(PREF.ORG_PAGE, JSON.stringify({ view: 'map' }));
        await render();
        expect(wrapper.vm.view).toBe('map');
        wrapper.unmount();
        localStorage.setItem(PREF.ORG_PAGE, JSON.stringify({ view: 'globe' }));
        await render();
        expect(wrapper.vm.view).toBe('list');
    });

    it('choosing a view is one local write that keeps the other settings', async () => {
        localStorage.setItem(PREF.ORG_PAGE, JSON.stringify({ itemsPerPage: 25, ownedOnly: false, sortColumn: 'creationDate', sortDirection: 'desc' }));
        await render();
        events.length = 0;
        wrapper.vm.view = 'map';
        await flushPromises();
        expect(localOrgSettingsWrites()).toEqual([{
            key: PREF.ORG_PAGE,
            value: { itemsPerPage: 25, ownedOnly: false, sortColumn: 'creationDate', sortDirection: 'desc', view: 'map' },
            origin: 'local'
        }]);
    });

    it('an external change of the view updates the page and writes nothing back', async () => {
        await render();
        events.length = 0;
        applyAccountValue(PREF.ORG_PAGE, { itemsPerPage: 10, ownedOnly: true, sortColumn: 'name', sortDirection: 'asc', view: 'map' });
        await flushPromises();
        expect(wrapper.vm.view).toBe('map');
        expect(localOrgSettingsWrites()).toHaveLength(0);
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
