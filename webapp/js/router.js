import { createRouter, createWebHistory } from 'vue-router';
import { setTitle } from '@/libs/utils';
import { useAuthStore } from '@/stores/auth';
import { guard, handleNotice } from '@/libs/authRoutes';
import { navigationTitle } from '@/libs/routeTitle';
import { notify } from '@/libs/notify';

// Lazy-loaded route components
const ViewDataset = () => import(/* webpackChunkName: "dataset" */ '@/features/dataset/ViewDataset.vue');
const MapViewer = () => import(/* webpackChunkName: "map" */ '@/features/viewers/map/MapViewer.vue');
const Login = () => import(/* webpackChunkName: "auth" */ '@/features/account/LoginPage.vue');
const Datasets = () => import(/* webpackChunkName: "datasets" */ '@/features/datasets/DatasetsPage.vue');
const Organizations = () => import(/* webpackChunkName: "orgs" */ '@/features/organizations/OrganizationsPage.vue');
const Upload = () => import(/* webpackChunkName: "upload" */ '@/features/upload/UploadPage.vue');
const NotFound = () => import(/* webpackChunkName: "notfound" */ '@/layout/NotFound.vue');
const Account = () => import(/* webpackChunkName: "account" */ '@/features/account/AccountPage.vue');
const Users = () => import(/* webpackChunkName: "admin" */ '@/features/admin/UsersPage.vue');
const AdminTasks = () => import(/* webpackChunkName: "admin" */ '@/features/admin/TasksPage.vue');
const AdminConfig = () => import(/* webpackChunkName: "admin" */ '@/features/admin/AdminConfig.vue');
const Potree = () => import(/* webpackChunkName: "pointcloud" */ '@/features/viewers/pointcloud/PotreeViewer.vue');
const Model = () => import(/* webpackChunkName: "model" */ '@/features/viewers/model/ModelViewer.vue');
const UnifiedViewer = () => import(/* webpackChunkName: "unified" */ '@/features/viewers/unified/UnifiedViewer.vue');
const Splat = () => import(/* webpackChunkName: "splat" */ '@/features/viewers/splat/SplatViewer.vue');
const Panorama = () => import(/* webpackChunkName: "panorama" */ '@/features/viewers/panorama/PanoramaViewer.vue');
const Report = () => import(/* webpackChunkName: "report" */ '@/features/reports/ReportPage.vue');
const Markdown = () => import(/* webpackChunkName: "markdown" */ '@/features/viewers/markdown/MarkdownViewer.vue');

// Header loaded eagerly (used on every page)
import Header from '@/layout/HubHeader.vue';

/**
 * Whether a navigation may open in an embedded page (?embed=1, or any iframe): only the viewers of a file and the
 * saved views (`meta.embeddable`), the pages that Share and Embed produce links for, and the Not Found page they
 * are refused with. Any other page (Login, the account, uploads, the administration, a report) is a page that
 * another site must not be able to frame.
 * @param {import('vue-router').RouteLocationNormalized} to
 */
export function isEmbeddable(to) {
    return to.matched.length > 0 && to.matched.every(r => r.meta.embeddable === true);
}

/** The error of a route chunk that cannot be fetched (a deploy replaced it, or the network failed), by browser */
const CHUNK_ERROR = /Loading (CSS )?chunk \S+ failed|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i;

/** @param {unknown} error */
export function isChunkLoadError(error) {
    const e = /** @type {any} */ (error);
    return e?.name === 'ChunkLoadError' || CHUNK_ERROR.test(String(e?.message ?? ''));
}

const RELOAD_KEY = 'hub.chunkReloadTarget';

/**
 * A route whose code cannot be loaded (a tab left open across a deploy): the page reloads once to the target, which
 * brings the new build. The target is remembered until a navigation succeeds, so a chunk that fails again after the
 * reload is told to the user instead of reloading for ever.
 * @param {unknown} error
 * @param {{ fullPath: string }} to
 * @param {{ storage?: Pick<Storage, 'getItem'|'setItem'|'removeItem'>, reload?: (target: string) => void }} [deps]
 * @returns {boolean}  whether the error was a chunk failure that was handled (reloading, or told)
 */
export function recoverFromChunkError(error, to, { storage = safeSessionStorage(), reload = target => window.location.assign(target) } = {}) {
    if (!isChunkLoadError(error)) return false;
    if (storage.getItem(RELOAD_KEY) === to.fullPath) {
        notify.error('Check the connection and try again, or reload the page.', { summary: 'Cannot open this page' });
        return true;
    }
    storage.setItem(RELOAD_KEY, to.fullPath);
    reload(to.fullPath);
    return true;
}

/** The guard of recoverFromChunkError is forgotten once a navigation has worked. */
export function forgetChunkReload(storage = safeSessionStorage()) {
    storage.removeItem(RELOAD_KEY);
}

