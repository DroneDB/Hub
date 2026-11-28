import { describe, it, expect, vi, afterEach } from 'vitest';
import { nextTick } from 'vue';
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

// The button is disabled while the PDF is made, so the progress dialog cannot give the focus back to it when it closes
// (Cancel, Escape, the end of the PDF): the page's h1 gets it, and the button takes it back once it is enabled again
describe('ReportExport focus after a PDF', () => {
    /** @type {import('@vue/test-utils').VueWrapper | null} */
    let wrapper = null;
    afterEach(() => { wrapper?.unmount(); wrapper = null; document.body.innerHTML = ''; });

    /** The page around the bar: its h1 (where an overlay leaves the focus) and a field of its own. */
    function page() {
        document.body.innerHTML = '<h1 tabindex="-1">North pit</h1><input id="other"><div id="bar"></div>';
        wrapper = mount(ReportExport, {
            props: { model: { name: 'North pit' }, dataset: {}, uid: 'r_1', canWrite: true, dialogs: { open: vi.fn() } },
            global: { plugins: [PrimeVue] },
            attachTo: '#bar'
        });
        return wrapper;
    }

    /** Clicks the button, runs a PDF to its end with the focus left at `focusAtEnd`; the element focused then. */
    async function runFrom(testid, focusAtEnd) {
        const button = page().find(`[data-testid="${testid}"]`);
        button.element.focus();
        await button.trigger('click');
        m.running.value = true;
        await nextTick();
        expect(button.attributes('disabled')).toBeDefined();
        focusAtEnd()?.focus();
        m.running.value = false;
        await nextTick();
        await nextTick();
        return { button: button.element, focused: document.activeElement };
    }

    it('gives the focus back to Download PDF once it is enabled again, after a cancel took it to the h1', async () => {
        const { button, focused } = await runFrom('report-download-pdf', () => document.querySelector('h1'));
        expect(focused).toBe(button);
    });

    it('gives it back to Publish PDF when that one started the PDF, the focus having been left nowhere', async () => {
        const { button, focused } = await runFrom('report-publish-pdf', () => {
            // A browser takes the focus off a button that is disabled (jsdom does not): the focus is on the body
            const h1 = /** @type {HTMLElement} */ (document.querySelector('h1'));
            h1.focus();
            h1.blur();
            return null;
        });
        expect(focused).toBe(button);
    });

    it('leaves the focus on a control the user went to meanwhile', async () => {
        const { focused } = await runFrom('report-download-pdf', () => document.querySelector('#other'));
        expect(focused).toBe(document.querySelector('#other'));
    });
});
