/**
 * The counts of the organization page (FR-ORG-10, FR-ORG-17): the header counts the datasets of the organization, not
 * those a search shows; the map keeps the search and shows the datasets it matches; a count of one is singular;
 * the delete of a row is not solid (FR-ORG-15); the pencil follows the name (FR-ORG-21).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils';
import PrimeVue from 'primevue/config';

const reg = vi.hoisted(() => ({ isAdmin: () => false, isLoggedIn: () => true, features: { get: () => false }, Organization: null }));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: reg }));

const { default: DatasetsPage } = await import('./DatasetsPage.vue');
const { PREF, _resetPrefListenersForTests } = await import('@/libs/preferences');

const dataset = (slug, name) => ({
    slug, creationDate: '2026-01-01T00:00:00Z', size: 1, permissions: { canRead: true, canWrite: true, canDelete: true },
    properties: { entries: 2, meta: { name: { data: name } } }
});

let wrapper;
let datasetsPage;
let info;

/** An organization of 26 datasets: the server answers a search with the matching ones. */
async function render({ view, orgInfo = { name: 'Org', slug: 'org', datasetCount: 26, permissions: { canManageMembers: true, canWrite: true } }, total = 26, items } = {}) {
    globalThis.HubOptions = {};
    _resetPrefListenersForTests();
    localStorage.clear();
    if (view) localStorage.setItem(PREF.DATASET_TABLE, JSON.stringify({ view }));
    const all = items ?? [dataset('bulk-dataset-1', 'Bulk dataset 1'), dataset('bulk-dataset-2', 'Bulk dataset 2')];
    datasetsPage = vi.fn(query => {
        const q = (query.q ?? '').toLowerCase();
        const found = q ? all.filter(ds => ds.properties.meta.name.data.toLowerCase().includes(q)) : all;
        return Promise.resolve({ items: found, total: q ? found.length : total });
    });
    info = vi.fn(() => Promise.resolve(orgInfo));
    reg.Organization = vi.fn(() => ({
        info,
        datasetsPage,
        datasetLocations: () => Promise.resolve([
            { slug: 'bulk-dataset-1', name: 'Bulk dataset 1', bbox: [1, 1, 2, 2] },
            { slug: 'bulk-dataset-2', name: 'Bulk dataset 2', bbox: [3, 3, 4, 4] },
            { slug: 'roof', name: 'Roof', tagline: 'Tiles and Gutters', bbox: [5, 5, 6, 6] }
        ]),
        datasets: () => Promise.resolve([]),
        Dataset: () => ({})
    }));
    wrapper = mount(DatasetsPage, {
        global: {
            plugins: [PrimeVue],
            components: { RouterLink: RouterLinkStub },
            mocks: { $route: { params: { org: 'org' } }, $router: { push: vi.fn() }, $notify: { success: vi.fn(), error: vi.fn() } },
            stubs: {
                DatasetDialog: true, ImportDatasetDialog: true, OrganizationDialog: true, OrganizationMembersDialog: true, MessageDialog: true,
                DialogHost: true, EmptyState: true, Paginator: true,
                DatasetLocationsMap: { props: ['groups', 'loading'], template: '<div class="map-stub" />' }
            }
        }
    });
    await flushPromises();
}
const headerCount = () => wrapper.find('.org-tags .p-tag-info, .org-tags [data-p="info"]').text();
const search = async text => {
    await wrapper.find('input[aria-label="Search datasets"]').setValue(text);
    await vi.advanceTimersByTimeAsync(400);
    await flushPromises();
};
const pinSlugs = () => wrapper.findComponent('.map-stub').props().groups.flatMap(g => g.datasets.map(d => d.slug));

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
afterEach(() => {
    vi.useRealTimers();
    wrapper?.unmount();
    wrapper = null;
    _resetPrefListenersForTests();
});

describe('the header count with a search (FR-ORG-10)', () => {
    it('is the datasets of the organization, not those the search shows, in the list and in the map', async () => {
        await render();
        expect(headerCount()).toBe('26');
        await search('Bulk dataset 2');
        expect(datasetsPage).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'Bulk dataset 2' }), expect.anything());
        expect(headerCount()).toBe('26');
        wrapper.vm.view = 'map';
        await flushPromises();
        expect(headerCount()).toBe('26');
    });

    it('is the total of a load without a search when the organization carries no count', async () => {
        await render({ orgInfo: { name: 'Org', slug: 'org', permissions: {} } });
        expect(headerCount()).toBe('26');
        await search('Bulk dataset 2');
        expect(headerCount()).toBe('26');
        await search('');
        expect(headerCount()).toBe('26');
    });

    it('puts the matching count in the pagination line, beside the total', async () => {
        await render();
        expect(wrapper.find('.ds-pagination-text').text()).toBe('Showing 1 to 10 of 26 datasets');
        await search('Bulk dataset 2');
        expect(wrapper.find('.ds-pagination-text').text()).toBe('Showing 1 to 1 of 1 dataset, 26 in the organization');
    });
});

