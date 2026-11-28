/**
 * The app's router (router.js) handles the one-shot notices after every navigation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { createAppRouter, isEmbeddable, isChunkLoadError, recoverFromChunkError, forgetChunkReload } from '@/router';
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
        const router = createAppRouter();
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


// An embedded page (?embed=1, or any iframe) is a viewer and nothing else: another site frames it
describe('createAppRouter: embedded pages', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        globalThis.HubOptions = {};
    });

    const refused = ['/login', '/', '/upload', '/account', '/admin/users', '/admin/tasks', '/admin/config', '/r', '/r/acme',
        '/r/acme/site', '/r/acme/site/reports/r_k3x9q2m7'];

    it.each(refused)('refuses %s: the page shows Not Found, not the page or the sign-in', async path => {
        const router = createAppRouter(true);
        await router.push(`${path}${path.includes('?') ? '&' : '?'}embed=1`);
        expect(router.currentRoute.value.name).toBe('NotFound');
        expect(router.currentRoute.value.path).toBe(path);
    });

    it('does not refuse the same pages outside an embedded page', async () => {
        const router = createAppRouter(false);
        await router.push('/login');
        expect(router.currentRoute.value.name).toBe('Login');
    });

    it('serves the viewers and the saved views, also when the path segment holds %2F, %2B and %3D', () => {
        const router = createAppRouter(true);
        const viewers = ['map', 'pointcloud', 'markdown', 'model', 'unified', 'splat', 'panorama'];
        for (const viewer of viewers) {
            const route = router.resolve(`/r/acme/site/view/6ZW%2F5Z%2BOLnRpZg%3D%3D/${viewer}?embed=1`);
            expect(route.name).not.toBe('NotFound');
            expect(route.params.encodedPath).toBe('6ZW/5Z+OLnRpZg==');
            expect(isEmbeddable(route)).toBe(true);
        }
        expect(isEmbeddable(router.resolve('/r/acme/site/views/v_aaaaaaaa?embed=1'))).toBe(true);
    });

    it('lists as embeddable exactly the routes that Share and Embed give links for', () => {
        const router = createAppRouter(true);
        const names = router.getRoutes().filter(r => r.meta.embeddable).map(r => r.name).sort();
        expect(names).toEqual(['MapViewer', 'Markdown', 'Model', 'NotFound', 'Panorama', 'PointCloud', 'SavedView', 'Splat', 'UnifiedViewer']);
    });
});

describe('route chunks that fail to load', () => {
    let storage;
    let reload;
    let error;
    beforeEach(() => {
        const data = new Map();
        storage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) };
        reload = vi.fn();
        error = vi.spyOn(notify, 'error').mockImplementation(() => { });
    });
    afterEach(() => vi.restoreAllMocks());

    it('knows the failure of each browser', () => {
        expect(isChunkLoadError(new Error('Loading chunk 12 failed.'))).toBe(true);
        expect(isChunkLoadError(new Error('Failed to fetch dynamically imported module: https://h/x.js'))).toBe(true);
        expect(isChunkLoadError(new Error('error loading dynamically imported module'))).toBe(true);
        expect(isChunkLoadError(new Error('Importing a module script failed.'))).toBe(true);
        expect(isChunkLoadError(Object.assign(new Error('x'), { name: 'ChunkLoadError' }))).toBe(true);
        expect(isChunkLoadError(new Error('Cannot read properties of null'))).toBe(false);
    });

    it('reloads once to the target, then tells the user instead of reloading again', () => {
        const failure = new Error('Loading chunk 7 failed.');
        expect(recoverFromChunkError(failure, { fullPath: '/r/acme/site' }, { storage, reload })).toBe(true);
        expect(reload).toHaveBeenCalledExactlyOnceWith('/r/acme/site');

        expect(recoverFromChunkError(failure, { fullPath: '/r/acme/site' }, { storage, reload })).toBe(true);
        expect(reload).toHaveBeenCalledTimes(1);
        expect(error).toHaveBeenCalledOnce();
    });

    it('reloads again after a navigation worked (another deploy, another tab left open)', () => {
        const failure = new Error('Loading chunk 7 failed.');
        recoverFromChunkError(failure, { fullPath: '/r' }, { storage, reload });
        forgetChunkReload(storage);
        recoverFromChunkError(failure, { fullPath: '/r' }, { storage, reload });
        expect(reload).toHaveBeenCalledTimes(2);
    });

    it('leaves another error alone', () => {
        expect(recoverFromChunkError(new Error('boom'), { fullPath: '/r' }, { storage, reload })).toBe(false);
        expect(reload).not.toHaveBeenCalled();
        expect(error).not.toHaveBeenCalled();
    });
});
