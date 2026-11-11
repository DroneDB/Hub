/**
 * The session routes of FR-XC-13: one home (homeLocation), one notice query handled in one
 * place (handleNotice), Login told why (`expired`, FR-ACC-09) and admin pages that say why they
 * are refused (`denied`, FR-ACC-15).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRouter, createWebHistory } from 'vue-router';
import {
    deniedLocation, guard, handleNotice, handleUnauthorized, homeLocation, loginLocation,
    markSessionExpired, markStaleSession, NOTICE_QUERY, Notice, parseNotice, withoutNotice
} from './authRoutes';
import { notify } from './notify';
import { currentPath } from './routeQuery';

const Page = { render: () => null };

/** The app's routes that matter here, wired as router.js wires them. */
function appRouter(auth) {
    const router = createRouter({
        history: createWebHistory(),
        routes: [
            { path: '/r', name: 'Organizations', component: Page, meta: { title: 'Organizations' } },
            { path: '/r/:org', name: 'Datasets', component: Page, meta: { title: 'Datasets' } },
            { path: '/login', name: 'Login', component: Page, meta: { title: 'Login' } },
            { path: '/account', name: 'Account', component: Page, meta: { title: 'Account', requiresAuth: true } },
            { path: '/admin/users', name: 'Users', component: Page, meta: { title: 'Users', requiresAdmin: true } },
            { path: '/admin/tasks', name: 'AdminTasks', component: Page, meta: { title: 'Tasks', requiresAdmin: true } }
        ]
    });
    router.beforeEach(to => guard(to, auth));
    router.afterEach((to, from, failure) => {
        if (!failure) handleNotice(to, router);
    });
    return router;
}

let warn;
let info;
beforeEach(() => {
    globalThis.HubOptions = {};
    window.history.replaceState({}, '', '/');
    warn = vi.spyOn(notify, 'warn').mockImplementation(() => { });
    info = vi.spyOn(notify, 'info').mockImplementation(() => { });
});
afterEach(() => vi.restoreAllMocks());

describe('homeLocation (FR-NAV-06)', () => {
    it('is Organizations, signed in or not', () => {
        expect(homeLocation()).toEqual({ name: 'Organizations' });
    });

    it('is the datasets of the one organization of a one-organization install', () => {
        globalThis.HubOptions = { singleOrganization: 'acme' };
        expect(homeLocation()).toEqual({ name: 'Datasets', params: { org: 'acme' } });
    });
});

describe('loginLocation with a notice', () => {
    it('adds the notice next to the page to come back to', () => {
        expect(loginLocation('/r/x', Notice.EXPIRED)).toEqual({ name: 'Login', query: { redirect: '/r/x', notice: 'expired' } });
        expect(loginLocation(undefined, Notice.EXPIRED)).toEqual({ name: 'Login', query: { notice: 'expired' } });
        expect(loginLocation('/login', Notice.EXPIRED)).toEqual({ name: 'Login', query: { notice: 'expired' } });
    });

    it('never carries a notice to the page it comes back to', () => {
        expect(loginLocation('/r?notice=denied%3AUsers&q=1#h')).toEqual({ name: 'Login', query: { redirect: '/r?q=1#h' } });
        expect(withoutNotice('/account?notice=expired')).toBe('/account');
        expect(withoutNotice('/r/x#a')).toBe('/r/x#a');
    });
});

describe('parseNotice', () => {
    it('reads the values of the notice query, and nothing else', () => {
        expect(parseNotice('expired')).toEqual({ kind: 'expired' });
        expect(parseNotice('signed-out')).toEqual({ kind: 'signed-out' });
        expect(parseNotice('denied:Users')).toEqual({ kind: 'denied', route: 'Users' });
        expect(parseNotice('other')).toBeNull();
        expect(parseNotice(['expired'])).toBeNull();
    });
});

describe('guard', () => {
    it('sends a non-admin home with the notice of the admin page (FR-ACC-15)', () => {
        const router = appRouter({ isLoggedIn: true, isAdmin: false });
        expect(guard(router.resolve('/admin/users'), { isLoggedIn: true, isAdmin: false }))
            .toEqual({ name: 'Organizations', query: { [NOTICE_QUERY]: 'denied:Users' } });
    });

    it('carries an expired session to Login', () => {
        const router = appRouter({ isLoggedIn: false, isAdmin: false });
        expect(guard(router.resolve('/account?notice=expired'), { isLoggedIn: false, isAdmin: false }))
            .toEqual({ name: 'Login', query: { redirect: '/account', notice: 'expired' } });
    });
});

describe('deniedLocation', () => {
    it('is the location of the guard, for the 403 of an admin page', () => {
        expect(deniedLocation('AdminTasks')).toEqual({ name: 'Organizations', query: { notice: 'denied:AdminTasks' } });
        globalThis.HubOptions = { singleOrganization: 'acme' };
        expect(deniedLocation('Users')).toEqual({ name: 'Datasets', params: { org: 'acme' }, query: { notice: 'denied:Users' } });
    });
});

