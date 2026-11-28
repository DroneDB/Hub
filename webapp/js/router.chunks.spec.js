/**
 * A route whose chunk cannot be fetched (a tab left open across a deploy) reloads the page once to the target:
 * the click used to do nothing at all.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

import { createAppRouter } from '@/router';
import { notify } from '@/libs/notify';

describe('createAppRouter: a route chunk that fails', () => {
    let assign;
    beforeEach(() => {
        setActivePinia(createPinia());
        globalThis.HubOptions = {};
        window.sessionStorage.clear();
        window.history.replaceState(null, '', '/');
        assign = vi.fn();
        vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, assign });
        vi.spyOn(notify, 'error').mockImplementation(() => { });
        vi.spyOn(console, 'error').mockImplementation(() => { });
    });
    afterEach(() => vi.restoreAllMocks());

    it('reloads to the target once, and tells the user when it fails again', async () => {
        const router = createAppRouter();
        router.addRoute({ path: '/broken', component: () => Promise.reject(new Error('Failed to fetch dynamically imported module: https://hub.test/auth.js')) });
        await router.push('/broken').catch(() => { });
        expect(assign).toHaveBeenCalledExactlyOnceWith('/broken');
        expect(notify.error).not.toHaveBeenCalled();

        // After the reload the chunk still fails: no second reload
        await router.push('/broken').catch(() => { });
        expect(assign).toHaveBeenCalledTimes(1);
        expect(notify.error).toHaveBeenCalledOnce();
    });
});
