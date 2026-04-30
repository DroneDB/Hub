import { createRouter, createWebHistory } from 'vue-router';
import { setTitle } from '@/libs/utils';

// Lazy-loaded route components
const ViewDataset = () => import(/* webpackChunkName: "dataset" */ '@/features/dataset/ViewDataset.vue');
const SingleMap = () => import(/* webpackChunkName: "map" */ '@/features/viewers/map/SingleMap.vue');
const Login = () => import(/* webpackChunkName: "auth" */ '@/features/account/Login.vue');
const Datasets = () => import(/* webpackChunkName: "datasets" */ '@/features/datasets/Datasets.vue');
const Organizations = () => import(/* webpackChunkName: "orgs" */ '@/features/organizations/Organizations.vue');
const Upload = () => import(/* webpackChunkName: "upload" */ '@/features/upload/Upload.vue');
const NotFound = () => import(/* webpackChunkName: "notfound" */ '@/layout/NotFound.vue');
const Account = () => import(/* webpackChunkName: "account" */ '@/features/account/Account.vue');
const Users = () => import(/* webpackChunkName: "admin" */ '@/features/admin/Users.vue');
const Potree = () => import(/* webpackChunkName: "pointcloud" */ '@/features/viewers/pointcloud/Potree.vue');
const Nexus = () => import(/* webpackChunkName: "model" */ '@/features/viewers/model/Nexus.vue');
const Panorama = () => import(/* webpackChunkName: "panorama" */ '@/features/viewers/panorama/Panorama.vue');
const Markdown = () => import(/* webpackChunkName: "markdown" */ '@/features/viewers/markdown/Markdown.vue');

// Header loaded eagerly (used on every page)
import Header from '@/layout/Header.vue';

export function createAppRouter(embed = false) {
    // Build the named-views map. In embed mode we OMIT the `header` key
    // entirely instead of setting it to null: vue-router 4.6+ treats any
    // non-null object value as a route component and tries to access
    // `__vccOpts` on it, which throws on null and breaks navigation
    // (TypeError: Cannot read properties of null (reading '__vccOpts')).
    const viewsFor = (content) => embed ? { content } : { content, header: Header };

    const routes = [
        { path: '/r/:org/:ds', name: 'ViewDataset', components: viewsFor(ViewDataset), meta: { title: 'View Dataset' } },
        { path: '/r/:org/:ds/view/:encodedPath/map', name: 'SingleMap', components: viewsFor(SingleMap), meta: { title: 'Map' } },
        { path: '/r/:org/:ds/view/:encodedPath/pointcloud', name: 'PointCloud', components: viewsFor(Potree), meta: { title: 'Point Cloud' } },
        { path: '/r/:org/:ds/view/:encodedPath/markdown', name: 'Markdown', components: viewsFor(Markdown), meta: { title: 'Markdown' } },
        { path: '/r/:org/:ds/view/:encodedPath/model', name: 'Model', components: viewsFor(Nexus), meta: { title: 'Model' } },
        { path: '/r/:org/:ds/view/:encodedPath/panorama', name: 'Panorama', components: viewsFor(Panorama), meta: { title: 'Panorama' } },
        { path: '/login', name: 'Login', components: viewsFor(Login), meta: { title: 'Login' } },
        { path: '/r/:org', name: 'Datasets', components: viewsFor(Datasets), meta: { title: 'Datasets' } },
        { path: '/r', name: 'Organizations', components: viewsFor(Organizations), meta: { title: 'Organizations' } },
        { path: '/upload', name: 'Upload', components: viewsFor(Upload), meta: { title: 'Upload' } },
        { path: '/admin/users', name: 'Users', components: viewsFor(Users), meta: { title: 'Users' } },
        { path: '/account', name: 'Account', components: viewsFor(Account), meta: { title: 'Account' } },
        { path: '/', name: 'LoginHome', components: viewsFor(Login), meta: { title: 'Login' } },
        { path: '/:pathMatch(.*)*', name: 'NotFound', components: viewsFor(NotFound), meta: { title: 'Not Found' } }
    ];

    const router = createRouter({
        history: createWebHistory(),
        routes
    });

    // Set titles, keep track of previous routes
    router.beforeEach((to, prev, next) => {
        setTitle(to.meta.title);
        to.meta.prev = prev;
        next();
    });

    return router;
}
