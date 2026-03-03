import { createRouter, createWebHistory } from 'vue-router';
import { setTitle } from './libs/utils';

// Lazy-loaded route components
const ViewDataset = () => import(/* webpackChunkName: "dataset" */ './components/ViewDataset.vue');
const SingleMap = () => import(/* webpackChunkName: "map" */ './components/SingleMap.vue');
const Login = () => import(/* webpackChunkName: "auth" */ './components/Login.vue');
const Datasets = () => import(/* webpackChunkName: "datasets" */ './components/datasets/Datasets.vue');
const Organizations = () => import(/* webpackChunkName: "orgs" */ './components/organizations/Organizations.vue');
const Upload = () => import(/* webpackChunkName: "upload" */ './components/Upload.vue');
const NotFound = () => import(/* webpackChunkName: "notfound" */ './components/NotFound.vue');
const Account = () => import(/* webpackChunkName: "account" */ './components/account/Account.vue');
const Users = () => import(/* webpackChunkName: "admin" */ './components/users/Users.vue');
const Potree = () => import(/* webpackChunkName: "pointcloud" */ './components/Potree.vue');
const Nexus = () => import(/* webpackChunkName: "model" */ './components/Nexus.vue');
const Panorama = () => import(/* webpackChunkName: "panorama" */ './components/Panorama.vue');
const Markdown = () => import(/* webpackChunkName: "markdown" */ './components/Markdown.vue');

// Header loaded eagerly (used on every page)
import Header from './components/Header.vue';

export function createAppRouter(embed = false) {
    const hdr = embed ? null : Header;

    const routes = [
        { path: '/r/:org/:ds', name: 'ViewDataset', components: { content: ViewDataset, header: hdr }, meta: { title: 'View Dataset' } },
        { path: '/r/:org/:ds/view/:encodedPath/map', name: 'SingleMap', components: { content: SingleMap, header: hdr }, meta: { title: 'Map' } },
        { path: '/r/:org/:ds/view/:encodedPath/pointcloud', name: 'PointCloud', components: { content: Potree, header: hdr }, meta: { title: 'Point Cloud' } },
        { path: '/r/:org/:ds/view/:encodedPath/markdown', name: 'Markdown', components: { content: Markdown, header: hdr }, meta: { title: 'Markdown' } },
        { path: '/r/:org/:ds/view/:encodedPath/model', name: 'Model', components: { content: Nexus, header: hdr }, meta: { title: 'Model' } },
        { path: '/r/:org/:ds/view/:encodedPath/panorama', name: 'Panorama', components: { content: Panorama, header: hdr }, meta: { title: 'Panorama' } },
        { path: '/login', name: 'Login', components: { content: Login, header: hdr }, meta: { title: 'Login' } },
        { path: '/r/:org', name: 'Datasets', components: { content: Datasets, header: hdr }, meta: { title: 'Datasets' } },
        { path: '/r', name: 'Organizations', components: { content: Organizations, header: hdr }, meta: { title: 'Organizations' } },
        { path: '/upload', name: 'Upload', components: { content: Upload, header: hdr }, meta: { title: 'Upload' } },
        { path: '/admin/users', name: 'Users', components: { content: Users, header: hdr }, meta: { title: 'Users' } },
        { path: '/account', name: 'Account', components: { content: Account, header: hdr }, meta: { title: 'Account' } },
        { path: '/', name: 'LoginHome', components: { content: Login, header: hdr }, meta: { title: 'Login' } },
        { path: '/:pathMatch(.*)*', name: 'NotFound', components: { content: NotFound, header: hdr }, meta: { title: 'Not Found' } }
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
