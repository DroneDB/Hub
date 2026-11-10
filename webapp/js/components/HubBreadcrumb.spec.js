/**
 * HubBreadcrumb (FR-NAV-03): Organizations / organization / dataset on the pages of an organization and of a
 * dataset, the last crumb the page (aria-current), the slug until a name is known and when the organization cannot be
 * read, and no redirect when it answers 401.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

const h = vi.hoisted(() => ({ info: null, Organization: null }));
vi.mock('@/libs/api/sharedRegistry', () => {
    h.Organization = vi.fn(() => ({ info: (...args) => h.info(...args) }));
    return { default: { Organization: (...args) => h.Organization(...args) } };
});

const { default: HubBreadcrumb } = await import('./HubBreadcrumb.vue');
const { useDatasetSessionStore } = await import('@/stores/datasetSession');
const { ApiError } = await import('@/libs/ddb/apiError');

let wrapper;
async function render(props) {
    wrapper = mount(HubBreadcrumb, { props, global: { plugins: [createPinia()], stubs: { RouterLink: RouterLinkStub } } });
    await flushPromises();
    return wrapper;
}
const crumbs = () => wrapper.findAll('li').map(li => li.text());
const links = () => wrapper.findAllComponents(RouterLinkStub).map(l => l.props('to'));
const root = name => ({ path: 'acme', properties: { meta: name ? { name: { data: name } } : {} } });

beforeEach(() => {
    globalThis.HubOptions = {};
    setActivePinia(createPinia());
    h.info = vi.fn(() => Promise.resolve({ name: 'T Orgs Bulk', isPublic: false }));
    h.Organization.mockClear();
});
afterEach(() => wrapper?.unmount());

describe('HubBreadcrumb crumbs', () => {
    it('on the page of an organization (/r/x): Organizations and the organization, the organization the page', async () => {
        await render({ org: 't-orgs-bulk' });
        expect(crumbs()).toEqual(['Organizations', 'T Orgs Bulk']);
        expect(links()).toEqual([{ name: 'Organizations' }]);
        expect(wrapper.find('[aria-current="page"]').text()).toBe('T Orgs Bulk');
        expect(wrapper.findAll('[aria-current]')).toHaveLength(1);
    });

    it('on the page of a dataset (/r/x/y): Organizations / organization / dataset, with the name of the dataset the page shows', async () => {
        await render({ org: 't-orgs-bulk', ds: 'bulk-dataset-26' });
        useDatasetSessionStore().setRootEntry(root('Bulk dataset 26'));
        await flushPromises();
        expect(crumbs()).toEqual(['Organizations', 'T Orgs Bulk', 'Bulk dataset 26']);
        expect(links()).toEqual([{ name: 'Organizations' }, { name: 'Datasets', params: { org: 't-orgs-bulk' } }]);
        expect(wrapper.find('[aria-current="page"]').text()).toBe('Bulk dataset 26');
        expect(wrapper.findAll('[aria-current]')).toHaveLength(1);
        expect(wrapper.find('nav').attributes('aria-label')).toBe('Breadcrumb');
    });

    it('shows the slug of the dataset until its name is known, and when it has no name or did not load', async () => {
        await render({ org: 'acme', ds: 'site-1' });
        expect(crumbs()[2]).toBe('site-1');
        const session = useDatasetSessionStore();
        session.setRootEntry(root('Site One'));
        await flushPromises();
        expect(crumbs()[2]).toBe('Site One');
        session.setUnavailable(true);
        await flushPromises();
        expect(crumbs()[2]).toBe('site-1');
    });

    it('shows the slug of the organization when it has no name', async () => {
        h.info = vi.fn(() => Promise.resolve({ name: '' }));
        await render({ org: 'acme' });
        expect(crumbs()).toEqual(['Organizations', 'acme']);
    });

    it('shows nothing off the pages of an organization', async () => {
        await render({});
        expect(wrapper.find('nav').exists()).toBe(false);
        expect(h.Organization).not.toHaveBeenCalled();
    });

    it('has no Organizations crumb in a one-organization install, where the organization is home', async () => {
        globalThis.HubOptions = { singleOrganization: 'acme' };
        await render({ org: 'acme', ds: 'site' });
        expect(crumbs()).toEqual(['T Orgs Bulk', 'site']);
    });

    it('follows the route: another organization is asked for again and shown by its name', async () => {
        await render({ org: 'a' });
        h.info = vi.fn(() => Promise.resolve({ name: 'Other' }));
        await wrapper.setProps({ org: 'b' });
        await flushPromises();
        expect(h.Organization).toHaveBeenLastCalledWith('b');
        expect(crumbs()).toEqual(['Organizations', 'Other']);
    });

    it('keeps the name of the last organization asked for when the answers come in another order', async () => {
        let first;
        h.info = vi.fn(() => new Promise(resolve => { first = resolve; }));
        await render({ org: 'a' });
        h.info = vi.fn(() => Promise.resolve({ name: 'Second' }));
        await wrapper.setProps({ org: 'b' });
        await flushPromises();
        first({ name: 'First' });
        await flushPromises();
        expect(crumbs()).toEqual(['Organizations', 'Second']);
    });
});

describe('HubBreadcrumb organization look-up (FR-XC-05)', () => {
    it('opts out of the global 401 redirect', async () => {
        await render({ org: 'acme', ds: 'site' });
        expect(h.Organization).toHaveBeenCalledWith('acme');
        expect(h.info).toHaveBeenCalledWith({ skipUnauthorized: true });
    });

    it.each([401, 403])('a %i shows the slug, as text, and goes nowhere', async status => {
        h.info = vi.fn(() => Promise.reject(new ApiError('No access', status)));
        await render({ org: 'acme', ds: 'site' });
        expect(crumbs()).toEqual(['Organizations', 'acme', 'site']);
        // Only the list of organizations is a link: the organization is refused to this visitor
        expect(links()).toEqual([{ name: 'Organizations' }]);
    });

    it('another failure shows the slug and keeps the link: the page may still open', async () => {
        h.info = vi.fn(() => Promise.reject(new Error('Network down')));
        await render({ org: 'acme', ds: 'site' });
        expect(crumbs()).toEqual(['Organizations', 'acme', 'site']);
        expect(links()).toEqual([{ name: 'Organizations' }, { name: 'Datasets', params: { org: 'acme' } }]);
    });
});