describe('the map view keeps the search (FR-ORG-10)', () => {
    it('shows the datasets the search matches, by name or slug, and all of them without one', async () => {
        await render({ view: 'map' });
        expect(wrapper.find('input[aria-label="Search datasets"]').exists()).toBe(true);
        expect(pinSlugs()).toEqual(['bulk-dataset-1', 'bulk-dataset-2', 'roof']);
        await search('dataset 2');
        expect(pinSlugs()).toEqual(['bulk-dataset-2']);
        await search('ROOF');
        expect(pinSlugs()).toEqual(['roof']);
        await search('');
        expect(pinSlugs()).toEqual(['bulk-dataset-1', 'bulk-dataset-2', 'roof']);
    });

    it('matches the tagline too, as the server search of the list does, without regard to case', async () => {
        await render({ view: 'map' });
        await search('  gutters ');
        expect(pinSlugs()).toEqual(['roof']);
        await search('no such text');
        expect(pinSlugs()).toEqual([]);
    });

    it('keeps the search when the view changes between the list and the map', async () => {
        await render();
        await search('roof');
        wrapper.vm.view = 'map';
        await flushPromises();
        expect(wrapper.find('input[aria-label="Search datasets"]').element.value).toBe('roof');
        expect(pinSlugs()).toEqual(['roof']);
    });
});

describe('plural counts (FR-ORG-17)', () => {
    it('says "1 dataset" for one result, and "datasets" for the others', async () => {
        await render({ items: [dataset('only', 'Only one')], total: 1, orgInfo: { name: 'Org', slug: 'org', permissions: {} } });
        expect(wrapper.find('.ds-pagination-text').text()).toBe('Showing 1 to 1 of 1 dataset');
        wrapper.unmount();
        await render({ total: 12 });
        expect(wrapper.find('.ds-pagination-text').text()).toBe('Showing 1 to 10 of 12 datasets');
    });
});

describe('the delete of a row (FR-ORG-15)', () => {
    it('is a text button in the danger severity, not a solid one, and the edit stays outlined', async () => {
        await render();
        const del = wrapper.find('button[aria-label="Delete dataset"]');
        expect(del.classes()).toEqual(expect.arrayContaining(['p-button-danger', 'p-button-text']));
        const edit = wrapper.find('button[aria-label="Edit dataset"]');
        expect(edit.classes()).toContain('p-button-outlined');
    });
});

describe('the title of the organization (FR-ORG-21)', () => {
    const sfc = fs.readFileSync(path.resolve(__dirname, 'DatasetsPage.vue'), 'utf8');

    it('keeps the name and the pencil in one run of text, the pencil outside the heading', async () => {
        await render();
        const title = wrapper.find('.org-title');
        const h1 = title.find('h1');
        expect(h1.text()).toBe('Org');
        expect(title.find('button[aria-label="Edit Organization"]').exists()).toBe(true);
        expect(h1.find('button').exists()).toBe(false);
        // The pencil comes right after the heading: no space between them to wrap at
        expect(h1.element.nextElementSibling).toBe(title.find('button').element);
        expect(h1.element.nextSibling).toBe(title.find('button').element);
    });

    it('lets the header wrap, the identity asks for 28rem, so the actions go under a long name; in a column it asks for none', () => {
        expect(sfc).toMatch(/\.org-header-layout \{\s*display: flex;\s*flex-wrap: wrap;/);
        expect(sfc).toMatch(/\.org-identity \{\s*flex: 1 1 28rem;\s*min-width: 0;/);
        const phone = sfc.slice(sfc.indexOf('Responsive: stack header vertically'));
        expect(phone.slice(0, 700)).toMatch(/\.org-identity \{\s*flex: 0 0 auto;/);
    });

    it('runs the name and the pencil inline, so the pencil is on the last line of the title', () => {
        expect(sfc).toMatch(/\.org-title \{\s*display: inline;/);
        expect(sfc).toMatch(/\.org-title \.org-name \{\s*display: inline;/);
    });
});
