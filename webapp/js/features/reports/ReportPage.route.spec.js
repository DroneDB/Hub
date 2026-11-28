/**
 * The report page in the app, with the real router and the routes of the app: "Save as new" (after another session
 * changed the report) goes to the new report, and the page then shows that report, reads it and edits it, not the
 * one it was opened on. The page reads its report once, so the new address must give a new page.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import { computed, defineComponent, h, ref, shallowRef } from 'vue';
import PrimeVue from 'primevue/config';
import ToastService from 'primevue/toastservice';
import { buildReportModel } from '@/libs/reports/reportModel';
import { definitionOf, inputOf } from '@/libs/reports/reportModel.fixtures';

const m = vi.hoisted(() => ({ opened: [], actions: [] }));
vi.mock('./useReport', () => ({ useReport: params => { m.opened.push(params); return reportOf(params.uid); } }));
vi.mock('./useReportActions', () => ({ useReportActions: () => { const a = { edit: vi.fn(), remove: vi.fn() }; m.actions.push(a); return a; } }));
vi.mock('@/libs/reports/photoFiles', () => ({ photoEntries: vi.fn(async () => null) }));

const { default: App } = await import('@/App.vue');
const { default: ReportPage } = await import('./ReportPage.vue');
const { default: ReportBar } = await import('./ReportBar.vue');
const { createAppRouter } = await import('@/router');

const NAMES = { r_old: 'North pit', r_new: 'North pit (saved as new)' };

function reportOf(uid) {
    const model = buildReportModel(inputOf([], { definition: definitionOf(['a.geojson'], { uid, name: NAMES[uid] }) }));
    return {
        dataset: { thumbUrl: () => '/thumb' },
        loading: ref(false), loadError: shallowRef(null), missing: ref(false), unreadable: ref(''), canWrite: ref(true),
        model: shallowRef(model), entry: shallowRef({ uid, name: NAMES[uid], data: {} }), reload: vi.fn(),
        errorMessage: computed(() => '')
    };
}

const ViewerShellStub = defineComponent({
    setup(_, { slots }) { return () => h('div', { class: 'shell' }, [h('div', { class: 'bar' }, slots.bar?.()), h('div', { class: 'body' }, slots.default?.())]); }
});
const page = { template: '<div />' };

let wrapper;
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
    m.opened.length = 0;
    m.actions.length = 0;
    vi.unstubAllGlobals();
});

async function openReport() {
    vi.stubGlobal('HubOptions', { appName: 'DroneDB' });
    Element.prototype.scrollIntoView = vi.fn();
    // The report route as the app declares it (its path, name and meta), with this page
    const record = createAppRouter(true).getRoutes().find(r => r.name === 'Report');
    const router = createRouter({
        history: createMemoryHistory(),
        routes: [
            { path: record.path, name: record.name, meta: record.meta, components: { header: page, content: ReportPage } },
            { path: '/r/:org/:ds', name: 'ViewDataset', components: { header: page, content: page } }
        ]
    });
    await router.push('/r/acme/site/reports/r_old');
    wrapper = mount(App, {
        attachTo: document.body,
        global: { plugins: [router, PrimeVue, ToastService], stubs: { ViewerShell: ViewerShellStub, ResourceState: true, DialogHost: true } }
    });
    await flushPromises();
    return router;
}

describe('the report page after "Save as new"', () => {
    it('shows, reads and edits the new report', async () => {
        const router = await openReport();
        expect(wrapper.find('h1').text()).toBe('North pit');
        m.actions[0].edit.mockResolvedValue({ uid: 'r_new' });

        wrapper.findComponent(ReportBar).vm.$emit('edit');
        await flushPromises();

        expect(router.currentRoute.value.params.uid).toBe('r_new');
        expect(m.opened.map(p => p.uid)).toEqual(['r_old', 'r_new']);
        expect(wrapper.find('h1').text()).toBe('North pit (saved as new)');

        // Edit now edits the new report
        m.actions.at(-1).edit.mockResolvedValue(null);
        wrapper.findComponent(ReportBar).vm.$emit('edit');
        await flushPromises();
        expect(m.actions.at(-1).edit).toHaveBeenCalledWith(expect.objectContaining({ uid: 'r_new' }));
    });

    it('stays the same page when only the item of the address changes', async () => {
        const router = await openReport();
        await router.push({ path: '/r/acme/site/reports/r_old', hash: '#item-p1' });
        await flushPromises();
        expect(m.opened).toHaveLength(1);
    });
});
