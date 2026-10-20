// @ts-check
/**
 * The signed-in user (HQ-04): one reactive copy of what the Registry client knows,
 * shared by the header, the route guards and the pages. The store is the only
 * subscriber to the client's login/logout events.
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import reg from '@/libs/api/sharedRegistry';
import { loadFeaturesAndBranding } from '@/libs/hubBranding';

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

    const homeOrg = computed(() => username.value);

    return { username, isLoggedIn, isAdmin, featuresVersion, homeOrg, sync, login, logout, refreshFeatures, feature };
});
