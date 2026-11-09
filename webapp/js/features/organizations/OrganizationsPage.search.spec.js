/**
 * The search of the organizations page (FR-ORG-18, FR-ORG-13): the shared field empties with Escape and its x,
 * the empty result names the query with Clear search, and the paginator is hidden when nothing is left to page.
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
const { _resetPrefListenersForTests } = await import('@/libs/preferences');

const dto = slug => ({ slug, name: slug, description: '', owner: 'zed', isPublic: false, permissions: { canRead: true }, creationDate: '2026-01-01T00:00:00Z' });

let wrapper;
beforeEach(() => {
    globalThis.HubOptions = {};
    _resetPrefListenersForTests();
    localStorage.clear();
    reg.orgs.getOrganizations = vi.fn(() => Promise.resolve([dto('alpha'), dto('beta')].map(org => ({ org }))));
});
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    _resetPrefListenersForTests();
});

async function render() {
    wrapper = mount(OrganizationsPage, {
        global: {
            plugins: [PrimeVue],
            mocks: { $router: { push: vi.fn() }, $notify: { error: vi.fn(), success: vi.fn() } },
            stubs: {
                OrganizationDialog: true, OrganizationMembersDialog: true, MessageDialog: true, DialogHost: true,
                Paginator: { template: '<nav class="paginator-stub" />' }, RouterLink: { props: ['to'], template: '<a><slot /></a>' }
            }
        }
    });
    await flushPromises();
}
const search = () => wrapper.find('input[aria-label="Search organizations"]');
const names = () => wrapper.findAll('.org-name').map(a => a.text());

describe('OrganizationsPage search', () => {
    it('shows the paginator for a list, and hides it when the search leaves nothing', async () => {
        await render();
        expect(wrapper.find('.paginator-stub').exists()).toBe(true);
        await search().setValue('zzzznomatch');
        await flushPromises();
        expect(names()).toEqual([]);
        expect(wrapper.find('.paginator-stub').exists()).toBe(false);
    });

    it('names the query of an empty result and clears it from the empty state', async () => {
        await render();
        await search().setValue('zzzznomatch');
        await flushPromises();
        expect(wrapper.find('.empty-state h3').text()).toBe('No organizations match "zzzznomatch"');
        await wrapper.find('.empty-state button').trigger('click');
        await flushPromises();
        expect(names()).toEqual(['alpha', 'beta']);
        expect(search().element.value).toBe('');
        expect(wrapper.find('.paginator-stub').exists()).toBe(true);
    });

    it('is emptied by Escape and by the x of the field', async () => {
        await render();
        await search().setValue('alp');
        await flushPromises();
        expect(names()).toEqual(['alpha']);
        await search().trigger('keydown', { key: 'Escape' });
        await flushPromises();
        expect(names()).toEqual(['alpha', 'beta']);

        await search().setValue('bet');
        await wrapper.find('button[aria-label="Clear search"]').trigger('click');
        await flushPromises();
        expect(names()).toEqual(['alpha', 'beta']);
    });
});
