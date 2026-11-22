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

describe('createAppRouter: the report route', () => {
    beforeEach(() => setActivePinia(createPinia()));

    it('serves the live page of a report at /r/:org/:ds/reports/:uid, with the header unless embedded', () => {
        const route = createAppRouter().resolve('/r/acme/site/reports/r_k3x9q2m7#item-a1b2');
        expect(route.name).toBe('Report');
        expect(route.params).toEqual({ org: 'acme', ds: 'site', uid: 'r_k3x9q2m7' });
        expect(route.hash).toBe('#item-a1b2');
        expect(route.meta.title).toBe('Report');
        expect(Object.keys(route.matched[0].components)).toEqual(['content', 'header']);
        expect(Object.keys(createAppRouter(true).resolve('/r/acme/site/reports/r_k3x9q2m7').matched[0].components)).toEqual(['content']);
    });

    it('loads the page as a chunk of its own', () => {
        const route = createAppRouter().resolve('/r/acme/site/reports/r_k3x9q2m7');
        expect(String(route.matched[0].components.content)).toContain('ReportPage');
    });

    it('does not take the routes of the dataset, a view or a file for its own', () => {
        const router = createAppRouter();
        expect(router.resolve('/r/acme/site').name).toBe('ViewDataset');
        expect(router.resolve('/r/acme/site/views/v_aaaaaaaa').name).toBe('SavedView');
        expect(router.resolve('/r/acme/site/reports').name).toBe('NotFound');
    });
});
