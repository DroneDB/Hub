/**
 * The app's router (router.js) handles the one-shot notices after every navigation (FR-XC-13).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { createAppRouter } from '@/router';
import { notify } from '@/libs/notify';
import { currentPath } from '@/libs/routeQuery';

describe('createAppRouter: the notices', () => {
    let warn;
    beforeEach(() => {
        setActivePinia(createPinia());
        globalThis.HubOptions = {};
        window.history.replaceState(null, '', '/');
        warn = vi.spyOn(notify, 'warn').mockImplementation(() => { });
    });
    afterEach(() => vi.restoreAllMocks());

    it('shows a notice of the address once and removes it from the address', async () => {
        const router = createAppRouter(true);
        await router.push('/r?notice=denied:AdminTasks&q=1');
        expect(router.currentRoute.value.name).toBe('Organizations');
        expect(warn).toHaveBeenCalledOnce();
        expect(warn).toHaveBeenCalledWith('You need administrator rights to open Tasks.', { summary: 'No access' });
        expect(currentPath()).toBe('/r?q=1');
        // Opening the address again says nothing
        await router.replace(currentPath());
        expect(warn).toHaveBeenCalledOnce();
    });
});
