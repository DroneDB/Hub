/**
 * Where the toasts of the app show (FR-XC-09, FR-VWR-24, FR-NAV-09): a page's toast is top right, below the header; a toast
 * raised while a viewer route is open goes to the viewer group, whatever raises it.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import PrimeVue from 'primevue/config';
import ToastService from 'primevue/toastservice';
import App from '@/App.vue';
import { createAppRouter } from '@/router';
import { notify, setToastService } from '@/libs/notify';

let wrapper;

afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    setToastService(null);
    document.body.innerHTML = '';
});

const page = { template: '<div class="page" />' };

async function mountApp() {
    const router = createRouter({
        history: createMemoryHistory(),
        routes: [
            { path: '/', components: { header: page, content: page }, meta: {} },
            { path: '/viewer', components: { header: page, content: page }, meta: { viewer: true } }
        ]
    });
    await router.push('/');
    wrapper = mount(App, { global: { plugins: [router, PrimeVue, ToastService] }, attachTo: document.body });
    setToastService(wrapper.vm.$toast);
    await flushPromises();
    return router;
}

describe('App toasts', () => {
    it('shows a page toast top right and a toast of a viewer route in the viewer host', async () => {
        const router = await mountApp();
        notify.success('On a page');
        await flushPromises();
        expect(document.querySelector('.p-toast-top-right').textContent).toContain('On a page');

        await router.push('/viewer');
        await flushPromises();
        notify.warn('No splat there');
        await flushPromises();
        expect(document.querySelector('.p-toast-top-center').textContent).toContain('No splat there');
        expect(document.querySelector('.p-toast-top-right').textContent).not.toContain('No splat there');

        await router.push('/');
        await flushPromises();
        notify.info('Back on a page');
        await flushPromises();
        expect(document.querySelector('.p-toast-top-right').textContent).toContain('Back on a page');
    });
});

describe('the routes of the viewers', () => {
    it('are marked as viewer routes, and the others are not', () => {
        vi.stubGlobal('HubOptions', {});
        const router = createAppRouter(true);
        const viewer = name => router.getRoutes().find(r => r.name === name).meta.viewer === true;
        for (const name of ['MapViewer', 'SavedView', 'PointCloud', 'Markdown', 'Model', 'UnifiedViewer', 'Splat', 'Panorama']) {
            expect(viewer(name), name).toBe(true);
        }
        for (const name of ['ViewDataset', 'Datasets', 'Organizations', 'Users', 'Login']) {
            expect(viewer(name), name).toBe(false);
        }
        vi.unstubAllGlobals();
    });
});
