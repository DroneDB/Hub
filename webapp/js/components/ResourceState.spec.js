/**
 * ResourceState (FR-XC-13): the one page state of a primary resource that cannot be shown. Each
 * kind has its h1, its plain text naming what was asked for, and its ways out as SPA links; the
 * heading is the page title.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';

const h = vi.hoisted(() => ({ loggedIn: false, username: 'ann', logout: null }));
vi.mock('@/libs/api/sharedRegistry', () => ({
    default: { isLoggedIn: () => h.loggedIn, getUsername: () => h.username }
}));
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ logout: h.logout }) }));

const { default: ResourceState } = await import('./ResourceState.vue');

const Page = { render: () => null };
let wrapper;
let router;

async function render(props, path = '/r/acme/site', { embed = false } = {}) {
    router = createRouter({
        history: createMemoryHistory(),
        routes: [
            { path: '/r', name: 'Organizations', component: Page },
            { path: '/r/:org', name: 'Datasets', component: Page },
            { path: '/r/:org/:ds', name: 'ViewDataset', component: Page },
            { path: '/login', name: 'Login', component: Page },
            { path: '/:pathMatch(.*)*', name: 'NotFound', component: Page }
        ]
    });
    window.history.replaceState({}, '', path);
    await router.push(path);
    wrapper = mount(ResourceState, { props, global: { plugins: [router], provide: { embed } } });
    await flushPromises();
}
const heading = () => wrapper.find('h1').text();
const links = () => wrapper.findAll('a').map(a => [a.text(), a.attributes('href')]);
const buttons = () => wrapper.findAll('button').map(b => b.text());

beforeEach(() => {
    globalThis.HubOptions = {};
    h.loggedIn = false;
    h.logout = vi.fn();
});
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    window.history.replaceState({}, '', '/');
});

describe('ResourceState', () => {
    it('not found: names the organization, links to Organizations, and is the page title', async () => {
        h.loggedIn = true;
        await render({ kind: 'not-found', resource: 'organization', name: 't-orgs-doesnotexist' }, '/r/t-orgs-doesnotexist');
        expect(heading()).toBe('Organization not found');
        expect(wrapper.findAll('h1')).toHaveLength(1);
        expect(wrapper.text()).toContain('"t-orgs-doesnotexist" does not exist.');
        expect(links()).toEqual([['Go to Organizations', '/r']]);
        expect(document.title).toBe('Organization not found - DroneDB');
    });

    it('offers a visitor without a session Sign in, not Organizations (which needs a session)', async () => {
        await render({ kind: 'not-found', resource: 'organization', name: 'nope' }, '/r/nope');
        expect(links()).toEqual([['Sign in', '/login?redirect=/r/nope']]);
        wrapper.unmount();
        await render({ kind: 'sign-in', resource: 'page' }, '/r');
        expect(links()).toEqual([['Sign in', '/login?redirect=/r']]);
        expect(heading()).toBe('Sign in to open this page');
    });

    it('embedded: opens its links in a new tab and leaves out what would act in the frame', async () => {
        h.loggedIn = true;
        await render({ kind: 'no-access', resource: 'dataset', name: 'site', backTo: '/r/acme/site', backLabel: 'Back to the dataset' },
            '/r/acme/site', { embed: true });
        const anchors = wrapper.findAll('a');
        expect(anchors.length).toBeGreaterThan(0);
        for (const a of anchors) {
            expect(a.attributes('target')).toBe('_blank');
            expect(a.attributes('rel')).toBe('noopener');
        }
        expect(buttons()).toEqual([]);
        const push = vi.spyOn(router, 'push');
        await anchors[0].trigger('click');
        expect(push).not.toHaveBeenCalled();
    });

    it('not found: a page names its address and has no link for end users to report it', async () => {
        await render({ kind: 'not-found', resource: 'page', name: '/nope' }, '/nope');
        expect(heading()).toBe('Page not found');
        expect(wrapper.text()).toContain('"/nope" does not exist. Check the address.');
        expect(wrapper.text()).not.toMatch(/report|github/i);
        expect(wrapper.find('a[href^="http"]').exists()).toBe(false);
    });

    it('no access with a session: my datasets, Organizations and Sign in as another user, no create action', async () => {
        h.loggedIn = true;
        await render({ kind: 'no-access', resource: 'organization', name: 'admin' }, '/r/admin');
        expect(heading()).toBe('You do not have access to this organization');
        expect(wrapper.text()).toContain('"admin" is private.');
        expect(links()).toEqual([['Go to my datasets', '/r/ann'], ['Go to Organizations', '/r']]);
        expect(buttons()).toContain('Sign in as another user');
        expect(wrapper.text()).not.toMatch(/Create|Import/);
    });

    it('goes home: the datasets of a one-organization install, once (homeLocation, FR-NAV-06)', async () => {
        h.loggedIn = true;
        globalThis.HubOptions = { singleOrganization: 'acme' };
        await render({ kind: 'not-found', resource: 'dataset', name: 'x' }, '/r/acme/x');
        expect(links()).toEqual([['Go to datasets', '/r/acme']]);
        wrapper.unmount();
        // No access: my datasets are home, not listed twice
        await render({ kind: 'no-access', resource: 'dataset', name: 'x' }, '/r/acme/x');
        expect(links()).toEqual([['Go to my datasets', '/r/acme']]);
    });

    it('Sign in as another user ends the session, then signs in coming back here', async () => {
        h.loggedIn = true;
        await render({ kind: 'no-access', resource: 'dataset', name: 'site' }, '/r/acme/site');
        const push = vi.spyOn(router, 'push');
        await wrapper.findAll('button').find(b => b.text() === 'Sign in as another user').trigger('click');
        await flushPromises();
        expect(h.logout).toHaveBeenCalledOnce();
        expect(push).toHaveBeenCalledWith({ name: 'Login', query: { redirect: '/r/acme/site' } });
    });

    it('sign in: the first action signs in and comes back to the page (D-048)', async () => {
        await render({ kind: 'sign-in', resource: 'dataset', name: 'brighton-beach' }, '/r/r3sharing/brighton-beach');
        expect(heading()).toBe('Sign in to open this dataset');
        expect(links()[0]).toEqual(['Sign in', '/login?redirect=/r/r3sharing/brighton-beach']);
        expect(wrapper.find('a.primary').text()).toBe('Sign in');
        expect(buttons()).not.toContain('Sign in as another user');
    });

    it('invalid link: its message, and the page back target first', async () => {
        await render({
            kind: 'invalid-link', resource: 'file', message: 'The file path in the address cannot be read.',
            backTo: { name: 'ViewDataset', params: { org: 'acme', ds: 'site' } }, backLabel: 'Back to the dataset'
        });
        expect(heading()).toBe('This link is not valid');
        expect(wrapper.text()).toContain('The file path in the address cannot be read.');
        expect(links()[0]).toEqual(['Back to the dataset', '/r/acme/site']);
        expect(buttons()).not.toContain('Back');
    });

    it('offers Back when the tab has a page to go back to', async () => {
        await render({ kind: 'not-found', resource: 'dataset', name: 'x' });
        expect(buttons()).not.toContain('Back');
        wrapper.unmount();
        window.history.replaceState({ back: '/r' }, '', '/r/acme/x');
        wrapper = mount(ResourceState, { props: { kind: 'not-found', resource: 'dataset', name: 'x' }, global: { plugins: [router] } });
        expect(buttons()).toContain('Back');
    });
});
