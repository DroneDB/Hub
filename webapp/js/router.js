import { createRouter, createWebHistory } from 'vue-router';
import { setTitle } from '@/libs/utils';
import { useAuthStore } from '@/stores/auth';
import { guard } from '@/libs/authRoutes';

// Lazy-loaded route components
const ViewDataset = () => import(/* webpackChunkName: "dataset" */ '@/features/dataset/ViewDataset.vue');
const SingleMap = () => import(/* webpackChunkName: "map" */ '@/features/viewers/map/SingleMap.vue');
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
const Markdown = () => import(/* webpackChunkName: "markdown" */ '@/features/viewers/markdown/MarkdownViewer.vue');

// Header loaded eagerly (used on every page)
import Header from '@/layout/HubHeader.vue';

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
        { path: '/r/:org/:ds/view/:encodedPath/model', name: 'Model', components: viewsFor(Model), meta: { title: 'Model' } },
        { path: '/r/:org/:ds/view/:encodedPath/unified', name: 'UnifiedViewer', components: viewsFor(UnifiedViewer), meta: { title: '3D Viewer' } },
        { path: '/r/:org/:ds/view/:encodedPath/splat', name: 'Splat', components: viewsFor(Splat), meta: { title: 'Gaussian Splat' } },
        { path: '/r/:org/:ds/view/:encodedPath/panorama', name: 'Panorama', components: viewsFor(Panorama), meta: { title: 'Panorama' } },
        { path: '/login', name: 'Login', components: viewsFor(Login), meta: { title: 'Login' } },
        { path: '/r/:org', name: 'Datasets', components: viewsFor(Datasets), meta: { title: 'Datasets' } },
        { path: '/r', name: 'Organizations', components: viewsFor(Organizations), meta: { title: 'Organizations' } },
        { path: '/upload', name: 'Upload', components: viewsFor(Upload), meta: { title: 'Upload', requiresAuth: true } },
        { path: '/admin/users', name: 'Users', components: viewsFor(Users), meta: { title: 'Users', requiresAdmin: true } },
        { path: '/admin/tasks', name: 'AdminTasks', components: viewsFor(AdminTasks), meta: { title: 'Tasks', requiresAdmin: true } },
        { path: '/admin/config', name: 'AdminConfig', components: viewsFor(AdminConfig), meta: { title: 'Configuration', requiresAdmin: true } },
        { path: '/account', name: 'Account', components: viewsFor(Account), meta: { title: 'Account', requiresAuth: true } },
        { path: '/', name: 'LoginHome', components: viewsFor(Login), meta: { title: 'Login' } },
        { path: '/:pathMatch(.*)*', name: 'NotFound', components: viewsFor(NotFound), meta: { title: 'Not Found' } }
    ];

    const router = createRouter({
        history: createWebHistory(),
        routes
    });

    router.beforeEach(to => {
        setTitle(to.meta.title);
        return guard(to, useAuthStore());
    });

    return router;
}
