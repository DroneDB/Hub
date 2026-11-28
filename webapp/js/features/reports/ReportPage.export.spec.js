/**
 * The exports in the bar of the live page: Download PDF for anyone who can read the report, Publish PDF with Edit and
 * Delete for those who can write.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { computed, defineComponent, h, ref, shallowRef } from 'vue';
import PrimeVue from 'primevue/config';
import { pdfModel } from '@/libs/reports/pdf/pdfDocument.fixtures';

const m = vi.hoisted(() => ({ report: null }));
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { org: 'acme', ds: 'site', uid: 'r_k3x9q2m7' }, hash: '' }), useRouter: () => ({ push: vi.fn() }) }));
vi.mock('./useReport', () => ({ useReport: () => m.report }));
vi.mock('./useReportActions', () => ({ useReportActions: () => ({ edit: vi.fn(), remove: vi.fn() }) }));
vi.mock('@/libs/reports/photoFiles', () => ({ photoEntries: async () => new Map() }));

const { default: ReportPage } = await import('./ReportPage.vue');

const ViewerShellStub = defineComponent({
    props: { loadError: { type: null, default: null }, loading: Boolean, name: { type: String, default: null } },
    setup: (_props, { slots }) => () => h('div', [h('div', { class: 'bar' }, slots.bar?.()), h('div', slots.default?.())])
});

let wrapper;
async function render({ canWrite }) {
    window.HubOptions = { appName: 'DroneDB' };
    m.report = {
        dataset: { thumbUrl: () => '/thumb' }, loading: ref(false), loadError: shallowRef(null), missing: ref(false), unreadable: ref(''),
        canWrite: ref(canWrite), model: shallowRef(pdfModel()), entry: shallowRef({ uid: 'r_k3x9q2m7', name: 'North pit', data: {} }),
        reload: vi.fn(), errorMessage: computed(() => '')
    };
    wrapper = mount(ReportPage, { global: { plugins: [PrimeVue], stubs: { ViewerShell: ViewerShellStub, DialogHost: true, ResourceState: true } } });
    await flushPromises();
}
afterEach(() => wrapper?.unmount());

describe('the exports of the report page', () => {
    it('are Download PDF alone for a reader, with no Publish PDF, Edit or Delete', async () => {
        await render({ canWrite: false });
        expect(wrapper.find('[data-testid="report-download-pdf"]').exists()).toBe(true);
        for (const id of ['report-publish-pdf', 'report-edit', 'report-delete']) expect(wrapper.find(`[data-testid="${id}"]`).exists(), id).toBe(false);
    });

    it('are Download PDF and Publish PDF, with Edit and Delete, for a user who can write', async () => {
        await render({ canWrite: true });
        for (const id of ['report-download-pdf', 'report-publish-pdf', 'report-edit', 'report-delete']) expect(wrapper.find(`[data-testid="${id}"]`).exists(), id).toBe(true);
    });

    it('sit in the toolbar of the bar, before Edit and Delete', async () => {
        await render({ canWrite: true });
        const ids = wrapper.findAll('.report-bar-actions button').map(b => b.attributes('data-testid'));
        expect(ids).toEqual(['report-download-pdf', 'report-publish-pdf', 'report-edit', 'report-delete']);
    });
});