describe('handleUnauthorized (FR-ACC-09)', () => {
    it('with a session: ends it and goes to Login with the notice expired', () => {
        window.history.replaceState({}, '', '/account');
        const router = { currentRoute: { value: { name: 'Account' } }, push: vi.fn(() => Promise.resolve()) };
        const auth = { isLoggedIn: true, logout: vi.fn() };
        handleUnauthorized(/** @type {any} */ (router), auth);
        expect(auth.logout).toHaveBeenCalledOnce();
        expect(router.push).toHaveBeenCalledWith({ name: 'Login', query: { redirect: '/account', notice: 'expired' } });
    });
});

describe('markStaleSession (boot, FR-ACC-09)', () => {
    beforeEach(() => window.history.replaceState({}, '', '/account?tab=1#top'));

    it('marks the address when a stored session is gone, keeping the rest of it', () => {
        expect(markStaleSession({ hadSession: true, isLoggedIn: false, embed: false })).toBe(true);
        expect(currentPath()).toBe('/account?tab=1&notice=expired#top');
    });

    it.each([
        ['there was no session', { hadSession: false, isLoggedIn: false, embed: false }],
        ['the session is still good', { hadSession: true, isLoggedIn: true, embed: false }],
        ['the view is embedded', { hadSession: true, isLoggedIn: false, embed: true }]
    ])('leaves the address alone when %s', (_, boot) => {
        expect(markStaleSession(boot)).toBe(false);
        expect(currentPath()).toBe('/account?tab=1#top');
    });

    it('on a new entry (no history state) the router made next still keeps the position of each entry', () => {
        // A tab opened at the address: the entry has no state yet
        window.history.replaceState(null, '', '/account?tab=1#top');
        markStaleSession({ hadSession: true, isLoggedIn: false, embed: false });
        expect(currentPath()).toBe('/account?tab=1&notice=expired#top');
        expect(window.history.state).toBeNull();
        // The router (main.js makes it after) writes its own state on the marked address
        const history = createWebHistory();
        expect(window.history.state).toMatchObject({ current: '/account?tab=1&notice=expired#top', back: null });
        const start = window.history.state.position;
        expect(Number.isInteger(start)).toBe(true);
        // so a later step is counted (a back or forward through a leave guard needs it)
        history.push('/r');
        expect(window.history.state.position).toBe(start + 1);
        history.destroy();
    });
});

describe('handleNotice: the one place of the one-shot notices', () => {
    it('a non-admin who opens an admin page lands home with one warning, and the address has no notice', async () => {
        const router = appRouter({ isLoggedIn: true, isAdmin: false });
        await router.push('/admin/users');
        expect(router.currentRoute.value.name).toBe('Organizations');
        expect(warn).toHaveBeenCalledOnce();
        expect(warn).toHaveBeenCalledWith('You need administrator rights to open Users.', { summary: 'No access' });
        expect(currentPath()).toBe('/r');
        // A reload of the page (or another visit) says nothing again
        await router.replace(currentPath());
        expect(warn).toHaveBeenCalledOnce();
    });

    it('names an unknown page plainly', async () => {
        const router = appRouter({ isLoggedIn: true, isAdmin: false });
        await router.push(deniedLocation('Nope'));
        expect(warn).toHaveBeenCalledWith('You need administrator rights to open this page.', { summary: 'No access' });
    });

    it('an expired session on a private page: Login shows it on the page, not in a toast', async () => {
        window.history.replaceState({}, '', '/account');
        markSessionExpired();
        const router = appRouter({ isLoggedIn: false, isAdmin: false });
        await router.push(currentPath());
        expect(router.currentRoute.value.name).toBe('Login');
        // The route keeps it for the page; the address does not
        expect(router.currentRoute.value.query).toEqual({ redirect: '/account', notice: 'expired' });
        expect(currentPath()).toBe('/login?redirect=/account');
        expect(info).not.toHaveBeenCalled();
    });

    it('an expired session on a public page: a toast says so', async () => {
        const router = appRouter({ isLoggedIn: false, isAdmin: false });
        await router.push('/r/acme?notice=expired');
        expect(info).toHaveBeenCalledWith('Your session has expired. Please sign in again.', { summary: 'Session expired' });
        expect(currentPath()).toBe('/r/acme');
    });

    it('removes a value it does not know and shows nothing', async () => {
        const router = appRouter({ isLoggedIn: true, isAdmin: true });
        await router.push('/r?notice=bogus&q=1');
        expect(currentPath()).toBe('/r?q=1');
        expect(warn).not.toHaveBeenCalled();
        expect(info).not.toHaveBeenCalled();
    });
});
