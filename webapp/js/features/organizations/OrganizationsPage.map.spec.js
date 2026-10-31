/**
 * The map view of the organizations page shows the datasets of every organization the filter
 * leaves, whatever the page of the list: four organizations are asked at a time, the pins appear
 * as the answers do, a change of the filter ends the requests of the organizations it leaves out
 * and drops their pins (those still in it are kept, those it brings in are asked), and leaving
 * the view ends every request and drops every pin.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';

const reg = vi.hoisted(() => ({
    isAdmin: () => false,
    getUsername: () => 'ann',
    features: { get: () => false },
    orgs: { getOrganizations: null, createOrganization: null },
    Organization: null
}));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: reg }));

const { default: OrganizationsPage } = await import('./OrganizationsPage.vue');
const { PREF, applyAccountValue, _resetPrefListenersForTests } = await import('@/libs/preferences');

const dto = (slug, extra = {}) => ({
    slug, name: slug, description: '', owner: 'zed', isPublic: false, permissions: { canRead: true },
    creationDate: '2026-01-01T00:00:00Z', lastModified: null, datasetCount: null, ...extra
});
const answer = list => Promise.resolve(list.map(org => ({ org })));
const place = [1, 1, 2, 2];

/** The organizations' location requests, settled by hand. */
let requests;
let active;
let peak;
/** How often the map was mounted. */
let mapMounts;

let wrapper;
beforeEach(() => {
    globalThis.HubOptions = {};
    _resetPrefListenersForTests();
    localStorage.clear();
    localStorage.setItem(PREF.ORG_PAGE, JSON.stringify({ itemsPerPage: 10, ownedOnly: false, view: 'map' }));
    requests = [];
    active = 0;
    peak = 0;
    mapMounts = 0;
    reg.Organization = vi.fn(slug => ({
        datasetLocations: ({ signal }) => new Promise((resolve, reject) => {
            const request = { slug, signal, resolve, reject };
            active++;
            peak = Math.max(peak, active);
            const settled = () => { active--; };
            request.resolve = value => { settled(); resolve(value); };
            signal.addEventListener('abort', () => { settled(); reject(Object.assign(new Error('aborted'), { name: 'AbortError' })); });
            requests.push(request);
        })
    }));
    reg.orgs.getOrganizations = vi.fn(() => answer(Array.from({ length: 12 }, (_, i) => dto(`org${String(i).padStart(2, '0')}`))));
});
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    vi.useRealTimers();
    _resetPrefListenersForTests();
});

async function render(organizations) {
    if (organizations) reg.orgs.getOrganizations = vi.fn(() => answer(organizations));
    wrapper = mount(OrganizationsPage, {
        global: {
            plugins: [PrimeVue],
            mocks: { $router: { push: vi.fn() }, $notify: { error: vi.fn(), success: vi.fn() } },
            stubs: {
                OrganizationDialog: true, OrganizationMembersDialog: true, MessageDialog: true, DialogHost: true, EmptyState: true,
                Paginator: true, RouterLink: { props: ['to'], template: '<a><slot /></a>' },
                DatasetLocationsMap: { props: ['groups', 'loading', 'organizations'], template: '<div class="map-stub" />', mounted() { mapMounts++; } }
            }
        }
    });
    await flushPromises();
}
const mapProps = () => wrapper.findComponent('.map-stub').props();
const shownOrgs = () => mapProps().groups.map(g => g.org);
const pending = () => requests.filter(r => !r.signal.aborted).map(r => r.slug);
const found = (request, ...slugs) => request.resolve(slugs.map(slug => ({ slug, name: slug.toUpperCase(), bbox: place })));

