// @ts-check
/**
 * The signed-in user: one reactive copy of what the Registry client knows,
 * shared by the header, the route guards and the pages. The store is the only
 * subscriber to the client's login/logout events, and to the storage events of the other tabs: a sign-out in
 * another tab ends the session here too (FR-ACC-19).
 */
import { defineStore } from 'pinia';
import { ref } from 'vue';
import reg from '@/libs/api/sharedRegistry';
import { loadFeaturesAndBranding } from '@/libs/hubBranding';
import { loginLocation, SIGNED_OUT_TEXT } from '@/libs/authRoutes';
import { currentPath } from '@/libs/routeQuery';
import { notify } from '@/libs/notify';

export const useAuthStore = defineStore('auth', () => {
    const username = ref(reg.getUsername() || '');
    const isLoggedIn = ref(reg.isLoggedIn());
    const isAdmin = ref(reg.isAdmin());
    // Bumped when the feature flags are (re)loaded, so `feature()` readers update
    const featuresVersion = ref(0);

    function sync() {
        username.value = reg.getUsername() || '';
        isLoggedIn.value = reg.isLoggedIn();
        isAdmin.value = isLoggedIn.value && reg.isAdmin();
    }

    // lifetime: app (the store lives as long as the page)
    reg.addEventListener('login', sync);
    reg.addEventListener('logout', sync);

    /** @type {import('vue-router').Router | null} */
    let router = null;

    /** The router that the "Sign in" action of the signed-out notice uses (main.js, once it is made). @param {import('vue-router').Router} appRouter */
    function bindRouter(appRouter) {
        router = appRouter;
    }

    function signIn() {
        if (router) router.push(loginLocation(currentPath())).catch(() => { });
        else window.location.assign('/login');
    }

    /**
     * Another tab signed in or out: the token (or the whole storage, key null) changed. This tab follows it, and a
     * session that ended there is told once, with the way back in (FR-ACC-19, FR-XC-13: the `signed-out` notice).
     * @param {StorageEvent} e
     */
    function onStorage(e) {
        if (e.key !== null && !e.key.startsWith(`${reg.url}_jwt_token`)) return;
        const wasLoggedIn = isLoggedIn.value;
        sync();
        if (wasLoggedIn && !isLoggedIn.value) {
            notify.info(SIGNED_OUT_TEXT, { summary: 'Signed out', life: 'long', action: { label: 'Sign in', run: signIn } });
        }
    }
    // lifetime: app (the store lives as long as the page)
    if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);

    async function refreshFeatures() {
        try {
            await loadFeaturesAndBranding(reg);
        } finally {
            featuresVersion.value++;
        }
    }

    /**
     * Sign in and load the user's feature flags.
     * @param {string} user
     * @param {string} password
     * @param {string|null} [xAuthToken]
     */
    async function login(user, password, xAuthToken = null) {
        await reg.login(user, password, xAuthToken);
        sync();
        await refreshFeatures();
    }

    function logout() {
        reg.logout();
        sync();
    }

    /** @param {string} name */
    function feature(name) {
        void featuresVersion.value;
        return reg.features.get(name);
    }

    return { username, isLoggedIn, isAdmin, featuresVersion, sync, login, logout, refreshFeatures, feature, bindRouter };
});
