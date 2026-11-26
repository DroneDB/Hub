/**
 * HubBreadcrumb (FR-NAV-03): organization / dataset on the pages of an organization and of a dataset (the
 * Organizations link of the main navigation is its root; without that link, an Organizations crumb), the last crumb the page (aria-current), the slug until a name is known and when the organization cannot be
 * read, and no redirect when it answers 401.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
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
    it('shows the logo of an organization that has one, small, before its name', async () => {
        h.info = vi.fn(() => Promise.resolve({ name: 'Acme', logoUrl: '/orgs/acme/logo?v=1' }));
        await render({ org: 'acme', ds: 'site', homeInNav: true });
        const img = wrapper.find('li img');
        expect(img.attributes('src')).toBe('/orgs/acme/logo?v=1');
        expect(img.classes()).toContain('org-logo-sm');
        expect(wrapper.findAll('li')[0].text()).toBe('Acme');
        // Only the organization has one
        expect(wrapper.findAll('img')).toHaveLength(1);
    });

    it('shows no logo, not even initials, for an organization without one or while it is not known', async () => {
        await render({ org: 'acme', homeInNav: true });
        expect(wrapper.find('.org-logo').exists()).toBe(false);
        h.info = vi.fn(() => Promise.resolve({ name: 'Acme', logoUrl: null }));
        wrapper.unmount();
        await render({ org: 'acme', homeInNav: true });
        expect(wrapper.find('.org-logo').exists()).toBe(false);
    });

    it('drops the logo of the previous organization when the route moves to another that has none', async () => {
        h.info = vi.fn()
            .mockResolvedValueOnce({ name: 'A', logoUrl: '/orgs/a/logo?v=1' })
            .mockResolvedValueOnce({ name: 'B' });
        await render({ org: 'a', homeInNav: true });
        expect(wrapper.find('img').exists()).toBe(true);
        await wrapper.setProps({ org: 'b' });
        await flushPromises();
        expect(wrapper.find('img').exists()).toBe(false);
    });

    it('on the page of an organization (/r/x): the organization, the page, after the Organizations link of the main navigation', async () => {
        await render({ org: 't-orgs-bulk', homeInNav: true });
        expect(crumbs()).toEqual(['T Orgs Bulk']);
        expect(links()).toEqual([]);
        expect(wrapper.find('[aria-current="page"]').text()).toBe('T Orgs Bulk');
        expect(wrapper.findAll('[aria-current]')).toHaveLength(1);
    });

    it('on the page of a dataset (/r/x/y): organization / dataset, with the name of the dataset the page shows', async () => {
        await render({ org: 't-orgs-bulk', ds: 'bulk-dataset-26', homeInNav: true });
        useDatasetSessionStore().setRootEntry(root('Bulk dataset 26'));
        await flushPromises();
        expect(crumbs()).toEqual(['T Orgs Bulk', 'Bulk dataset 26']);
        expect(links()).toEqual([{ name: 'Datasets', params: { org: 't-orgs-bulk' } }]);
        expect(wrapper.find('[aria-current="page"]').text()).toBe('Bulk dataset 26');
        expect(wrapper.findAll('[aria-current]')).toHaveLength(1);
        expect(wrapper.find('nav').attributes('aria-label')).toBe('Breadcrumb');
    });

    it('starts with an Organizations crumb when the header has no main navigation (nobody is signed in)', async () => {
        await render({ org: 't-orgs-bulk', ds: 'bulk-dataset-26' });
        expect(crumbs()).toEqual(['Organizations', 'T Orgs Bulk', 'bulk-dataset-26']);
        expect(links()).toEqual([{ name: 'Organizations' }, { name: 'Datasets', params: { org: 't-orgs-bulk' } }]);
    });

    it('shows the slug of the dataset until its name is known, and when it has no name or did not load', async () => {
        await render({ org: 'acme', ds: 'site-1', homeInNav: true });
        expect(crumbs()[1]).toBe('site-1');
        const session = useDatasetSessionStore();
        session.setRootEntry(root('Site One'));
        await flushPromises();
        expect(crumbs()[1]).toBe('Site One');
        session.setUnavailable(true);
        await flushPromises();
        expect(crumbs()[1]).toBe('site-1');
    });

    it('shows the slug of the organization when it has no name', async () => {
        h.info = vi.fn(() => Promise.resolve({ name: '' }));
        await render({ org: 'acme', homeInNav: true });
        expect(crumbs()).toEqual(['acme']);
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
        await wrapper.setProps({ homeInNav: true });
        expect(crumbs()).toEqual(['T Orgs Bulk', 'site']);
    });

    it('follows the route: another organization is asked for again and shown by its name', async () => {
        await render({ org: 'a', homeInNav: true });
        h.info = vi.fn(() => Promise.resolve({ name: 'Other' }));
        await wrapper.setProps({ org: 'b' });
        await flushPromises();
        expect(h.Organization).toHaveBeenLastCalledWith('b');
        expect(crumbs()).toEqual(['Other']);
    });

    it('keeps the name of the last organization asked for when the answers come in another order', async () => {
        let first;
        h.info = vi.fn(() => new Promise(resolve => { first = resolve; }));
        await render({ org: 'a', homeInNav: true });
        h.info = vi.fn(() => Promise.resolve({ name: 'Second' }));
        await wrapper.setProps({ org: 'b' });
        await flushPromises();
        first({ name: 'First' });
        await flushPromises();
        expect(crumbs()).toEqual(['Second']);
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

describe('HubBreadcrumb after the trail', () => {
    const style = fs.readFileSync(path.join(__dirname, 'HubBreadcrumb.vue'), 'utf8').split(/<style[^>]*>/)[1];
    const rule = selector => style.slice(style.indexOf(`${selector} {`)).split('}')[0];

    it('shows the tagline of the dataset in the tooltip of its name: the page has no title block', async () => {
        await render({ org: 't-orgs-bulk', ds: 'bulk-dataset-26', homeInNav: true });
        useDatasetSessionStore().setRootEntry({ path: '', properties: { meta: { name: { data: 'Bulk' }, tagline: { data: ' Shore survey ' } } } });
        await flushPromises();
        expect(wrapper.find('[aria-current="page"]').attributes('title')).toBe('Bulk — Shore survey');
        useDatasetSessionStore().setRootEntry(root('Bulk'));
        await flushPromises();
        expect(wrapper.find('[aria-current="page"]').attributes('title')).toBe('Bulk');
    });

    it('puts the after slot next to the trail, outside the part cut with an ellipsis', async () => {
        wrapper = mount(HubBreadcrumb, {
            props: { org: 't-orgs-bulk', ds: 'bulk-dataset-26', homeInNav: true },
            slots: { after: '<span class="badge-stub">Private</span>' },
            global: { plugins: [createPinia()], stubs: { RouterLink: RouterLinkStub } }
        });
        await flushPromises();
        const after = wrapper.find('nav > .crumbs-after');
        expect(after.find('.badge-stub').exists()).toBe(true);
        expect(wrapper.find('ol .badge-stub').exists()).toBe(false);
        // the trail shrinks and cuts the name; what follows keeps its size
        expect(rule('.hub-breadcrumb')).toContain('display: flex;');
        expect(rule('ol')).toContain('min-width: 0;');
        expect(rule('.crumbs-after')).toContain('flex: none;');
    });

    it('has no after box without the slot', async () => {
        await render({ org: 't-orgs-bulk', homeInNav: true });
        expect(wrapper.find('.crumbs-after').exists()).toBe(false);
    });

    it('has the text size of the header', () => {
        expect(rule('ol')).toContain('font-size: var(--ddb-font-size-ui);');
    });
});
