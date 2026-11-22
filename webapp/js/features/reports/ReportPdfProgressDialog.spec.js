import { describe, it, expect, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import ReportPdfProgressDialog from './ReportPdfProgressDialog.vue';

let mounted = null;
const render = async props => {
    mounted = mount(ReportPdfProgressDialog, { props, attachTo: document.body, global: { plugins: [PrimeVue] } });
    await flushPromises();
    return mounted;
};
afterEach(() => { mounted?.unmount(); mounted = null; });
const text = () => document.body.textContent;

describe('ReportPdfProgressDialog', () => {
    it('says how many items are rendered out of all of them, and has a progress bar', async () => {
        await render({ done: 3, total: 12 });
        expect(text()).toContain('Rendered 3 of 12');
        expect(document.querySelector('[role="progressbar"]').getAttribute('aria-valuenow')).toBe('25');
    });

    it('says it is preparing before the total is known', async () => {
        await render({ done: 0, total: 0 });
        expect(text()).toContain('Preparing the PDF');
    });

    it('is titled by what the user asked for', async () => {
        const download = await render({ mode: 'download' });
        expect(text()).toContain('Making the PDF');
        download.unmount();
        await render({ mode: 'publish' });
        expect(text()).toContain('Publishing the PDF');
    });

    it('has Cancel, which closes it with the answer cancel', async () => {
        const wrapper = await render({ done: 1, total: 2 });
        const cancel = document.querySelector('[data-cancel]');
        expect(cancel.textContent).toContain('Cancel');
        cancel.click();
        await wrapper.vm.$nextTick();
        expect(wrapper.emitted('close')).toEqual([['cancel']]);
    });
});