describe('OrganizationsPage map view', () => {
    it('shows the map instead of the cards and the paginator, and hides the sort controls', async () => {
        await render();
        expect(wrapper.find('.map-stub').exists()).toBe(true);
        expect(wrapper.find('.org-card').exists()).toBe(false);
        expect(wrapper.find('.org-pagination').exists()).toBe(false);
        expect(wrapper.find('.org-actions .sort-select').exists()).toBe(false);
        expect(wrapper.find('.org-actions .view-select').exists()).toBe(true);
    });

    it('asks for every organization the filter leaves, not only the page, four at a time', async () => {
        await render();
        expect(requests.map(r => r.slug)).toEqual(['org00', 'org01', 'org02', 'org03']);
        expect(mapProps().loading).toBe(true);

        // Each answer lets the next organization start
        for (let i = 0; i < 12; i++) {
            found(requests[i], `ds${i}`);
            await flushPromises();
        }
        expect(requests).toHaveLength(12);
        expect(peak).toBe(4);
        expect(mapProps().loading).toBe(false);
        expect(shownOrgs()).toEqual(requests.map(r => r.slug));
    });

    it('shows the pins of an organization as soon as it answers', async () => {
        await render();
        found(requests[2], 'x');
        await flushPromises();
        expect(shownOrgs()).toEqual(['org02']);
        expect(mapProps().groups[0]).toEqual({ org: 'org02', orgName: 'org02', datasets: [{ slug: 'x', name: 'X', bbox: place }] });
        expect(mapProps().loading).toBe(true);
    });

    it('skips an organization that fails and goes on', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        await render([dto('a'), dto('b'), dto('c')]);
        requests[0].reject(Object.assign(new Error('Forbidden'), { status: 403 }));
        found(requests[1], 'x');
        found(requests[2], 'y');
        await flushPromises();
        expect(shownOrgs()).toEqual(['b', 'c']);
        expect(mapProps().loading).toBe(false);
        expect(warn).toHaveBeenCalledTimes(1);
        warn.mockRestore();
    });

    it('asks nothing of an organization known to hold no dataset', async () => {
        await render([dto('empty', { datasetCount: 0 }), dto('some', { datasetCount: 3 }), dto('unknown')]);
        expect(requests.map(r => r.slug).sort()).toEqual(['some', 'unknown']);
    });

    it('follows the search: the organizations it leaves out end their requests and lose their pins at once, the others are kept', async () => {
        await render();
        found(requests[0], 'x');
        await flushPromises();
        expect(shownOrgs()).toEqual(['org00']);
        const oldRequests = [...requests];

        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        wrapper.vm.searchQuery = 'org1';
        await flushPromises();
        // The organizations left out stop at once, while the user is still typing
        expect(oldRequests.every(r => r.signal.aborted)).toBe(true);
        expect(shownOrgs()).toEqual([]);
        expect(mapProps().loading).toBe(true);
        // Those still in the set were queued: they go on, and nothing is asked twice
        expect(pending().sort()).toEqual(['org10', 'org11']);

        // An answer of an organization left out that arrives now is not shown
        found(oldRequests[1], 'late');
        await flushPromises();
        expect(shownOrgs()).toEqual([]);

        vi.advanceTimersByTime(300);
        await flushPromises();
        expect(requests.map(r => r.slug).filter(slug => slug.startsWith('org1'))).toEqual(['org10', 'org11']);
        found(requests.at(-1), 'new');
        await flushPromises();
        expect(shownOrgs()).toEqual([requests.at(-1).slug]);
    });

    it('gives the map every organization listed for its colours, whatever the search and the order of the list', async () => {
        await render([dto('beta'), dto('alpha'), dto('gamma')]);
        expect(mapProps().organizations).toEqual(['beta', 'alpha', 'gamma']);
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        wrapper.vm.searchQuery = 'gam';
        wrapper.vm.sortDirection = wrapper.vm.sortDirection === 'asc' ? 'desc' : 'asc';
        await flushPromises();
        vi.advanceTimersByTime(300);
        await flushPromises();
        expect(mapProps().organizations).toEqual(['beta', 'alpha', 'gamma']);
    });

    it('waits for the user to pause typing before it asks for the organizations a search brings back, and asks once', async () => {
        await render([dto('a'), dto('ab'), dto('abc'), dto('abcd')]);
        requests.forEach(r => found(r));
        await flushPromises();
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        wrapper.vm.searchQuery = 'abcd';
        await flushPromises();
        vi.advanceTimersByTime(300);
        await flushPromises();
        expect(shownOrgs()).toEqual(['abcd']);
        const before = requests.length;

        for (const text of ['abc', 'ab', 'a']) {
            wrapper.vm.searchQuery = text;
            await flushPromises();
            vi.advanceTimersByTime(100);
        }
        expect(requests).toHaveLength(before);
        expect(mapProps().loading).toBe(true);
        vi.advanceTimersByTime(300);
        await flushPromises();
        expect(requests.slice(before).map(r => r.slug).sort()).toEqual(['a', 'ab', 'abc']);
        expect(shownOrgs()).toEqual(['abcd']);
    });

    it('does not ask again for a new sort of the same organizations', async () => {
        await render([dto('a'), dto('b')]);
        const before = requests.length;
        wrapper.vm.sortColumn = 'creationDate';
        wrapper.vm.sortDirection = 'desc';
        await flushPromises();
        expect(requests).toHaveLength(before);
        expect(requests.every(r => !r.signal.aborted)).toBe(true);
    });

    it('keeps the map and its pins while an organization is created, and asks only for the new one', async () => {
        await render([dto('a'), dto('b')]);
        found(requests[0], 'x');
        found(requests[1], 'y');
        await flushPromises();
        let created;
        reg.orgs.createOrganization = vi.fn(() => new Promise(resolve => { created = resolve; }));

        wrapper.vm.orgDialogMode = 'new';
        const closing = wrapper.vm.handleOrganizationClose('save', { slug: 'c', name: 'C', description: '', isPublic: false });
        await flushPromises();
        // The map stays while the server creates it
        expect(wrapper.find('.map-stub').exists()).toBe(true);
        expect(wrapper.vm.creatingOrganization).toBe(true);

        // Its dataset count is unknown: it is asked
        created(dto('c', { owner: 'ann' }));
        await closing;
        await flushPromises();
        expect(requests.map(r => r.slug)).toEqual(['a', 'b', 'c']);
        expect(requests.every(r => !r.signal.aborted)).toBe(true);
        expect(shownOrgs()).toEqual(['a', 'b']);
        expect(mapProps().loading).toBe(true);
        expect(mapMounts).toBe(1);
        expect(wrapper.vm.creatingOrganization).toBe(false);

        found(requests[2], 'z');
        await flushPromises();
        expect(shownOrgs()).toEqual(['a', 'b', 'c']);
        expect(mapProps().loading).toBe(false);
    });

    it('asks nothing for a new organization known to hold no dataset', async () => {
        await render([dto('a')]);
        reg.orgs.createOrganization = vi.fn(() => Promise.resolve(dto('empty', { datasetCount: 0 })));
        wrapper.vm.orgDialogMode = 'new';
        await wrapper.vm.handleOrganizationClose('save', { slug: 'empty', name: 'Empty', description: '', isPublic: false });
        await flushPromises();
        expect(wrapper.vm.organizations.map(o => o.slug)).toEqual(['a', 'empty']);
        expect(requests.map(r => r.slug)).toEqual(['a']);
    });

    it('ends the requests and drops the pins when the view goes back to the list', async () => {
        await render([dto('a'), dto('b')]);
        found(requests[0], 'x');
        await flushPromises();
        wrapper.vm.view = 'list';
        await flushPromises();
        expect(requests.every(r => r.signal.aborted)).toBe(true);
        expect(wrapper.vm.locationGroups).toEqual([]);
        expect(wrapper.vm.locationsLoading).toBe(false);
        expect(wrapper.find('.org-card').exists()).toBe(true);
    });

    it('asks when the map is chosen, and not before', async () => {
        localStorage.setItem(PREF.ORG_PAGE, JSON.stringify({ view: 'list' }));
        await render([dto('a')]);
        expect(requests).toHaveLength(0);
        wrapper.vm.view = 'map';
        await flushPromises();
        expect(pending()).toEqual(['a']);
        expect(JSON.parse(localStorage.getItem(PREF.ORG_PAGE)).view).toBe('map');
    });

    it('ends the requests when the page goes away', async () => {
        await render([dto('a'), dto('b')]);
        const mine = [...requests];
        wrapper.unmount();
        wrapper = null;
        expect(mine.every(r => r.signal.aborted)).toBe(true);
    });

    it('keeps the map, its pins and the requests of the organizations still listed while Show all asks for the list again', async () => {
        await render([dto('a'), dto('b'), dto('c')]);
        found(requests[0], 'x');
        found(requests[1], 'y');
        await flushPromises();
        let listed;
        reg.orgs.getOrganizations = vi.fn(() => new Promise(resolve => { listed = resolve; }));

        wrapper.vm.showAll = false;
        await flushPromises();
        expect(reg.orgs.getOrganizations).toHaveBeenCalledWith(true);
        // The map stays while the list is asked, and shows it is loading
        expect(wrapper.find('.map-stub').exists()).toBe(true);
        expect(mapProps().loading).toBe(true);
        expect(shownOrgs()).toEqual(['a', 'b']);

        listed([dto('b'), dto('c'), dto('d')].map(org => ({ org })));
        await flushPromises();
        expect(mapMounts).toBe(1);
        // b keeps its pins and c its request; a is dropped and d is asked
        expect(requests.map(r => r.slug)).toEqual(['a', 'b', 'c', 'd']);
        expect(requests[0].signal.aborted).toBe(true);
        expect(requests[2].signal.aborted).toBe(false);
        expect(shownOrgs()).toEqual(['b']);
        found(requests[3], 'z');
        await flushPromises();
        expect(shownOrgs()).toEqual(['b', 'd']);
    });

    it('follows a Show all changed elsewhere without leaving the map', async () => {
        await render([dto('a')]);
        found(requests[0], 'x');
        await flushPromises();
        reg.orgs.getOrganizations = vi.fn(() => answer([dto('a'), dto('b')]));
        applyAccountValue(PREF.ORG_PAGE, { itemsPerPage: 10, ownedOnly: true, sortColumn: 'name', sortDirection: 'asc', view: 'map' });
        await flushPromises();
        expect(wrapper.vm.showAll).toBe(false);
        expect(mapMounts).toBe(1);
        expect(requests.map(r => r.slug)).toEqual(['a', 'b']);
        expect(shownOrgs()).toEqual(['a']);
    });

    describe('when Show all changes again before the list arrives', () => {
        let lists;
        beforeEach(async () => {
            await render([dto('a')]);
            lists = [];
            reg.orgs.getOrganizations = vi.fn(() => new Promise((resolve, reject) => lists.push({ resolve, reject })));
            wrapper.vm.showAll = false;
            await flushPromises();
            wrapper.vm.showAll = true;
            await flushPromises();
            expect(reg.orgs.getOrganizations.mock.calls).toEqual([[true], [false]]);
        });
        const listedSlugs = () => wrapper.vm.organizations.map(org => org.slug);

        it('drops the older list when it arrives last', async () => {
            lists[1].resolve([dto('a'), dto('all')].map(org => ({ org })));
            await flushPromises();
            expect(wrapper.vm.loading).toBe(false);
            lists[0].resolve([dto('mine')].map(org => ({ org })));
            await flushPromises();
            expect(listedSlugs()).toEqual(['a', 'all']);
            expect(wrapper.vm.loading).toBe(false);
            expect(requests.map(r => r.slug)).toEqual(['a', 'all']);
        });

        it('stays loading when the older list arrives first, and shows the newer one', async () => {
            lists[0].resolve([dto('mine')].map(org => ({ org })));
            await flushPromises();
            expect(listedSlugs()).toEqual(['a']);
            expect(wrapper.vm.loading).toBe(true);
            expect(mapProps().loading).toBe(true);
            lists[1].resolve([dto('a'), dto('all')].map(org => ({ org })));
            await flushPromises();
            expect(listedSlugs()).toEqual(['a', 'all']);
            expect(wrapper.vm.loading).toBe(false);
            expect(requests.map(r => r.slug)).toEqual(['a', 'all']);
        });

        it('reports no error of the older list and keeps loading the newer one', async () => {
            lists[0].reject(new Error('older failed'));
            await flushPromises();
            expect(wrapper.vm.$notify.error).not.toHaveBeenCalled();
            expect(wrapper.vm.loading).toBe(true);
            lists[1].resolve([dto('a'), dto('all')].map(org => ({ org })));
            await flushPromises();
            expect(listedSlugs()).toEqual(['a', 'all']);
            expect(wrapper.vm.loading).toBe(false);
        });
    });

    it('asks for an organization whose datasets came and drops one whose datasets went, on a reload of the same organizations', async () => {
        await render([dto('a', { datasetCount: 0 }), dto('b', { datasetCount: 2 })]);
        found(requests[0], 'x');
        await flushPromises();
        expect(requests.map(r => r.slug)).toEqual(['b']);
        expect(shownOrgs()).toEqual(['b']);

        reg.orgs.getOrganizations = vi.fn(() => answer([dto('a', { datasetCount: 1 }), dto('b', { datasetCount: 0 })]));
        wrapper.vm.showAll = false;
        await flushPromises();
        expect(requests.map(r => r.slug)).toEqual(['b', 'a']);
        expect(requests[0].signal.aborted).toBe(true);
        expect(requests[1].signal.aborted).toBe(false);
        expect(shownOrgs()).toEqual([]);
    });

    it('follows a change of the view made elsewhere', async () => {
        localStorage.setItem(PREF.ORG_PAGE, JSON.stringify({ view: 'list' }));
        await render([dto('a')]);
        applyAccountValue(PREF.ORG_PAGE, { itemsPerPage: 10, ownedOnly: false, sortColumn: 'name', sortDirection: 'asc', view: 'map' });
        await flushPromises();
        expect(wrapper.vm.view).toBe('map');
        expect(pending()).toEqual(['a']);
    });
});
