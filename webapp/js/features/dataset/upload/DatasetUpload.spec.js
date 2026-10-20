/**
 * DatasetUpload.vue mounted for real (UPL-01): the queue must exist before the component's
 * watchers first read it, and the dialog must follow the queue from the file list to the
 * summary. The request layer is replaced by a fake that answers each job at once.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
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
    default: {
        url: 'http://hub.test', getAuthToken: () => 'token', invalidateCache: vi.fn(),
        Organization: org => ({ Dataset: ds => ({ baseApi: `/orgs/${org}/ds/${ds}` }) })
    }
}));

const { default: DatasetUpload } = await import('./DatasetUpload.vue');

const flush = async () => {
    for (let i = 0; i < 5; i++) {
        await new Promise(r => setTimeout(r, 0));
        await nextTick();
    }
};

describe('DatasetUpload', () => {
    let wrapper, errors, uploaded;

    beforeEach(() => {
        sent.length = 0;
        errors = [];
        uploaded = [];
    });

    afterEach(() => wrapper?.unmount());

    function mountUpload(props) {
        wrapper = mount(DatasetUpload, {
            props: { organization: 'org', dataset: 'ds', path: '', ...props, onOnUpload: entry => uploaded.push(entry.path) },
            attachTo: document.body,
            global: {
                plugins: [PrimeVue],
                config: { errorHandler: err => errors.push(err) },
                mocks: { $router: { push: () => {} } },
                stubs: { RouterLink: true }
            }
        });
    }

    it('mounts without errors and shows the file picker when no files are given', async () => {
        mountUpload({ filesToUpload: [] });
        await flush();

        expect(errors).toEqual([]);
        expect(wrapper.text()).toContain('Select Files');
    });

    it('uploads the given files and shows the summary', async () => {
        const files = [new File(['a'], 'a.txt'), new File(['bb'], 'b.txt')];
        mountUpload({ filesToUpload: files });
        await flush();

        expect(errors).toEqual([]);
        expect(sent.flat()).toEqual(['a.txt', 'b.txt']);
        expect(uploaded).toEqual(['a.txt', 'b.txt']);
        expect(wrapper.find('.upload-summary').exists()).toBe(true);
        expect(wrapper.text()).toContain('All 2 files uploaded successfully');
    });
});
