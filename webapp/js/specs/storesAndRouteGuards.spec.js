/**
 * Pinia stores own the session state; the router guards protected routes.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

describe('stores', () => {
    beforeEach(() => setActivePinia(createPinia()));

    it('auth store exposes the session', async () => {
        const { useAuthStore } = await import('@/stores/auth');
        const auth = useAuthStore();
        expect(auth.isLoggedIn).toBe(false);
        expect(auth.isAdmin).toBe(false);
    });

    it('dataset session store replaces the Header/ViewDataset bus events', async () => {
        const { useDatasetSessionStore } = await import('@/stores/datasetSession');
        const s = useDatasetSessionStore();
        s.setSelectedFiles([{ entry: { path: 'a.jpg' } }]);
        s.setActiveTab('map');
        expect(s.selectedFiles).toHaveLength(1);
        expect(s.activeTab).toBe('map');
    });
});

describe('router guard', () => {
    beforeEach(() => setActivePinia(createPinia()));

    it('sends anonymous users to Login with a redirect and keeps public routes open', async () => {
        const { createAppRouter } = await import('@/router');
        const { guard } = await import('@/libs/authRoutes');
        const router = createAppRouter(true);
        const anonymous = { isLoggedIn: false, isAdmin: false };
        expect(guard(router.resolve('/admin/users'), anonymous)).toEqual({ name: 'Login', query: { redirect: '/admin/users' } });
        expect(guard(router.resolve('/upload'), anonymous)).toEqual({ name: 'Login', query: { redirect: '/upload' } });
        expect(guard(router.resolve('/r/public/ds'), anonymous)).toBe(true);
        expect(guard(router.resolve('/admin/users'), { isLoggedIn: true, isAdmin: false })).toEqual({ name: 'Organizations' });
        expect(guard(router.resolve('/admin/users'), { isLoggedIn: true, isAdmin: true })).toBe(true);
    });

    it('signs an anonymous user in before a link to the Preferences window, keeping the link', async () => {
        const { createAppRouter } = await import('@/router');
        const { guard } = await import('@/libs/authRoutes');
        const router = createAppRouter(true);
        const link = '/r?preferences=notifications';
        expect(guard(router.resolve(link), { isLoggedIn: false, isAdmin: false }))
            .toEqual({ name: 'Login', query: { redirect: link } });
        expect(guard(router.resolve(link), { isLoggedIn: true, isAdmin: false })).toBe(true);
        // On the Login page itself the link is dropped: no loop
        expect(guard(router.resolve('/login?preferences=notifications'), { isLoggedIn: false, isAdmin: false })).toEqual({ name: 'Login' });
    });

    it('marks protected routes in meta', async () => {
        const { createAppRouter } = await import('@/router');
        const router = createAppRouter(true);
        const meta = name => router.getRoutes().find(r => r.name === name).meta;
        expect(meta('Users').requiresAdmin).toBe(true);
        expect(meta('Upload').requiresAuth).toBe(true);
        expect(meta('ViewDataset').requiresAuth).toBeFalsy();
    });

    it('only redirects back to paths inside the app', async () => {
        const { loginLocation } = await import('@/libs/authRoutes');
        expect(loginLocation('/r/org/ds')).toEqual({ name: 'Login', query: { redirect: '/r/org/ds' } });
        expect(loginLocation('//evil.example')).toEqual({ name: 'Login' });
        expect(loginLocation('https://evil.example')).toEqual({ name: 'Login' });
        expect(loginLocation('/login')).toEqual({ name: 'Login' });
    });
});
