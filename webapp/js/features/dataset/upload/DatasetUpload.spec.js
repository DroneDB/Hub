/**
 * DatasetUpload.vue mounted for real (UPL-01): the queue must exist before the component's
 * watchers first read it, and the dialog must follow the queue from the file list to the
 * summary. The request layer is replaced by a fake that answers each job at once.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import PrimeVue from 'primevue/config';

const sent = [];
vi.mock('@/libs/upload/uploadRequests', () => ({
    createUploadRequests: () => ({
        send: async (job, hooks) => {
            sent.push(job.items.map(i => i.path));
            hooks.onUploaded(job.items.map(i => i.id));
            return job.items.map(i => ({ id: i.id, ok: true, entry: { path: i.path } }));
        }
    })
}));
vi.mock('@/libs/api/sharedRegistry', () => ({
    default: { url: 'http://hub.test', getAuthToken: () => 'token', invalidateCache: vi.fn() }
}));

const { default: DatasetUpload } = await import('./DatasetUpload.vue');

const flush = async () => {
    for (let i = 0; i < 5; i++) {
        await new Promise(r => setTimeout(r, 0));
        await nextTick();
    }
};

describe('DatasetUpload', () => {
    let el, app, errors, uploaded;

    beforeEach(() => {
        sent.length = 0;
        errors = [];
        uploaded = [];
        el = document.createElement('div');
        document.body.appendChild(el);
    });

    afterEach(() => {
        app?.unmount();
        el.remove();
    });

    function mount(props) {
        app = createApp({
            render: () => h(DatasetUpload, { organization: 'org', dataset: 'ds', path: '', ...props,
                onOnUpload: entry => uploaded.push(entry.path) })
        });
        app.use(PrimeVue);
        app.config.errorHandler = err => errors.push(err);
        app.config.globalProperties.$router = { push: () => {} };
        app.component('RouterLink', { render: () => null });
        app.mount(el);
    }

    it('mounts without errors and shows the file picker when no files are given', async () => {
        mount({ filesToUpload: [] });
        await flush();

        expect(errors).toEqual([]);
        expect(el.textContent).toContain('Select Files');
    });

    it('uploads the given files and shows the summary', async () => {
        const files = [new File(['a'], 'a.txt'), new File(['bb'], 'b.txt')];
        mount({ filesToUpload: files });
        await flush();

        expect(errors).toEqual([]);
        expect(sent.flat()).toEqual(['a.txt', 'b.txt']);
        expect(uploaded).toEqual(['a.txt', 'b.txt']);
        expect(el.querySelector('.upload-summary')).not.toBeNull();
        expect(el.textContent).toContain('All 2 files uploaded successfully');
    });
});