// sessionStorage where the browser allows it (a blocked one throws), else a guard that lasts for the page only
function safeSessionStorage() {
    try {
        const storage = window.sessionStorage;
        storage.getItem(RELOAD_KEY);
        return storage;
    } catch {
        return memoryStorage;
    }
}
const memory = new Map();
const memoryStorage = {
    getItem: key => memory.get(key) ?? null,
    setItem: (key, value) => { memory.set(key, value); },
    removeItem: key => { memory.delete(key); }
};

export function createAppRouter(embed = false) {
    // Build the named-views map. In embed mode we OMIT the `header` key
    // entirely instead of setting it to null: vue-router 4.6+ treats any
    // non-null object value as a route component and tries to access
    // `__vccOpts` on it, which throws on null and breaks navigation
    // (TypeError: Cannot read properties of null (reading '__vccOpts')).
    const viewsFor = (content) => embed ? { content } : { content, header: Header };

    const routes = [
        { path: '/r/:org/:ds', name: 'ViewDataset', components: viewsFor(ViewDataset), meta: { title: 'View Dataset' } },
        // The map viewer: a new view of a file, and a saved view
        // The live page of a report: the sections of its model, drawn from the measurement files as they are now
        { path: '/r/:org/:ds/reports/:uid', name: 'Report', components: viewsFor(Report), meta: { title: 'Report', viewer: true } },
        { path: '/r/:org/:ds/view/:encodedPath/map', name: 'MapViewer', components: viewsFor(MapViewer), meta: { title: 'Map', viewer: true, embeddable: true } },
        { path: '/r/:org/:ds/views/:uid', name: 'SavedView', components: viewsFor(MapViewer), meta: { title: 'Map', viewer: true, embeddable: true } },
        { path: '/r/:org/:ds/view/:encodedPath/pointcloud', name: 'PointCloud', components: viewsFor(Potree), meta: { title: 'Point Cloud', viewer: true, embeddable: true } },
        { path: '/r/:org/:ds/view/:encodedPath/markdown', name: 'Markdown', components: viewsFor(Markdown), meta: { title: 'Markdown', viewer: true, embeddable: true } },
        { path: '/r/:org/:ds/view/:encodedPath/model', name: 'Model', components: viewsFor(Model), meta: { title: 'Model', viewer: true, embeddable: true } },
        { path: '/r/:org/:ds/view/:encodedPath/unified', name: 'UnifiedViewer', components: viewsFor(UnifiedViewer), meta: { title: '3D Viewer', viewer: true, embeddable: true } },
        { path: '/r/:org/:ds/view/:encodedPath/splat', name: 'Splat', components: viewsFor(Splat), meta: { title: 'Gaussian Splat', viewer: true, embeddable: true } },
        { path: '/r/:org/:ds/view/:encodedPath/panorama', name: 'Panorama', components: viewsFor(Panorama), meta: { title: 'Panorama', viewer: true, embeddable: true } },
        { path: '/login', name: 'Login', components: viewsFor(Login), meta: { title: 'Login' } },
        { path: '/r/:org', name: 'Datasets', components: viewsFor(Datasets), meta: { title: 'Datasets' } },
        { path: '/r', name: 'Organizations', components: viewsFor(Organizations), meta: { title: 'Organizations' } },
        { path: '/upload', name: 'Upload', components: viewsFor(Upload), meta: { title: 'Upload', requiresAuth: true } },
        { path: '/admin/users', name: 'Users', components: viewsFor(Users), meta: { title: 'Users', requiresAdmin: true } },
        { path: '/admin/tasks', name: 'AdminTasks', components: viewsFor(AdminTasks), meta: { title: 'Tasks', requiresAdmin: true } },
        { path: '/admin/config', name: 'AdminConfig', components: viewsFor(AdminConfig), meta: { title: 'Configuration', requiresAdmin: true } },
        { path: '/account', name: 'Account', components: viewsFor(Account), meta: { title: 'Account', requiresAuth: true } },
        { path: '/', name: 'LoginHome', components: viewsFor(Login), meta: { title: 'Login' } },
        { path: '/:pathMatch(.*)*', name: 'NotFound', components: viewsFor(NotFound), meta: { title: 'Not Found', embeddable: true } }
    ];

    const router = createRouter({
        history: createWebHistory(),
        routes
    });

    router.beforeEach((to, from) => {
        // An embedded page shows a viewer and nothing else: no sign-in, no account, no administration. The refusal
        // comes before the session guard, so an embedded Login or admin page is never even offered
        if (embed && !isEmbeddable(to)) {
            return { name: 'NotFound', params: { pathMatch: to.path.split('/').slice(1) }, query: to.query, hash: to.hash };
        }
        // Views refine the title after load; a change of query or hash on the same page must keep it.
        const title = navigationTitle(to, from);
        if (title) setTitle(title);
        return guard(to, useAuthStore());
    });

    // The one-shot notices (why the app brought the user here): shown once, then removed
    router.afterEach((to, from, failure) => {
        if (failure) return;
        forgetChunkReload();
        handleNotice(to, router);
    });

    // A route chunk that does not load: one reload to the target (see recoverFromChunkError)
    router.onError((error, to) => {
        if (!recoverFromChunkError(error, to)) console.error('Navigation failed:', error);
    });

    return router;
}
