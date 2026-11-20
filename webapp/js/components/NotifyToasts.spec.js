/**
 * The toast hosts of the app (FR-XC-09, FR-NAV-09, FR-XC-23): the pages' toasts are top right, the viewers' have their
 * own host, and a toast with an action shows its button, which runs it and closes the toast.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import ToastService from 'primevue/toastservice';
import NotifyToasts from './NotifyToasts.vue';
import { notify, setToastService, setToastGroupResolver } from '@/libs/notify';

let wrapper;


const hosts = () => [...document.querySelectorAll('.p-toast')];

afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    setToastService(null);
    setToastGroupResolver(null);
    document.body.innerHTML = '';
});

// The service of the app, as main.js hands it to notify
async function mountWithService() {
    let service;
    const Probe = { template: '<NotifyToasts />', components: { NotifyToasts }, mounted() { service = this.$toast; } };
    wrapper = mount(Probe, { global: { plugins: [PrimeVue, ToastService] }, attachTo: document.body });
    setToastService(service);
    await flushPromises();
}

describe('NotifyToasts', () => {
    it('has a host top right for the pages and one top centre for the viewers', async () => {
        await mountWithService();
        notify.success('Page toast');
        notify.success('Viewer toast', { group: 'viewer' });
        await flushPromises();
        const [pages, viewers] = [document.querySelector('.p-toast-top-right'), document.querySelector('.p-toast-top-center')];
        expect(pages.textContent).toContain('Page toast');
        expect(pages.textContent).not.toContain('Viewer toast');
        expect(viewers.textContent).toContain('Viewer toast');
        expect(viewers.textContent).not.toContain('Page toast');
        expect(hosts()).toHaveLength(2);
    });

    it('shows the summary, the detail and the severity icon of a toast as PrimeVue draws them by default', async () => {
        await mountWithService();
        notify.error('Disk full', { summary: 'Save failed' });
        await flushPromises();
        const toast = document.querySelector('.p-toast-message');
        expect(toast.querySelector('.p-toast-summary').textContent).toBe('Save failed');
        expect(toast.querySelector('.p-toast-detail').textContent).toBe('Disk full');
        expect(toast.querySelector('svg.p-toast-message-icon')).not.toBeNull();
        expect(toast.querySelector('.toast-action')).toBeNull();
    });

    it('draws the action of a toast as a button, which runs it and closes the toast', async () => {
        await mountWithService();
        const run = vi.fn();
        notify.success('File moved successfully', { summary: 'Moved', action: { label: 'Undo', run } });
        await flushPromises();
        const button = document.querySelector('.p-toast-message button.toast-action');
        expect(button.textContent).toBe('Undo');
        button.click();
        await flushPromises();
        expect(run).toHaveBeenCalledTimes(1);
        await vi.waitFor(() => expect(document.querySelector('.p-toast-message')).toBeNull());
    });
});
