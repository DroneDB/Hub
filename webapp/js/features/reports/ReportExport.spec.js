import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';

const m = vi.hoisted(() => ({ run: vi.fn(), running: null }));
vi.mock('./useReportPdf', async () => {
    const { ref } = await import('vue');
    m.running = ref(false);
    return { useReportPdf: () => ({ run: m.run, running: m.running }) };
});

const { default: ReportExport } = await import('./ReportExport.vue');

const render = (props = {}) => mount(ReportExport, {
    props: { model: { name: 'North pit' }, dataset: {}, uid: 'r_1', dialogs: { open: vi.fn() }, ...props },
    global: { plugins: [PrimeVue] }
});

afterEach(() => { m.run.mockReset(); m.running.value = false; });

describe('ReportExport', () => {
    it('has Download PDF for a reader, and no Publish PDF', () => {
        const wrapper = render({ canWrite: false });
        expect(wrapper.find('[data-testid="report-download-pdf"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="report-publish-pdf"]').exists()).toBe(false);
    });

    it('has both for a user who can write', () => {
        const wrapper = render({ canWrite: true });
        expect(wrapper.find('[data-testid="report-download-pdf"]').text()).toBe('Download PDF');
        expect(wrapper.find('[data-testid="report-publish-pdf"]').text()).toBe('Publish PDF');
    });

    it('asks for the download or the publish a button names', async () => {
        const wrapper = render({ canWrite: true });
        await wrapper.find('[data-testid="report-download-pdf"]').trigger('click');
        await wrapper.find('[data-testid="report-publish-pdf"]').trigger('click');
        expect(m.run.mock.calls).toEqual([['download'], ['publish']]);
    });

    it('disables both while a PDF is made', async () => {
        const wrapper = render({ canWrite: true });
        expect(wrapper.find('[data-testid="report-download-pdf"]').attributes('disabled')).toBeUndefined();
        m.running.value = true;
        const busy = render({ canWrite: true });
        expect(busy.find('[data-testid="report-download-pdf"]').attributes('disabled')).toBeDefined();
        expect(busy.find('[data-testid="report-publish-pdf"]').attributes('disabled')).toBeDefined();
    });
});
